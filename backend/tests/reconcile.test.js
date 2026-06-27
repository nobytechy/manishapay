'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const { reconcilePending } = require('../src/services/reconcile');
const realPaynow = require('../src/services/paynow');

// Silence the logger in tests.
const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * Minimal chainable Supabase mock. The query builder ignores filters and
 * resolves to `selectResult` for reads; for writes it invokes onUpdate with
 * the `id` filter value + the update payload and resolves to { error: null }.
 */
function mockSupabase({ selectResult, onUpdate }) {
  function from() {
    let isWrite = false;
    let payload = null;
    let idFilter = null;
    const builder = {
      select() { return builder; },
      update(p) { isWrite = true; payload = p; return builder; },
      insert() { isWrite = true; return builder; },
      neq() { return builder; },
      not() { return builder; },
      gte() { return builder; },
      lte() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      maybeSingle() { return builder; },
      single() { return builder; },
      eq(col, val) { if (col === 'id') idFilter = val; return builder; },
      then(resolve) {
        if (isWrite) {
          if (onUpdate) onUpdate(idFilter, payload);
          return resolve({ data: null, error: null });
        }
        return resolve({ data: selectResult, error: null });
      },
    };
    return builder;
  }
  return { from };
}

function pendingTxn(over = {}) {
  return {
    id: 'txn-1',
    project_id: 'proj-1',
    developer_id: 'dev-1',
    tracker: 'mp_abcdef0123456789',
    merchant_reference: 'order-1',
    merchant_amount: 5,
    status: 'Sent',
    status_normalized: 'pending',
    mode: 'test',
    method: null,
    poll_url: 'https://www.paynow.co.zw/interface/poll/x',
    created_at: '2026-06-26T00:00:00.000Z',
    ...over,
  };
}

const okCreds = { loadActive: async () => ({ integrationId: '1', integrationKey: 'k' }) };

test('reconcile: resolves a paid transaction and dispatches the merchant webhook', async () => {
  const updates = [];
  const dispatched = [];
  const summary = await reconcilePending({
    force: true,
    logger: noopLogger,
    supabase: mockSupabase({
      selectResult: [pendingTxn()],
      onUpdate: (id, payload) => updates.push({ id, payload }),
    }),
    paynow: {
      pollStatus: async () => ({ status: 'Paid', paynow_reference: 'pn-123' }),
      normalizeStatus: realPaynow.normalizeStatus,
    },
    credentials: okCreds,
    dispatch: async (txn) => { dispatched.push(txn); return { dispatched: 1 }; },
  });

  assert.equal(summary.scanned, 1);
  assert.equal(summary.updated, 1);
  assert.equal(summary.dispatched, 1);
  assert.equal(summary.errors, 0);

  assert.equal(updates.length, 1);
  assert.equal(updates[0].payload.status, 'Paid');
  assert.equal(updates[0].payload.status_normalized, 'paid');
  assert.ok(updates[0].payload.paid_at, 'paid_at should be set when resolved to paid');

  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].status, 'Paid');
});

test('reconcile: no change when PayNow still reports the same status', async () => {
  const updates = [];
  const dispatched = [];
  const summary = await reconcilePending({
    force: true,
    logger: noopLogger,
    supabase: mockSupabase({ selectResult: [pendingTxn()], onUpdate: (i, p) => updates.push({ i, p }) }),
    paynow: { pollStatus: async () => ({ status: 'Sent' }), normalizeStatus: realPaynow.normalizeStatus },
    credentials: okCreds,
    dispatch: async () => { dispatched.push(1); return { dispatched: 1 }; },
  });

  assert.equal(summary.updated, 0);
  assert.equal(summary.dispatched, 0);
  assert.equal(updates.length, 0);
  assert.equal(dispatched.length, 0);
});

test('reconcile: a status shuffle that stays pending updates the row but fires no webhook', async () => {
  const updates = [];
  const dispatched = [];
  const summary = await reconcilePending({
    force: true,
    logger: noopLogger,
    supabase: mockSupabase({ selectResult: [pendingTxn({ status: 'Created' })], onUpdate: (i, p) => updates.push(p) }),
    // Created → Sent: raw status changed, but both normalize to 'pending'.
    paynow: { pollStatus: async () => ({ status: 'Sent' }), normalizeStatus: realPaynow.normalizeStatus },
    credentials: okCreds,
    dispatch: async () => { dispatched.push(1); return { dispatched: 1 }; },
  });

  assert.equal(summary.updated, 1, 'row is refreshed');
  assert.equal(summary.dispatched, 0, 'but no merchant webhook — still pending');
  assert.equal(dispatched.length, 0);
});

test('reconcile: skips transactions with no loadable credentials', async () => {
  const updates = [];
  const summary = await reconcilePending({
    force: true,
    logger: noopLogger,
    supabase: mockSupabase({ selectResult: [pendingTxn()], onUpdate: (i, p) => updates.push(p) }),
    paynow: { pollStatus: async () => ({ status: 'Paid' }), normalizeStatus: realPaynow.normalizeStatus },
    credentials: { loadActive: async () => null },
    dispatch: async () => ({ dispatched: 1 }),
  });

  assert.equal(summary.scanned, 1);
  assert.equal(summary.updated, 0);
  assert.equal(updates.length, 0);
});

test('reconcile: one failing transaction does not abort the sweep', async () => {
  let polls = 0;
  const dispatched = [];
  const summary = await reconcilePending({
    force: true,
    logger: noopLogger,
    supabase: mockSupabase({ selectResult: [pendingTxn({ id: 'a' }), pendingTxn({ id: 'b' })] }),
    paynow: {
      pollStatus: async () => {
        polls += 1;
        if (polls === 1) throw new Error('PayNow timeout');
        return { status: 'Paid' };
      },
      normalizeStatus: realPaynow.normalizeStatus,
    },
    credentials: okCreds,
    dispatch: async () => { dispatched.push(1); return { dispatched: 1 }; },
  });

  assert.equal(summary.scanned, 2);
  assert.equal(summary.errors, 1);
  assert.equal(summary.updated, 1, 'the second transaction still processed');
  assert.equal(dispatched.length, 1);
});

test('reconcile: concurrency guard skips an overlapping sweep', async () => {
  const slowSupabase = mockSupabase({ selectResult: [] });
  // Make the first sweep linger on its query so the second overlaps it.
  const lingering = {
    from() {
      const builder = {
        select() { return builder; },
        neq() { return builder; }, eq() { return builder; }, not() { return builder; },
        gte() { return builder; }, lte() { return builder; }, order() { return builder; },
        limit() { return builder; },
        then(resolve) { setTimeout(() => resolve({ data: [], error: null }), 25); },
      };
      return builder;
    },
  };

  const deps = { logger: noopLogger, paynow: realPaynow, credentials: okCreds, dispatch: async () => ({ dispatched: 0 }) };
  const p1 = reconcilePending({ ...deps, supabase: lingering });
  const p2 = reconcilePending({ ...deps, supabase: slowSupabase });
  const [r1, r2] = await Promise.all([p1, p2]);

  assert.equal(r2.skipped, true, 'second overlapping sweep is skipped');
  assert.equal(r1.skipped, false);
});
