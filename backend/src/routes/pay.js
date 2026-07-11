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
const credentials = require('../services/credentials');
const qr = require('../services/qr');
const { supabase } = require('../config/supabase');
const AppError = require('../errors/AppError');

const initiateSchema = z.object({
  reference: z.string().min(1).max(64),
  // Accept string OR number — normalizer fixes the format.
  amount: z.union([z.string(), z.number()]),
  description: z.string().max(255).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  method: z.enum(['ecocash', 'onemoney', 'innbucks', 'omari', 'zimswitch', 'vmc']).optional(),
  // PayNow currency is fixed by the integration (commonly USD or ZWL). We let
  // the merchant declare it so we can store and echo it back on every response —
  // removing the "which currency did this run in?" ambiguity from the forum.
  currency: z.enum(['USD', 'ZWL']).optional(),
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

    // Load creds for the API key's mode. May be null → simulated path.
    const creds = await credentials.loadActive(project.id, req.developer.mode);

    const result = await paynow.initiate(parsed.data, {
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
      tracker: result.tracker,
      merchant_reference: parsed.data.reference,
      merchant_amount: merchantAmount,
      customer_amount: merchantAmount, // v1: no fee pass-through
      currency: parsed.data.currency || 'USD',
      status: result.status || 'Sent',
      status_normalized: paynow.normalizeStatus(result.status || 'Sent'),
      mode: result.mode,
      method: parsed.data.method || null,
      customer_phone: parsed.data.phone || null,
      poll_url: result.poll_url,
      browser_url: result.browser_url,
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
    if (result.browser_url) {
      try {
        qrCode = await qr.toDataUrl(result.browser_url);
      } catch (qrErr) {
        if (req.log) req.log.warn({ err: qrErr }, 'qr generation failed; continuing');
      }
    }

    const responseBody = {
      data: {
        reference: parsed.data.reference,
        tracker: result.tracker,
        browser_url: result.browser_url,
        poll_url: result.poll_url,
        status: result.status,
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
        'tracker, merchant_reference, merchant_amount, customer_amount, currency, status, status_normalized, mode, method, poll_url, paynow_reference, created_at, updated_at',
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
    if (data.poll_url && data.mode !== 'simulated') {
      try {
        const creds = await credentials.loadActive(req.developer.projectId, data.mode);
        if (creds) {
          live = await paynow.pollStatus(data.poll_url, creds);
          if (live.status && live.status !== data.status) {
            const normalized = paynow.normalizeStatus(live.status);
            await supabase
              .from('manishapay_transactions')
              .update({
                status: live.status,
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
        reference: data.merchant_reference,
        tracker: data.tracker,
        amount: data.merchant_amount,
        currency: data.currency,
        status: data.status,
        status_normalized: data.status_normalized,
        mode: data.mode,
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
