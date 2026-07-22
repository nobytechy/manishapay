'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.MOCK_MODE = 'true';

const { getProvider, liveIds, listCatalog, methodMatrix } = require('../src/providers');
const { CANONICAL_STATUSES, assertProvider } = require('../src/providers/contract');
const catalog = require('../src/providers/catalog');

test('paynow is a live, contract-valid provider', () => {
  const p = getProvider('paynow');
  assert.equal(p.id, 'paynow');
  assert.doesNotThrow(() => assertProvider(p, { requireMethods: true }));
  assert.ok(liveIds().includes('paynow'));
});

test('getProvider defaults to paynow', () => {
  assert.equal(getProvider().id, 'paynow');
});

test('every catalog gateway is code-wired and callable (incl. coming-soon ones)', () => {
  // All 11 gateways are implemented — "coming soon" is a label, not a code gap.
  // A supplied credential is the only remaining step to use any of them.
  for (const c of catalog.all()) {
    const p = getProvider(c.id);
    assert.equal(p.id, c.id, `${c.id} resolves to a real provider`);
    assert.equal(typeof p.initiate, 'function', `${c.id} implements initiate()`);
  }
  // The coming-soon curation flag never blocks the code path.
  assert.equal(getProvider('dpo').id, 'dpo');
});

test('an unknown gateway throws a 400 with the roadmap', () => {
  try {
    getProvider('does-not-exist');
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(err.status, 400);
  }
});

test('paynow normalizeStatus maps into the canonical enum', () => {
  const p = getProvider('paynow');
  for (const raw of ['Paid', 'Sent', 'Created', 'Cancelled', 'Refunded', 'anything']) {
    assert.ok(CANONICAL_STATUSES.includes(p.normalizeStatus(raw)), `${raw} → canonical`);
  }
});

test('every catalog provider declares the metadata the Connect App needs', () => {
  for (const c of catalog.all()) {
    assert.ok(c.id && c.displayName, `${c.id}: id + displayName`);
    assert.ok(Array.isArray(c.capabilities.methods), `${c.id}: methods[]`);
    assert.ok(Array.isArray(c.credentialSchema), `${c.id}: credentialSchema[]`);
    for (const f of c.credentialSchema) {
      assert.ok(f.key && f.label && f.type, `${c.id}: credential field shape`);
    }
  }
});

test('listCatalog: all implemented; coming_soon is a label on hard-credential gateways', () => {
  const list = listCatalog();
  const paynow = list.find((p) => p.id === 'paynow');
  const stripe = list.find((p) => p.id === 'stripe');
  const dpo = list.find((p) => p.id === 'dpo');
  // Every gateway is code-wired.
  assert.ok(list.every((p) => p.implemented === true), 'all gateways implemented');
  // Hard-credential gateways are labelled coming_soon; the rest live.
  assert.equal(paynow.status, 'live');
  assert.equal(stripe.status, 'live');
  assert.equal(dpo.status, 'coming_soon');
  // Never leak a stored secret — only the schema (field definitions).
  assert.ok(!('config' in paynow));
});

test('methodMatrix covers Zim rails and marks paynow support', () => {
  const { methods, rows } = methodMatrix();
  assert.ok(methods.includes('ecocash'));
  const ecocash = rows.find((r) => r.method === 'ecocash');
  assert.equal(ecocash.providers.paynow, true);
  assert.equal(ecocash.providers.stripe, false);
});
