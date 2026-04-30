'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.MOCK_MODE = 'true';
const paynow = require('../src/services/paynow');

test('normalizeAmount accepts numbers', () => {
  assert.equal(paynow.normalizeAmount(2), '2.00');
  assert.equal(paynow.normalizeAmount(2.5), '2.50');
});

test("normalizeAmount accepts the C# '2.00' string", () => {
  assert.equal(paynow.normalizeAmount('2.00'), '2.00');
});

test("normalizeAmount accepts comma-decimal locale ('2,50')", () => {
  assert.equal(paynow.normalizeAmount('2,50'), '2.50');
});

test('normalizeAmount rejects non-positive amounts', () => {
  assert.throws(() => paynow.normalizeAmount('0'));
  assert.throws(() => paynow.normalizeAmount('abc'));
});

test('normalizePhone canonicalises Zim mobile numbers', () => {
  assert.equal(paynow.normalizePhone('0772123456'), '263772123456');
  assert.equal(paynow.normalizePhone('+263 77 212 3456'), '263772123456');
  assert.equal(paynow.normalizePhone('772123456'), '263772123456');
  assert.equal(paynow.normalizePhone('263772123456'), '263772123456');
});

test('generateTracker produces a globally-unique mp_-prefixed id', () => {
  const a = paynow.generateTracker();
  const b = paynow.generateTracker();
  assert.match(a, /^mp_[0-9a-f]{16}$/);
  assert.notEqual(a, b);
  assert.ok(a.length <= 32, 'must fit PayNow merchanttrace 32-char limit');
});

test('normalizeStatus maps PayNow statuses into 5-value enum', () => {
  assert.equal(paynow.normalizeStatus('Paid'), 'paid');
  assert.equal(paynow.normalizeStatus('Awaiting Delivery'), 'paid');
  assert.equal(paynow.normalizeStatus('Delivered'), 'paid');
  assert.equal(paynow.normalizeStatus('Created'), 'pending');
  assert.equal(paynow.normalizeStatus('Sent'), 'pending');
  assert.equal(paynow.normalizeStatus('Cancelled'), 'failed');
  assert.equal(paynow.normalizeStatus('Disputed'), 'disputed');
  assert.equal(paynow.normalizeStatus('Refunded'), 'refunded');
  assert.equal(paynow.normalizeStatus(''), 'pending'); // safe default
});

test('initiate falls back to simulated mode when test key has no creds', async () => {
  process.env.MANISHAPAY_MASTER_KEY =
    '0000000000000000000000000000000000000000000000000000000000000000';
  process.env.SIMULATOR_BASE_URL = 'http://localhost:3000';
  const result = await paynow.initiate(
    { reference: 'order-1', amount: '5.00' },
    { mode: 'test', creds: null, project: {} },
  );
  assert.equal(result.mode, 'simulated');
  assert.match(result.tracker, /^mp_[0-9a-f]{16}$/);
  assert.match(result.browser_url, /\/simulator\/mp_[0-9a-f]{16}$/);
  assert.match(result.poll_url, /\/simulator\/mp_[0-9a-f]{16}\/poll$/);
});

test('initiate refuses live mode without credentials', async () => {
  await assert.rejects(
    () =>
      paynow.initiate(
        { reference: 'order-2', amount: '5.00' },
        { mode: 'live', creds: null, project: {} },
      ),
    (err) => err.code === 'CREDENTIALS_REQUIRED',
  );
});
