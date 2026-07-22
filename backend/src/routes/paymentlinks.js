/**
 * /v1/links — no-code payment links + hosted checkout.
 *
 *   POST /v1/links            (JWT)    create a link → shareable /pay/<slug>
 *   GET  /v1/links/:slug      (public) link details for the hosted page
 *   POST /v1/links/:slug/pay  (public) start a payment for the link
 *
 * The public checkout carries no API key — the link itself is the context.
 * Payments run through the same PayNow path as /v1/pay (live creds if the
 * merchant has them, otherwise the test/sandbox fallback).
 */
'use strict';

const router = require('express').Router();
const { z } = require('zod');
const nodeCrypto = require('crypto');
const { jwtAuthenticate, requireCapability } = require('../middleware/jwtAuth');
const { supabase } = require('../config/supabase');
const credentials = require('../services/credentials');
const paynow = require('../services/paynow');
const { getProvider } = require('../providers');
const catalog = require('../providers/catalog');
const routing = require('../services/routing');
const qr = require('../services/qr');
const AppError = require('../errors/AppError');

const KNOWN_METHODS = new Set(catalog.allMethods());

const createSchema = z.object({
  project_id: z.string().uuid(),
  // Which gateway collects on this link. Optional — defaults to PayNow so all
  // existing links keep working. Unknown/not-yet-live gateways are rejected by
  // the registry when the link is paid. This is the checkout's PRIMARY provider:
  // when the customer picks a method it serves, it wins the routing tie-break.
  provider: z.string().min(1).max(32).optional(),
  title: z.string().min(1).max(120),
  amount: z.union([z.string(), z.number()]),
  currency: z.enum(['USD', 'ZWL']).optional(),
  description: z.string().max(255).optional(),
  // Multi-method hosted checkout: the methods the customer may choose from.
  // Omitted → the primary provider's own methods (a legacy link still upgrades
  // to a proper chooser). Each is routed to a connected gateway at pay time.
  enabled_methods: z.array(z.string()).max(24).optional(),
  // Optional power-user override: pin a method to a specific gateway.
  method_routing: z.record(z.string()).optional(),
});

