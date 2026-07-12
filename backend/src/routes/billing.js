/**
 * /v1/billing — usage metering for the current period + past invoices.
 *
 * Billing model: free_tier_monthly successful transactions/month are free,
 * then per_txn_fee_usd per billable transaction. Usage is metered from the
 * `billable` flag on transactions; this endpoint computes the live current-
 * period position and lists finalised invoices.
 */
'use strict';

const router = require('express').Router();
const { jwtAuthenticate } = require('../middleware/jwtAuth');
const { supabase } = require('../config/supabase');
const AppError = require('../errors/AppError');

router.use(jwtAuthenticate);

router.get('/', async (req, res, next) => {
  try {
    const { data: dev } = await supabase
      .from('manishapay_developers')
      .select('free_tier_monthly, per_txn_fee_usd')
      .eq('id', req.developer.id)
      .maybeSingle();
    const freeTier = dev?.free_tier_monthly ?? 50;
    const fee = Number(dev?.per_txn_fee_usd ?? 0.05);

    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);

    const { count, error } = await supabase
      .from('manishapay_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('developer_id', req.developer.id)
      .eq('billable', true)
      .gte('created_at', start.toISOString());
    if (error) throw new AppError({ status: 500, code: 'DB_ERROR', message: error.message });

    const billable = count || 0;
    const overage = Math.max(0, billable - freeTier);
    const amountDue = Number((overage * fee).toFixed(2));

    const { data: invoices } = await supabase
      .from('manishapay_invoices')
      .select('period_start, period_end, txn_count, billable_count, amount_due, currency, status, paid_at')
      .eq('developer_id', req.developer.id)
      .order('period_start', { ascending: false })
      .limit(12);

    res.json({
      data: {
        period_start: start.toISOString(),
        billable_this_period: billable,
        free_tier: freeTier,
        overage,
        per_txn_fee: fee,
        amount_due: amountDue,
        currency: 'USD',
        invoices: invoices || [],
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
