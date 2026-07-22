'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
const stripe = require('../src/providers/stripe');

// ─── normalizeStatus — every raw value the adapter can meet ──────────────────
test('normalizeStatus maps Checkout Session payment_status values', () => {
  assert.equal(stripe.normalizeStatus('paid'), 'paid');
  assert.equal(stripe.normalizeStatus('unpaid'), 'pending');
  assert.equal(stripe.normalizeStatus('no_payment_required'), 'paid');
});

test('normalizeStatus maps Checkout Session status values', () => {
  assert.equal(stripe.normalizeStatus('open'), 'pending');
  assert.equal(stripe.normalizeStatus('complete'), 'paid');
  assert.equal(stripe.normalizeStatus('expired'), 'failed');
});

test('normalizeStatus maps PaymentIntent / Charge statuses', () => {
  assert.equal(stripe.normalizeStatus('succeeded'), 'paid');
  assert.equal(stripe.normalizeStatus('processing'), 'pending');
  assert.equal(stripe.normalizeStatus('requires_action'), 'pending'); // 3DS/SCA -> pending, never paid
  assert.equal(stripe.normalizeStatus('requires_confirmation'), 'pending');
  assert.equal(stripe.normalizeStatus('requires_capture'), 'pending');
  assert.equal(stripe.normalizeStatus('requires_payment_method'), 'failed');
  assert.equal(stripe.normalizeStatus('canceled'), 'failed');
  assert.equal(stripe.normalizeStatus('cancelled'), 'failed'); // spelling tolerance
});

test('normalizeStatus maps dispute/refund event tokens', () => {
  assert.equal(stripe.normalizeStatus('charge.dispute.created'), 'disputed');
  assert.equal(stripe.normalizeStatus('disputed'), 'disputed');
  assert.equal(stripe.normalizeStatus('charge.refunded'), 'refunded');
  assert.equal(stripe.normalizeStatus('refunded'), 'refunded');
});

test('normalizeStatus is case-insensitive and safely defaults unknown -> pending', () => {
  assert.equal(stripe.normalizeStatus('SUCCEEDED'), 'paid');
  assert.equal(stripe.normalizeStatus('  Paid  '), 'paid');
  assert.equal(stripe.normalizeStatus('something_new'), 'pending');
  assert.equal(stripe.normalizeStatus(''), 'pending');
  assert.equal(stripe.normalizeStatus(undefined), 'pending');
  assert.equal(stripe.normalizeStatus(null), 'pending');
});

// ─── toGatewayAmount — cents + zero-decimal conversion ───────────────────────
test('toGatewayAmount converts standard currencies to cents', () => {
  assert.equal(stripe.toGatewayAmount('10.00', 'usd'), 1000);
  assert.equal(stripe.toGatewayAmount('0.50', 'usd'), 50);
  assert.equal(stripe.toGatewayAmount(10, 'eur'), 1000);
});

test('toGatewayAmount avoids binary float drift (10.10 -> 1010, not 1009)', () => {
  assert.equal(stripe.toGatewayAmount('10.10', 'usd'), 1010);
  assert.equal(stripe.toGatewayAmount('1.16', 'gbp'), 116);
  assert.equal(stripe.toGatewayAmount('19.99', 'usd'), 1999);
});

test('toGatewayAmount treats zero-decimal currencies as whole units', () => {
  assert.equal(stripe.toGatewayAmount('500', 'jpy'), 500);
  assert.equal(stripe.toGatewayAmount('500', 'JPY'), 500); // case-insensitive
  assert.equal(stripe.toGatewayAmount('1000', 'krw'), 1000);
  assert.equal(stripe.toGatewayAmount('7', 'vnd'), 7);
});

test('toGatewayAmount accepts comma-decimal locale and defaults currency to usd', () => {
  assert.equal(stripe.toGatewayAmount('2,50'), 250);
});

test('toGatewayAmount rejects non-positive / non-numeric amounts', () => {
  assert.throws(() => stripe.toGatewayAmount('0', 'usd'));
  assert.throws(() => stripe.toGatewayAmount('-5', 'usd'));
  assert.throws(() => stripe.toGatewayAmount('abc', 'usd'));
  assert.throws(() => stripe.toGatewayAmount(null, 'usd'));
});

// ─── verifyWebhook — Stripe-Signature HMAC-SHA256 over `${t}.${rawBody}` ─────
const WEBHOOK_SECRET = 'whsec_testsecret_0123456789abcdef';
const EVENT_BODY = JSON.stringify({
  id: 'evt_1abc',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_123', payment_status: 'paid', payment_intent: 'pi_test_999' } },
});

