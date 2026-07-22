'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// No network is touched by any test below — only pure helpers are exercised.
process.env.NODE_ENV = 'test';
process.env.MOCK_MODE = 'true';

const paypal = require('../src/providers/paypal');

// ─── normalizeStatus: every order + capture value ─────────────────────────────
test('normalizeStatus maps ORDER statuses into the 5-value enum', () => {
  assert.equal(paypal.normalizeStatus('CREATED'), 'pending');
  assert.equal(paypal.normalizeStatus('SAVED'), 'pending');
  assert.equal(paypal.normalizeStatus('APPROVED'), 'pending'); // approved ≠ paid
  assert.equal(paypal.normalizeStatus('PAYER_ACTION_REQUIRED'), 'pending');
  assert.equal(paypal.normalizeStatus('COMPLETED'), 'paid');
  assert.equal(paypal.normalizeStatus('VOIDED'), 'failed');
});

test('normalizeStatus maps CAPTURE statuses (authoritative) into the enum', () => {
  assert.equal(paypal.normalizeStatus('COMPLETED'), 'paid');
  assert.equal(paypal.normalizeStatus('PENDING'), 'pending');
  assert.equal(paypal.normalizeStatus('DECLINED'), 'failed');
  assert.equal(paypal.normalizeStatus('FAILED'), 'failed');
  assert.equal(paypal.normalizeStatus('DENIED'), 'failed');
  assert.equal(paypal.normalizeStatus('EXPIRED'), 'failed');
  assert.equal(paypal.normalizeStatus('REFUNDED'), 'refunded');
  assert.equal(paypal.normalizeStatus('PARTIALLY_REFUNDED'), 'refunded');
  assert.equal(paypal.normalizeStatus('DISPUTED'), 'disputed');
});

test('normalizeStatus is case-insensitive and trims', () => {
  assert.equal(paypal.normalizeStatus('completed'), 'paid');
  assert.equal(paypal.normalizeStatus('  Approved  '), 'pending');
});

test('normalizeStatus never silently reports paid — unknown/empty → pending', () => {
  assert.equal(paypal.normalizeStatus(''), 'pending');
  assert.equal(paypal.normalizeStatus(undefined), 'pending');
  assert.equal(paypal.normalizeStatus('SOMETHING_NEW'), 'pending');
});

// ─── Amount: string with exactly 2 decimals, major units ──────────────────────
test('toGatewayAmount formats to 2dp strings', () => {
  assert.equal(paypal.toGatewayAmount(10), '10.00');
  assert.equal(paypal.toGatewayAmount(2.5), '2.50');
  assert.equal(paypal.toGatewayAmount('2.00'), '2.00');
  assert.equal(paypal.toGatewayAmount('19.999'), '20.00'); // rounds to 2dp
  assert.equal(paypal.toGatewayAmount('2,50'), '2.50'); // comma-decimal locale
});

test('toGatewayAmount rejects non-positive / non-numeric amounts', () => {
  assert.throws(() => paypal.toGatewayAmount('0'));
  assert.throws(() => paypal.toGatewayAmount('-1'));
  assert.throws(() => paypal.toGatewayAmount('abc'));
});

// ─── Redirect-link extraction: payer-action OR approve ────────────────────────
test('extractRedirectLink prefers rel:"payer-action"', () => {
  const links = [
    { rel: 'self', href: 'https://api-m.paypal.com/v2/checkout/orders/1' },
    { rel: 'payer-action', href: 'https://www.paypal.com/checkoutnow?token=1' },
    { rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=1' },
  ];
  assert.equal(paypal.extractRedirectLink(links), 'https://www.paypal.com/checkoutnow?token=1');
});

test('extractRedirectLink falls back to rel:"approve" (older API)', () => {
  const links = [
    { rel: 'self', href: 'https://api-m.paypal.com/v2/checkout/orders/1' },
    { rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=abc' },
  ];
  assert.equal(paypal.extractRedirectLink(links), 'https://www.sandbox.paypal.com/checkoutnow?token=abc');
});

test('extractRedirectLink returns undefined when neither rel is present', () => {
  assert.equal(paypal.extractRedirectLink([{ rel: 'self', href: 'x' }]), undefined);
  assert.equal(paypal.extractRedirectLink(undefined), undefined);
  assert.equal(paypal.extractRedirectLink(null), undefined);
});

// ─── CRC-32 known vector (used in the offline webhook message) ────────────────
test('crc32 matches the known IEEE vector for "123456789"', () => {
  assert.equal(paypal.crc32('123456789'), 0xcbf43926); // canonical CRC-32 check value
  assert.equal(paypal.crc32(''), 0);
});

// ─── Webhook event → status/ref extraction (no signature, pure) ───────────────
test('eventToStatus maps capture-completed to paid and pulls the order id', () => {
  const evt = {
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: 'CAP-1',
      supplementary_data: { related_ids: { order_id: 'ORDER-1' } },
    },
  };
  const r = paypal.eventToStatus(evt);
  assert.equal(r.status, 'paid');
  assert.equal(r.captureId, 'CAP-1');
  assert.equal(r.orderId, 'ORDER-1');
  assert.equal(r.providerRef, 'ORDER-1');
});

test('eventToStatus maps ORDER.APPROVED to pending (money not captured yet)', () => {
  const r = paypal.eventToStatus({ event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: 'ORDER-2' } });
  assert.equal(r.status, 'pending');
  assert.equal(r.orderId, 'ORDER-2');
});

