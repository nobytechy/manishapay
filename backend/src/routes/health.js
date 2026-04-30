/**
 * Health/uptime endpoints.
 *
 * `/health`        — fast liveness probe (no DB call). Use for load balancers.
 * `/health/deep`   — readiness probe; pings Supabase + PayNow status URL.
 *                    Should be called sparingly (cron, status page).
 */
'use strict';

const router = require('express').Router();
const axios = require('axios');
const { supabase } = require('../config/supabase');
const env = require('../config/env');

router.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'manishapay-gateway', uptime_seconds: Math.round(process.uptime()) });
});

router.get('/deep', async (_req, res) => {
  const checks = {};

  try {
    const start = Date.now();
    const { error } = await supabase.from('api_keys').select('id').limit(1);
    checks.supabase = { ok: !error, latency_ms: Date.now() - start, error: error?.message };
  } catch (err) {
    checks.supabase = { ok: false, error: err.message };
  }

  try {
    const start = Date.now();
    // We don't actually call /interface, just resolve DNS to confirm reachability.
    await axios.head(env.PAYNOW_API_BASE, { timeout: 5_000, validateStatus: () => true });
    checks.paynow = { ok: true, latency_ms: Date.now() - start };
  } catch (err) {
    checks.paynow = { ok: false, error: err.message };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  res.status(allOk ? 200 : 503).json({ status: allOk ? 'ok' : 'degraded', checks });
});

module.exports = router;
