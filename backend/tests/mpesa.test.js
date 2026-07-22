'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.MOCK_MODE = 'true';
const mpesa = require('../src/providers/mpesa');

// ─── Password / Timestamp (the #1 Daraja encoding bug) ───────────────────────

test('buildPassword matches the canonical Safaricom vector', () => {
  // Official Daraja example: shortcode 174379 + sandbox passkey + 20160216165627.
  const shortcode = '174379';
  const passkey = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
  const timestamp = '20160216165627';
  const expected =
    'MTc0Mzc5YmZiMjc5ZjlhYTliZGJjZjE1OGU5N2RkNzFhNDY3Y2QyZTBjODkzMDU5YjEwZjc4ZTZiNzJhZGExZWQyYzkxOTIwMTYwMjE2MTY1NjI3';
  assert.equal(mpesa.buildPassword(shortcode, passkey, timestamp), expected);
});

test('buildPassword trims a trailing newline on the passkey', () => {
  const clean = mpesa.buildPassword('174379', 'abc', '20160216165627');
  const dirty = mpesa.buildPassword('174379', 'abc\n', '20160216165627');
  assert.equal(dirty, clean);
});

test('buildTimestamp emits YYYYMMDDHHMMSS', () => {
  const ts = mpesa.buildTimestamp(new Date(2016, 1, 16, 16, 56, 27)); // month is 0-based
  assert.equal(ts, '20160216165627');
  assert.match(mpesa.buildTimestamp(), /^\d{14}$/);
});

// ─── MSISDN normalization ────────────────────────────────────────────────────

test('normalizeMsisdn canonicalises Kenyan numbers to 2547XXXXXXXX', () => {
  assert.equal(mpesa.normalizeMsisdn('0712345678'), '254712345678');
  assert.equal(mpesa.normalizeMsisdn('+254 712 345 678'), '254712345678');
  assert.equal(mpesa.normalizeMsisdn('712345678'), '254712345678');
  assert.equal(mpesa.normalizeMsisdn('254712345678'), '254712345678');
  assert.equal(mpesa.normalizeMsisdn('0110345678'), '254110345678'); // Safaricom 011x range
  assert.equal(mpesa.normalizeMsisdn(''), null);
  assert.equal(mpesa.normalizeMsisdn(null), null);
});

// ─── Amount is an integer (no cents in M-Pesa) ───────────────────────────────

test('toGatewayAmount coerces whole values to an integer', () => {
  assert.equal(mpesa.toGatewayAmount('10.00'), 10);
  assert.equal(mpesa.toGatewayAmount(5), 5);
  assert.equal(mpesa.toGatewayAmount('100'), 100);
  assert.equal(Number.isInteger(mpesa.toGatewayAmount('42')), true);
});

test('toGatewayAmount rejects fractional and non-positive amounts', () => {
  assert.throws(() => mpesa.toGatewayAmount('10.50'), (e) => e.code === 'AMOUNT_NOT_INTEGER');
  assert.throws(() => mpesa.toGatewayAmount('0'), (e) => e.code === 'BAD_REQUEST');
  assert.throws(() => mpesa.toGatewayAmount('-3'), (e) => e.code === 'BAD_REQUEST');
  assert.throws(() => mpesa.toGatewayAmount('abc'), (e) => e.code === 'BAD_REQUEST');
});

// ─── ResultCode → canonical status ───────────────────────────────────────────

test('normalizeStatus maps Daraja ResultCodes into the 5-value enum', () => {
  assert.equal(mpesa.normalizeStatus(0), 'paid');
  assert.equal(mpesa.normalizeStatus('0'), 'paid');
  assert.equal(mpesa.normalizeStatus(1032), 'failed'); // user cancelled
  assert.equal(mpesa.normalizeStatus('1037'), 'failed'); // DS timeout / no response
  assert.equal(mpesa.normalizeStatus(1), 'failed'); // insufficient balance
  assert.equal(mpesa.normalizeStatus(2001), 'failed'); // wrong PIN
  assert.equal(mpesa.normalizeStatus(1019), 'failed'); // expired
  assert.equal(mpesa.normalizeStatus(1001), 'failed'); // locked
  assert.equal(mpesa.normalizeStatus(''), 'pending'); // no result yet
  assert.equal(mpesa.normalizeStatus(undefined), 'pending');
  assert.equal(mpesa.normalizeStatus('500.001.1001'), 'pending'); // still processing wrapper
  assert.equal(mpesa.normalizeStatus('reversed'), 'refunded');
});

// ─── Callback parsing (ManishaPay owns the callback) ─────────────────────────

test('parseCallback extracts a successful STK result', () => {
  const body = {
    Body: {
      stkCallback: {
        MerchantRequestID: '29115-34620561-1',
        CheckoutRequestID: 'ws_CO_191220191020363925',
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        CallbackMetadata: {
          Item: [
            { Name: 'Amount', Value: 10 },
            { Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
            { Name: 'TransactionDate', Value: 20191219102115 },
            { Name: 'PhoneNumber', Value: 254708374149 },
          ],
        },
      },
    },
  };
  const r = mpesa.parseCallback(body);
  assert.equal(r.valid, true);
  assert.equal(r.status, 'paid');
  assert.equal(r.providerRef, 'ws_CO_191220191020363925');
  assert.equal(r.receipt, 'NLJ7RT61SV');
  assert.equal(r.amount, 10);
  assert.equal(r.phone, '254708374149');
});

test('parseCallback marks a cancelled/failed STK result', () => {
  const body = {
    Body: {
      stkCallback: {
        MerchantRequestID: '29115-34620561-1',
        CheckoutRequestID: 'ws_CO_191220191020363925',
        ResultCode: 1032,
        ResultDesc: 'Request cancelled by user',
      },
    },
  };
  const r = mpesa.parseCallback(body);
  assert.equal(r.status, 'failed');
  assert.equal(r.providerRef, 'ws_CO_191220191020363925');
  assert.match(r.reason, /cancelled/i);
});

test('parseCallback returns { valid:false } for a non-STK body', () => {
  assert.equal(mpesa.parseCallback({}).valid, false);
  assert.equal(mpesa.parseCallback({ Body: {} }).valid, false);
  assert.equal(mpesa.parseCallback(null).valid, false);
});
