/**
 * /v1/webhook — receives PayNow's server-to-server callback.
 *
 * PayNow POSTs a URL-encoded body containing reference, amount, status,
 * and a hash. The `reference` field is OUR globally-unique tracker
 * (`mp_<hex>`), not the merchant's reference, so we can route the
 * callback to the right project even if two merchants share a
 * merchant_reference value.
 *
 * Flow:
 *   1. Look up transaction by tracker → know which project + mode
 *   2. Load that project's credentials and verify the hash
 *   3. Update the transaction row + bump status_normalized
 *   4. Fan out to merchant's webhook endpoints (signed, retried elsewhere)
 *   5. Return 200 OK fast — anything else and PayNow retries up to 10x
 */
'use strict';

const router = require('express').Router();
const axios = require('axios');
const nodeCrypto = require('crypto');
const hash = require('../services/hash');
const credentials = require('../services/credentials');
const paynow = require('../services/paynow');
const { supabase } = require('../config/supabase');
const { logger } = require('../services/logger');

router.post('/', async (req, res) => {
  // PayNow sends form-encoded; use the raw body that app.js captured.
  const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
  const fields = hash.parseQueryString(raw);
  const tracker = fields.reference;

  if (!tracker) {
    logger.warn({ requestId: req.id, fields }, 'webhook missing reference field');
    return res.status(200).send('missing reference');
  }

  // Look up the transaction so we know which project's creds to use.
  const { data: txn, error: txnErr } = await supabase
    .from('manishapay_transactions')
    .select('id, developer_id, project_id, tracker, merchant_reference, mode, status')
    .eq('tracker', tracker)
    .maybeSingle();

  if (txnErr) {
    logger.error({ err: txnErr, tracker }, 'webhook: txn lookup failed');
    return res.status(200).send('lookup failed');
  }
  if (!txn) {
    logger.warn({ tracker }, 'webhook: no transaction matches tracker — possibly forged');
    return res.status(200).send('unknown tracker');
  }

  // Load this project's credentials so we can verify the hash.
  let creds;
  try {
    creds = await credentials.loadActive(txn.project_id, txn.mode);
  } catch (err) {
    logger.error({ err, project: txn.project_id, mode: txn.mode }, 'webhook: cred load failed');
    return res.status(200).send('cred load failed');
  }

  if (!creds) {
    logger.warn(
      { tracker, project: txn.project_id, mode: txn.mode },
      'webhook: no creds for project+mode (was the txn simulated?)',
    );
    // Acknowledge so PayNow stops retrying.
    return res.status(200).send('no creds');
  }

  const verification = hash.verify(fields, creds.integrationKey);
  if (!verification.ok) {
    logger.warn(
      {
        requestId: req.id,
        tracker,
        expected: verification.expected,
        actual: verification.actual,
      },
      'webhook signature mismatch — possibly forged',
    );
    // Acknowledge so PayNow doesn't retry forever; flag in logs.
    return res.status(200).send('signature mismatch');
  }

  const newStatus = fields.status;
  const newStatusNormalized = paynow.normalizeStatus(newStatus);
  const updatedAt = new Date().toISOString();

  const { data: updated, error: updErr } = await supabase
    .from('manishapay_transactions')
    .update({
      status: newStatus,
      status_normalized: newStatusNormalized,
      paynow_reference: fields.paynowreference || null,
      paid_at: newStatusNormalized === 'paid' ? updatedAt : null,
      updated_at: updatedAt,
    })
    .eq('id', txn.id)
    .select('id, developer_id, project_id, merchant_reference, tracker, merchant_amount, status, status_normalized, mode, method')
    .maybeSingle();

  if (updErr) {
    logger.error({ err: updErr, tracker }, 'webhook: txn update failed');
  }

  // Idempotency: PayNow re-delivers the same callback up to 10x. Only fan out
  // to the merchant's endpoints when the status actually CHANGED, so retries
  // never cause the merchant to process the same payment twice.
  const statusChanged = txn.status !== newStatus;
  const target = updated || txn;

  if (statusChanged) {
    const { data: endpoints } = await supabase
      .from('manishapay_webhook_endpoints')
      .select('id, url, secret, status')
      .eq('project_id', target.project_id)
      .eq('status', 'active');

    if (endpoints && endpoints.length > 0) {
      Promise.all(endpoints.map((ep) => deliver(ep, target))).catch((err) => {
        logger.error({ err }, 'webhook fan-out failed');
      });
    }
  } else {
    logger.info({ tracker, status: newStatus }, 'webhook: status unchanged — skipping merchant fan-out (idempotent retry)');
  }

  res.status(200).send('ok');
});

async function deliver(endpoint, txn) {
  const payload = JSON.stringify({
    event: 'payment.updated',
    data: {
      reference: txn.merchant_reference,
      tracker: txn.tracker,
      amount: txn.merchant_amount,
      status: txn.status,
      status_normalized: txn.status_normalized,
      mode: txn.mode,
      method: txn.method,
    },
    timestamp: new Date().toISOString(),
  });
  const ts = Math.floor(Date.now() / 1000);
  const signature = nodeCrypto
    .createHmac('sha256', endpoint.secret || '')
    .update(`${ts}.${payload}`)
    .digest('hex');

  const start = Date.now();
  let status = 'delivered';
  let httpStatus = null;
  let errorMsg = null;
  try {
    const r = await axios.post(endpoint.url, payload, {
      timeout: 8_000,
      headers: {
        'Content-Type': 'application/json',
        'X-ManishaPay-Signature': `t=${ts},v1=${signature}`,
      },
      validateStatus: () => true,
    });
    httpStatus = r.status;
    if (r.status >= 400) {
      status = 'failed';
      errorMsg = `HTTP ${r.status}`;
    }
  } catch (err) {
    status = 'failed';
    errorMsg = err.message;
  }

  await supabase.from('manishapay_webhook_deliveries').insert({
    endpoint_id: endpoint.id,
    transaction_id: txn.id,
    payload,
    signature: `t=${ts},v1=${signature}`,
    status,
    http_status: httpStatus,
    error: errorMsg,
    latency_ms: Date.now() - start,
  });
}

module.exports = router;
