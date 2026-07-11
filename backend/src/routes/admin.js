/**
 * /v1/admin — super-admin-only platform settings.
 *
 * Currently: the dynamic WhatsApp (UltraMsg) configuration. The instance is
 * stored plaintext; the token is encrypted with the same envelope helper as
 * PayNow credentials and never returned to the client (only a "token_set" flag).
 */
'use strict';

const router = require('express').Router();
const { z } = require('zod');
const { jwtAuthenticate } = require('../middleware/jwtAuth');
const { supabase } = require('../config/supabase');
const crypto = require('../services/crypto');
const whatsapp = require('../services/whatsapp');
const AppError = require('../errors/AppError');

router.use(jwtAuthenticate);

// Admin gate — verify the caller's developer row is role='admin'.
router.use(async (req, res, next) => {
  try {
    const { data } = await supabase
      .from('manishapay_developers')
      .select('role')
      .eq('id', req.developer.id)
      .maybeSingle();
    if (!data || data.role !== 'admin') {
      throw new AppError({ status: 403, code: 'ADMIN_ONLY', message: 'Administrator access required' });
    }
    next();
  } catch (err) {
    next(err);
  }
});

router.get('/settings', async (req, res, next) => {
  try {
    const { data } = await supabase
      .from('manishapay_platform_settings')
      .select('ultramsg_instance, integration_key_encrypted, whatsapp_enabled, updated_at')
      .eq('id', true)
      .maybeSingle();
    res.json({
      data: {
        ultramsg_instance: data?.ultramsg_instance || '',
        whatsapp_enabled: !!data?.whatsapp_enabled,
        token_set: !!data?.integration_key_encrypted,
        updated_at: data?.updated_at || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

const settingsSchema = z.object({
  ultramsg_instance: z.string().max(120).optional(),
  ultramsg_token: z.string().max(300).optional(), // only sent when (re)setting it
  whatsapp_enabled: z.boolean().optional(),
});

router.put('/settings', async (req, res, next) => {
  try {
    const p = settingsSchema.parse(req.body);
    const row = { id: true, updated_at: new Date().toISOString() };
    if (p.ultramsg_instance !== undefined) row.ultramsg_instance = p.ultramsg_instance.trim();
    if (p.whatsapp_enabled !== undefined) row.whatsapp_enabled = p.whatsapp_enabled;
    if (p.ultramsg_token) {
      const sealed = await crypto.encryptCredential({
        integrationId: (p.ultramsg_instance || 'ultramsg').trim(),
        integrationKey: p.ultramsg_token.trim(),
      });
      row.integration_id_encrypted = sealed.integration_id_encrypted;
      row.integration_key_encrypted = sealed.integration_key_encrypted;
      row.data_key_encrypted = sealed.data_key_encrypted;
    }
    const { error } = await supabase
      .from('manishapay_platform_settings')
      .upsert(row, { onConflict: 'id' });
    if (error) throw new AppError({ status: 500, code: 'SETTINGS_SAVE_FAILED', message: error.message });
    whatsapp.invalidate();
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});

router.post('/settings/whatsapp-test', async (req, res, next) => {
  try {
    const to = String(req.body?.to || '').trim();
    if (!to) throw AppError.badRequest('Provide a "to" number to test.');
    const r = await whatsapp.sendMessage(to, 'ManishaPay: your WhatsApp integration is working. ✅');
    res.json({ data: r });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
