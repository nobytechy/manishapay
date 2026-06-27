/**
 * Merchant webhook delivery — the single place that signs and POSTs a
 * `payment.updated` event to a merchant's configured endpoints and records
 * the attempt in manishapay_webhook_deliveries.
 *
 * Extracted so the three callers that need it — the live PayNow webhook
 * (routes/webhooks.js), the simulator (routes/simulator.js), and the
 * reconciliation sweep (services/reconcile.js) — share byte-identical
 * payload + signature semantics. If this drifts, a merchant's signature
 * verification would pass for one path and fail for another.
 *
 * Dependencies (supabase) are injectable so the logic is unit-testable
 * without a live database.
 */
'use strict';

const axios = require('axios');
const nodeCrypto = require('crypto');
const { supabase: defaultSupabase } = require('../config/supabase');
const { logger: defaultLogger } = require('./logger');

const DELIVERY_TIMEOUT_MS = 8_000;

/**
 * Builds the canonical JSON body merchants receive. The signature is
 * computed over `${ts}.${payload}`, so this exact string must be what we
 * both sign and send.
 */
function buildPayload(txn) {
  return JSON.stringify({
    event: 'payment.updated',
    data: {
      reference: txn.merchant_reference,
      tracker: txn.tracker,
      amount: txn.merchant_amount,
      currency: txn.currency || 'USD',
      status: txn.status,
      status_normalized: txn.status_normalized,
      mode: txn.mode,
      method: txn.method,
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Delivers one event to one endpoint and records the attempt. Never throws —
 * a down merchant endpoint must not crash the caller's fan-out — it returns
 * a result object and logs the failed delivery row instead.
 *
 * @param {{ id: string, url: string, secret: string }} endpoint
 * @param {object} txn   transaction row (must carry id, project_id, merchant_*, status*)
 * @param {{ supabase?: object }} [deps]
 * @returns {Promise<{ ok: boolean, status: 'delivered'|'failed', httpStatus: number|null }>}
 */
async function deliverOne(endpoint, txn, deps = {}) {
  const db = deps.supabase || defaultSupabase;
  const payload = buildPayload(txn);
  const ts = Math.floor(Date.now() / 1000);
  const signature = nodeCrypto
    .createHmac('sha256', endpoint.secret || '')
    .update(`${ts}.${payload}`)
    .digest('hex');
  const sigHeader = `t=${ts},v1=${signature}`;

  const start = Date.now();
  let status = 'delivered';
  let httpStatus = null;
  let errorMsg = null;
  try {
    const r = await axios.post(endpoint.url, payload, {
      timeout: DELIVERY_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'X-ManishaPay-Signature': sigHeader,
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

  await db.from('manishapay_webhook_deliveries').insert({
    endpoint_id: endpoint.id,
    transaction_id: txn.id,
    payload,
    signature: sigHeader,
    status,
    http_status: httpStatus,
    error: errorMsg,
    latency_ms: Date.now() - start,
  });

  return { ok: status === 'delivered', status, httpStatus };
}

/**
 * Loads a project's active webhook endpoints and delivers the event to each.
 * Returns how many endpoints were dispatched to (0 if none configured).
 *
 * @param {object} txn   transaction row carrying project_id + payload fields
 * @param {{ supabase?: object, logger?: object }} [deps]
 * @returns {Promise<{ dispatched: number, delivered: number, failed: number }>}
 */
async function dispatchToEndpoints(txn, deps = {}) {
  const db = deps.supabase || defaultSupabase;
  const log = deps.logger || defaultLogger;

  const { data: endpoints, error } = await db
    .from('manishapay_webhook_endpoints')
    .select('id, url, secret, status')
    .eq('project_id', txn.project_id)
    .eq('status', 'active');

  if (error) {
    log.error({ err: error, tracker: txn.tracker }, 'webhook: endpoint lookup failed');
    return { dispatched: 0, delivered: 0, failed: 0 };
  }
  if (!endpoints || endpoints.length === 0) {
    return { dispatched: 0, delivered: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    endpoints.map((ep) => deliverOne(ep, txn, deps)),
  );
  let delivered = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.ok) delivered += 1;
    else failed += 1;
  }
  return { dispatched: endpoints.length, delivered, failed };
}

module.exports = { buildPayload, deliverOne, dispatchToEndpoints };
