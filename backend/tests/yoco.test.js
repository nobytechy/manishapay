'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
process.env.MOCK_MODE = 'true';

const yoco = require('../src/providers/yoco');

// ── normalizeStatus: every raw value from the research note ──────────────────
test('normalizeStatus maps checkout lifecycle statuses into the 5-value enum', () => {
  assert.equal(yoco.normalizeStatus('created'), 'pending');
  assert.equal(yoco.normalizeStatus('started'), 'pending');
  assert.equal(yoco.normalizeStatus('processing'), 'pending');
  assert.equal(yoco.normalizeStatus('pending'), 'pending');
  assert.equal(yoco.normalizeStatus('completed'), 'paid');
  assert.equal(yoco.normalizeStatus('failed'), 'failed');
  assert.equal(yoco.normalizeStatus('cancelled'), 'failed');
  assert.equal(yoco.normalizeStatus('canceled'), 'failed');
  assert.equal(yoco.normalizeStatus('refunded'), 'refunded');
});

test('normalizeStatus maps webhook event types', () => {
  assert.equal(yoco.normalizeStatus('payment.succeeded'), 'paid');
  assert.equal(yoco.normalizeStatus('payment.failed'), 'failed');
  assert.equal(yoco.normalizeStatus('payment.cancelled'), 'failed');
  assert.equal(yoco.normalizeStatus('refund.succeeded'), 'refunded');
  assert.equal(yoco.normalizeStatus('refund.failed'), 'failed');
});

test('normalizeStatus is case/whitespace-insensitive', () => {
  assert.equal(yoco.normalizeStatus('COMPLETED'), 'paid');
  assert.equal(yoco.normalizeStatus('  Payment.Succeeded  '), 'paid');
});

test('normalizeStatus defaults unknown/empty to pending (never silently paid)', () => {
  assert.equal(yoco.normalizeStatus('some-new-status'), 'pending');
  assert.equal(yoco.normalizeStatus(''), 'pending');
  assert.equal(yoco.normalizeStatus(undefined), 'pending');
  assert.equal(yoco.normalizeStatus(null), 'pending');
});

test('normalizeStatus never emits disputed (Yoco exposes no disputes API)', () => {
  // Sanity: no raw value maps to 'disputed'.
  const raws = ['created', 'started', 'processing', 'completed', 'failed', 'cancelled',
    'refunded', 'payment.succeeded', 'payment.failed', 'refund.succeeded', 'anything'];
  for (const r of raws) assert.notEqual(yoco.normalizeStatus(r), 'disputed');
});

// ── amount: major units (ZAR) → cents (× 100 integer) + R2.00 minimum ─────────
test('toGatewayAmount converts Rand to integer cents (×100)', () => {
  assert.equal(yoco.toGatewayAmount('100.00'), 10000);
  assert.equal(yoco.toGatewayAmount(100), 10000);
  assert.equal(yoco.toGatewayAmount('2'), 200);
  assert.equal(yoco.toGatewayAmount('2.00'), 200);
  assert.equal(yoco.toGatewayAmount('19.99'), 1999);
});

test('toGatewayAmount rounds float artefacts to a whole cent', () => {
  // 10.005 * 100 = 1000.4999… in IEEE-754 → must round to 1001, and be an integer
  const v = yoco.toGatewayAmount('10.005');
  assert.ok(Number.isInteger(v));
  assert.equal(v, 1001);
});

test('toGatewayAmount accepts comma-decimal locale', () => {
  assert.equal(yoco.toGatewayAmount('12,50'), 1250);
});

test('toGatewayAmount enforces the R2.00 (200-cent) minimum', () => {
  assert.throws(() => yoco.toGatewayAmount('1.99'), /minimum charge is R2\.00/);
  assert.throws(() => yoco.toGatewayAmount('0.50'), /minimum charge/);
  // Exactly R2.00 is allowed.
  assert.equal(yoco.toGatewayAmount('2.00'), 200);
});

test('toGatewayAmount rejects non-positive / non-numeric / non-ZAR', () => {
  assert.throws(() => yoco.toGatewayAmount('0'));
  assert.throws(() => yoco.toGatewayAmount('-5'));
  assert.throws(() => yoco.toGatewayAmount('abc'));
  assert.throws(() => yoco.toGatewayAmount('100.00', 'USD'), /only settles in ZAR/);
});

// ── webhook: Svix HMAC-SHA256 over `{id}.{timestamp}.{body}` ──────────────────
test('signSvix matches the documented Svix known-answer vector', () => {
  // Canonical example from the Svix signature docs.
  const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
  const id = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
  const timestamp = '1614265330';
  const body = '{"test": 2432232314}';
  assert.equal(yoco.signSvix(secret, id, timestamp, body), 'g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=');
});

