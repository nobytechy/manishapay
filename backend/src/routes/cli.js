/**
 * /v1/cli — powers the ManishaPay CLI's local webhook forwarding
 * (`manishapay listen`). The CLI polls this with an API key and forwards each
 * new payment event to the developer's localhost — the "stripe listen" pattern,
 * on plain HTTP polling (no paid streaming infra).
 */
'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const AppError = require('../errors/AppError');

router.use(authenticate);

router.get('/events', async (req, res, next) => {
  try {
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 5 * 60 * 1000);
    const { data, error } = await supabase
      .from('manishapay_transactions')
      .select('tracker, merchant_reference, merchant_amount, currency, status, status_normalized, mode, method, updated_at')
      .eq('developer_id', req.developer.id)
      .gt('updated_at', since.toISOString())
      .order('updated_at', { ascending: true })
      .limit(50);
    if (error) throw new AppError({ status: 500, code: 'DB_ERROR', message: error.message });

    const events = (data || []).map((t) => ({
      event: 'payment.updated',
      data: {
        reference: t.merchant_reference,
        tracker: t.tracker,
        amount: t.merchant_amount,
        currency: t.currency,
        status: t.status,
        status_normalized: t.status_normalized,
        mode: t.mode,
        method: t.method,
      },
      timestamp: t.updated_at,
    }));
    const cursor = data && data.length ? data[data.length - 1].updated_at : since.toISOString();
    res.json({ data: { events, cursor } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
