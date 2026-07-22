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
      .select('ultramsg_instance, integration_key_encrypted, whatsapp_enabled, ' +
              'bank_name, bank_account_name, bank_account_number, bank_branch, bank_swift, ' +
              'bank_currency, bank_enabled, billing_notes, billing_paynow_config_encrypted, ' +
              'billing_paynow_enabled, updated_at')
      .eq('id', true)
      .maybeSingle();
    res.json({
      data: {
        ultramsg_instance: data?.ultramsg_instance || '',
        whatsapp_enabled: !!data?.whatsapp_enabled,
        token_set: !!data?.integration_key_encrypted,
        // Receiving / payout details (bank fields are display-for-payer, safe to return).
        bank_name: data?.bank_name || '',
        bank_account_name: data?.bank_account_name || '',
        bank_account_number: data?.bank_account_number || '',
        bank_branch: data?.bank_branch || '',
        bank_swift: data?.bank_swift || '',
        bank_currency: data?.bank_currency || '',
        bank_enabled: !!data?.bank_enabled,
        billing_notes: data?.billing_notes || '',
        billing_paynow_set: !!data?.billing_paynow_config_encrypted,
        billing_paynow_enabled: !!data?.billing_paynow_enabled,
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
  // Receiving / payout details.
  bank_name: z.string().max(120).optional(),
  bank_account_name: z.string().max(120).optional(),
  bank_account_number: z.string().max(64).optional(),
  bank_branch: z.string().max(120).optional(),
  bank_swift: z.string().max(32).optional(),
  bank_currency: z.string().max(12).optional(),
  bank_enabled: z.boolean().optional(),
  billing_notes: z.string().max(500).optional(),
  // ManishaPay's own PayNow (fee collection) — id+key only sent when (re)setting.
  billing_paynow_id: z.string().max(120).optional(),
  billing_paynow_key: z.string().max(300).optional(),
  billing_paynow_enabled: z.boolean().optional(),
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
    // Bank / payout details (plaintext display fields).
    for (const f of ['bank_name', 'bank_account_name', 'bank_account_number', 'bank_branch',
                     'bank_swift', 'bank_currency', 'billing_notes']) {
      if (p[f] !== undefined) row[f] = p[f].trim();
    }
    if (p.bank_enabled !== undefined) row.bank_enabled = p.bank_enabled;
    if (p.billing_paynow_enabled !== undefined) row.billing_paynow_enabled = p.billing_paynow_enabled;
    // Billing PayNow credential — sealed as a config blob; only rewritten when both parts sent.
    if (p.billing_paynow_id && p.billing_paynow_key) {
      const sealed = await crypto.encryptConfig({
        integrationId: p.billing_paynow_id.trim(),
        integrationKey: p.billing_paynow_key.trim(),
      });
      row.billing_paynow_config_encrypted = sealed.config_encrypted;
      row.billing_paynow_datakey_encrypted = sealed.data_key_encrypted;
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
