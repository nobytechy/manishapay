/**
 * POST /v1/webhook/:provider — generic inbound webhook for EVERY non-PayNow gateway.
 *
 * PayNow keeps its own dedicated `/v1/webhook` (form + hash). This route is the
 * multi-gateway equivalent: each provider ships a `verifyWebhook(rawBody, headers,
 * creds)` that verifies the signature and returns `{ valid, status, rawStatus,
 * providerRef, event }`. We:
 *   1. extract a candidate transaction ref from the (still-untrusted) payload,
 *   2. look up the transaction → learn project + mode,
 *   3. load THAT project's creds for THAT provider,
 *   4. verify the signature via the provider,
 *   5. on a verified status change, update the row + fan out to merchant webhooks.
 *
 * We always 200 fast (even on a bad/forged callback) so gateways stop retrying;
 * anything suspicious is logged. The lookup-before-verify is safe: we only read a
 * row to find creds and never act until the provider confirms the signature.
 */
'use strict';

const router = require('express').Router();
const { getProvider } = require('../providers');
const credentials = require('../services/credentials');
const webhookDelivery = require('../services/webhookDelivery');
const whatsapp = require('../services/whatsapp');
const { supabase } = require('../config/supabase');
const { logger } = require('../services/logger');

/**
 * Best-effort, UNVERIFIED extraction of transaction identifiers from a raw
 * webhook body (JSON or form-encoded). Used only to locate the transaction row
 * so we can load the right creds — never to authorize anything.
 */
function candidateRefs(rawBody) {
  const refs = new Set();
  const s = rawBody ? rawBody.toString('utf8') : '';
  if (!s) return [];
  const add = (v) => { if (v != null && String(v).trim()) refs.add(String(v).trim()); };

  // JSON payload (Stripe, Paystack, Flutterwave, PayPal, Yoco, M-Pesa)
  try {
    const j = JSON.parse(s);
    const d = j.data || j.payload || {};
    const r = j.resource || {};
    [
      j.id, j.reference, j.tx_ref, j.txRef,
      d.id, d.reference, d.tx_ref, d.tracker, d.flw_ref, d.merchant_reference,
      d.metadata && d.metadata.reference, d.client_reference_id,
      r.id, r.supplementary_data && r.supplementary_data.related_ids && r.supplementary_data.related_ids.order_id,
      // M-Pesa STK callback
      j.Body && j.Body.stkCallback && j.Body.stkCallback.CheckoutRequestID,
    ].forEach(add);
  } catch { /* not JSON */ }

  // Form-encoded payload (PayFast, Ozow)
  if (s.includes('=')) {
    try {
      const f = Object.fromEntries(new URLSearchParams(s));
      [f.m_payment_id, f.reference, f.TransactionId, f.TransactionReference, f.pf_payment_id].forEach(add);
    } catch { /* ignore */ }
  }
  return [...refs];
}

