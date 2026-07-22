/**
 * /v1/subscriptions — recurring billing.
 *
 *   POST /                 create a subscription
 *   POST /:id/charge       raise a payment for this period (returns browser_url)
 *
 * Charging initiates a normal PayNow payment for the subscription amount. Where
 * PayNow tokenisation is enabled a future upgrade can charge silently; today we
 * generate the checkout so the customer completes it. List/pause/cancel are done
 * from the dashboard via row-level-secured reads/writes.
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
const AppError = require('../errors/AppError');

router.use(jwtAuthenticate);

const MS = { weekly: 7 * 864e5, monthly: 30 * 864e5, yearly: 365 * 864e5 };

const createSchema = z.object({
  project_id: z.string().uuid(),
  // Which gateway bills this subscription. Optional — defaults to PayNow so all
  // existing subscriptions keep working. Unknown/not-yet-live gateways are
  // rejected by the registry at charge time.
  provider: z.string().min(1).max(32).optional(),
  title: z.string().min(1).max(120),
  amount: z.union([z.string(), z.number()]),
  currency: z.enum(['USD', 'ZWL']).optional(),
  billing_interval: z.enum(['weekly', 'monthly', 'yearly']).optional(),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().optional(),
});

router.post('/', requireCapability('payments'), async (req, res, next) => {
  try {
    const p = createSchema.parse(req.body);
    const { data: proj } = await supabase
      .from('manishapay_projects').select('id')
      .eq('id', p.project_id).eq('developer_id', req.developer.id).maybeSingle();
    if (!proj) throw AppError.notFound('Project');

    const interval = p.billing_interval || 'monthly';
    const next = new Date(Date.now() + MS[interval]).toISOString();

    const { data, error } = await supabase
      .from('manishapay_subscriptions')
      .insert({
        developer_id: req.developer.id,
        project_id: p.project_id,
        provider: p.provider || 'paynow',
        title: p.title,
        amount: paynow.normalizeAmount(p.amount),
        currency: p.currency || 'USD',
        billing_interval: interval,
        customer_email: p.customer_email || null,
        customer_phone: p.customer_phone || null,
        next_charge_at: next,
      })
      .select('*')
      .single();
    if (error) throw new AppError({ status: 500, code: 'SUB_CREATE_FAILED', message: error.message });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/charge', requireCapability('payments'), async (req, res, next) => {
  try {
    const { data: sub, error } = await supabase
      .from('manishapay_subscriptions').select('*')
      .eq('id', req.params.id).eq('developer_id', req.developer.id).maybeSingle();
    if (error) throw new AppError({ status: 500, code: 'DB_ERROR', message: error.message });
    if (!sub) throw AppError.notFound('Subscription');
    if (sub.status !== 'active') throw AppError.badRequest('Subscription is not active.');

    const { data: project } = await supabase
      .from('manishapay_projects').select('id, return_url, result_url, default_mode')
      .eq('id', sub.project_id).maybeSingle();

    // Resolve the gateway via the registry — never call a provider directly.
    // Defaults to PayNow; an unknown/not-yet-live gateway throws a clean error.
    const providerId = sub.provider || 'paynow';
    const provider = getProvider(providerId);

    // Prefer the merchant's live credentials for THIS gateway; fall back to
    // test/sandbox. loadActive is provider-aware.
    let mode = 'live';
    let creds = await credentials.loadActive(sub.project_id, providerId, 'live');
    if (!creds) { mode = 'test'; creds = await credentials.loadActive(sub.project_id, providerId, 'test'); }

    const reference = `sub-${sub.id.slice(0, 8)}-${nodeCrypto.randomBytes(3).toString('hex')}`;
    const result = await provider.initiate(
      { reference, amount: String(sub.amount), description: sub.title, email: sub.customer_email, phone: sub.customer_phone, currency: sub.currency },
      { mode, creds, project },
    );

    await supabase.from('manishapay_transactions').insert({
      developer_id: sub.developer_id,
      project_id: sub.project_id,
      provider: providerId,
      tracker: result.providerRef,
      merchant_reference: reference,
      merchant_amount: paynow.normalizeAmount(sub.amount),
      customer_amount: paynow.normalizeAmount(sub.amount),
      currency: sub.currency,
      status: result.rawStatus || 'Sent',
      status_normalized: result.status || paynow.normalizeStatus('Sent'),
      mode: result.mode,
      customer_phone: sub.customer_phone || null,
      poll_url: result.pollUrl,
      browser_url: result.checkoutUrl,
      billable: result.mode !== 'simulated',
    });

    await supabase.from('manishapay_subscriptions').update({
      last_charge_at: new Date().toISOString(),
      next_charge_at: new Date(Date.now() + MS[sub.billing_interval]).toISOString(),
    }).eq('id', sub.id);

    res.json({ data: { provider: providerId, reference, tracker: result.providerRef, browser_url: result.checkoutUrl, status: result.rawStatus } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
