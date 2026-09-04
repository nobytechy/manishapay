/**
 * POST /v1/reconcile — manually trigger a reconciliation sweep.
 *
 * Guarded by CRON_SECRET (not the developer API key or Supabase JWT) so an
 * external scheduler can drive it: cron-job.org, UptimeRobot, a Render Cron
 * Job, or the same uptime pinger that keeps a free host warm. This is the
 * reliable path on a host that sleeps — the in-process interval only runs
 * while the process is awake.
 *
 *   curl -X POST https://<api>/v1/reconcile \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * If CRON_SECRET is unset the endpoint is disabled (503) so it can never run
 * un-authenticated.
 */
'use strict';

const router = require('express').Router();
const nodeCrypto = require('crypto');
const env = require('../config/env');
const { reconcilePending } = require('../services/reconcile');
const { sweepAnonymous, DEFAULT_AGE_DAYS } = require('../services/sweepAnonymous');
const { logger } = require('../services/logger');

/** Constant-time string compare that tolerates length mismatch. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return nodeCrypto.timingSafeEqual(ba, bb);
}

router.post('/', async (req, res) => {
  if (!env.CRON_SECRET) {
    return res.status(503).json({
      error: { code: 'RECONCILE_DISABLED', message: 'CRON_SECRET is not configured on this server' },
    });
  }

  const auth = req.header('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const token = bearer || req.header('X-Cron-Secret') || '';

  if (!token || !safeEqual(token, env.CRON_SECRET)) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret' } });
  }

  try {
    const summary = await reconcilePending();
    return res.json({ data: summary, requestId: req.id });
  } catch (err) {
    logger.error({ err }, 'reconcile: trigger failed');
    return res.status(500).json({ error: { code: 'RECONCILE_FAILED', message: err.message } });
  }
});

/**
 * POST /v1/reconcile/anonymous — delete abandoned guest accounts.
 *
 * Same CRON_SECRET guard as the sweep above, for the same reason: an external
 * scheduler drives it, and an unauthenticated endpoint that deletes users is
 * not something to leave lying around.
 *
 *   # See what it would remove, change nothing (the default):
 *   curl -X POST https://<api>/v1/reconcile/anonymous \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 *   # Actually remove them:
 *   curl -X POST https://<api>/v1/reconcile/anonymous \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H 'Content-Type: application/json' -d '{"confirm":true}'
 *
 * Dry-run is the default and `confirm: true` is required to delete, because
 * the failure mode here is silent and permanent: a bad age or a mistaken
 * filter destroys real merchants and nothing announces it. Run it dry first,
 * read the numbers, then schedule it.
 */
router.post('/anonymous', async (req, res) => {
  if (!env.CRON_SECRET) {
    return res.status(503).json({
      error: { code: 'SWEEP_DISABLED', message: 'CRON_SECRET is not configured on this server' },
    });
  }

  const auth = req.header('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const token = bearer || req.header('X-Cron-Secret') || '';
  if (!token || !safeEqual(token, env.CRON_SECRET)) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret' } });
  }

  const body = req.body || {};
  const olderThanDays = Number.isFinite(Number(body.older_than_days))
    ? Math.max(Number(body.older_than_days), 1)   // never 0 — that would take today's visitors
    : DEFAULT_AGE_DAYS;

  try {
    const summary = await sweepAnonymous({
      olderThanDays,
      dryRun: body.confirm !== true,
      limit: body.limit,
    });
    return res.json({ data: summary, requestId: req.id });
  } catch (err) {
    logger.error({ err }, 'sweep-anonymous: failed');
    return res.status(500).json({ error: { code: 'SWEEP_FAILED', message: err.message } });
  }
});

module.exports = router;