router.post('/:provider', async (req, res) => {
  const providerId = String(req.params.provider || '').toLowerCase();
  const rawBody = req.rawBody || Buffer.from('');

  let provider;
  try {
    provider = getProvider(providerId);
  } catch {
    logger.warn({ providerId }, 'webhook: unknown provider');
    return res.status(200).send('unknown provider');
  }
  if (typeof provider.verifyWebhook !== 'function') {
    // DPO / Pesepay confirm by polling, not signed webhooks.
    logger.info({ providerId }, 'webhook: provider has no verifyWebhook (poll-only) — ignoring');
    return res.status(200).send('not a webhook provider');
  }

  // 1–2. Locate the transaction from the payload so we know whose creds to use.
  const refs = candidateRefs(rawBody);
  if (!refs.length) {
    logger.warn({ providerId, requestId: req.id }, 'webhook: no candidate ref in payload');
    return res.status(200).send('no reference');
  }

  const { data: txns, error: lookErr } = await supabase
    .from('manishapay_transactions')
    .select('id, developer_id, project_id, provider, tracker, merchant_reference, merchant_amount, currency, status, status_normalized, mode, method, customer_phone')
    .or(`tracker.in.(${refs.join(',')}),merchant_reference.in.(${refs.join(',')})`)
    .eq('provider', providerId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (lookErr) {
    logger.error({ err: lookErr, providerId }, 'webhook: txn lookup failed');
    return res.status(200).send('lookup failed');
  }
  const txn = txns && txns[0];
  if (!txn) {
    logger.warn({ providerId, refs }, 'webhook: no matching transaction — possibly forged or out of scope');
    return res.status(200).send('unknown transaction');
  }

  // 3. Load this project's creds for this provider (stored → sandbox fallback).
  let creds;
  try {
    creds = await credentials.loadActive(txn.project_id, providerId, txn.mode);
  } catch (err) {
    logger.error({ err, providerId, project: txn.project_id }, 'webhook: cred load failed');
    return res.status(200).send('cred load failed');
  }
  if (!creds) {
    logger.warn({ providerId, project: txn.project_id, mode: txn.mode }, 'webhook: no creds to verify with');
    return res.status(200).send('no creds');
  }

  // 4. Verify the signature via the provider. Never throws → returns { valid }.
  let result;
  try {
    result = await provider.verifyWebhook(rawBody, req.headers, creds, { mode: txn.mode, expectedAmount: txn.merchant_amount });
  } catch (err) {
    logger.error({ err, providerId }, 'webhook: verifyWebhook threw');
    return res.status(200).send('verify error');
  }
  if (!result || !result.valid) {
    logger.warn({ providerId, tracker: txn.tracker, reason: result && result.reason }, 'webhook: signature/validation failed — possibly forged');
    return res.status(200).send('invalid signature');
  }

  // Derive the canonical status.
  const normalized = result.status || (result.rawStatus ? provider.normalizeStatus(result.rawStatus) : null);
  if (!normalized) {
    logger.info({ providerId, tracker: txn.tracker, event: result.event }, 'webhook: verified but no status to apply');
    return res.status(200).send('ok');
  }

  // 5. Update on a real change, then fan out (idempotent on status change).
  const changed = normalized !== txn.status_normalized;
  let target = txn;
  if (changed) {
    const updatedAt = new Date().toISOString();
    const { data: updated, error: updErr } = await supabase
      .from('manishapay_transactions')
      .update({
        status: result.rawStatus || normalized,
        status_normalized: normalized,
        paid_at: normalized === 'paid' ? updatedAt : null,
        updated_at: updatedAt,
      })
      .eq('id', txn.id)
      .select('id, developer_id, project_id, provider, merchant_reference, tracker, merchant_amount, currency, status, status_normalized, mode, method, customer_phone')
      .maybeSingle();
    if (updErr) logger.error({ err: updErr, tracker: txn.tracker }, 'webhook: txn update failed');
    target = updated || txn;

    const { data: endpoints } = await supabase
      .from('manishapay_webhook_endpoints')
      .select('id, url, secret, status')
      .eq('project_id', target.project_id)
      .eq('status', 'active');
    if (endpoints && endpoints.length) {
      Promise.all(endpoints.map((ep) => webhookDelivery.deliverOne(ep, target))).catch((err) => {
        logger.error({ err }, 'webhook fan-out failed');
      });
    }

    if (normalized === 'paid' && target.customer_phone) {
      whatsapp
        .sendMessage(target.customer_phone, `ManishaPay: your payment of ${target.currency || 'USD'} ${target.merchant_amount} for "${target.merchant_reference}" was successful. Thank you!`)
        .catch(() => {});
    }
  } else {
    logger.info({ providerId, tracker: txn.tracker, status: normalized }, 'webhook: status unchanged — idempotent, no fan-out');
  }

  res.status(200).send('ok');
});

module.exports = router;
