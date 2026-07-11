'use strict';

/**
 * Smoke tests for the ManishaPay Node SDK. Run: `npm test` (Node ≥18).
 * No network — the HTTP layer is stubbed via the injectable `fetch` option.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const ManishaPay = require('./index');

test('rejects an invalid API key', () => {
  assert.throws(() => new ManishaPay('nope'), /mp_test_ or mp_live_/);
});

test('accepts a valid test key', () => {
  const mp = new ManishaPay('mp_test_abc', { fetch: async () => ({}) });
  assert.equal(mp.apiKey, 'mp_test_abc');
});

test('pay() POSTs to /v1/pay with auth and unwraps data', async () => {
  let seen;
  const fakeFetch = async (url, opts) => {
    seen = { url, opts };
    return { ok: true, status: 200, json: async () => ({ data: { tracker: 'mp_1', browser_url: 'https://x' } }) };
  };
  const mp = new ManishaPay('mp_test_abc', { fetch: fakeFetch, baseUrl: 'https://api.test/api' });
  const r = await mp.pay({ reference: 'o1', amount: '5.00' });
  assert.equal(r.tracker, 'mp_1');
  assert.match(seen.url, /\/v1\/pay$/);
  assert.equal(seen.opts.method, 'POST');
  assert.equal(seen.opts.headers.Authorization, 'Bearer mp_test_abc');
});

test('throws ManishaPayError on a non-2xx response', async () => {
  const fakeFetch = async () => ({
    ok: false, status: 401,
    json: async () => ({ error: { code: 'UNAUTHENTICATED', message: 'bad key' } }),
  });
  const mp = new ManishaPay('mp_live_x', { fetch: fakeFetch });
  await assert.rejects(
    () => mp.pay({ reference: 'o', amount: '1' }),
    (e) => e.name === 'ManishaPayError' && e.code === 'UNAUTHENTICATED' && e.status === 401,
  );
});

test('verifyWebhook: valid signature passes, tampered body fails', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ event: 'payment.updated' });
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  const header = `t=${ts},v1=${sig}`;
  assert.equal(ManishaPay.verifyWebhook(body, header, secret), true);
  assert.equal(ManishaPay.verifyWebhook(`${body} `, header, secret), false);
});

test('verifyWebhook: rejects a stale timestamp', () => {
  const secret = 'whsec_test';
  const body = '{}';
  const ts = Math.floor(Date.now() / 1000) - 10000;
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  assert.equal(ManishaPay.verifyWebhook(body, `t=${ts},v1=${sig}`, secret), false);
});
