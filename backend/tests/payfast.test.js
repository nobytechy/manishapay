'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.MOCK_MODE = 'true';
const payfast = require('../src/providers/payfast');

// ── phpUrlEncode: must match PHP urlencode(), NOT encodeURIComponent() ─────────
// PHP encodes `! ' ( ) * ~`, uses `+` for spaces, and UPPERCASE hex.
// Golden fixture generated against the documented PHP behaviour.
test('phpUrlEncode reproduces PHP urlencode() exactly (space->+, ~!\'()* encoded)', () => {
  assert.equal(payfast.phpUrlEncode("Test Item & More ~!'()*"), 'Test+Item+%26+More+%7E%21%27%28%29%2A');
});

test('phpUrlEncode differs from encodeURIComponent on the PayFast-sensitive chars', () => {
  // encodeURIComponent would leave ~ ! ' ( ) * bare and emit %20 for a space.
  assert.notEqual(payfast.phpUrlEncode("a b~"), encodeURIComponent('a b~'));
  assert.equal(payfast.phpUrlEncode('a b'), 'a+b'); // space -> +
  assert.equal(payfast.phpUrlEncode('~'), '%7E');
  assert.equal(payfast.phpUrlEncode('/'), '%2F'); // uppercase hex
  assert.equal(payfast.phpUrlEncode('@'), '%40');
});

// ── signature: MD5 of key=value&… (documented order), golden vectors ──────────
const FIELDS = {
  merchant_id: '10000100',
  merchant_key: '46f0cd694581a',
  return_url: 'https://www.example.com/return',
  cancel_url: 'https://www.example.com/cancel',
  notify_url: 'https://www.example.com/notify',
  name_first: 'John',
  name_last: 'Doe',
  email_address: 'john@example.com',
  m_payment_id: 'ORDER-001',
  amount: '100.00',
  item_name: 'Test Item',
};

test('computeSignature matches the known md5 of a documented-order field set (no passphrase)', () => {
  const sig = payfast.computeSignature(FIELDS, payfast.CHECKOUT_ORDER);
  assert.equal(sig, 'df975e09a8de2352898fbac874930d59');
  assert.match(sig, /^[0-9a-f]{32}$/); // lowercase hex
});

test('computeSignature appends &passphrase when one is set (changes the hash)', () => {
  const withPass = payfast.computeSignature(FIELDS, payfast.CHECKOUT_ORDER, 'MyS3cr3t-P@ss');
  assert.equal(withPass, '5455f76d5fbc96edc7ee632b7ee4ed22');
  assert.notEqual(withPass, payfast.computeSignature(FIELDS, payfast.CHECKOUT_ORDER));
});

test('signatureDebug returns the exact hashed param string', () => {
  const dbg = payfast.signatureDebug(FIELDS);
  assert.equal(
    dbg.paramString,
    'merchant_id=10000100&merchant_key=46f0cd694581a&return_url=https%3A%2F%2Fwww.example.com%2Freturn' +
      '&cancel_url=https%3A%2F%2Fwww.example.com%2Fcancel&notify_url=https%3A%2F%2Fwww.example.com%2Fnotify' +
      '&name_first=John&name_last=Doe&email_address=john%40example.com&m_payment_id=ORDER-001' +
      '&amount=100.00&item_name=Test+Item',
  );
  assert.equal(dbg.signature, 'df975e09a8de2352898fbac874930d59');
});

// ── filtering: blank on ''/null, NOT truthiness — so '0' survives ─────────────
test("signature filters blanks but keeps '0' (cycles=0 must not be dropped)", () => {
  const order = ['subscription_type', 'frequency', 'cycles', 'item_description'];
  const fields = { subscription_type: '1', frequency: '3', cycles: '0', item_description: '' };
  const str = payfast.buildSignatureString(fields, order);
  // '0' cycles stays, blank item_description is dropped.
  assert.equal(str, 'subscription_type=1&frequency=3&cycles=0');
  assert.ok(str.includes('cycles=0'));
  assert.ok(!str.includes('item_description'));
  assert.equal(payfast.computeSignature(fields, order), 'a6a25210a326c0b634848579783b6862');
});

test("nonBlank treats '0' as present and ''/null/undefined/whitespace as blank", () => {
  assert.equal(payfast.nonBlank('0'), true);
  assert.equal(payfast.nonBlank(0), true);
  assert.equal(payfast.nonBlank(''), false);
  assert.equal(payfast.nonBlank('   '), false);
  assert.equal(payfast.nonBlank(null), false);
  assert.equal(payfast.nonBlank(undefined), false);
});

// ── ITN body parsing preserves received order + decodes + -> space ────────────
test('parseUrlEncodedOrdered preserves received order and decodes values', () => {
  const pairs = payfast.parseUrlEncodedOrdered('m_payment_id=ORDER-001&item_name=Test+Item&amount_gross=100.00&signature=abc');
  assert.deepEqual(pairs, [
    ['m_payment_id', 'ORDER-001'],
    ['item_name', 'Test Item'],
    ['amount_gross', '100.00'],
    ['signature', 'abc'],
  ]);
});

// ── normalizeStatus across every documented payment_status value ──────────────
test('normalizeStatus maps PayFast payment_status into the 5-value enum', () => {
  assert.equal(payfast.normalizeStatus('COMPLETE'), 'paid');
  assert.equal(payfast.normalizeStatus('PENDING'), 'pending');
  assert.equal(payfast.normalizeStatus('FAILED'), 'failed');
  assert.equal(payfast.normalizeStatus('CANCELLED'), 'failed');
  assert.equal(payfast.normalizeStatus('complete'), 'paid'); // case-insensitive
  assert.equal(payfast.normalizeStatus('  COMPLETE  '), 'paid'); // trimmed
  assert.equal(payfast.normalizeStatus('SOMETHING_NEW'), 'pending'); // unknown -> safe default
  assert.equal(payfast.normalizeStatus(''), 'pending');
  assert.equal(payfast.normalizeStatus(null), 'pending');
});

test('normalizeStatus never returns a value outside the canonical enum', () => {
  const canonical = new Set(['paid', 'pending', 'failed', 'disputed', 'refunded']);
  for (const raw of ['COMPLETE', 'PENDING', 'FAILED', 'CANCELLED', 'x', '', null, undefined]) {
    assert.ok(canonical.has(payfast.normalizeStatus(raw)), `status ${raw} mapped outside enum`);
  }
});

// ── amount formatting ─────────────────────────────────────────────────────────
test('toGatewayAmount formats to a 2dp decimal string', () => {
  assert.equal(payfast.toGatewayAmount('100'), '100.00');
  assert.equal(payfast.toGatewayAmount(2.5), '2.50');
  assert.equal(payfast.toGatewayAmount('2,50'), '2.50'); // comma-decimal locale
  assert.throws(() => payfast.toGatewayAmount('0'));
  assert.throws(() => payfast.toGatewayAmount('abc'));
  assert.throws(() => payfast.toGatewayAmount(-5));
});
