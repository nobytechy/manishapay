/**
 * /v1/credentials — JWT-authenticated CRUD for a project's PayNow creds.
 *
 * Plaintext credentials enter the system here, get encrypted via the
 * envelope helper, and are persisted to manishapay_paynow_credentials.
 * They never come back out to the dashboard — only the last 4 chars of
 * the integration ID are displayed. To rotate, the developer adds a new
 * credential which automatically revokes the prior active one for that
 * (project, mode) pair.
 */
'use strict';

const router = require('express').Router();
const { z } = require('zod');
const { jwtAuthenticate, requireCapability, assertPermanentAccount } = require('../middleware/jwtAuth');
const credentials = require('../services/credentials');
const { getProvider } = require('../providers');
const { supabase } = require('../config/supabase');
const AppError = require('../errors/AppError');

router.use(jwtAuthenticate);

const saveSchema = z.object({
  project_id: z.string().uuid(),
  mode: z.enum(['test', 'live']),
  integration_id: z.union([z.string(), z.number()]),
  integration_key: z.string().min(8).max(64),
  // PayNow-registered merchant email → sent as authemail. Required for mobile /
  // Express-Checkout and (in test mode) must match the merchant's registered
  // email. Optional here so web-redirect-only merchants aren't forced to set it.
  merchant_email: z.string().trim().email().optional().or(z.literal('')),
});

