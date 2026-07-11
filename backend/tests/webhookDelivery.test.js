'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const { buildPayload, deliverOne } = require('../src/services/webhookDelivery');

const TXN = {
  id: 't1', project_id: 'p1', merchant_reference: 'o1', tracker: 'mp_x',
  merchant_amount: 5, status: 'Paid', status_normalized: 'paid', mode: 'live',
};
const ENDPOINT = { id: 'e1', url: 'https://merchant.test/hook', secret: 'whsec' };
const fakeDb = { from: () => ({ insert: async () => ({ error: null }) }) };

test('buildPayload includes the transaction currency', () => {
  const body = JSON.parse(buildPayload({
    merchant_reference: 'order-1',
    tracker: 'mp_abc',
    merchant_amount: 5,
    currency: 'ZWL',
    status: 'Paid',
    status_normalized: 'paid',
    mode: 'live',
    method: 'ecocash',
  }));
  assert.equal(body.event, 'payment.updated');
  assert.equal(body.data.currency, 'ZWL');
  assert.equal(body.data.amount, 5);
});

test('buildPayload defaults currency to USD when absent', () => {
  const body = JSON.parse(buildPayload({
    merchant_reference: 'order-2',
    tracker: 'mp_def',
    merchant_amount: 1,
    status: 'Sent',
    status_normalized: 'pending',
    mode: 'test',
  }));
  assert.equal(body.data.currency, 'USD');
});

test('deliverOne retries a transient 5xx, then succeeds', async () => {
  let calls = 0;
  const post = async () => {
    calls += 1;
    return calls < 3 ? { status: 503 } : { status: 200 };
  };
  const res = await deliverOne(ENDPOINT, TXN, { post, supabase: fakeDb, attempts: 3, baseDelay: 0 });
  assert.equal(calls, 3);
  assert.equal(res.ok, true);
  assert.equal(res.status, 'delivered');
});

test('deliverOne does NOT retry a 4xx (merchant rejection)', async () => {
  let calls = 0;
  const post = async () => { calls += 1; return { status: 400 }; };
  const res = await deliverOne(ENDPOINT, TXN, { post, supabase: fakeDb, attempts: 3, baseDelay: 0 });
  assert.equal(calls, 1);
  assert.equal(res.ok, false);
  assert.equal(res.httpStatus, 400);
});

test('deliverOne gives up after exhausting retries', async () => {
  let calls = 0;
  const post = async () => { calls += 1; return { status: 503 }; };
  const res = await deliverOne(ENDPOINT, TXN, { post, supabase: fakeDb, attempts: 3, baseDelay: 0 });
  assert.equal(calls, 3);
  assert.equal(res.ok, false);
});
