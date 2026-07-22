'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
process.env.MOCK_MODE = 'true';

const pesepay = require('../src/providers/pesepay');

// A valid 32-char (256-bit) key and a 16-char (128-bit) key for the tests.
const KEY_32 = '0123456789abcdef0123456789abcdef';
const KEY_16 = '0123456789abcdef';
const KEY_24 = '0123456789abcdef01234567';

test('AES round-trip: encrypt → { payload } → decrypt returns the original object', () => {
  const original = {
    amountDetails: { amount: 10.5, currencyCode: 'USD' },
    reasonForPayment: 'Order #42',
    resultUrl: 'https://example.com/result',
    returnUrl: 'https://example.com/return',
  };
  const envelope = pesepay.encryptPayload(original, KEY_32);

  // On-the-wire shape must be exactly { payload: <base64 string> }.
  assert.deepEqual(Object.keys(envelope), ['payload']);
  assert.equal(typeof envelope.payload, 'string');
  assert.match(envelope.payload, /^[A-Za-z0-9+/]+={0,2}$/); // base64

  const back = pesepay.decryptPayload(envelope, KEY_32);
  assert.deepEqual(back, original);
});

test('decryptPayload also accepts a bare base64 string (not just the envelope)', () => {
  const env = pesepay.encryptPayload({ hello: 'world' }, KEY_32);
  assert.deepEqual(pesepay.decryptPayload(env.payload, KEY_32), { hello: 'world' });
});

test('IV is the first 16 chars of the key (not random) — matches an independent OpenSSL-style computation', () => {
  const data = { transactionStatus: 'SUCCESS', referenceNumber: 'PSP-1' };
  const envelope = pesepay.encryptPayload(data, KEY_32);

  // Reproduce independently: aes-256-cbc, key = utf8 key, iv = first 16 bytes.
  const key = Buffer.from(KEY_32, 'utf8');
  const iv = key.subarray(0, 16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const expected = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]).toString('base64');

  assert.equal(envelope.payload, expected);
});

test('encryption is deterministic (fixed IV) — same input yields the same ciphertext', () => {
  const a = pesepay.encryptPayload({ x: 1 }, KEY_32);
  const b = pesepay.encryptPayload({ x: 1 }, KEY_32);
  assert.equal(a.payload, b.payload);
});

test('key length is validated: 16/24/32 accepted, everything else rejected', () => {
  assert.equal(pesepay.assertKeyLength(KEY_16), 16);
  assert.equal(pesepay.assertKeyLength(KEY_24), 24);
  assert.equal(pesepay.assertKeyLength(KEY_32), 32);

  assert.throws(() => pesepay.assertKeyLength(''), /16, 24 or 32/);
  assert.throws(() => pesepay.assertKeyLength('short'), /16, 24 or 32/);
  assert.throws(() => pesepay.assertKeyLength('012345678901234567890'), /16, 24 or 32/); // 21 chars
});

test('round-trips under all three valid key sizes (128/192/256-bit)', () => {
  for (const key of [KEY_16, KEY_24, KEY_32]) {
    const back = pesepay.decryptPayload(pesepay.encryptPayload({ k: key.length }, key), key);
    assert.deepEqual(back, { k: key.length });
  }
});

test('pickAlgorithm maps key byte-length to the AES variant', () => {
  assert.equal(pesepay.pickAlgorithm(Buffer.alloc(16)), 'aes-128-cbc');
  assert.equal(pesepay.pickAlgorithm(Buffer.alloc(24)), 'aes-192-cbc');
  assert.equal(pesepay.pickAlgorithm(Buffer.alloc(32)), 'aes-256-cbc');
  assert.throws(() => pesepay.pickAlgorithm(Buffer.alloc(20)));
});

test('normalizeStatus maps every documented Pesepay status into the 5-value enum', () => {
  // paid — only SUCCESS
  assert.equal(pesepay.normalizeStatus('SUCCESS'), 'paid');
  assert.equal(pesepay.normalizeStatus('success'), 'paid'); // case-insensitive

  // pending
  for (const s of ['INITIATED', 'PENDING', 'PROCESSING', 'PARTIALLY_PAID', 'AUTHORIZATION_REQUIRED']) {
    assert.equal(pesepay.normalizeStatus(s), 'pending', s);
  }

  // failed
  for (const s of [
    'FAILED', 'DECLINED', 'CANCELLED', 'CANCELED', 'ERROR',
    'INSUFFICIENT_FUNDS', 'TERMINATED', 'TIME_OUT', 'SERVICE_UNAVAILABLE',
    'CLOSED', 'CLOSED_PERIOD_ELAPSED',
  ]) {
    assert.equal(pesepay.normalizeStatus(s), 'failed', s);
  }

  // refunded
  assert.equal(pesepay.normalizeStatus('REVERSED'), 'refunded');

  // safe defaults — unknown / empty → pending, never silently paid
  assert.equal(pesepay.normalizeStatus(''), 'pending');
  assert.equal(pesepay.normalizeStatus('WHO_KNOWS'), 'pending');
  assert.equal(pesepay.normalizeStatus(undefined), 'pending');
  // liquidationStatus is settlement, not payment — must never be treated as paid
  assert.equal(pesepay.normalizeStatus('SETTLED'), 'pending');
});

test('toGatewayAmount produces a positive 2dp number and rejects junk', () => {
  assert.equal(pesepay.toGatewayAmount('10.00'), 10);
  assert.equal(pesepay.toGatewayAmount(10.5), 10.5);
  assert.equal(pesepay.toGatewayAmount('10,50'), 10.5); // comma-decimal locale
  assert.equal(pesepay.toGatewayAmount('2.005'), 2.01); // rounds to 2dp
  assert.throws(() => pesepay.toGatewayAmount('0'));
  assert.throws(() => pesepay.toGatewayAmount('-5'));
  assert.throws(() => pesepay.toGatewayAmount('abc'));
});

test('the auth header name is pinned (single flip-point for the key-vs-authorization ambiguity)', () => {
  assert.equal(pesepay.AUTH_HEADER_NAME, 'authorization');
});
