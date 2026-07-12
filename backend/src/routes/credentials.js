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
const { jwtAuthenticate, requireCapability } = require('../middleware/jwtAuth');
const credentials = require('../services/credentials');
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

module.exports = router;
