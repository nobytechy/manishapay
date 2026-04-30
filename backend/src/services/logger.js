/**
 * Structured logger built on pino.
 *
 * In dev we pretty-print to the console; in prod we emit JSON so cPanel
 * tail / grep / Logflare can parse it cleanly. Sensitive fields are
 * redacted to avoid leaking PayNow keys into log files.
 */
'use strict';

const pino = require('pino');
const env = require('../config/env');

const isDev = env.NODE_ENV !== 'production';

const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'manishapay-gateway' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.PAYNOW_INTEGRATION_KEY',
      '*.SUPABASE_SERVICE_ROLE',
      '*.JWT_SECRET',
      '*.password',
      '*.token',
      '*.refresh_token',
    ],
    censor: '[REDACTED]',
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
      }
    : undefined,
});

module.exports = { logger };
