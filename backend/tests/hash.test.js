/**
 * Unit tests for the hash service. Run with `npm test`.
 *
 * These are deliberately offline — no Supabase, no PayNow — so they can
 * run in any CI without secrets.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
const hash = require('../src/services/hash');

test('compute is order-sensitive (PayNow is not alphabetical)', () => {
  const a = hash.compute({ a: '1', b: '2' }, 'KEY');
  const b = hash.compute({ b: '2', a: '1' }, 'KEY');
  assert.notEqual(a, b);
});

test('compute uppercases hex output', () => {
  const out = hash.compute({ x: '1' }, 'k');
  assert.equal(out, out.toUpperCase());
  assert.match(out, /^[0-9A-F]{128}$/);
});

test('verify excludes the hash field itself', () => {
  const fields = { a: '1', b: '2' };
  fields.hash = hash.compute(fields, 'K');
  assert.equal(hash.verify(fields, 'K').ok, true);
});

test('verify catches a tampered field', () => {
  const fields = { a: '1', b: '2' };
  fields.hash = hash.compute(fields, 'K');
  fields.b = '3';
  assert.equal(hash.verify(fields, 'K').ok, false);
});

test('parseQueryString preserves field order', () => {
  const out = hash.parseQueryString('z=1&a=2&m=3');
  assert.deepEqual(Object.keys(out), ['z', 'a', 'm']);
});

// ─────────────────────────────────────────────────────────────────────────
// PayNow's published worked example.
// Source: https://developers.paynow.co.zw/docs/paynow/generating_hash
// If this test ever fails, our hash implementation has drifted from the
// reference — every initiate/verify call would break against real PayNow.
// ─────────────────────────────────────────────────────────────────────────
test('matches the PayNow docs worked example byte-for-byte', () => {
  const fields = {
    id: '1201',
    reference: 'TEST REF',
    amount: '99.99',
    additionalinfo: 'A test ticket transaction',
    returnurl: 'http://www.google.com/search?q=returnurl',
    resulturl: 'http://www.google.com/search?q=resulturl',
    status: 'Message',
  };
  const integrationKey = '3e9fed89-60e1-4ce5-ab6e-6b1eb2d4f977';
  const expected =
    '2A033FC38798D913D42ECB786B9B19645ADEDBDE788862032F1BD82CF3B92DEF' +
    '84F316385D5B40DBB35F1A4FD7D5BFE73835174136463CDD48C9366B0749C689';
  assert.equal(hash.compute(fields, integrationKey), expected);
});
