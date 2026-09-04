'use strict';

/**
 * Anonymous-account gate.
 *
 * A merchant can enter the dashboard with signInAnonymously() and do everything
 * in TEST mode. The boundary is real money: an account that disappears when the
 * browser cache is cleared must not be able to hold live credentials or mint
 * live keys. These tests pin that boundary, since it's the one place where
 * getting the fast-start wrong costs a merchant actual money.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.MANISHAPAY_MASTER_KEY = '0000000000000000000000000000000000000000000000000000000000000000';

const { assertPermanentAccount, requirePermanentAccount } = require('../src/middleware/jwtAuth');
const credentials = require('../src/services/credentials');

test('assertPermanentAccount rejects an unsecured account', () => {
  assert.throws(
    () => assertPermanentAccount({ id: 'dev_1', isAnonymous: true }),
    (err) => err.code === 'ACCOUNT_NOT_SECURED' && err.status === 403,
  );
});

test('assertPermanentAccount allows a secured account', () => {
  assert.doesNotThrow(() => assertPermanentAccount({ id: 'dev_1', isAnonymous: false }));
});

test('assertPermanentAccount allows an account with the flag absent', () => {
  // Pre-anonymous sessions have no isAnonymous field; they must not be locked out.
  assert.doesNotThrow(() => assertPermanentAccount({ id: 'dev_1' }));
});

test('requirePermanentAccount passes the error to next() rather than throwing', () => {
  let captured = null;
  requirePermanentAccount({ developer: { id: 'd', isAnonymous: true } }, {}, (err) => { captured = err; });
  assert.equal(captured?.code, 'ACCOUNT_NOT_SECURED');

  let calledClean = false;
  requirePermanentAccount({ developer: { id: 'd', isAnonymous: false } }, {}, (err) => {
    calledClean = err === undefined;
  });
  assert.equal(calledClean, true);
});

test('requirePermanentAccount 401s when there is no developer at all', () => {
  let captured = null;
  requirePermanentAccount({}, {}, (err) => { captured = err; });
  assert.equal(captured?.status, 401);
});

test('PayNow declares its shared sandbox like every other gateway', () => {
  const saved = {
    id: process.env.PAYNOW_TEST_INTEGRATION_ID,
    key: process.env.PAYNOW_TEST_INTEGRATION_KEY,
    email: process.env.PAYNOW_TEST_AUTHEMAIL,
  };
  try {
    delete process.env.PAYNOW_TEST_INTEGRATION_ID;
    delete process.env.PAYNOW_TEST_INTEGRATION_KEY;
    assert.equal(credentials.sandboxFromEnv('paynow'), null);

    process.env.PAYNOW_TEST_INTEGRATION_ID = '11627';
    process.env.PAYNOW_TEST_INTEGRATION_KEY = 'test-key';
    process.env.PAYNOW_TEST_AUTHEMAIL = 'merchant@example.com';
    const sandbox = credentials.sandboxFromEnv('paynow');
    assert.equal(sandbox.integrationId, '11627');
    assert.equal(sandbox.integrationKey, 'test-key');
    assert.equal(sandbox.merchantEmail, 'merchant@example.com');
  } finally {
    if (saved.id === undefined) delete process.env.PAYNOW_TEST_INTEGRATION_ID;
    else process.env.PAYNOW_TEST_INTEGRATION_ID = saved.id;
    if (saved.key === undefined) delete process.env.PAYNOW_TEST_INTEGRATION_KEY;
    else process.env.PAYNOW_TEST_INTEGRATION_KEY = saved.key;
    if (saved.email === undefined) delete process.env.PAYNOW_TEST_AUTHEMAIL;
    else process.env.PAYNOW_TEST_AUTHEMAIL = saved.email;
  }
});
