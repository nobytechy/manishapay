/**
 * /v1/pay — initiate a payment, look up status by merchant reference.
 *
 * Authenticated with the developer's API key. The route loads the
 * project's encrypted PayNow credentials (if any), passes them into the
 * PayNow service, then persists a row into manishapay_transactions
 * keyed on a globally-unique `tracker` we generate (so webhooks can route
 * to the right project even if two merchants share a reference value).
 *
 * Behavior matrix:
 *   mp_test_*  +  no creds set   →  simulated (no PayNow call)
 *   mp_test_*  +  test creds set →  real PayNow with test integration
 *   mp_live_*  +  live creds set →  real PayNow with live integration
 *   mp_live_*  +  no creds set   →  400 CREDENTIALS_REQUIRED
 */
'use strict';

const router = require('express').Router();
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const paynow = require('../services/paynow');
const { getProvider } = require('../providers');
const catalog = require('../providers/catalog');
const credentials = require('../services/credentials');
const qr = require('../services/qr');
const { supabase } = require('../config/supabase');
const AppError = require('../errors/AppError');

const initiateSchema = z.object({
  // Which gateway moves the money. Optional — defaults to PayNow. Unknown or
  // not-yet-live gateways are rejected by the registry with a clear error, so
  // the caller never gets a silent wrong-provider charge.
  provider: z.string().min(1).max(32).optional(),
  reference: z.string().min(1).max(64),
  // Accept string OR number — normalizer fixes the format.
  amount: z.union([z.string(), z.number()]),
  description: z.string().max(255).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  // Method is a free-form rail name (ecocash, mpesa, card, mobile_money, paypal…).
  // It is validated PROVIDER-AWARE against the resolved gateway's capabilities
  // below — a fixed enum here would reject every non-PayNow gateway.
  method: z.string().min(1).max(32).optional(),
  // 3-letter ISO currency code. Each provider validates the currencies it actually
  // supports; a fixed USD/ZWL enum here would reject KES (M-Pesa), ZAR (Yoco), etc.
  currency: z.string().regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter code').optional(),
  return_url: z.string().url().optional(),
  result_url: z.string().url().optional(),
});

router.use(authenticate);

router.post('/', async (req, res, next) => {
  try {
    const parsed = initiateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest('Invalid payment payload', { issues: parsed.error.flatten() });
    }

    // Idempotency: a client that retries POST /v1/pay with the same
    // Idempotency-Key gets the ORIGINAL response back, never a second charge.
    const idemKey = req.header('Idempotency-Key');
    if (idemKey) {
      const { data: prior } = await supabase
        .from('manishapay_idempotency')
        .select('status_code, response')
        .eq('developer_id', req.developer.id)
        .eq('idem_key', idemKey)
        .maybeSingle();
      if (prior) {
        return res.status(prior.status_code).json(prior.response);
      }
    }

    // Load the project (for return/result URLs and to verify it exists).
    const { data: project, error: projErr } = await supabase
      .from('manishapay_projects')
      .select('id, return_url, result_url, default_mode')
      .eq('id', req.developer.projectId)
      .maybeSingle();
    if (projErr) {
      throw new AppError({ status: 500, code: 'PROJECT_LOOKUP_FAILED', message: projErr.message });
    }
    if (!project) throw AppError.notFound('Project');

    // Resolve the gateway via the registry — never call a provider directly.
    // Defaults to PayNow; an unknown gateway throws a clean error here.
    const providerId = parsed.data.provider || 'paynow';
    const provider = getProvider(providerId);

    // Provider-aware method validation (replaces the old PayNow-only enum): if a
    // method is given, it must be one the resolved gateway actually serves.
    if (parsed.data.method && !catalog.providerServes(providerId, parsed.data.method)) {
      const supported = catalog.get(providerId)?.capabilities?.methods || [];
      throw AppError.badRequest(
        `Method '${parsed.data.method}' is not supported by ${provider.displayName || providerId}`,
        { resolution: supported.length ? `Supported methods: ${supported.join(', ')}` : undefined },
      );
    }

    // Load THIS provider's credentials for the API key's mode. May be null:
    //   • PayNow test with no creds → simulated path
    //   • other gateways with no creds in live mode → provider throws CREDENTIALS_REQUIRED
    const creds = await credentials.loadActive(project.id, providerId, req.developer.mode);

    const result = await provider.initiate(parsed.data, {
      mode: req.developer.mode,
      creds,
      project,
    });

    const merchantAmount = paynow.normalizeAmount(parsed.data.amount);

    // Persist the transaction. Must succeed — without the row, downstream
    // routes (/simulator/:tracker, /v1/webhook, /v1/pay/:ref/status) all
    // 404 because they look up by tracker / reference. Previously this was
    // a warn-and-continue, which meant the API would return a fake-success
    // response with a tracker that didn't exist in the database.
    const { error: insertErr } = await supabase.from('manishapay_transactions').insert({
      developer_id: req.developer.id,
      project_id: project.id,
      provider: providerId,
      tracker: result.providerRef,
      merchant_reference: parsed.data.reference,
      merchant_amount: merchantAmount,
      customer_amount: merchantAmount, // v1: no fee pass-through
      currency: parsed.data.currency || 'USD',
      status: result.rawStatus || 'Sent',
      status_normalized: result.status || paynow.normalizeStatus('Sent'),
      mode: result.mode,
      method: parsed.data.method || null,
      customer_phone: parsed.data.phone || null,
      poll_url: result.pollUrl,
      browser_url: result.checkoutUrl,
      request_id: req.id,
      billable: result.mode !== 'simulated', // simulated transactions don't count toward billing
    });
    if (insertErr) {
      if (req.log) req.log.error({ err: insertErr }, 'transaction insert failed');
      throw new AppError({
        status: 500,
        code: 'TRANSACTION_INSERT_FAILED',
        message: insertErr.message || 'Failed to persist transaction',
        detail: insertErr.details || insertErr.hint || null,
      });
    }

    // Payment ticket: a scannable QR of the checkout URL. The customer scans
    // it with their phone and lands straight on the checkout. Never let a QR
    // failure break the payment — it's a convenience field.
    let qrCode = null;
    if (result.checkoutUrl) {
      try {
        qrCode = await qr.toDataUrl(result.checkoutUrl);
      } catch (qrErr) {
        if (req.log) req.log.warn({ err: qrErr }, 'qr generation failed; continuing');
      }
    }

    const responseBody = {
      data: {
        provider: providerId,
        reference: parsed.data.reference,
        tracker: result.providerRef,
        browser_url: result.checkoutUrl,
        poll_url: result.pollUrl,
        status: result.rawStatus,
        status_normalized: result.status,
        mode: result.mode,
        currency: parsed.data.currency || 'USD',
        qr_code: qrCode,
        instructions: result.instructions,
      },
      requestId: req.id,
    };

    // Store the response against the idempotency key (best-effort; the unique
    // (developer_id, idem_key) constraint guards against concurrent retries).
    if (idemKey) {
      supabase
        .from('manishapay_idempotency')
        .insert({ developer_id: req.developer.id, idem_key: idemKey, status_code: 201, response: responseBody })
        .then(() => {}, () => {});
    }

    res.status(201).json(responseBody);
  } catch (err) {
    next(err);
  }
});