// List metadata only — never decrypted blobs.
router.get('/', async (req, res, next) => {
  try {
    const { data: projects, error: projErr } = await supabase
      .from('manishapay_projects')
      .select('id')
      .eq('developer_id', req.developer.id);
    if (projErr) throw new AppError({ status: 500, code: 'LIST_FAILED', message: projErr.message });

    const ids = (projects || []).map((p) => p.id);
    if (ids.length === 0) {
      return res.json({ data: [] });
    }

    const { data, error } = await supabase
      .from('manishapay_paynow_credentials')
      .select('id, project_id, mode, integration_id_last4, merchant_email, status, last_used_at, created_at, rotated_at')
      .in('project_id', ids)
      .order('created_at', { ascending: false });
    if (error) throw new AppError({ status: 500, code: 'LIST_FAILED', message: error.message });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireCapability('manage'), async (req, res, next) => {
  try {
    const parsed = saveSchema.parse(req.body);
    if (parsed.mode === 'live') assertPermanentAccount(req.developer);

    // Confirm project ownership.
    const { data: proj, error: projErr } = await supabase
      .from('manishapay_projects')
      .select('id')
      .eq('id', parsed.project_id)
      .eq('developer_id', req.developer.id)
      .maybeSingle();
    if (projErr) throw new AppError({ status: 500, code: 'PROJECT_LOOKUP_FAILED', message: projErr.message });
    if (!proj) throw AppError.notFound('Project');

    const result = await credentials.save({
      projectId: parsed.project_id,
      mode: parsed.mode,
      integrationId: String(parsed.integration_id),
      integrationKey: parsed.integration_key,
      merchantEmail: parsed.merchant_email || null,
      addedBy: req.developer.id,
    });

    res.status(201).json({
      data: {
        id: result.id,
        project_id: parsed.project_id,
        mode: parsed.mode,
        integration_id_last4: result.integrationIdLast4,
        status: 'active',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireCapability('manage'), async (req, res, next) => {
  try {
    // Confirm the credential belongs to a project this developer owns.
    const { data: cred, error: credErr } = await supabase
      .from('manishapay_paynow_credentials')
      .select('id, project_id, manishapay_projects!inner(developer_id)')
      .eq('id', req.params.id)
      .maybeSingle();
    if (credErr) throw new AppError({ status: 500, code: 'LOOKUP_FAILED', message: credErr.message });
    if (!cred || cred.manishapay_projects.developer_id !== req.developer.id) {
      throw AppError.notFound('Credential');
    }
    await credentials.revoke(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ─── Generic multi-gateway credentials (Stripe, Paystack, Flutterwave, …) ───
// The Connect App posts { project_id, provider, mode, config } where `config`
// carries the fields that provider's credentialSchema declares. Validated here,
// encrypted, and stored in manishapay_gateway_credentials. PayNow keeps its own
// dedicated endpoints above for backward compatibility.

const gatewaySaveSchema = z.object({
  project_id: z.string().uuid(),
  provider: z.string().min(1).max(32),
  mode: z.enum(['test', 'live']),
  config: z.record(z.string(), z.any()),
});

// List connected-gateway credential METADATA (never secrets) for the developer.
router.get('/gateway', async (req, res, next) => {
  try {
    const { data: projects } = await supabase
      .from('manishapay_projects')
      .select('id')
      .eq('developer_id', req.developer.id);
    const ids = (projects || []).map((p) => p.id);
    if (!ids.length) return res.json({ data: [] });

    const { data, error } = await supabase
      .from('manishapay_gateway_credentials')
      .select('id, project_id, provider, mode, hint, status, last_used_at, created_at, rotated_at')
      .in('project_id', ids)
      .order('created_at', { ascending: false });
    if (error) throw new AppError({ status: 500, code: 'LIST_FAILED', message: error.message });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post('/gateway', requireCapability('manage'), async (req, res, next) => {
  try {
    const parsed = gatewaySaveSchema.parse(req.body);
    // Test mode is wide open — that's the whole point of the fast start. Live
    // credentials mean real money, so the account has to be recoverable first.
    if (parsed.mode === 'live') assertPermanentAccount(req.developer);

    // Ownership.
    const { data: proj, error: projErr } = await supabase
      .from('manishapay_projects')
      .select('id')
      .eq('id', parsed.project_id)
      .eq('developer_id', req.developer.id)
      .maybeSingle();
    if (projErr) throw new AppError({ status: 500, code: 'PROJECT_LOOKUP_FAILED', message: projErr.message });
    if (!proj) throw AppError.notFound('Project');

    // Resolve the provider (throws for unknown) and validate required fields
    // against ITS credentialSchema — the same schema the Connect App renders.
    const provider = getProvider(parsed.provider);
    const missing = (provider.credentialSchema || [])
      .filter((f) => f.required && !parsed.config[f.key])
      .map((f) => f.key);
    if (missing.length) {
      throw AppError.badRequest(`Missing required credential fields for ${parsed.provider}: ${missing.join(', ')}`, { missing });
    }

    // Non-secret display hint: last 4 of the first declared field.
    const firstKey = (provider.credentialSchema[0] || {}).key;
    const firstVal = firstKey ? parsed.config[firstKey] : null;
    const hint = firstVal ? `••••${String(firstVal).slice(-4)}` : null;

    const result = await credentials.saveGateway({
      projectId: parsed.project_id,
      provider: parsed.provider,
      mode: parsed.mode,
      config: parsed.config,
      hint,
      addedBy: req.developer.id,
    });

    res.status(201).json({
      data: { id: result.id, project_id: parsed.project_id, provider: parsed.provider, mode: parsed.mode, hint, status: 'active' },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/gateway/:id', requireCapability('manage'), async (req, res, next) => {
  try {
    // Confirm the credential belongs to a project this developer owns.
    const { data: cred, error: credErr } = await supabase
      .from('manishapay_gateway_credentials')
      .select('id, manishapay_projects!inner(developer_id)')
      .eq('id', req.params.id)
      .maybeSingle();
    if (credErr) throw new AppError({ status: 500, code: 'LOOKUP_FAILED', message: credErr.message });
    if (!cred || cred.manishapay_projects.developer_id !== req.developer.id) {
      throw AppError.notFound('Credential');
    }
    const { error } = await supabase
      .from('manishapay_gateway_credentials')
      .update({ status: 'revoked', rotated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('status', 'active');
    if (error) throw new AppError({ status: 500, code: 'REVOKE_FAILED', message: error.message });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
