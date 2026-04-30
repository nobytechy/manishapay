/**
 * /v1/tools — the "problem solver" surface.
 *
 * Each route here exists to make a specific forum issue go away. They're
 * intentionally cheap and stateless so the dashboard can call them
 * without worrying about quotas, and curl power-users can use them too.
 */
'use strict';

const router = require('express').Router();
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const hash = require('../services/hash');
const paynow = require('../services/paynow');
const credentials = require('../services/credentials');
const AppError = require('../errors/AppError');
const { supabase } = require('../config/supabase');

router.use(authenticate);

// ─── Hash diff: tells you why your signature didn't match ───────────────
// Uses the calling key's project + mode to load the integration key.
// Useful for devs debugging hash mismatches against the merchant's own creds.
router.post('/hash', async (req, res, next) => {
  try {
    const schema = z.object({
      fields: z.record(z.union([z.string(), z.number(), z.null()])),
      received_hash: z.string().optional(),
    });
    const parsed = schema.parse(req.body);

    const creds = await credentials.loadActive(req.developer.projectId, req.developer.mode);
    if (!creds) {
      throw AppError.badRequest(
        'No PayNow credentials configured for this project — add them in the dashboard, then try /tools/hash again.',
      );
    }
    const expected = hash.compute(parsed.fields, creds.integrationKey);
    const concatenated = Object.entries(parsed.fields)
      .filter(([k]) => k.toLowerCase() !== 'hash')
      .map(([k, v]) => `${k}=${v ?? ''}`)
      .join(' | ');
    res.json({
      data: {
        expected,
        received: parsed.received_hash || null,
        ok: parsed.received_hash ? expected === parsed.received_hash.toUpperCase() : null,
        concatenation_preview: concatenated,
        algorithm: 'SHA-512',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Decimal normalizer: fixes the C# '2.00' bug ────────────────────────
router.post('/decimal', (req, res, next) => {
  try {
    const schema = z.object({ amount: z.union([z.string(), z.number()]) });
    const parsed = schema.parse(req.body);
    res.json({ data: { input: parsed.amount, normalized: paynow.normalizeAmount(parsed.amount) } });
  } catch (err) {
    next(err);
  }
});

// ─── Phone formatter: makes Express payouts prompt for OTP ──────────────
router.post('/phone', (req, res, next) => {
  try {
    const schema = z.object({ phone: z.string() });
    const parsed = schema.parse(req.body);
    const normalized = paynow.normalizePhone(parsed.phone);
    res.json({
      data: {
        input: parsed.phone,
        msisdn: normalized,
        valid: !!(normalized && /^263(7|8)\d{8}$/.test(normalized)),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Sample initiate: returns a deterministic simulated response ───────
// Replaces the old global MOCK_MODE toggle. Always runs in simulated mode
// regardless of whether the project has creds — useful for docs examples.
router.post('/sample/pay', async (req, res, next) => {
  try {
    const result = await paynow.initiate(
      {
        reference: req.body.reference || 'sample-' + Date.now(),
        amount: req.body.amount || '1.00',
        description: req.body.description || 'Sample payment',
        method: req.body.method,
        phone: req.body.phone,
        email: req.body.email,
      },
      { mode: 'test', creds: null, project: {} },
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// ─── Redirect bridge: deep-link return URLs Firebase can't open ─────────
router.get('/redirect/:reference', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('manishapay_transactions')
      .select('merchant_reference, project_id')
      .eq('developer_id', req.developer.id)
      .eq('merchant_reference', req.params.reference)
      .maybeSingle();
    if (error || !data) throw AppError.notFound('Transaction');
    const { data: project } = await supabase
      .from('manishapay_projects')
      .select('return_url')
      .eq('id', data.project_id)
      .maybeSingle();
    if (!project || !project.return_url) {
      throw AppError.badRequest('Project has no return_url configured');
    }
    res.redirect(302, project.return_url);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
