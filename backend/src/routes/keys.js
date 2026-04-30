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
const { jwtAuthenticate } = require('../middleware/jwtAuth');
const { supabase } = require('../config/supabase');
const AppError = require('../errors/AppError');

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
});

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('manishapay_api_keys')
      .select('id, project_id, prefix, label, mode, status, plan, last_used_at, created_at')
      .eq('developer_id', req.developer.id)
      .order('created_at', { ascending: false });
    if (error) throw new AppError({ status: 500, code: 'LIST_FAILED', message: error.message });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = createSchema.parse(req.body);

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

    const { data, error } = await supabase
      .from('manishapay_api_keys')
      .insert({
        developer_id: req.developer.id,
        project_id: parsed.project_id,
        prefix,
        key_hash: keyHash,
        label: parsed.label || null,
        mode: parsed.mode,
        status: 'active',
        plan: 'free',
      })
      .select('id, project_id, prefix, label, mode, status, created_at')
      .single();
    if (error) throw new AppError({ status: 500, code: 'CREATE_FAILED', message: error.message });

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

router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('manishapay_api_keys')
      .update({ status: 'revoked' })
      .eq('id', req.params.id)
      .eq('developer_id', req.developer.id);
    if (error) throw new AppError({ status: 500, code: 'REVOKE_FAILED', message: error.message });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
