/**
 * /v1/transactions — JWT-authenticated transaction operations for the dashboard.
 *
 * Refunds: ManishaPay is a BRIDGE, not a processor. We record the refund
 * (status → refunded), stamp amount/reason, and notify the merchant's webhook
 * endpoints. The actual funds movement is completed by PayNow under the
 * merchant's own PayNow account — we never custody or move money.
 */
'use strict';

const router = require('express').Router();
const { z } = require('zod');
const { jwtAuthenticate } = require('../middleware/jwtAuth');
const { supabase } = require('../config/supabase');
const paynow = require('../services/paynow');
const webhookDelivery = require('../services/webhookDelivery');
const AppError = require('../errors/AppError');

router.use(jwtAuthenticate);

const refundSchema = z.object({
  amount: z.union([z.string(), z.number()]).optional(),
  reason: z.string().max(255).optional(),
});

router.post('/:reference/refund', async (req, res, next) => {
  try {
    const parsed = refundSchema.parse(req.body || {});
    const reference = req.params.reference;

    const { data: rows, error } = await supabase
      .from('manishapay_transactions')
      .select('*')
      .eq('developer_id', req.developer.id)
      .eq('merchant_reference', reference)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw new AppError({ status: 500, code: 'DB_ERROR', message: error.message });
    const txn = rows && rows[0];
    if (!txn) throw AppError.notFound('Transaction');
    if (txn.status_normalized !== 'paid') {
      throw AppError.badRequest(`Only a paid transaction can be refunded (this one is "${txn.status_normalized}").`);
    }

    const refundAmount = parsed.amount != null ? paynow.normalizeAmount(parsed.amount) : txn.merchant_amount;

    const { data: updated, error: updErr } = await supabase
      .from('manishapay_transactions')
      .update({
        status: 'Refunded',
        status_normalized: 'refunded',
        refund_amount: refundAmount,
        refund_reason: parsed.reason || null,
        refunded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', txn.id)
      .select('*')
      .single();
    if (updErr) throw new AppError({ status: 500, code: 'REFUND_FAILED', message: updErr.message });

    // Notify the merchant's endpoints that the payment is now refunded. Best-effort.
    webhookDelivery.dispatchToEndpoints(updated).catch(() => {});

    res.json({
      data: {
        reference: txn.merchant_reference,
        tracker: txn.tracker,
        status: 'refunded',
        refund_amount: refundAmount,
        currency: txn.currency,
        note: 'Refund recorded and the merchant endpoints were notified. As a bridge, the funds movement is completed by PayNow under your PayNow account.',
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
