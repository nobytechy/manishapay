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
const { jwtAuthenticate } = require('../middleware/jwtAuth');
const { supabase } = require('../config/supabase');
const credentials = require('../services/credentials');
const paynow = require('../services/paynow');
const qr = require('../services/qr');
const AppError = require('../errors/AppError');

const createSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1).max(120),
  amount: z.union([z.string(), z.number()]),
  currency: z.enum(['USD', 'ZWL']).optional(),
  description: z.string().max(255).optional(),
});

// ── Create (JWT) ──────────────────────────────────────────────────────────
router.post('/', jwtAuthenticate, async (req, res, next) => {
  try {
    const p = createSchema.parse(req.body);
    const { data: proj } = await supabase
      .from('manishapay_projects')
      .select('id')
      .eq('id', p.project_id)
      .eq('developer_id', req.developer.id)
      .maybeSingle();
    if (!proj) throw AppError.notFound('Project');

    const slug = nodeCrypto.randomBytes(6).toString('hex');
    const { data, error } = await supabase
      .from('manishapay_payment_links')
      .insert({
        developer_id: req.developer.id,
        project_id: p.project_id,
        slug,
        title: p.title,
        amount: paynow.normalizeAmount(p.amount),
        currency: p.currency || 'USD',
        description: p.description || null,
      })
      .select('id, slug, title, amount, currency, description, active, created_at')
      .single();
    if (error) throw new AppError({ status: 500, code: 'LINK_CREATE_FAILED', message: error.message });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// ── Public: link details ──────────────────────────────────────────────────
router.get('/:slug', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('manishapay_payment_links')
      .select('slug, title, amount, currency, description, active')
      .eq('slug', req.params.slug)
      .maybeSingle();
    if (error) throw new AppError({ status: 500, code: 'DB_ERROR', message: error.message });
    if (!data || !data.active) throw AppError.notFound('Payment link');
    res.json({ data });
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
      .select('id, developer_id, project_id, slug, title, amount, currency, active')
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

    // Prefer the merchant's live credentials; fall back to test/sandbox.
    let mode = 'live';
    let creds = await credentials.loadActive(link.project_id, 'live');
    if (!creds) { mode = 'test'; creds = await credentials.loadActive(link.project_id, 'test'); }

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

    const result = await paynow.initiate(input, { mode, creds, project });

    const { error: insErr } = await supabase.from('manishapay_transactions').insert({
      developer_id: link.developer_id,
      project_id: link.project_id,
      tracker: result.tracker,
      merchant_reference: reference,
      merchant_amount: paynow.normalizeAmount(link.amount),
      customer_amount: paynow.normalizeAmount(link.amount),
      currency: link.currency,
      status: result.status || 'Sent',
      status_normalized: paynow.normalizeStatus(result.status || 'Sent'),
      mode: result.mode,
      method: p.method || null,
      customer_phone: p.phone || null,
      poll_url: result.poll_url,
      browser_url: result.browser_url,
      billable: result.mode !== 'simulated',
    });
    if (insErr) throw new AppError({ status: 500, code: 'TRANSACTION_INSERT_FAILED', message: insErr.message });

    let qrCode = null;
    if (result.browser_url) {
      try { qrCode = await qr.toDataUrl(result.browser_url); } catch { /* non-fatal */ }
    }

    res.status(201).json({
      data: {
        reference,
        tracker: result.tracker,
        browser_url: result.browser_url,
        status: result.status,
        mode: result.mode,
        qr_code: qrCode,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
