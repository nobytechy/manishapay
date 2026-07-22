'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
process.env.MOCK_MODE = 'true';

const paystack = require('../src/providers/paystack');

// ── normalizeStatus: every raw value from the research note ──────────────────
test('normalizeStatus maps transaction outcomes into the 5-value enum', () => {
  assert.equal(paystack.normalizeStatus('success'), 'paid');
  assert.equal(paystack.normalizeStatus('failed'), 'failed');
  assert.equal(paystack.normalizeStatus('abandoned'), 'failed');
  assert.equal(paystack.normalizeStatus('pending'), 'pending');
  assert.equal(paystack.normalizeStatus('ongoing'), 'pending');
  assert.equal(paystack.normalizeStatus('processing'), 'pending');
  assert.equal(paystack.normalizeStatus('queued'), 'pending');
  assert.equal(paystack.normalizeStatus('reversed'), 'refunded');
});

test('normalizeStatus maps webhook event names', () => {
  assert.equal(paystack.normalizeStatus('charge.success'), 'paid');
  assert.equal(paystack.normalizeStatus('refund.processed'), 'refunded');
  assert.equal(paystack.normalizeStatus('refund.pending'), 'pending');
  assert.equal(paystack.normalizeStatus('refund.failed'), 'failed');
  assert.equal(paystack.normalizeStatus('dispute.create'), 'disputed');
  assert.equal(paystack.normalizeStatus('dispute.created'), 'disputed');
});

test('normalizeStatus is case/whitespace-insensitive', () => {
  assert.equal(paystack.normalizeStatus('SUCCESS'), 'paid');
  assert.equal(paystack.normalizeStatus('  Success  '), 'paid');
});

test('normalizeStatus defaults unknown/empty to pending (never silently paid)', () => {
  assert.equal(paystack.normalizeStatus('some-new-status'), 'pending');
  assert.equal(paystack.normalizeStatus(''), 'pending');
  assert.equal(paystack.normalizeStatus(undefined), 'pending');
  assert.equal(paystack.normalizeStatus(null), 'pending');
});

// ── amount: major units → subunits (× 100 integer) ──────────────────────────
test('toGatewayAmount converts major units to integer subunits (×100)', () => {
  assert.equal(paystack.toGatewayAmount('100.00'), 10000);
  assert.equal(paystack.toGatewayAmount(100), 10000);
  assert.equal(paystack.toGatewayAmount('1'), 100);
  assert.equal(paystack.toGatewayAmount('0.50'), 50);
  assert.equal(paystack.toGatewayAmount('19.99'), 1999);
});

test('toGatewayAmount rounds float artefacts to a whole subunit', () => {
  // 10.005 * 100 = 1000.4999… in IEEE-754 → must round to 1001, and be an integer
  const v = paystack.toGatewayAmount('10.005');
  assert.ok(Number.isInteger(v));
  assert.equal(v, 1001);
});

test('toGatewayAmount accepts comma-decimal locale', () => {
  assert.equal(paystack.toGatewayAmount('12,50'), 1250);
});

test('toGatewayAmount rejects non-positive / non-numeric amounts', () => {
  assert.throws(() => paystack.toGatewayAmount('0'));
  assert.throws(() => paystack.toGatewayAmount('-5'));
  assert.throws(() => paystack.toGatewayAmount('abc'));
});

// ── webhook: HMAC-SHA512 of RAW body with the secret key ─────────────────────
test('verifyWebhook accepts a correct HMAC-SHA512 signature (known vector)', () => {
  const secretKey = 'sk_test_0123456789abcdef';
  const rawBody = JSON.stringify({
    event: 'charge.success',
    data: { reference: 'mp_deadbeef', status: 'success', amount: 10000, currency: 'NGN' },
  });
  const signature = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');

  const result = paystack.verifyWebhook(rawBody, { 'x-paystack-signature': signature }, { secretKey });
  assert.equal(result.valid, true);
  assert.equal(result.event, 'charge.success');
  assert.equal(result.status, 'paid');
  assert.equal(result.providerRef, 'mp_deadbeef');
});

test('verifyWebhook computes HMAC over the RAW bytes (Buffer body)', () => {
  const secretKey = 'sk_test_0123456789abcdef';
  const rawBody = Buffer.from(JSON.stringify({ event: 'refund.processed', data: { reference: 'r1', status: 'reversed' } }), 'utf8');
  const signature = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');

  const result = paystack.verifyWebhook(rawBody, { 'x-paystack-signature': signature }, { secretKey });
  assert.equal(result.valid, true);
  assert.equal(result.status, 'refunded');
});

test('verifyWebhook: fixed known-answer vector', () => {
  // Deterministic vector — recompute independently to pin the algorithm.
  const secretKey = 'sk_test_key';
  const rawBody = '{"event":"charge.success","data":{"reference":"abc","status":"success"}}';
  const expected = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');
  // sanity: SHA-512 hex digest is 128 chars
  assert.equal(expected.length, 128);
  const result = paystack.verifyWebhook(rawBody, { 'x-paystack-signature': expected }, { secretKey });
  assert.equal(result.valid, true);
});

test('verifyWebhook rejects a tampered body / wrong signature', () => {
  const secretKey = 'sk_test_0123456789abcdef';
  const rawBody = JSON.stringify({ event: 'charge.success', data: { reference: 'x', status: 'success' } });
  const signature = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');

  // Body mutated after signing → invalid.
  const tampered = rawBody.replace('success', 'failed');
  assert.equal(paystack.verifyWebhook(tampered, { 'x-paystack-signature': signature }, { secretKey }).valid, false);

  // Wrong secret key → invalid.
  assert.equal(paystack.verifyWebhook(rawBody, { 'x-paystack-signature': signature }, { secretKey: 'sk_test_other' }).valid, false);

  // Garbage signature (different length) → invalid, no throw.
  assert.equal(paystack.verifyWebhook(rawBody, { 'x-paystack-signature': 'nope' }, { secretKey }).valid, false);
});

test('verifyWebhook returns {valid:false} on missing inputs (never throws)', () => {
  assert.equal(paystack.verifyWebhook('{}', {}, { secretKey: 'sk' }).valid, false);
  assert.equal(paystack.verifyWebhook(null, { 'x-paystack-signature': 'x' }, { secretKey: 'sk' }).valid, false);
  assert.equal(paystack.verifyWebhook('{}', { 'x-paystack-signature': 'x' }, null).valid, false);
});

// ── contract / metadata sanity ───────────────────────────────────────────────
test('provider exposes the contract shape', () => {
  assert.equal(paystack.id, 'paystack');
  assert.equal(typeof paystack.initiate, 'function');
  assert.equal(typeof paystack.pollStatus, 'function');
  assert.equal(typeof paystack.normalizeStatus, 'function');
  assert.equal(typeof paystack.verifyWebhook, 'function');
  assert.equal(typeof paystack.refund, 'function');
  assert.ok(Array.isArray(paystack.credentialSchema));
});

test('initiate rejects when no credentials are supplied', async () => {
  await assert.rejects(
    () => paystack.initiate({ reference: 'o1', amount: '10.00', email: 'a@b.com' }, { mode: 'live', creds: null, project: {} }),
    (err) => err.code === 'CREDENTIALS_REQUIRED',
  );
});

test('initiate requires an email (Paystack mandatory field)', async () => {
  await assert.rejects(
    () => paystack.initiate({ reference: 'o1', amount: '10.00' }, { mode: 'test', creds: { secretKey: 'sk_test_x' }, project: {} }),
    (err) => err.status === 400,
  );
});
