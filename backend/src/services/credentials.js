/**
 * PayNow credential management.
 *
 * Wraps the manishapay_paynow_credentials table with three operations:
 *
 *   loadActive(projectId, mode)  → { integrationId, integrationKey, ... } | null
 *   save(projectId, mode, plain) → encrypts, marks any prior active row as
 *                                  revoked, inserts a fresh active row.
 *   revoke(credentialId)         → flips status to revoked.
 *
 * Plaintext PayNow credentials NEVER leave this module's caller frame. The
 * dashboard shows only the last 4 chars of the integration ID.
 *
 * Requires:
 *   • MANISHAPAY_MASTER_KEY env var (32 bytes, hex or base64)
 *   • Supabase service-role client (bypasses RLS so we can read encrypted blobs)
 */
'use strict';

const { supabase } = require('../config/supabase');
const crypto = require('./crypto');
const AppError = require('../errors/AppError');

const TABLE = 'manishapay_paynow_credentials';

/**
 * Loads the currently-active credential for a project + mode and returns
 * the decrypted PayNow Integration ID + Key. Returns null if no active
 * credential is configured (e.g. the merchant hasn't set it up yet —
 * caller can fall back to simulated mode).
 *
 * @param {string} projectId
 * @param {'test'|'live'} mode
 * @returns {Promise<null | {
 *   credentialId: string,
 *   integrationId: string,
 *   integrationKey: string,
 *   integrationIdLast4: string,
 *   addedAt: string,
 * }>}
 */
async function loadActive(projectId, mode) {
  if (!projectId) throw new Error('loadActive: projectId is required');
  if (mode !== 'test' && mode !== 'live') {
    throw new Error(`loadActive: invalid mode '${mode}'`);
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select(
      'id, integration_id_encrypted, integration_key_encrypted, data_key_encrypted, integration_id_last4, created_at',
    )
    .eq('project_id', projectId)
    .eq('mode', mode)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    throw new AppError({
      status: 500,
      code: 'CRED_LOOKUP_FAILED',
      message: `Could not load credentials: ${error.message}`,
    });
  }
  if (!data) return null;

  const decrypted = await crypto.decryptCredential(data);

  // Best-effort touch — we want to know which creds were used recently
  // so the dashboard can surface idle / unused credentials.
  supabase
    .from(TABLE)
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {});

  return {
    credentialId: data.id,
    integrationId: decrypted.integrationId,
    integrationKey: decrypted.integrationKey,
    integrationIdLast4: data.integration_id_last4,
    addedAt: data.created_at,
  };
}

/**
 * Encrypts and persists a fresh credential. If a credential already exists
 * for (project_id, mode, status='active'), it's marked revoked first so
 * the unique partial index `manishapay_paynow_credentials_one_active_per_mode`
 * stays satisfied.
 *
 * @param {{
 *   projectId: string,
 *   mode: 'test'|'live',
 *   integrationId: string|number,
 *   integrationKey: string,
 *   addedBy?: string|null,
 * }} input
 * @returns {Promise<{ id: string, integrationIdLast4: string }>}
 */
async function save({ projectId, mode, integrationId, integrationKey, addedBy = null }) {
  if (!projectId) throw new Error('save: projectId is required');
  if (mode !== 'test' && mode !== 'live') throw new Error(`save: invalid mode '${mode}'`);
  if (!integrationId || !integrationKey) {
    throw new Error('save: integrationId and integrationKey are required');
  }

  // Revoke any existing active row for this (project, mode) — kept for
  // audit, allows the new active row to be inserted.
  const { error: revokeErr } = await supabase
    .from(TABLE)
    .update({ status: 'revoked', rotated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .eq('mode', mode)
    .eq('status', 'active');
  if (revokeErr) {
    throw new AppError({
      status: 500,
      code: 'CRED_REVOKE_FAILED',
      message: `Could not rotate prior credential: ${revokeErr.message}`,
    });
  }

  const sealed = await crypto.encryptCredential({ integrationId, integrationKey });
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      project_id: projectId,
      mode,
      integration_id_encrypted: sealed.integration_id_encrypted,
      integration_key_encrypted: sealed.integration_key_encrypted,
      data_key_encrypted: sealed.data_key_encrypted,
      integration_id_last4: sealed.integration_id_last4,
      added_by: addedBy,
      status: 'active',
    })
    .select('id, integration_id_last4')
    .single();

  if (error) {
    throw new AppError({
      status: 500,
      code: 'CRED_SAVE_FAILED',
      message: `Could not save credential: ${error.message}`,
    });
  }
  return { id: data.id, integrationIdLast4: data.integration_id_last4 };
}

/**
 * Revokes a credential row. Use to disable a credential without replacing
 * it (the merchant's API calls will fall back to simulated mode in test,
 * or 400 in live).
 */
async function revoke(credentialId) {
  if (!credentialId) throw new Error('revoke: credentialId is required');
  const { error } = await supabase
    .from(TABLE)
    .update({ status: 'revoked', rotated_at: new Date().toISOString() })
    .eq('id', credentialId)
    .eq('status', 'active');
  if (error) {
    throw new AppError({
      status: 500,
      code: 'CRED_REVOKE_FAILED',
      message: error.message,
    });
  }
}

module.exports = { loadActive, save, revoke };
