/**
 * Unit tests for the credential encryption helper.
 *
 * Verifies envelope encryption round-trips, master-key handling, and
 * tamper detection. Runs offline — no Supabase, no PayNow.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
// 32 zero bytes — fine for tests, never use in production.
process.env.MANISHAPAY_MASTER_KEY =
  '0000000000000000000000000000000000000000000000000000000000000000';

const crypto = require('../src/services/crypto');

test('encrypt → decrypt round-trips a credential', async () => {
  const sealed = await crypto.encryptCredential({
    integrationId: '11627',
    integrationKey: '838c7e4e-d9d5-4fc8-a7bb-52e85b2d95d5',
  });
  // The three ciphertext fields must all be present and base64-shaped.
  assert.match(sealed.integration_id_encrypted, /^[A-Za-z0-9+/=]+$/);
  assert.match(sealed.integration_key_encrypted, /^[A-Za-z0-9+/=]+$/);
  assert.match(sealed.data_key_encrypted, /^[A-Za-z0-9+/=]+$/);
  assert.equal(sealed.integration_id_last4, '1627');

  const opened = await crypto.decryptCredential(sealed);
  assert.equal(opened.integrationId, '11627');
  assert.equal(opened.integrationKey, '838c7e4e-d9d5-4fc8-a7bb-52e85b2d95d5');
});

test('two encryptions of the same plaintext produce different ciphertexts', async () => {
  const a = await crypto.encryptCredential({ integrationId: 'X', integrationKey: 'Y' });
  const b = await crypto.encryptCredential({ integrationId: 'X', integrationKey: 'Y' });
  // Random nonce + random per-row data key → ciphertexts must differ.
  assert.notEqual(a.integration_id_encrypted, b.integration_id_encrypted);
  assert.notEqual(a.data_key_encrypted, b.data_key_encrypted);
});

test('tampered ciphertext fails to decrypt', async () => {
  const sealed = await crypto.encryptCredential({
    integrationId: '11627',
    integrationKey: 'whatever',
  });
  // Flip one byte by replacing the first base64 char.
  const tampered = {
    ...sealed,
    integration_id_encrypted: (sealed.integration_id_encrypted[0] === 'A' ? 'B' : 'A') +
      sealed.integration_id_encrypted.slice(1),
  };
  await assert.rejects(() => crypto.decryptCredential(tampered));
});

test('selfTest passes with a valid master key', async () => {
  await assert.doesNotReject(() => crypto.selfTest());
});

test('rejects when MANISHAPAY_MASTER_KEY is missing', async () => {
  const saved = process.env.MANISHAPAY_MASTER_KEY;
  delete process.env.MANISHAPAY_MASTER_KEY;
  try {
    await assert.rejects(
      () => crypto.encryptCredential({ integrationId: 'X', integrationKey: 'Y' }),
      /MANISHAPAY_MASTER_KEY/,
    );
  } finally {
    process.env.MANISHAPAY_MASTER_KEY = saved;
  }
});

test('accepts master key in base64 form too', async () => {
  const saved = process.env.MANISHAPAY_MASTER_KEY;
  // 32 zero bytes encoded as base64 is "AAAAAA…AAAAAA=" (44 chars including padding)
  process.env.MANISHAPAY_MASTER_KEY = Buffer.alloc(32).toString('base64');
  try {
    const sealed = await crypto.encryptCredential({ integrationId: 'X', integrationKey: 'Y' });
    const opened = await crypto.decryptCredential(sealed);
    assert.equal(opened.integrationId, 'X');
    assert.equal(opened.integrationKey, 'Y');
  } finally {
    process.env.MANISHAPAY_MASTER_KEY = saved;
  }
});