test('signSvix strips whsec_ and base64-decodes the secret (independent recompute)', () => {
  const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
  const id = 'msg_abc';
  const timestamp = '1700000000';
  const body = '{"type":"payment.succeeded"}';
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`, 'utf8').digest('base64');
  assert.equal(yoco.signSvix(secret, id, timestamp, body), expected);
});

test('verifyWebhook accepts a correctly-signed event within the replay window', () => {
  const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
  const id = 'msg_live1';
  const timestamp = String(Math.floor(Date.now() / 1000)); // fresh → inside 3-min window
  const body = JSON.stringify({ type: 'payment.succeeded', payload: { id: 'ch_123' } });
  const sig = yoco.signSvix(secret, id, timestamp, body);

  const result = yoco.verifyWebhook(
    body,
    { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${sig}` },
    { webhookSecret: secret },
  );
  assert.equal(result.valid, true);
  assert.equal(result.event, 'payment.succeeded');
  assert.equal(result.status, 'paid');
  assert.equal(result.providerRef, 'ch_123');
});

test('verifyWebhook works with a Buffer body and multiple space-separated sigs', () => {
  const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
  const id = 'msg_live2';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: 'refund.succeeded', payload: { id: 'ch_456' } });
  const sig = yoco.signSvix(secret, id, timestamp, body);
  const header = `v1,AAAA v1,${sig}`; // first entry is bogus; second matches

  const result = yoco.verifyWebhook(
    Buffer.from(body, 'utf8'),
    { 'Webhook-Id': id, 'Webhook-Timestamp': timestamp, 'Webhook-Signature': header },
    { webhookSecret: secret },
  );
  assert.equal(result.valid, true);
  assert.equal(result.status, 'refunded');
});

test('verifyWebhook rejects a tampered body / wrong secret (never throws)', () => {
  const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
  const id = 'msg_x';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: 'payment.succeeded', payload: { id: 'ch_1' } });
  const sig = yoco.signSvix(secret, id, timestamp, body);
  const headers = { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${sig}` };

  // Body mutated after signing → invalid.
  const tampered = body.replace('succeeded', 'failed');
  assert.equal(yoco.verifyWebhook(tampered, headers, { webhookSecret: secret }).valid, false);

  // Wrong secret → invalid.
  assert.equal(
    yoco.verifyWebhook(body, headers, { webhookSecret: 'whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }).valid,
    false,
  );

  // Garbage signature → invalid, no throw.
  assert.equal(
    yoco.verifyWebhook(body, { ...headers, 'webhook-signature': 'v1,nope' }, { webhookSecret: secret }).valid,
    false,
  );
});

test('verifyWebhook rejects events outside the 3-minute replay window', () => {
  const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
  const id = 'msg_old';
  const timestamp = String(Math.floor(Date.now() / 1000) - 600); // 10 min old
  const body = JSON.stringify({ type: 'payment.succeeded', payload: { id: 'ch_1' } });
  const sig = yoco.signSvix(secret, id, timestamp, body); // correctly signed, but stale

  const result = yoco.verifyWebhook(
    body,
    { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${sig}` },
    { webhookSecret: secret },
  );
  assert.equal(result.valid, false);
});

test('verifyWebhook returns {valid:false} on missing inputs (never throws)', () => {
  const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
  assert.equal(yoco.verifyWebhook('{}', {}, { webhookSecret: secret }).valid, false);
  assert.equal(yoco.verifyWebhook(null, { 'webhook-id': 'x' }, { webhookSecret: secret }).valid, false);
  assert.equal(yoco.verifyWebhook('{}', { 'webhook-id': 'x', 'webhook-timestamp': '1', 'webhook-signature': 'v1,x' }, null).valid, false);
});

// ── contract / metadata sanity ───────────────────────────────────────────────
test('provider exposes the contract shape', () => {
  assert.equal(yoco.id, 'yoco');
  assert.equal(typeof yoco.initiate, 'function');
  assert.equal(typeof yoco.pollStatus, 'function');
  assert.equal(typeof yoco.normalizeStatus, 'function');
  assert.equal(typeof yoco.verifyWebhook, 'function');
  assert.equal(typeof yoco.refund, 'function');
  assert.ok(Array.isArray(yoco.credentialSchema));
});

test('initiate rejects when no credentials are supplied', async () => {
  await assert.rejects(
    () => yoco.initiate({ reference: 'o1', amount: '10.00' }, { mode: 'live', creds: null, project: {} }),
    (err) => err.code === 'CREDENTIALS_REQUIRED',
  );
});

test('initiate rejects a below-minimum amount before any network call', async () => {
  await assert.rejects(
    () => yoco.initiate({ reference: 'o1', amount: '1.00' }, { mode: 'test', creds: { secretKey: 'sk_test_x' }, project: {} }),
    (err) => err.status === 400 && /minimum charge/.test(err.message),
  );
});