router.get('/:reference/status', async (req, res, next) => {
  try {
    const { reference } = req.params;
    const { data, error } = await supabase
      .from('manishapay_transactions')
      .select(
        'provider, tracker, merchant_reference, merchant_amount, customer_amount, currency, status, status_normalized, mode, method, poll_url, paynow_reference, created_at, updated_at',
      )
      .eq('developer_id', req.developer.id)
      .eq('project_id', req.developer.projectId)
      .eq('merchant_reference', reference)
      .maybeSingle();
    if (error) throw new AppError({ status: 500, code: 'DB_ERROR', message: error.message });
    if (!data) throw AppError.notFound('Transaction');

    // Try to fetch a fresh status from PayNow if the transaction is in a
    // non-terminal state and we have credentials. Cached status is
    // returned if the live poll fails.
    let live = null;
    let creds = null;
    if (data.poll_url && data.mode !== 'simulated') {
      try {
        const providerId = data.provider || 'paynow';
        const prov = getProvider(providerId);
        creds = await credentials.loadActive(req.developer.projectId, providerId, data.mode);
        if (creds) {
          live = await prov.pollStatus(data.poll_url, creds);
          // Providers return a canonical `status` (+ raw `rawStatus`). Persist a
          // change only when the canonical status actually moved.
          const normalized = live.status || prov.normalizeStatus(live.rawStatus);
          if (normalized && normalized !== data.status_normalized) {
            await supabase
              .from('manishapay_transactions')
              .update({
                status: live.rawStatus || live.status,
                status_normalized: normalized,
                paid_at: normalized === 'paid' ? new Date().toISOString() : null,
                updated_at: new Date().toISOString(),
              })
              .eq('developer_id', req.developer.id)
              .eq('merchant_reference', reference);
          }
        }
      } catch (err) {
        if (req.log) req.log.warn({ err }, 'live poll failed; returning cached status');
      }
    }

    res.json({
      data: {
        provider: data.provider || 'paynow',
        reference: data.merchant_reference,
        tracker: data.tracker,
        amount: data.merchant_amount,
        currency: data.currency,
        status: data.status,
        status_normalized: data.status_normalized,
        mode: data.mode,
        // How the gateway was authenticated: the developer's own connected keys,
        // ManishaPay's shared test sandbox, or the built-in PayNow simulator.
        credential_source: creds ? (creds.source || 'own') : (data.mode === 'simulated' ? 'simulated' : null),
        method: data.method,
        paynow_reference: data.paynow_reference,
        created_at: data.created_at,
        updated_at: data.updated_at,
        live,
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
