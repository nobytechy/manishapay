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
const env = require('../config/env');
const AppError = require('../errors/AppError');
const { logger } = require('./logger');

const TABLE = 'manishapay_paynow_credentials';
const GATEWAY_TABLE = 'manishapay_gateway_credentials';

/**
 * Shared-sandbox fallback: in TEST mode, if a project has no stored credentials
 * for a gateway, fall back to platform sandbox keys from env. This is what lets
 * a developer run a real sandbox transaction on any gateway with ZERO setup —
 * the same zero-friction onboarding PayNow already has. Returns null when the
 * platform hasn't configured that gateway's sandbox keys.
 *
 * @param {string} provider
 * @returns {Record<string, any> | null}
 */
function sandboxFromEnv(provider) {
  const e = process.env;
  const has = (...ks) => ks.every((k) => e[k]);
  switch (provider) {
    case 'stripe':
      return e.STRIPE_TEST_SECRET_KEY
        ? { secretKey: e.STRIPE_TEST_SECRET_KEY, webhookSecret: e.STRIPE_TEST_WEBHOOK_SECRET || null }
        : null;
    case 'paystack':
      return e.PAYSTACK_TEST_SECRET_KEY ? { secretKey: e.PAYSTACK_TEST_SECRET_KEY } : null;
    case 'flutterwave':
      // v4 (current default): OAuth client-credentials + encryption key.
      return has('FLUTTERWAVE_V4_CLIENT_ID', 'FLUTTERWAVE_V4_CLIENT_SECRET')
        ? {
            clientId: e.FLUTTERWAVE_V4_CLIENT_ID,
            clientSecret: e.FLUTTERWAVE_V4_CLIENT_SECRET,
            encryptionKey: e.FLUTTERWAVE_ENCRYPTION_KEY || null,
            secretHash: e.FLUTTERWAVE_SECRET_HASH || null,
          }
        : null;
    case 'paypal':
      return has('PAYPAL_SANDBOX_CLIENT_ID', 'PAYPAL_SANDBOX_CLIENT_SECRET')
        ? { clientId: e.PAYPAL_SANDBOX_CLIENT_ID, clientSecret: e.PAYPAL_SANDBOX_CLIENT_SECRET, webhookId: e.PAYPAL_SANDBOX_WEBHOOK_ID || null }
        : null;
    case 'yoco':
      return e.YOCO_TEST_SECRET_KEY ? { secretKey: e.YOCO_TEST_SECRET_KEY, webhookSecret: e.YOCO_TEST_WEBHOOK_SECRET || null } : null;
    case 'pesepay':
      return has('PESEPAY_TEST_INTEGRATION_KEY', 'PESEPAY_TEST_ENCRYPTION_KEY')
        ? { integrationKey: e.PESEPAY_TEST_INTEGRATION_KEY, encryptionKey: e.PESEPAY_TEST_ENCRYPTION_KEY }
        : null;
    case 'payfast':
      return has('PAYFAST_TEST_MERCHANT_ID', 'PAYFAST_TEST_MERCHANT_KEY')
        ? { merchantId: e.PAYFAST_TEST_MERCHANT_ID, merchantKey: e.PAYFAST_TEST_MERCHANT_KEY, passphrase: e.PAYFAST_TEST_PASSPHRASE || null }
        : null;
    case 'ozow':
      return has('OZOW_TEST_SITE_CODE', 'OZOW_TEST_PRIVATE_KEY', 'OZOW_TEST_API_KEY')
        ? { siteCode: e.OZOW_TEST_SITE_CODE, privateKey: e.OZOW_TEST_PRIVATE_KEY, apiKey: e.OZOW_TEST_API_KEY }
        : null;
    case 'mpesa':
      return has('MPESA_TEST_CONSUMER_KEY', 'MPESA_TEST_CONSUMER_SECRET', 'MPESA_TEST_SHORTCODE', 'MPESA_TEST_PASSKEY')
        ? { consumerKey: e.MPESA_TEST_CONSUMER_KEY, consumerSecret: e.MPESA_TEST_CONSUMER_SECRET, shortcode: e.MPESA_TEST_SHORTCODE, passkey: e.MPESA_TEST_PASSKEY, transactionType: e.MPESA_TEST_TRANSACTION_TYPE || undefined }
        : null;
    case 'dpo':
      return e.DPO_TEST_COMPANY_TOKEN
        ? { companyToken: e.DPO_TEST_COMPANY_TOKEN, serviceType: e.DPO_TEST_SERVICE_TYPE || undefined, mode: 'test' }
        : null;
    default:
      return null;
  }
}

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
/**
 * Provider-aware credential loader — the single entry point every route uses.
 *
 * Backward compatible: older callers call loadActive(projectId, mode) and get
 * PayNow creds. New callers pass loadActive(projectId, provider, mode).
 *
 * Resolution order for a non-PayNow gateway:
 *   1. the project's own stored credential (manishapay_gateway_credentials)
 *   2. (TEST mode only) the platform shared-sandbox keys from env
 *   3. null → the provider throws CREDENTIALS_REQUIRED
 *
 * @param {string} projectId
 * @param {string} providerArg  provider id, OR (legacy) the mode
 * @param {'test'|'live'} [modeArg]
 */