test('eventToStatus maps refund/dispute/denied events', () => {
  assert.equal(paypal.eventToStatus({ event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: {} }).status, 'refunded');
  assert.equal(paypal.eventToStatus({ event_type: 'PAYMENT.CAPTURE.REVERSED', resource: {} }).status, 'refunded');
  assert.equal(paypal.eventToStatus({ event_type: 'PAYMENT.CAPTURE.DENIED', resource: {} }).status, 'failed');
  assert.equal(paypal.eventToStatus({ event_type: 'CUSTOMER.DISPUTE.CREATED', resource: {} }).status, 'disputed');
  assert.equal(paypal.eventToStatus(null).status, 'pending');
});

// ─── verifyWebhook: never throws, refuses without inputs ──────────────────────
test('verifyWebhook returns valid:false (never throws) when webhookId missing', () => {
  const raw = JSON.stringify({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP-1' } });
  const out = paypal.verifyWebhook(raw, { 'paypal-transmission-id': 'x' }, {});
  assert.equal(out.valid, false);
  assert.equal(out.reason, 'WEBHOOK_ID_MISSING');
  assert.equal(out.status, 'paid'); // still parses the event for the caller
});

test('verifyWebhook refuses missing signature headers', () => {
  const raw = JSON.stringify({ event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: 'ORDER-1' } });
  const out = paypal.verifyWebhook(raw, {}, { webhookId: 'WH-1' });
  assert.equal(out.valid, false);
  assert.equal(out.reason, 'MISSING_SIGNATURE_HEADERS');
  assert.equal(out.action, 'capture'); // APPROVED ⇒ caller must capture
});

test('verifyWebhook rejects a non-paypal.com cert URL (SSRF guard)', () => {
  const raw = JSON.stringify({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP-1' } });
  const out = paypal.verifyWebhook(
    raw,
    {
      'paypal-transmission-id': 't',
      'paypal-transmission-time': '2026-07-18T00:00:00Z',
      'paypal-transmission-sig': 'AA==',
      'paypal-cert-url': 'https://evil.example.com/cert.pem',
      'paypal-auth-algo': 'SHA256withRSA',
    },
    { webhookId: 'WH-1' },
  );
  assert.equal(out.valid, false);
  assert.equal(out.reason, 'UNTRUSTED_CERT_URL');
});

test('verifyWebhook builds the correct offline message and verifies a real RSA signature', () => {
  // Generate a throwaway RSA keypair; sign the exact PayPal message string, then
  // confirm verifyWebhook validates it with the matching cert (public key PEM).
  const crypto = require('node:crypto');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const certPem = publicKey.export({ type: 'spki', format: 'pem' });

  const raw = JSON.stringify({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP-9' } });
  const transmissionId = 'txn-123';
  const transmissionTime = '2026-07-18T12:00:00Z';
  const webhookId = 'WH-XYZ';
  const message = `${transmissionId}|${transmissionTime}|${webhookId}|${paypal.crc32(Buffer.from(raw, 'utf8'))}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message, 'utf8');
  signer.end();
  const sig = signer.sign(privateKey).toString('base64');

  const headers = {
    'PayPal-Transmission-Id': transmissionId,
    'PayPal-Transmission-Time': transmissionTime,
    'PayPal-Transmission-Sig': sig,
    'PayPal-Cert-Url': 'https://api.paypal.com/v1/notifications/certs/cert.pem',
    'PayPal-Auth-Algo': 'SHA256withRSA',
  };

  const good = paypal.verifyWebhook(raw, headers, { webhookId, certPem });
  assert.equal(good.valid, true);
  assert.equal(good.status, 'paid');
  assert.equal(good.message, message);

  // Tamper with the body: signature must no longer verify.
  const tampered = paypal.verifyWebhook(raw + ' ', headers, { webhookId, certPem });
  assert.equal(tampered.valid, false);
});

// ─── Contract wiring sanity ───────────────────────────────────────────────────
test('provider exposes the contract surface', () => {
  assert.equal(paypal.id, 'paypal');
  assert.equal(typeof paypal.initiate, 'function');
  assert.equal(typeof paypal.pollStatus, 'function');
  assert.equal(typeof paypal.normalizeStatus, 'function');
  assert.equal(typeof paypal.verifyWebhook, 'function');
  assert.equal(typeof paypal.refund, 'function');
  assert.equal(typeof paypal.capture, 'function');
});
