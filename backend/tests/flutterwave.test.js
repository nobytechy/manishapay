'use strict';

/**
 * Flutterwave v4 provider — pure unit tests, NO network.
 * Covers:
 *   • normalizeStatus across the v4 raw values (succeeded/pending/failed/unknown + refund/dispute)
 *   • AES-256-GCM encrypt → decrypt round-trip (proves the card-encryption helper)
 *   • webhook flutterwave-signature HMAC-SHA256/base64 known vector (valid + tampered)
 *   • amount formatting (v4 sends a JSON number)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
const flutterwave = require('../src/providers/flutterwave');

// ─── normalizeStatus ─────────────────────────────────────────────────────────

test('normalizeStatus maps v4 statuses into the 5-value enum', () => {
  // paid
  assert.equal(flutterwave.normalizeStatus('succeeded'), 'paid');
  assert.equal(flutterwave.normalizeStatus('successful'), 'paid');
  assert.equal(flutterwave.normalizeStatus('completed'), 'paid');
  assert.equal(flutterwave.normalizeStatus('charge.completed'), 'paid');
  // pending
  assert.equal(flutterwave.normalizeStatus('pending'), 'pending');
  assert.equal(flutterwave.normalizeStatus('processing'), 'pending');
  assert.equal(flutterwave.normalizeStatus('requires_requery'), 'pending');
  assert.equal(flutterwave.normalizeStatus('requires_otp'), 'pending');
  // failed
  assert.equal(flutterwave.normalizeStatus('failed'), 'failed');
  assert.equal(flutterwave.normalizeStatus('cancelled'), 'failed');
  assert.equal(flutterwave.normalizeStatus('error'), 'failed');
  // refunded / disputed
  assert.equal(flutterwave.normalizeStatus('refunded'), 'refunded');
  assert.equal(flutterwave.normalizeStatus('refund.completed'), 'refunded');
  assert.equal(flutterwave.normalizeStatus('disputed'), 'disputed');
  assert.equal(flutterwave.normalizeStatus('dispute.created'), 'disputed');
  assert.equal(flutterwave.normalizeStatus('chargeback.created'), 'disputed');
});

test('normalizeStatus is case- and whitespace-insensitive', () => {
  assert.equal(flutterwave.normalizeStatus('SUCCEEDED'), 'paid');
  assert.equal(flutterwave.normalizeStatus('  Succeeded  '), 'paid');
});

test('normalizeStatus defaults unknown/empty to pending (never silently paid)', () => {
  assert.equal(flutterwave.normalizeStatus(''), 'pending');
  assert.equal(flutterwave.normalizeStatus(null), 'pending');
  assert.equal(flutterwave.normalizeStatus(undefined), 'pending');
  assert.equal(flutterwave.normalizeStatus('some-new-status'), 'pending');
});

// ─── toGatewayAmount (v4 = JSON number in major units) ────────────────────────

test('toGatewayAmount returns a number in major units', () => {
  assert.equal(flutterwave.toGatewayAmount(10), 10);
  assert.equal(flutterwave.toGatewayAmount('10.50'), 10.5);
  assert.equal(flutterwave.toGatewayAmount('100'), 100);
  assert.equal(flutterwave.toGatewayAmount(10.005), 10.01); // rounds to 2dp
  assert.equal(typeof flutterwave.toGatewayAmount(10), 'number');
});

test('toGatewayAmount accepts comma-decimal locale strings', () => {
  assert.equal(flutterwave.toGatewayAmount('2,50'), 2.5);
});

test('toGatewayAmount rejects non-positive / non-numeric amounts', () => {
  assert.throws(() => flutterwave.toGatewayAmount('0'));
  assert.throws(() => flutterwave.toGatewayAmount('-5'));
  assert.throws(() => flutterwave.toGatewayAmount('abc'));
  assert.throws(() => flutterwave.toGatewayAmount(''));
});

// ─── AES-256-GCM card encryption round-trip ───────────────────────────────────

test('aesGcmEncrypt → aesGcmDecrypt round-trips with the same key/iv/tag', () => {
  // A valid base64 Encryption Key that decodes to exactly 32 bytes (AES-256).
  const encryptionKey = crypto.randomBytes(32).toString('base64');
  const key = flutterwave.decodeEncryptionKey(encryptionKey);
  assert.equal(key.length, 32);

  const nonce = flutterwave.generateNonce();
  assert.equal(nonce.length, 12); // the 12-char nonce IS the GCM IV
  const iv = Buffer.from(nonce, 'utf8');
  assert.equal(iv.length, 12);

  const plaintext = '4187427415564246';
  const ciphertext = flutterwave.aesGcmEncrypt(plaintext, key, iv);

  // Ciphertext is base64 and is NOT the plaintext.
  assert.notEqual(ciphertext, plaintext);
  assert.doesNotThrow(() => Buffer.from(ciphertext, 'base64'));

  // Decrypting with the same key/iv (and the appended 16-byte tag) recovers it.
  const roundTripped = flutterwave.aesGcmDecrypt(ciphertext, key, iv);
  assert.equal(roundTripped, plaintext);
});

test('aesGcmDecrypt fails the auth tag when ciphertext is tampered', () => {
  const key = flutterwave.decodeEncryptionKey(crypto.randomBytes(32).toString('base64'));
  const iv = Buffer.from(flutterwave.generateNonce(), 'utf8');
  const ct = flutterwave.aesGcmEncrypt('123', key, iv);

  const buf = Buffer.from(ct, 'base64');
  buf[0] ^= 0xff; // flip a byte → GCM tag verification must reject it
  const tampered = buf.toString('base64');

  assert.throws(() => flutterwave.aesGcmDecrypt(tampered, key, iv));
});

test('decodeEncryptionKey rejects a key that is not 32 bytes', () => {
  assert.throws(() => flutterwave.decodeEncryptionKey(crypto.randomBytes(16).toString('base64')));
  assert.throws(() => flutterwave.decodeEncryptionKey(''));
});

// ─── webhook HMAC-SHA256/base64 (flutterwave-signature) ───────────────────────

// Known vector: HMAC-SHA256 of the raw body under the secret hash, base64.
const WEBHOOK_SECRET = 'SECRETHASH123';
const WEBHOOK_BODY = JSON.stringify({
  event: 'charge.completed',
  data: { id: 'chg_abc123', reference: 'order-1', status: 'succeeded', amount: 10, currency: 'USD' },
});
const KNOWN_SIG = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(Buffer.from(WEBHOOK_BODY, 'utf8'))
  .digest('base64');

test('computeWebhookSignature matches base64(HMAC-SHA256(rawBody, secretHash))', () => {
  assert.equal(flutterwave.computeWebhookSignature(WEBHOOK_BODY, WEBHOOK_SECRET), KNOWN_SIG);
  // Buffer body produces the same signature as the equivalent string.
  assert.equal(
    flutterwave.computeWebhookSignature(Buffer.from(WEBHOOK_BODY, 'utf8'), WEBHOOK_SECRET),
    KNOWN_SIG,
  );
});

test('verifyWebhook accepts a valid flutterwave-signature and extracts the event', () => {
  const res = flutterwave.verifyWebhook(
    WEBHOOK_BODY,
    { 'flutterwave-signature': KNOWN_SIG },
    { secretHash: WEBHOOK_SECRET },
  );
  assert.equal(res.valid, true);
  assert.equal(res.event, 'charge.completed');
  assert.equal(res.status, 'paid');
  assert.equal(res.providerRef, 'chg_abc123');
  assert.equal(res.reference, 'order-1');
});

test('verifyWebhook rejects a tampered body / wrong signature without throwing', () => {
  // Right signature, but the body was mutated after signing.
  const tamperedBody = WEBHOOK_BODY.replace('order-1', 'order-2');
  assert.equal(
    flutterwave.verifyWebhook(
      tamperedBody,
      { 'flutterwave-signature': KNOWN_SIG },
      { secretHash: WEBHOOK_SECRET },
    ).valid,
    false,
  );
  // Wrong/missing signature, and missing secret.
  assert.equal(
    flutterwave.verifyWebhook(WEBHOOK_BODY, { 'flutterwave-signature': 'nope' }, { secretHash: WEBHOOK_SECRET }).valid,
    false,
  );
  assert.equal(flutterwave.verifyWebhook(WEBHOOK_BODY, {}, { secretHash: WEBHOOK_SECRET }).valid, false);
  assert.equal(flutterwave.verifyWebhook(WEBHOOK_BODY, { 'flutterwave-signature': KNOWN_SIG }, {}).valid, false);
});

test('verifyWebhook is case-insensitive on the header name', () => {
  assert.equal(
    flutterwave.verifyWebhook(
      WEBHOOK_BODY,
      { 'Flutterwave-Signature': KNOWN_SIG },
      { secretHash: WEBHOOK_SECRET },
    ).valid,
    true,
  );
});

test('verifyWebhook returns invalid (not throw) on malformed JSON', () => {
  const body = '{not json';
  const sig = flutterwave.computeWebhookSignature(body, WEBHOOK_SECRET);
  const res = flutterwave.verifyWebhook(body, { 'flutterwave-signature': sig }, { secretHash: WEBHOOK_SECRET });
  assert.equal(res.valid, false);
});

// ─── timingSafeEqualStr ───────────────────────────────────────────────────────

test('timingSafeEqualStr is true only on an exact match', () => {
  assert.equal(flutterwave.timingSafeEqualStr('abc', 'abc'), true);
  assert.equal(flutterwave.timingSafeEqualStr('abc', 'abd'), false);
  assert.equal(flutterwave.timingSafeEqualStr('short', 'a-longer-value'), false);
  assert.equal(flutterwave.timingSafeEqualStr('', ''), true);
});
