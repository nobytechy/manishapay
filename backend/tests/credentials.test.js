'use strict';

/**
 * Credential-service tests — focused on the shared-sandbox env fallback that
 * powers zero-setup onboarding for every gateway. (The DB-backed loadActive
 * path is exercised via the pay-route + provider integration probes.)
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.MANISHAPAY_MASTER_KEY = '0000000000000000000000000000000000000000000000000000000000000000';

const credentials = require('../src/services/credentials');

const SANDBOX_ENV_KEYS = [
  'STRIPE_TEST_SECRET_KEY', 'STRIPE_TEST_WEBHOOK_SECRET',
  'PAYSTACK_TEST_SECRET_KEY',
  'FLUTTERWAVE_V4_CLIENT_ID', 'FLUTTERWAVE_V4_CLIENT_SECRET', 'FLUTTERWAVE_ENCRYPTION_KEY', 'FLUTTERWAVE_SECRET_HASH',
  'PAYPAL_SANDBOX_CLIENT_ID', 'PAYPAL_SANDBOX_CLIENT_SECRET', 'PAYPAL_SANDBOX_WEBHOOK_ID',
  'YOCO_TEST_SECRET_KEY', 'YOCO_TEST_WEBHOOK_SECRET',
  'PESEPAY_TEST_INTEGRATION_KEY', 'PESEPAY_TEST_ENCRYPTION_KEY',
  'PAYFAST_TEST_MERCHANT_ID', 'PAYFAST_TEST_MERCHANT_KEY', 'PAYFAST_TEST_PASSPHRASE',
  'OZOW_TEST_SITE_CODE', 'OZOW_TEST_PRIVATE_KEY', 'OZOW_TEST_API_KEY',
  'MPESA_TEST_CONSUMER_KEY', 'MPESA_TEST_CONSUMER_SECRET', 'MPESA_TEST_SHORTCODE', 'MPESA_TEST_PASSKEY',
  'DPO_TEST_COMPANY_TOKEN',
];

function clearSandboxEnv() {
  const saved = {};
  for (const k of SANDBOX_ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  return () => { for (const k of SANDBOX_ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } };
}

test('sandboxFromEnv returns null for every gateway when no platform keys are set', () => {
  const restore = clearSandboxEnv();
  try {
    for (const p of ['stripe', 'paystack', 'flutterwave', 'paypal', 'yoco', 'pesepay', 'payfast', 'ozow', 'mpesa', 'dpo']) {
      assert.equal(credentials.sandboxFromEnv(p), null, `${p} → null with no env`);
    }
    assert.equal(credentials.sandboxFromEnv('unknown-gateway'), null);
  } finally { restore(); }
});

test('sandboxFromEnv maps each gateway to its declared config shape', () => {
  const restore = clearSandboxEnv();
  try {
    process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_stripe';
    assert.deepEqual(credentials.sandboxFromEnv('stripe'), { secretKey: 'sk_test_stripe', webhookSecret: null });

    process.env.PAYSTACK_TEST_SECRET_KEY = 'sk_test_ps';
    assert.deepEqual(credentials.sandboxFromEnv('paystack'), { secretKey: 'sk_test_ps' });

    process.env.FLUTTERWAVE_V4_CLIENT_ID = 'cid';
    process.env.FLUTTERWAVE_V4_CLIENT_SECRET = 'csec';
    const fw = credentials.sandboxFromEnv('flutterwave');
    assert.equal(fw.clientId, 'cid');
    assert.equal(fw.clientSecret, 'csec');

    process.env.MPESA_TEST_CONSUMER_KEY = 'ck';
    process.env.MPESA_TEST_CONSUMER_SECRET = 'cs';
    process.env.MPESA_TEST_SHORTCODE = '174379';
    process.env.MPESA_TEST_PASSKEY = 'pk';
    const mp = credentials.sandboxFromEnv('mpesa');
    assert.equal(mp.shortcode, '174379');
    assert.equal(mp.passkey, 'pk');

    process.env.PAYFAST_TEST_MERCHANT_ID = '10000100';
    process.env.PAYFAST_TEST_MERCHANT_KEY = 'key';
    const pf = credentials.sandboxFromEnv('payfast');
    assert.equal(pf.merchantId, '10000100');
  } finally { restore(); }
});

test('sandboxFromEnv requires ALL mandatory keys (partial config → null)', () => {
  const restore = clearSandboxEnv();
  try {
    // Flutterwave needs both client id + secret — only one present → null.
    process.env.FLUTTERWAVE_V4_CLIENT_ID = 'cid-only';
    assert.equal(credentials.sandboxFromEnv('flutterwave'), null);
    // M-Pesa needs all four — three present → null.
    process.env.MPESA_TEST_CONSUMER_KEY = 'ck';
    process.env.MPESA_TEST_CONSUMER_SECRET = 'cs';
    process.env.MPESA_TEST_SHORTCODE = '174379';
    assert.equal(credentials.sandboxFromEnv('mpesa'), null);
  } finally { restore(); }
});
