/**
 * /v1/keys — JWT-authenticated CRUD for the developer's API keys.
 *
 * On create, we mint a fresh `mp_(test|live)_<24-char-secret>` key,
 * bcrypt-hash it, store the hash + 12-char prefix, and return the
 * plaintext to the dashboard ONCE so it can be displayed to the user.
 * After that they only ever see the prefix.
 */
'use strict';

const router = require('express').Router();
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const nodeCrypto = require('crypto');
const { jwtAuthenticate, requireCapability, assertPermanentAccount } = require('../middleware/jwtAuth');
const { supabase } = require('../config/supabase');
const crypto = require('../services/crypto');
const AppError = require('../errors/AppError');

// One active key per developer — flip this one on, everything else off.
async function setActiveKey(developerId, keyId) {
  await supabase.from('manishapay_api_keys').update({ is_active: false })
    .eq('developer_id', developerId).eq('is_active', true);
  await supabase.from('manishapay_api_keys').update({ is_active: true })
    .eq('developer_id', developerId).eq('id', keyId);
}

router.use(jwtAuthenticate);

const PREFIX_LEN = 12;
const SECRET_BYTES = 18; // 18 bytes → 24 base64 chars
const BCRYPT_COST = 11;

function mintKey(mode) {
  const secret = nodeCrypto.randomBytes(SECRET_BYTES).toString('base64url');
  const fullKey = `mp_${mode}_${secret}`;
  return { fullKey, prefix: fullKey.slice(0, PREFIX_LEN) };
}

const createSchema = z.object({
  project_id: z.string().uuid(),
  mode: z.enum(['test', 'live']),
  label: z.string().max(80).optional(),
  scopes: z.array(z.enum(['pay', 'read'])).min(1).optional(),
  expires_at: z.string().datetime().optional(),
  ip_allowlist: z.array(z.string().max(64)).max(20).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('manishapay_api_keys')
      .select('id, project_id, prefix, label, mode, status, plan, is_active, last_used_at, created_at')
      .eq('developer_id', req.developer.id)
      .order('created_at', { ascending: false });
    if (error) throw new AppError({ status: 500, code: 'LIST_FAILED', message: error.message });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// The developer's active key, resolved server-side so it works on ANY device.
// For a TEST key we return the decrypted value so the client can use it; a LIVE
// key is never revealed (hash-only) — the client keeps whatever it saved at mint.
router.get('/active', async (req, res, next) => {
  try {
    const { data } = await supabase
      .from('manishapay_api_keys')
      .select('id, prefix, mode, status, key_encrypted, key_data_key_encrypted')
      .eq('developer_id', req.developer.id)
      .eq('is_active', true)
      .eq('status', 'active')
      .maybeSingle();
    if (!data) return res.json({ data: null });
    let key = null;
    if (data.mode === 'test' && data.key_encrypted && data.key_data_key_encrypted) {
      try {
        const cfg = await crypto.decryptConfig({ config_encrypted: data.key_encrypted, data_key_encrypted: data.key_data_key_encrypted });
        key = cfg.k || null;
      } catch { /* leave null — client falls back to its saved copy */ }
    }
    res.json({ data: { id: data.id, prefix: data.prefix, mode: data.mode, key } });
  } catch (err) {
    next(err);
  }
});

// Mark a key as the active/in-use one (persisted server-side, cross-device).
router.post('/:id/activate', async (req, res, next) => {
  try {
    const { data } = await supabase
      .from('manishapay_api_keys')
      .select('id').eq('id', req.params.id).eq('developer_id', req.developer.id)
      .eq('status', 'active').maybeSingle();
    if (!data) throw AppError.notFound('API key');
    await setActiveKey(req.developer.id, req.params.id);
    res.json({ data: { ok: true, id: req.params.id } });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireCapability('manage'), async (req, res, next) => {
  try {
    const parsed = createSchema.parse(req.body);
    // A live key charges real customers. An account that can vanish with the
    // browser cache doesn't get one until it's secured.
    if (parsed.mode === 'live') assertPermanentAccount(req.developer);

    // Confirm the project belongs to this developer.
    const { data: proj } = await supabase
      .from('manishapay_projects')
      .select('id')
      .eq('id', parsed.project_id)
      .eq('developer_id', req.developer.id)
      .maybeSingle();
    if (!proj) throw AppError.notFound('Project');

    const { fullKey, prefix } = mintKey(parsed.mode);
    const keyHash = await bcrypt.hash(fullKey, BCRYPT_COST);

    // TEST keys are ALSO stored encrypted so they can be re-revealed / loaded on
    // any device. LIVE keys keep only the bcrypt hash and are never retrievable.
    let sealed = { config_encrypted: null, data_key_encrypted: null };
    if (parsed.mode === 'test') sealed = await crypto.encryptConfig({ k: fullKey });

    const { data, error } = await supabase
      .from('manishapay_api_keys')
      .insert({
        developer_id: req.developer.id,
        project_id: parsed.project_id,
        prefix,
        key_hash: keyHash,
        key_encrypted: sealed.config_encrypted,
        key_data_key_encrypted: sealed.data_key_encrypted,
        label: parsed.label || null,
        mode: parsed.mode,
        status: 'active',
        plan: 'free',
        is_active: true, // a freshly-minted key becomes the active/in-use one
        scopes: parsed.scopes && parsed.scopes.length ? parsed.scopes : ['pay', 'read'],
        expires_at: parsed.expires_at || null,
        ip_allowlist: parsed.ip_allowlist || null,
      })
      .select('id, project_id, prefix, label, mode, status, scopes, expires_at, created_at')
      .single();
    if (error) throw new AppError({ status: 500, code: 'CREATE_FAILED', message: error.message });

    // Make it the sole active key (turn the others off).
    await setActiveKey(req.developer.id, data.id);

    res.status(201).json({
      data: {
        ...data,
        key: fullKey, // shown ONCE in the dashboard, then never again
      },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireCapability('manage'), async (req, res, next) => {
  try {
    // `.select()` so we know how many rows actually matched. Without this the
    // update returns 204 even when it matched NOTHING (wrong key id, or a key
    // owned by a different developer account) — a silent no-op that looks like
    // success in the dashboard. We turn that into an honest 404 instead.
    const { data, error } = await supabase
      .from('manishapay_api_keys')
      .update({ status: 'revoked' })
      .eq('id', req.params.id)
      .eq('developer_id', req.developer.id)
      .select('id');
    if (error) throw new AppError({ status: 500, code: 'REVOKE_FAILED', message: error.message });
    if (!data || data.length === 0) {
      throw new AppError({
        status: 404,
        code: 'KEY_NOT_FOUND',
        message: 'No such API key on this account.',
        resolution:
          'This key belongs to a different account (or was already removed). Sign in with the account that created it — the dashboard only lists and revokes keys owned by the signed-in developer.',
      });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
