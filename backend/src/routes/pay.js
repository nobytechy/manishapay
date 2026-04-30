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

    // Persist the transaction. Failures are logged but don't block the
    // response — the merchant already has a working redirect URL.
    const { error: insertErr } = await supabase.from('manishapay_transactions').insert({
      developer_id: req.developer.id,
      project_id: project.id,
      tracker: result.tracker,
      merchant_reference: parsed.data.reference,
      merchant_amount: merchantAmount,
      customer_amount: merchantAmount, // v1: no fee pass-through
      status: result.status || 'Sent',
      status_normalized: paynow.normalizeStatus(result.status || 'Sent'),
      mode: result.mode,
      method: parsed.data.method || null,
      poll_url: result.poll_url,
      browser_url: result.browser_url,
      request_id: req.id,
      billable: result.mode !== 'simulated', // simulated transactions don't count toward billing
    });
    if (insertErr && req.log) {
      req.log.warn({ err: insertErr }, 'transaction insert failed');
    }

    res.status(201).json({
      data: {
        reference: parsed.data.reference,
        tracker: result.tracker,
        browser_url: result.browser_url,
        poll_url: result.poll_url,
        status: result.status,
        mode: result.mode,
        instructions: result.instructions,
      },
      requestId: req.id,
    });
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
        'tracker, merchant_reference, merchant_amount, customer_amount, status, status_normalized, mode, method, poll_url, paynow_reference, created_at, updated_at',
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
