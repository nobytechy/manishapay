'use strict';

/**
 * Ozow provider — unit tests. NO NETWORK.
 *
 * The load-bearing thing to lock down is the HashCheck:
 *   concat(field VALUES in order) + PrivateKey  ->  lowercase WHOLE string  ->  SHA512 hex.
 *
 * The golden hex vectors below were generated from that exact algorithm and act
 * as a regression guard: if the concatenation order, the "%.2f" amount, the
 * lowercase-after-append rule, or the SHA512 pipeline ever changes, they break.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test'; // relax env validation (see src/config/env.js)
process.env.MOCK_MODE = 'true';

const ozow = require('../src/providers/ozow');
const { computeHashCheck, toGatewayAmount, isTestString, REQUEST_FIELD_ORDER, NOTIFICATION_FIELD_ORDER } =
  ozow._internal;

const PRIVATE_KEY = '215114531AFF7134A94C88CEEA48E';

// A fixed REQUEST field set (order matters — matches REQUEST_FIELD_ORDER).
const REQUEST_FIELDS = {
  SiteCode: 'TSTSTE0001',
  CountryCode: 'ZA',
  CurrencyCode: 'ZAR',
  Amount: '25.01',
  TransactionReference: 'ref-123',
  BankReference: 'bankref',
  Optional1: '',
  Optional2: '',
  Optional3: '',
  Optional4: '',
  Optional5: '',
  Customer: '',
  CancelUrl: 'https://m.test/cancel',
  ErrorUrl: 'https://m.test/error',
  SuccessUrl: 'https://m.test/success',
  NotifyUrl: 'https://m.test/notify',
  IsTest: 'true',
};

// Golden vectors (see header) — generated from the documented algorithm.
const REQUEST_GOLDEN_HASH =
  'b476bd172b225071e20ff452a6bd8eb4046fd2e70aeeb4478dccb5326016123c4d3f9051772c82b87d3b21a3ccf066458142b3a893dd38893853b00f80023963';

const NOTIFICATION_FIELDS = {
  SiteCode: 'TSTSTE0001',
  TransactionId: 'abc-tx-1',
  TransactionReference: 'ref-123',
  Amount: '25.01',
  Status: 'Complete',
  Optional1: '',
  Optional2: '',
  Optional3: '',
  Optional4: '',
  Optional5: '',
  CurrencyCode: 'ZAR',
  IsTest: 'true',
  StatusMessage: 'Test complete',
};

const NOTIFICATION_GOLDEN_HASH =
  '577c9a29e83fb8cb1ff4f0b8f915909a16c1015bc7fadefbd6da8a81321274bcd3f994930ab8b5b1e650d35e061fa1e4a55e93ec880bf998bf3d25594d786071';

// ── HashCheck: request order ─────────────────────────────────────────────────

test('computeHashCheck (request order) matches the golden SHA512 hex', () => {
  const hash = computeHashCheck(REQUEST_FIELDS, REQUEST_FIELD_ORDER, PRIVATE_KEY);
  assert.equal(hash, REQUEST_GOLDEN_HASH);
  assert.equal(hash.length, 128); // SHA512 hex
});

test('HashCheck lowercases the WHOLE string (values + key) before hashing', () => {
  // Independent recompute: build the concatenation by hand, lowercase, SHA512.
  const concat = REQUEST_FIELD_ORDER.map((k) => REQUEST_FIELDS[k] ?? '').join('');
  const expected = crypto
    .createHash('sha512')
    .update((concat + PRIVATE_KEY).toLowerCase(), 'utf8')
    .digest('hex');
  assert.equal(computeHashCheck(REQUEST_FIELDS, REQUEST_FIELD_ORDER, PRIVATE_KEY), expected);
});

test('HashCheck is order-sensitive (reordering fields changes the hash)', () => {
  const reordered = [...REQUEST_FIELD_ORDER];
  [reordered[3], reordered[4]] = [reordered[4], reordered[3]]; // swap Amount/TransactionReference
  const bad = computeHashCheck(REQUEST_FIELDS, reordered, PRIVATE_KEY);
  assert.notEqual(bad, REQUEST_GOLDEN_HASH);
});

test('missing/null optional fields concatenate as empty strings', () => {
  const withUndefined = { ...REQUEST_FIELDS };
  delete withUndefined.Optional1;
  delete withUndefined.Optional2;
  withUndefined.Optional3 = null;
  // '' vs undefined vs null must all collapse to '' → same hash.
  assert.equal(
    computeHashCheck(withUndefined, REQUEST_FIELD_ORDER, PRIVATE_KEY),
    REQUEST_GOLDEN_HASH,
  );
});

// ── HashCheck: notification order (UNVERIFIED field order) ────────────────────

test('computeHashCheck (notification order) matches its golden hex', () => {
  const hash = computeHashCheck(NOTIFICATION_FIELDS, NOTIFICATION_FIELD_ORDER, PRIVATE_KEY);
  assert.equal(hash, NOTIFICATION_GOLDEN_HASH);
});

test('request vs notification orders produce different hashes for the same key', () => {
  const reqHash = computeHashCheck(REQUEST_FIELDS, REQUEST_FIELD_ORDER, PRIVATE_KEY);
  const notifHash = computeHashCheck(NOTIFICATION_FIELDS, NOTIFICATION_FIELD_ORDER, PRIVATE_KEY);
  assert.notEqual(reqHash, notifHash);
});

test('verifyWebhook accepts a correctly-hashed notification (case-insensitive)', () => {
  const payload = { ...NOTIFICATION_FIELDS, Hash: NOTIFICATION_GOLDEN_HASH.toUpperCase() };
  const res = ozow.verifyWebhook(payload, {}, { privateKey: PRIVATE_KEY });
  assert.equal(res.valid, true);
  assert.equal(res.status, 'paid');
  assert.equal(res.providerRef, 'abc-tx-1');
});

test('verifyWebhook rejects a tampered notification', () => {
  const payload = { ...NOTIFICATION_FIELDS, Amount: '9999.00', Hash: NOTIFICATION_GOLDEN_HASH };
  const res = ozow.verifyWebhook(payload, {}, { privateKey: PRIVATE_KEY });
  assert.equal(res.valid, false);
});

test('verifyWebhook returns {valid:false} (never throws) on missing hash / creds', () => {
  assert.equal(ozow.verifyWebhook(NOTIFICATION_FIELDS, {}, { privateKey: PRIVATE_KEY }).valid, false);
  assert.equal(ozow.verifyWebhook(NOTIFICATION_FIELDS, {}, null).valid, false);
});

test('verifyWebhook parses a urlencoded notification body', () => {
  const params = new URLSearchParams({ ...NOTIFICATION_FIELDS, Hash: NOTIFICATION_GOLDEN_HASH });
  const res = ozow.verifyWebhook(params.toString(), {}, { privateKey: PRIVATE_KEY });
  assert.equal(res.valid, true);
});

// ── Amount: decimal 2dp ("%.2f") ─────────────────────────────────────────────

test('toGatewayAmount formats to exactly 2 decimal places', () => {
  assert.equal(toGatewayAmount(25), '25.00');
  assert.equal(toGatewayAmount(25.1), '25.10');
  assert.equal(toGatewayAmount('25.014'), '25.01');
  assert.equal(toGatewayAmount('25,50'), '25.50'); // comma-decimal locale
  assert.equal(toGatewayAmount(0.5), '0.50');
});

test('toGatewayAmount rejects non-positive / non-numeric amounts', () => {
  assert.throws(() => toGatewayAmount(0));
  assert.throws(() => toGatewayAmount(-5));
  assert.throws(() => toGatewayAmount('abc'));
});

// ── IsTest serialization: lowercase string ───────────────────────────────────

test('isTestString serialises to the lowercase strings "true"/"false"', () => {
  assert.equal(isTestString('test'), 'true');
  assert.equal(isTestString('live'), 'false');
  assert.strictEqual(typeof isTestString('test'), 'string');
});

// ── normalizeStatus: every raw value ─────────────────────────────────────────

test('normalizeStatus maps every Ozow raw status into the 5-value enum', () => {
  assert.equal(ozow.normalizeStatus('Complete'), 'paid');
  assert.equal(ozow.normalizeStatus('Pending'), 'pending');
  assert.equal(ozow.normalizeStatus('PendingInvestigation'), 'pending');
  assert.equal(ozow.normalizeStatus('Cancelled'), 'failed');
  assert.equal(ozow.normalizeStatus('Abandoned'), 'failed');
  assert.equal(ozow.normalizeStatus('Error'), 'failed');
  assert.equal(ozow.normalizeStatus('Voided'), 'failed');
  assert.equal(ozow.normalizeStatus('Refunded'), 'refunded');
  // case-insensitive + safe default
  assert.equal(ozow.normalizeStatus('complete'), 'paid');
  assert.equal(ozow.normalizeStatus('Something New'), 'pending');
  assert.equal(ozow.normalizeStatus(''), 'pending');
  assert.equal(ozow.normalizeStatus(undefined), 'pending');
});
