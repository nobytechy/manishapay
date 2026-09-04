'use strict';

/**
 * Stale-guest sweep.
 *
 * This endpoint deletes users. Its failure mode is silent and permanent, so
 * the guarantees worth pinning are the refusals: never touch a permanent
 * account, never touch a guest who connected a gateway or took a real payment,
 * and never delete anything unless explicitly told to.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.MANISHAPAY_MASTER_KEY = '0000000000000000000000000000000000000000000000000000000000000000';

const { DEFAULT_AGE_DAYS } = require('../src/services/sweepAnonymous');

test('the default retention window is a month, not a day', () => {
  // A short window would delete people mid-evaluation — someone who tried the
  // product on Monday and came back on Friday must still have their account.
  assert.equal(DEFAULT_AGE_DAYS, 30);
});

test('deleting is opt-in: the service defaults to a dry run', () => {
  const src = require('node:fs').readFileSync(
    require.resolve('../src/services/sweepAnonymous'), 'utf8',
  );
  assert.match(src, /dryRun\s*=\s*opts\.dryRun\s*!==\s*false/,
    'dryRun must default to true so an unqualified call cannot destroy data');
});

test('only anonymous rows are ever candidates', () => {
  const src = require('node:fs').readFileSync(
    require.resolve('../src/services/sweepAnonymous'), 'utf8',
  );
  assert.match(src, /\.eq\('status',\s*'anonymous'\)/,
    'the candidate query must filter on status = anonymous');
  assert.match(src, /\.lt\('created_at',\s*cutoff\)/,
    'the candidate query must filter on age');
});

test('guests who invested something are kept regardless of age', () => {
  const src = require('node:fs').readFileSync(
    require.resolve('../src/services/sweepAnonymous'), 'utf8',
  );
  // A connected gateway means real effort; a billable payment means it was
  // never a throwaway. Both must survive the sweep.
  assert.match(src, /keptReasons\.connectedGateway/);
  assert.match(src, /keptReasons\.realPayment/);
  assert.match(src, /\.eq\('billable',\s*true\)/,
    'demo payments are billable:false — the sweep must only count real ones');
});