async function loadActive(projectId, providerArg, modeArg) {
  // Legacy 2-arg shim: loadActive(projectId, 'test'|'live') → PayNow.
  let provider = providerArg;
  let mode = modeArg;
  if (modeArg === undefined && (providerArg === 'test' || providerArg === 'live')) {
    mode = providerArg;
    provider = 'paynow';
  }
  provider = provider || 'paynow';

  if (provider === 'paynow') return loadPaynow(projectId, mode);

  // ── Generic gateways ──────────────────────────────────────────────
  let stored = null;
  try {
    stored = await loadGatewayConfig(projectId, provider, mode);
  } catch (err) {
    // Only the "table not created yet" case may fall through to the sandbox path.
    // A REAL failure (decryption, transient DB/RLS error) must surface — otherwise
    // a merchant with a valid-but-unreadable key is wrongly told CREDENTIALS_REQUIRED.
    const msg = String((err && err.message) || '');
    const tableMissing = /does not exist|relation .*gateway_credentials|42P01/i.test(msg);
    if (tableMissing) {
      logger.warn({ provider, projectId }, 'gateway_credentials table missing (pre-migration) — using sandbox fallback');
    } else {
      logger.error({ err, provider, projectId }, 'loadGatewayConfig failed');
      throw err;
    }
  }
  if (stored) return { ...stored, mode };

  if (mode === 'test') {
    const sandbox = sandboxFromEnv(provider);
    if (sandbox) return { ...sandbox, mode, source: 'platform-sandbox' };
  }
  return null;
}

/**
 * Loads + decrypts a project's stored config for one gateway + mode from the
 * generic manishapay_gateway_credentials table. Returns null if none active.
 */
async function loadGatewayConfig(projectId, provider, mode) {
  const { data, error } = await supabase
    .from(GATEWAY_TABLE)
    .select('id, config_encrypted, data_key_encrypted')
    .eq('project_id', projectId)
    .eq('provider', provider)
    .eq('mode', mode)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new AppError({ status: 500, code: 'CRED_LOOKUP_FAILED', message: error.message });
  if (!data) return null;

  const config = await crypto.decryptConfig(data);
  supabase.from(GATEWAY_TABLE).update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {});
  return config;
}

/**
 * Encrypts + persists a project's credential config for any gateway. Revokes
 * the prior active row for (project, provider, mode) first so the unique index
 * stays satisfied. `hint` is a non-secret display label (never a secret).
 *
 * @param {{ projectId: string, provider: string, mode: 'test'|'live', config: object, hint?: string, addedBy?: string }} input
 */
async function saveGateway({ projectId, provider, mode, config, hint = null, addedBy = null }) {
  if (!projectId) throw new Error('saveGateway: projectId is required');
  if (!provider) throw new Error('saveGateway: provider is required');
  if (mode !== 'test' && mode !== 'live') throw new Error(`saveGateway: invalid mode '${mode}'`);
  if (!config || typeof config !== 'object' || !Object.keys(config).length) {
    throw new Error('saveGateway: non-empty config object is required');
  }

  const { error: revokeErr } = await supabase
    .from(GATEWAY_TABLE)
    .update({ status: 'revoked', rotated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .eq('provider', provider)
    .eq('mode', mode)
    .eq('status', 'active');
  if (revokeErr) {
    throw new AppError({ status: 500, code: 'CRED_REVOKE_FAILED', message: revokeErr.message });
  }

  const sealed = await crypto.encryptConfig(config);
  const { data, error } = await supabase
    .from(GATEWAY_TABLE)
    .insert({
      project_id: projectId,
      provider,
      mode,
      config_encrypted: sealed.config_encrypted,
      data_key_encrypted: sealed.data_key_encrypted,
      hint,
      added_by: addedBy,
      status: 'active',
    })
    .select('id')
    .single();
  if (error) throw new AppError({ status: 500, code: 'CRED_SAVE_FAILED', message: error.message });
  return { id: data.id };
}

/**
 * Loads the active PayNow credential (or the shared TEST sandbox integration).
 */
async function loadPaynow(projectId, mode) {
  if (!projectId) throw new Error('loadActive: projectId is required');
  if (mode !== 'test' && mode !== 'live') {
    throw new Error(`loadActive: invalid mode '${mode}'`);
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select(
      'id, integration_id_encrypted, integration_key_encrypted, data_key_encrypted, integration_id_last4, merchant_email, created_at',
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
  if (!data) {
    // Sandbox fallback: in TEST mode, a project with no credentials of its own
    // uses the platform's shared test integration (PAYNOW_TEST_*), so the
    // sandbox connects to REAL PayNow test with zero setup. Live never falls
    // back — it always requires the merchant's own credentials.
    if (mode === 'test' && env.PAYNOW_TEST_INTEGRATION_ID && env.PAYNOW_TEST_INTEGRATION_KEY) {
      return {
        credentialId: null,
        integrationId: String(env.PAYNOW_TEST_INTEGRATION_ID),
        integrationKey: env.PAYNOW_TEST_INTEGRATION_KEY,
        integrationIdLast4: String(env.PAYNOW_TEST_INTEGRATION_ID).slice(-4),
        // Registered email of the shared test integration — lets paynow.js
        // swap authemail in test mode so any caller email is accepted.
        merchantEmail: env.PAYNOW_TEST_AUTHEMAIL || null,
        addedAt: null,
        source: 'platform-sandbox',
      };
    }
    return null;
  }

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
    // The merchant's own registered email drives authemail; fall back to the
    // platform-wide test email only if this credential doesn't carry one.
    merchantEmail: data.merchant_email || env.PAYNOW_TEST_AUTHEMAIL || null,
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
async function save({ projectId, mode, integrationId, integrationKey, merchantEmail = null, addedBy = null }) {
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
      merchant_email: merchantEmail,
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

module.exports = { loadActive, save, revoke, saveGateway, loadGatewayConfig, sandboxFromEnv };
