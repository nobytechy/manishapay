/**
 * WhatsApp notifications via UltraMsg — fully dynamic.
 *
 * The super-admin sets the UltraMsg instance + token in the admin console
 * (stored encrypted in manishapay_platform_settings). This service reads that
 * config, decrypts the token, and sends messages. If WhatsApp isn't configured
 * or is disabled, every call is a safe no-op — nothing here forces a paid
 * dependency; it only activates once the admin adds their own UltraMsg creds.
 */
'use strict';

const axios = require('axios');
const { supabase } = require('../config/supabase');
const crypto = require('./crypto');
const { logger } = require('./logger');

let cache = null;
let cacheAt = 0;
const TTL_MS = 30_000;

async function getConfig() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  try {
    const { data } = await supabase
      .from('manishapay_platform_settings')
      .select('ultramsg_instance, integration_id_encrypted, integration_key_encrypted, data_key_encrypted, whatsapp_enabled')
      .eq('id', true)
      .maybeSingle();

    if (!data || !data.whatsapp_enabled || !data.ultramsg_instance || !data.integration_key_encrypted) {
      cache = { enabled: false };
    } else {
      let token = null;
      try {
        token = (await crypto.decryptCredential(data)).integrationKey;
      } catch (err) {
        logger.warn({ err: err.message }, 'whatsapp: token decrypt failed');
      }
      cache = token
        ? { enabled: true, instance: data.ultramsg_instance, token }
        : { enabled: false };
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'whatsapp: settings lookup failed');
    cache = { enabled: false };
  }
  cacheAt = Date.now();
  return cache;
}

/** Force a config re-read after the admin updates settings. */
function invalidate() {
  cache = null;
  cacheAt = 0;
}

/**
 * Send a WhatsApp text. Never throws — returns { sent, reason? }.
 * @param {string} to    destination number (E.164, e.g. 263771234567)
 * @param {string} body  message text
 */
async function sendMessage(to, body) {
  const cfg = await getConfig();
  if (!cfg.enabled) return { sent: false, reason: 'WhatsApp not configured' };
  const number = String(to || '').replace(/[^\d+]/g, '');
  if (!number) return { sent: false, reason: 'no destination number' };
  try {
    const url = `https://api.ultramsg.com/${encodeURIComponent(cfg.instance)}/messages/chat`;
    const res = await axios.post(url, { token: cfg.token, to: number, body }, { timeout: 8_000 });
    return { sent: true, id: res.data?.id ?? null, provider: res.data ?? null };
  } catch (err) {
    logger.warn({ err: err.message }, 'whatsapp: send failed');
    return { sent: false, reason: err.response?.data?.error || err.message };
  }
}

module.exports = { sendMessage, getConfig, invalidate };
