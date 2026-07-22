'use strict';

/**
 * Hosted-checkout routing — the PURE decision logic (pickProvider /
 * computeMethods). No database: we hand-build the `connected` map that
 * connectedProviders() would return and assert the routing is deterministic
 * and matches the documented precedence.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

// routing.js pulls in the provider registry + config; relax env like the other
// service tests do before requiring it.
process.env.NODE_ENV = 'test';
process.env.MANISHAPAY_MASTER_KEY = '0000000000000000000000000000000000000000000000000000000000000000';

const { pickProvider, computeMethods } = require('../src/services/routing');

// ── pickProvider precedence ────────────────────────────────────────────────

test('pickProvider: explicit method_routing override wins', () => {
  const connected = { paynow: 'live', stripe: 'test' };
  const r = pickProvider('card', connected, { routing: { card: 'stripe' }, primaryProvider: 'paynow' });
  assert.deepEqual(r, { provider: 'stripe', mode: 'test' });
});

test('pickProvider: an override to an UNconnected gateway is ignored', () => {
  const connected = { paynow: 'live' };
  const r = pickProvider('card', connected, { routing: { card: 'stripe' }, primaryProvider: 'paynow' });
  // stripe not connected → falls to primary provider (paynow serves card)
  assert.deepEqual(r, { provider: 'paynow', mode: 'live' });
});

test('pickProvider: an override to a gateway that does not serve the method is ignored', () => {
  const connected = { paynow: 'live', mpesa: 'test' };
  // mpesa only serves 'mpesa', not 'card' → ignored, primary wins
  const r = pickProvider('card', connected, { routing: { card: 'mpesa' }, primaryProvider: 'paynow' });
  assert.deepEqual(r, { provider: 'paynow', mode: 'live' });
});

test('pickProvider: primary provider is preferred when it serves the method', () => {
  const connected = { paynow: 'live', stripe: 'live' };
  const r = pickProvider('card', connected, { primaryProvider: 'paynow' });
  assert.deepEqual(r, { provider: 'paynow', mode: 'live' });
});

test('pickProvider: falls back to catalog order when primary does not serve / is not connected', () => {
  // primary paynow NOT connected; paystack + stripe both serve card.
  // Catalog order puts paystack before stripe → paystack wins.
  const connected = { stripe: 'test', paystack: 'live' };
  const r = pickProvider('card', connected, { primaryProvider: 'paynow' });
  assert.deepEqual(r, { provider: 'paystack', mode: 'live' });
});

test('pickProvider: returns null when no connected gateway serves the method', () => {
  const connected = { stripe: 'test' }; // stripe has no ecocash
  const r = pickProvider('ecocash', connected, { primaryProvider: 'paynow' });
  assert.equal(r, null);
});

// ── computeMethods (the customer-facing chooser) ────────────────────────────

test('computeMethods: defaults to the primary provider\'s own methods when none declared', () => {
  const connected = { paynow: 'live' };
  const list = computeMethods(connected, { primaryProvider: 'paynow' });
  const methods = list.map((m) => m.method);
  // PayNow catalog methods
  assert.deepEqual(methods, ['ecocash', 'onemoney', 'innbucks', 'omari', 'zimswitch', 'card']);
  // metadata is attached
  const ecocash = list.find((m) => m.method === 'ecocash');
  assert.equal(ecocash.label, 'EcoCash');
  assert.equal(ecocash.needsPhone, true);
  assert.deepEqual({ provider: ecocash.provider, mode: ecocash.mode }, { provider: 'paynow', mode: 'live' });
});

test('computeMethods: hides methods no connected gateway can fulfil', () => {
  // Only stripe connected; offer ecocash + card. ecocash has no gateway → hidden.
  const connected = { stripe: 'live' };
  const list = computeMethods(connected, { enabledMethods: ['ecocash', 'card'], primaryProvider: 'paynow' });
  assert.deepEqual(list.map((m) => m.method), ['card']);
  assert.equal(list[0].provider, 'stripe');
});

test('computeMethods: dedupes repeated methods and preserves declared order', () => {
  const connected = { paynow: 'live', stripe: 'live' };
  const list = computeMethods(connected, { enabledMethods: ['card', 'card', 'ecocash'], primaryProvider: 'paynow' });
  assert.deepEqual(list.map((m) => m.method), ['card', 'ecocash']);
  // card routes to primary (paynow), ecocash only paynow serves it
  assert.equal(list.find((m) => m.method === 'card').provider, 'paynow');
});

test('computeMethods: routes each declared method independently across gateways', () => {
  // paynow (ecocash) + stripe (card) connected; a checkout offering both should
  // send ecocash→paynow and card→paynow(primary) — but pin card to stripe.
  const connected = { paynow: 'live', stripe: 'test' };
  const list = computeMethods(connected, {
    enabledMethods: ['ecocash', 'card'],
    routing: { card: 'stripe' },
    primaryProvider: 'paynow',
  });
  const byMethod = Object.fromEntries(list.map((m) => [m.method, m.provider]));
  assert.deepEqual(byMethod, { ecocash: 'paynow', card: 'stripe' });
});

test('computeMethods: empty when nothing is connected', () => {
  const list = computeMethods({}, { primaryProvider: 'paynow' });
  assert.deepEqual(list, []);
});
