/**
 * Credential encryption — envelope-encryption helper using libsodium.
 *
 * Each PayNow credential row stores three ciphertexts:
 *
 *   data_key_encrypted          ← random 32-byte data key, sealed with the
 *                                 master key (env: MANISHAPAY_MASTER_KEY)
 *   integration_id_encrypted    ← Integration ID,  sealed with the data key
 *   integration_key_encrypted   ← Integration Key, sealed with the data key
 *
 * Why envelope (two layers) instead of one master key for everything?
 *   • Master rotation only re-encrypts small data keys (32 bytes each),
 *     not every credential payload.
 *   • A leaked single-row data key compromises only that one credential,
 *     not every merchant in the database.
 *
 * Format of every ciphertext field stored in the DB:
 *   base64( nonce(24 bytes) || ciphertext )
 *
 * The master key is provided via env in either form:
 *   • 64-char hex (32 bytes), or
 *   • 44-char base64 (32 bytes, standard alphabet)
 *
 * Generate one with:   openssl rand -hex 32
 */
'use strict';

const sodium = require('libsodium-wrappers');

let _ready = null;
function ready() {
  if (!_ready) _ready = sodium.ready;
  return _ready;
}

/** Decode the master key from env into a 32-byte Uint8Array. */
function loadMasterKey() {
  const raw = process.env.MANISHAPAY_MASTER_KEY;
  if (!raw) {
    throw new Error(
      'MANISHAPAY_MASTER_KEY is not set. Generate one with `openssl rand -hex 32` and add it to backend/.env.local',
    );
  }
  const trimmed = raw.trim();
  // Hex (64 chars) or base64 (44 chars with padding) — both encode 32 bytes.
  let bytes;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    bytes = Uint8Array.from(Buffer.from(trimmed, 'hex'));
  } else {
    try {
      bytes = Uint8Array.from(Buffer.from(trimmed, 'base64'));
    } catch (err) {
      throw new Error('MANISHAPAY_MASTER_KEY: must be 64-char hex or 44-char base64');
    }
  }
  if (bytes.length !== 32) {
    throw new Error(`MANISHAPAY_MASTER_KEY decodes to ${bytes.length} bytes; need exactly 32`);
  }
  return bytes;
}

/** Encrypt a string or byte array under `key`; return base64(nonce||cipher). */
function sealBytes(plaintext, key) {
  const data =
    typeof plaintext === 'string'
      ? sodium.from_string(plaintext)
      : plaintext instanceof Uint8Array
        ? plaintext
        : Uint8Array.from(plaintext);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const cipher = sodium.crypto_secretbox_easy(data, nonce, key);
  const combined = new Uint8Array(nonce.length + cipher.length);
  combined.set(nonce, 0);
  combined.set(cipher, nonce.length);
  return sodium.to_base64(combined, sodium.base64_variants.ORIGINAL);
}

/** Inverse of sealBytes — returns a Uint8Array. */
function openBytes(b64, key) {
  const combined = sodium.from_base64(b64, sodium.base64_variants.ORIGINAL);
  const nonceLen = sodium.crypto_secretbox_NONCEBYTES;
  if (combined.length < nonceLen + sodium.crypto_secretbox_MACBYTES) {
    throw new Error('Ciphertext too short to contain nonce + MAC');
  }
  const nonce = combined.slice(0, nonceLen);
  const cipher = combined.slice(nonceLen);
  return sodium.crypto_secretbox_open_easy(cipher, nonce, key);
}

/** String-flavoured wrapper for the common case of encrypted text. */
function openString(b64, key) {
  return sodium.to_string(openBytes(b64, key));
}

/**
 * Encrypts a fresh credential pair. Returns the three ciphertext fields
 * and a display-only `last4` of the integration ID.
 *
 * @param {{ integrationId: string|number, integrationKey: string }} input
 * @returns {Promise<{
 *   integration_id_encrypted: string,
 *   integration_key_encrypted: string,
 *   data_key_encrypted: string,
 *   integration_id_last4: string
 * }>}
 */