// ── Create (JWT) ──────────────────────────────────────────────────────────
router.post('/', jwtAuthenticate, requireCapability('payments'), async (req, res, next) => {
  try {
    const p = createSchema.parse(req.body);
    const { data: proj } = await supabase
      .from('manishapay_projects')
      .select('id')
      .eq('id', p.project_id)
      .eq('developer_id', req.developer.id)
      .maybeSingle();
    if (!proj) throw AppError.notFound('Project');

    // Reject unknown method names early — a typo here would silently hide a
    // method from the checkout, which is confusing to debug later.
    const enabledMethods = (p.enabled_methods || []).filter((m, i, a) => a.indexOf(m) === i);
    const badMethod = enabledMethods.find((m) => !KNOWN_METHODS.has(m));
    if (badMethod) {
      throw AppError.badRequest(`Unknown payment method '${badMethod}'`, {
        supported: [...KNOWN_METHODS],
      });
    }

    const slug = nodeCrypto.randomBytes(6).toString('hex');
    const { data, error } = await supabase
      .from('manishapay_payment_links')
      .insert({
        developer_id: req.developer.id,
        project_id: p.project_id,
        provider: p.provider || 'paynow',
        slug,
        title: p.title,
        amount: paynow.normalizeAmount(p.amount),
        currency: p.currency || 'USD',
        description: p.description || null,
        enabled_methods: enabledMethods.length ? enabledMethods : null,
        method_routing: p.method_routing || null,
      })
      .select('id, slug, title, amount, currency, description, active, created_at')
      .single();
    if (error) throw new AppError({ status: 500, code: 'LINK_CREATE_FAILED', message: error.message });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// ── Public: link details (+ the method chooser) ───────────────────────────
router.get('/:slug', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('manishapay_payment_links')
      .select('slug, title, amount, currency, description, active, project_id, provider, enabled_methods, method_routing')
      .eq('slug', req.params.slug)
      .maybeSingle();
    if (error) throw new AppError({ status: 500, code: 'DB_ERROR', message: error.message });
    if (!data || !data.active) throw AppError.notFound('Payment link');

    // Resolve which methods the customer can actually pay with right now
    // (offered methods ∩ connected gateways). Best-effort: a routing hiccup
    // must never make a valid link un-loadable, so we fall back to an empty
    // chooser and the front-end shows a single "Pay" button (legacy path).
    let methods = [];
    try {
      methods = await routing.availableMethods(data.project_id, {
        enabledMethods: data.enabled_methods,
        routing: data.method_routing,
        primaryProvider: data.provider || 'paynow',
      });
    } catch (e) {
      if (req.log) req.log.warn({ err: e }, 'method chooser resolution failed; serving link without methods');
    }

    res.json({
      data: {
        slug: data.slug,
        title: data.title,
        amount: data.amount,
        currency: data.currency,
        description: data.description,
        active: data.active,
        primary_provider: data.provider || 'paynow',
        methods,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Public: start a payment for the link ──────────────────────────────────
const paySchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  method: z.string().optional(),
});

router.post('/:slug/pay', async (req, res, next) => {
  try {
    const p = paySchema.parse(req.body || {});
    const { data: link, error } = await supabase
      .from('manishapay_payment_links')
      .select('id, developer_id, project_id, provider, slug, title, amount, currency, active, enabled_methods, method_routing')
      .eq('slug', req.params.slug)
      .maybeSingle();
    if (error) throw new AppError({ status: 500, code: 'DB_ERROR', message: error.message });
    if (!link || !link.active) throw AppError.notFound('Payment link');

    const { data: project } = await supabase
      .from('manishapay_projects')
      .select('id, return_url, result_url, default_mode')
      .eq('id', link.project_id)
      .maybeSingle();
    if (!project) throw AppError.notFound('Project');

    // ── Route the chosen method to a connected gateway ──────────────────────
    // If the customer picked a method, resolve the gateway that fulfils it
    // (explicit override → primary provider → catalog order). Otherwise fall
    // back to the checkout's primary provider — the pre-multi-method path, so
    // existing links keep working unchanged.
    let providerId = link.provider || 'paynow';
    let mode;
    let creds;
    if (p.method) {
      const route = await routing.resolveRoute(link.project_id, p.method, {
        enabledMethods: link.enabled_methods,
        routing: link.method_routing,
        primaryProvider: link.provider || 'paynow',
      });
      if (!route) {
        throw AppError.badRequest(
          `No connected gateway can process '${p.method}' on this checkout.`,
          { method: p.method },
        );
      }
      providerId = route.provider;
      mode = route.mode;
      creds = await credentials.loadActive(link.project_id, providerId, mode);
    } else {
      // Prefer the merchant's live credentials for the primary gateway; fall
      // back to test/sandbox. loadActive is provider-aware.
      mode = 'live';
      creds = await credentials.loadActive(link.project_id, providerId, 'live');
      if (!creds) { mode = 'test'; creds = await credentials.loadActive(link.project_id, providerId, 'test'); }
    }

    // Resolve the gateway via the registry — never call a provider directly.
    const provider = getProvider(providerId);

    const reference = `${link.slug}-${nodeCrypto.randomBytes(4).toString('hex')}`;
    const input = {
      reference,
      amount: String(link.amount),
      description: link.title,
      email: p.email,
      phone: p.phone,
      method: p.method,
      currency: link.currency,
    };

    const result = await provider.initiate(input, { mode, creds, project });

    const { error: insErr } = await supabase.from('manishapay_transactions').insert({
      developer_id: link.developer_id,
      project_id: link.project_id,
      provider: providerId,
      tracker: result.providerRef,
      merchant_reference: reference,
      merchant_amount: paynow.normalizeAmount(link.amount),
      customer_amount: paynow.normalizeAmount(link.amount),
      currency: link.currency,
      status: result.rawStatus || 'Sent',
      status_normalized: result.status || paynow.normalizeStatus('Sent'),
      mode: result.mode,
      method: p.method || null,
      customer_phone: p.phone || null,
      poll_url: result.pollUrl,
      browser_url: result.checkoutUrl,
      billable: result.mode !== 'simulated',
    });
    if (insErr) throw new AppError({ status: 500, code: 'TRANSACTION_INSERT_FAILED', message: insErr.message });

    let qrCode = null;
    if (result.checkoutUrl) {
      try { qrCode = await qr.toDataUrl(result.checkoutUrl); } catch { /* non-fatal */ }
    }

    res.status(201).json({
      data: {
        provider: providerId,
        reference,
        tracker: result.providerRef,
        browser_url: result.checkoutUrl,
        status: result.rawStatus,
        mode: result.mode,
        qr_code: qrCode,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