/** Builds a genuine Stripe-Signature header for a given body/timestamp/secret. */
function signHeader(body, timestamp, secret) {
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

test('verifyWebhook accepts a correctly-signed payload and extracts status/ref', () => {
  const t = Math.floor(Date.now() / 1000);
  const header = signHeader(EVENT_BODY, t, WEBHOOK_SECRET);
  const result = stripe.verifyWebhook(EVENT_BODY, { 'stripe-signature': header }, { webhookSecret: WEBHOOK_SECRET });
  assert.equal(result.valid, true);
  assert.equal(result.status, 'paid');
  assert.equal(result.rawStatus, 'paid');
  assert.equal(result.providerRef, 'cs_test_123');
  assert.equal(result.eventId, 'evt_1abc');
  assert.equal(result.type, 'checkout.session.completed');
});

test('verifyWebhook verifies over RAW Buffer bytes identically to a string', () => {
  const t = Math.floor(Date.now() / 1000);
  const header = signHeader(EVENT_BODY, t, WEBHOOK_SECRET);
  const result = stripe.verifyWebhook(Buffer.from(EVENT_BODY, 'utf8'), { 'stripe-signature': header }, { webhookSecret: WEBHOOK_SECRET });
  assert.equal(result.valid, true);
  assert.equal(result.status, 'paid');
});

test('verifyWebhook rejects a tampered body (signature no longer matches)', () => {
  const t = Math.floor(Date.now() / 1000);
  const header = signHeader(EVENT_BODY, t, WEBHOOK_SECRET);
  const tampered = EVENT_BODY.replace('"paid"', '"unpaid"');
  const result = stripe.verifyWebhook(tampered, { 'stripe-signature': header }, { webhookSecret: WEBHOOK_SECRET });
  assert.equal(result.valid, false);
});

test('verifyWebhook rejects a wrong signing secret', () => {
  const t = Math.floor(Date.now() / 1000);
  const header = signHeader(EVENT_BODY, t, WEBHOOK_SECRET);
  const result = stripe.verifyWebhook(EVENT_BODY, { 'stripe-signature': header }, { webhookSecret: 'whsec_wrong' });
  assert.equal(result.valid, false);
});

test('verifyWebhook rejects a timestamp outside the 300s tolerance (replay)', () => {
  const stale = Math.floor(Date.now() / 1000) - 600;
  const header = signHeader(EVENT_BODY, stale, WEBHOOK_SECRET);
  const result = stripe.verifyWebhook(EVENT_BODY, { 'stripe-signature': header }, { webhookSecret: WEBHOOK_SECRET });
  assert.equal(result.valid, false);
});

test('verifyWebhook returns {valid:false} for missing secret/header, never throws', () => {
  const t = Math.floor(Date.now() / 1000);
  const header = signHeader(EVENT_BODY, t, WEBHOOK_SECRET);
  assert.deepEqual(stripe.verifyWebhook(EVENT_BODY, { 'stripe-signature': header }, {}), { valid: false });
  assert.deepEqual(stripe.verifyWebhook(EVENT_BODY, {}, { webhookSecret: WEBHOOK_SECRET }), { valid: false });
  assert.deepEqual(stripe.verifyWebhook('not json', { 'stripe-signature': 'garbage' }, { webhookSecret: WEBHOOK_SECRET }), { valid: false });
});

test('verifyWebhook maps a fixed known vector (secret+body+timestamp -> signature)', () => {
  // Frozen vector: recomputing the HMAC here documents the exact scheme
  // (v1 = HMAC-SHA256(secret, `${t}.${body}`)) the adapter must implement.
  const t = 1700000000;
  const body = '{"id":"evt_fixed","type":"payment_intent.succeeded","data":{"object":{"id":"pi_fixed","status":"succeeded"}}}';
  const expectedSig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${body}`, 'utf8').digest('hex');
  const header = `t=${t},v1=${expectedSig}`;
  // Timestamp is far in the past, so the tolerance check must reject it...
  assert.equal(stripe.verifyWebhook(body, { 'stripe-signature': header }, { webhookSecret: WEBHOOK_SECRET }).valid, false);
  // ...but a fresh timestamp with the same scheme is accepted and mapped.
  const fresh = Math.floor(Date.now() / 1000);
  const freshHeader = `t=${fresh},v1=${crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${fresh}.${body}`, 'utf8').digest('hex')}`;
  const ok = stripe.verifyWebhook(body, { 'stripe-signature': freshHeader }, { webhookSecret: WEBHOOK_SECRET });
  assert.equal(ok.valid, true);
  assert.equal(ok.status, 'paid');
  assert.equal(ok.providerRef, 'pi_fixed');
});

test('verifyWebhook derives disputed/refunded from charge event types', () => {
  const t = Math.floor(Date.now() / 1000);
  const disputeBody = JSON.stringify({ id: 'evt_d', type: 'charge.dispute.created', data: { object: { id: 'dp_1', payment_intent: 'pi_d' } } });
  const dh = signHeader(disputeBody, t, WEBHOOK_SECRET);
  const d = stripe.verifyWebhook(disputeBody, { 'stripe-signature': dh }, { webhookSecret: WEBHOOK_SECRET });
  assert.equal(d.valid, true);
  assert.equal(d.status, 'disputed');
  assert.equal(d.providerRef, 'pi_d');

  const refundBody = JSON.stringify({ id: 'evt_r', type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_r', refunded: true } } });
  const rh = signHeader(refundBody, t, WEBHOOK_SECRET);
  const r = stripe.verifyWebhook(refundBody, { 'stripe-signature': rh }, { webhookSecret: WEBHOOK_SECRET });
  assert.equal(r.valid, true);
  assert.equal(r.status, 'refunded');
  assert.equal(r.providerRef, 'pi_r');
});