async function encryptCredential({ integrationId, integrationKey }) {
  await ready();
  const id = String(integrationId);
  const key = String(integrationKey);
  if (!id || !key) {
    throw new Error('encryptCredential: integrationId and integrationKey are required');
  }

  const masterKey = loadMasterKey();
  const dataKey = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);

  return {
    integration_id_encrypted: sealBytes(id, dataKey),
    integration_key_encrypted: sealBytes(key, dataKey),
    data_key_encrypted: sealBytes(dataKey, masterKey),
    integration_id_last4: id.slice(-4),
  };
}

/**
 * Decrypts a credential row. Pass the row from
 * `manishapay_paynow_credentials`; receive the plaintext PayNow creds.
 *
 * @param {{
 *   integration_id_encrypted: string,
 *   integration_key_encrypted: string,
 *   data_key_encrypted: string
 * }} row
 * @returns {Promise<{ integrationId: string, integrationKey: string }>}
 */
async function decryptCredential(row) {
  await ready();
  if (!row || !row.data_key_encrypted) {
    throw new Error('decryptCredential: row is missing data_key_encrypted');
  }
  const masterKey = loadMasterKey();
  const dataKey = openBytes(row.data_key_encrypted, masterKey);
  try {
    return {
      integrationId: openString(row.integration_id_encrypted, dataKey),
      integrationKey: openString(row.integration_key_encrypted, dataKey),
    };
  } finally {
    // Best-effort: zero the data key so it doesn't linger in heap dumps.
    // (V8 may still have copies; this is defense-in-depth, not a guarantee.)
    if (dataKey && dataKey.fill) dataKey.fill(0);
  }
}

/**
 * Envelope-encrypts an arbitrary provider credential config object (any shape,
 * per each gateway's credentialSchema — e.g. { secretKey, webhookSecret } for
 * Stripe, { integrationKey, encryptionKey } for Pesepay). Same two-layer scheme
 * as encryptCredential, but the whole config is JSON-sealed under a fresh data key.
 *
 * @param {Record<string, any>} config
 * @returns {Promise<{ config_encrypted: string, data_key_encrypted: string }>}
 */
async function encryptConfig(config) {
  await ready();
  if (!config || typeof config !== 'object') {
    throw new Error('encryptConfig: config object is required');
  }
  const masterKey = loadMasterKey();
  const dataKey = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);
  return {
    config_encrypted: sealBytes(JSON.stringify(config), dataKey),
    data_key_encrypted: sealBytes(dataKey, masterKey),
  };
}

/**
 * Inverse of encryptConfig — returns the decrypted config object.
 * @param {{ config_encrypted: string, data_key_encrypted: string }} row
 * @returns {Promise<Record<string, any>>}
 */
async function decryptConfig(row) {
  await ready();
  if (!row || !row.data_key_encrypted || !row.config_encrypted) {
    throw new Error('decryptConfig: row is missing config_encrypted / data_key_encrypted');
  }
  const masterKey = loadMasterKey();
  const dataKey = openBytes(row.data_key_encrypted, masterKey);
  try {
    return JSON.parse(openString(row.config_encrypted, dataKey));
  } finally {
    if (dataKey && dataKey.fill) dataKey.fill(0);
  }
}

/**
 * Re-encrypts an existing credential row's data key under a new master key
 * without touching the credential payloads. Used by master-key rotation.
 */
async function rewrapDataKey(row, oldMasterKey, newMasterKey) {
  await ready();
  const plain = openBytes(row.data_key_encrypted, oldMasterKey);
  const rewrapped = sealBytes(plain, newMasterKey);
  if (plain && plain.fill) plain.fill(0);
  return rewrapped;
}

/**
 * Quick self-test — run on boot to catch a broken master key before a
 * merchant ever tries to use the system.
 */
async function selfTest() {
  await ready();
  const probe = await encryptCredential({
    integrationId: '__selftest__',
    integrationKey: '00000000-0000-0000-0000-000000000000',
  });
  const out = await decryptCredential(probe);
  if (out.integrationId !== '__selftest__' || !out.integrationKey) {
    throw new Error('crypto.selfTest failed — master key cannot round-trip a credential');
  }
}

module.exports = {
  encryptCredential,
  decryptCredential,
  encryptConfig,
  decryptConfig,
  rewrapDataKey,
  selfTest,
  // Exported for unit tests only.
  _internals: { sealBytes, openBytes, openString, loadMasterKey },
};
