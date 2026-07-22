/**
 * Reconciliation sweep — the safety net for missed PayNow webhooks.
 *
 * PayNow notifies us of a status change by POSTing to /v1/webhook. If our API
 * was asleep (free host) or briefly down when that callback fired, the
 * transaction is stranded in `pending` forever and the merchant is never told
 * their customer paid. This sweep closes that gap: it re-polls every pending,
 * non-simulated transaction directly against PayNow's poll URL and, when the
 * status has resolved, updates our row and fires the merchant webhook — the
 * exact same signed event the live webhook path would have sent.
 *
 * Idempotency: we only fire the merchant webhook when the *normalized* status
 * actually leaves `pending` (i.e. the payment resolved). Re-running the sweep
 * on an already-resolved transaction does nothing because it's no longer in
 * the `pending` query window.
 *
 * Driven two ways (see server.js + routes/reconcile.js):
 *   • in-process setInterval (RECONCILE_INTERVAL_MS) when the process stays awake
 *   • POST /v1/reconcile guarded by CRON_SECRET, for an external scheduler
 *
 * All external deps are injectable so the decision logic is unit-testable
 * without a live database or network.
 */
'use strict';

const { supabase: defaultSupabase } = require('../config/supabase');
const { getProvider } = require('../providers');
const defaultCredentials = require('./credentials');
const webhookDelivery = require('./webhookDelivery');
const { logger: defaultLogger } = require('./logger');
const env = require('../config/env');

const CANON = new Set(['paid', 'pending', 'failed', 'disputed', 'refunded']);

// Process-wide guard so two overlapping sweeps (interval + manual trigger)
// don't double-poll PayNow and race on the same rows.
let running = false;

/**
 * Runs one reconciliation sweep.
 *
 * @param {object} [opts]
 * @param {object} [opts.supabase]      injectable Supabase client
 * @param {object} [opts.paynow]        injectable PayNow service
 * @param {object} [opts.credentials]   injectable credentials service
 * @param {Function} [opts.dispatch]    injectable webhook dispatcher
 * @param {object} [opts.logger]
 * @param {() => number} [opts.now]     injectable clock (ms) for tests
 * @param {boolean} [opts.force]        bypass the concurrency guard (tests)
 * @param {number} [opts.minAgeMinutes]
 * @param {number} [opts.maxAgeHours]
 * @param {number} [opts.batchSize]
 * @returns {Promise<{ scanned: number, updated: number, dispatched: number, errors: number, skipped: boolean }>}
 */
async function reconcilePending(opts = {}) {
  if (running && !opts.force) {
    return { scanned: 0, updated: 0, dispatched: 0, errors: 0, skipped: true };
  }
  running = true;

  const db = opts.supabase || defaultSupabase;
  // Resolve a provider adapter per transaction (contract: pollStatus/normalizeStatus).
  // Injectable for tests; defaults to the real registry so reconcile follows the
  // gateway that actually processed each transaction, not just PayNow.
  const resolveProvider = opts.resolveProvider || ((id) => getProvider(id || 'paynow'));
  const credentials = opts.credentials || defaultCredentials;
  const dispatch = opts.dispatch || webhookDelivery.dispatchToEndpoints;
  const log = opts.logger || defaultLogger;
  const nowMs = opts.now ? opts.now() : Date.now();

  const minAgeMinutes = opts.minAgeMinutes ?? env.RECONCILE_MIN_AGE_MINUTES;
  const maxAgeHours = opts.maxAgeHours ?? env.RECONCILE_MAX_AGE_HOURS;
  const batchSize = opts.batchSize ?? env.RECONCILE_BATCH_SIZE;

  // Only transactions created within [now - maxAge, now - minAge].
  const createdAfter = new Date(nowMs - maxAgeHours * 3600 * 1000).toISOString();
  const createdBefore = new Date(nowMs - minAgeMinutes * 60 * 1000).toISOString();

  const summary = { scanned: 0, updated: 0, dispatched: 0, errors: 0, skipped: false };

  try {
    const { data: rows, error } = await db
      .from('manishapay_transactions')
      .select(
        'id, project_id, developer_id, provider, tracker, merchant_reference, merchant_amount, currency, status, status_normalized, mode, method, poll_url, created_at',
      )
      .neq('mode', 'simulated')
      .eq('status_normalized', 'pending')
      .not('poll_url', 'is', null)
      .gte('created_at', createdAfter)
      .lte('created_at', createdBefore)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (error) {
      log.error({ err: error }, 'reconcile: pending query failed');
      summary.errors += 1;
      return summary;
    }

    summary.scanned = rows ? rows.length : 0;

    for (const txn of rows || []) {
      try {
        const providerId = txn.provider || 'paynow';
        const provider = resolveProvider(providerId);
        const creds = await credentials.loadActive(txn.project_id, providerId, txn.mode);
        if (!creds) {
          // No credentials → we can't verify the poll response. Skip quietly.
          continue;
        }

        const live = await provider.pollStatus(txn.poll_url, creds);
        if (!live) continue;

        // Providers may return a canonical `status` (adapter) or a raw one
        // (legacy service). Derive both robustly either way.
        const rawStatus = live.rawStatus != null ? live.rawStatus : live.status;
        const normalized = live.status && CANON.has(live.status)
          ? live.status
          : provider.normalizeStatus(rawStatus);

        const rawChanged = rawStatus != null && rawStatus !== txn.status;
        const normChanged = normalized && normalized !== txn.status_normalized;
        if (!rawChanged && !normChanged) continue; // gateway agrees — nothing to do.

        const updatedAt = new Date(nowMs).toISOString();
        const { error: updErr } = await db
          .from('manishapay_transactions')
          .update({
            status: rawStatus != null ? rawStatus : txn.status,
            status_normalized: normalized || txn.status_normalized,
            paynow_reference: live.paynow_reference || null,
            paid_at: normalized === 'paid' ? updatedAt : null,
            updated_at: updatedAt,
          })
          .eq('id', txn.id);

        if (updErr) {
          log.error({ err: updErr, tracker: txn.tracker }, 'reconcile: update failed');
          summary.errors += 1;
          continue;
        }
        summary.updated += 1;

        // Fire the merchant webhook only when the payment actually RESOLVED
        // (normalized status left `pending`). A raw-only shuffle updates the row
        // above but is not a merchant-facing event.
        if (normChanged) {
          const target = { ...txn, status: rawStatus, status_normalized: normalized };
          const res = await dispatch(target, { supabase: db, logger: log });
          summary.dispatched += (res && res.dispatched) || 0;
          log.info(
            { tracker: txn.tracker, provider: providerId, from: txn.status_normalized, to: normalized, dispatched: res && res.dispatched },
            'reconcile: recovered stranded transaction',
          );
        }
      } catch (err) {
        // One bad transaction must not abort the sweep.
        summary.errors += 1;
        log.warn({ err, tracker: txn.tracker }, 'reconcile: transaction failed; continuing');
      }
    }

    log.info(summary, 'reconcile sweep complete');
    return summary;
  } finally {
    running = false;
  }
}

module.exports = { reconcilePending };
