/**
 * ManishaPay API gateway — boot file.
 *
 * Loads env vars, builds the Express app from src/app.js, and starts listening.
 * Kept tiny on purpose so the app itself stays testable in isolation (see tests/).
 */
'use strict';

require('dotenv').config();

const { buildApp } = require('./src/app');
const { logger } = require('./src/services/logger');
const env = require('./src/config/env');
const { reconcilePending } = require('./src/services/reconcile');

const port = Number(process.env.PORT || 8787);
const app = buildApp();

const server = app.listen(port, () => {
  logger.info({ port, env: process.env.NODE_ENV || 'development' }, 'ManishaPay gateway listening');
});

// ─── Reconciliation sweep (in-process) ───────────────────────────────────
// Only useful when the process stays awake (keep-warm pinger or a paid plan).
// On a host that sleeps, drive POST /v1/reconcile from an external scheduler
// instead. 0 (the default) disables the in-process timer.
let reconcileTimer = null;
if (env.RECONCILE_INTERVAL_MS > 0) {
  reconcileTimer = setInterval(() => {
    reconcilePending().catch((err) => logger.error({ err }, 'reconcile: interval sweep failed'));
  }, env.RECONCILE_INTERVAL_MS);
  logger.info({ intervalMs: env.RECONCILE_INTERVAL_MS }, 'reconcile: in-process sweep enabled');
}

// Graceful shutdown so cPanel/PM2/systemd can recycle us cleanly.
const shutdown = (signal) => {
  logger.info({ signal }, 'Shutting down gateway');
  if (reconcileTimer) clearInterval(reconcileTimer);
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
    process.exit(0);
  });
  // Hard-exit if we hang for more than 10s.
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled rejection'));
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  shutdown('uncaughtException');
});
