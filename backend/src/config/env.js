/**
 * Centralized, validated environment configuration.
 *
 * Importing from process.env scattered across the codebase makes it
 * impossible to know what we depend on. This file is the single source
 * of truth — everything else imports from here.
 */
'use strict';

const { z } = require('zod');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // PayNow credentials are NO LONGER read from env per-server. Each merchant
  // adds their own Integration ID + Key through the dashboard, encrypted via
  // services/crypto.js and stored in manishapay_paynow_credentials. The
  // server-level credentials below are only used for ManishaPay's OWN PayNow
  // account (used to charge developers their monthly invoice — dogfood).
  MANISHAPAY_OWN_PAYNOW_INTEGRATION_ID: z.string().optional(),
  MANISHAPAY_OWN_PAYNOW_INTEGRATION_KEY: z.string().optional(),

  PAYNOW_RETURN_URL: z.string().url(),
  PAYNOW_RESULT_URL: z.string().url(),
  PAYNOW_API_BASE: z.string().url().default('https://www.paynow.co.zw/interface'),

  // Public base URL of the simulator page (dashboard's /simulator/:tracker).
  // Falls back to deriving from PAYNOW_RETURN_URL if unset.
  SIMULATOR_BASE_URL: z.string().url().optional(),

  // Master key for envelope-encrypting merchant PayNow credentials.
  // Generate with `openssl rand -hex 32`. Required in production; relaxed
  // in tests so app.js can boot without env wiring.
  MANISHAPAY_MASTER_KEY: z
    .string()
    .min(44, 'MANISHAPAY_MASTER_KEY must be 64-char hex or 44-char base64 (32 bytes)')
    .optional(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars — run `openssl rand -hex 32`'),
  JWT_EXPIRY: z.string().default('1h'),
  REFRESH_EXPIRY: z.string().default('30d'),

  RATE_LIMIT_DEV: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_ADMIN: z.coerce.number().int().positive().default(1000),
  MAX_RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),

  MOCK_MODE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  ALLOW_CORS_ORIGINS: z.string().optional().default(''),
});

// In tests we don't want a hard crash if PayNow creds are missing.
const isTest = process.env.NODE_ENV === 'test';

let parsed;
try {
  parsed = schema.parse(process.env);
} catch (err) {
  if (isTest) {
    // Provide minimal defaults for tests so app.js can still boot.
    parsed = {
      NODE_ENV: 'test',
      PORT: 0,
      LOG_LEVEL: 'error',
      MANISHAPAY_OWN_PAYNOW_INTEGRATION_ID: undefined,
      MANISHAPAY_OWN_PAYNOW_INTEGRATION_KEY: undefined,
      MANISHAPAY_MASTER_KEY:
        '0000000000000000000000000000000000000000000000000000000000000000', // 32 zero bytes for tests
      PAYNOW_RETURN_URL: 'http://localhost/return',
      PAYNOW_RESULT_URL: 'http://localhost/webhook',
      PAYNOW_API_BASE: 'https://www.paynow.co.zw/interface',
      SIMULATOR_BASE_URL: 'http://localhost:3000',
      SUPABASE_URL: 'http://localhost',
      SUPABASE_SERVICE_ROLE: 'test',
      SUPABASE_ANON_KEY: 'test',
      JWT_SECRET: 'test'.repeat(10),
      JWT_EXPIRY: '1h',
      REFRESH_EXPIRY: '30d',
      RATE_LIMIT_DEV: 100,
      RATE_LIMIT_ADMIN: 1000,
      MAX_RETRY_ATTEMPTS: 3,
      MOCK_MODE: true,
      ALLOW_CORS_ORIGINS: '',
    };
  } else {
    // Pretty-print missing/invalid keys so deployment fails loudly.
    // eslint-disable-next-line no-console
    console.error('\n  Invalid environment configuration:');
    for (const issue of err.errors || []) {
      // eslint-disable-next-line no-console
      console.error(`   • ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
}

module.exports = parsed;
