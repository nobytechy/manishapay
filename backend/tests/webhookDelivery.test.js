'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const { buildPayload } = require('../src/services/webhookDelivery');

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
