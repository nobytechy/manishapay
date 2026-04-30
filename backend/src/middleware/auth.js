/**
 * API key authentication.
 *
 * Developers send `Authorization: Bearer mp_(test|live)_xxxxxxxx`.
 * The plaintext key is never stored — we keep a bcrypt hash and a 12-char
 * prefix in the `manishapay_api_keys` table. We look up by prefix
 * (cheap, indexed), then bcrypt-compare. If it matches and is active, we
 * also check the developer's billing_status; a developer in `disabled`
 * billing state can't make any calls, and `read_only` blocks writes.
 *
 * On success: `req.developer = { id, projectId, mode, plan, keyId, billingStatus }`
 */
'use strict';

const bcrypt = require('bcryptjs');
const AppError = require('../errors/AppError');
const { supabase } = require('../config/supabase');

const PREFIX_LEN = 12;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function authenticate(req, _res, next) {
  try {
    const header = req.header('Authorization') || '';
    if (!header.startsWith('Bearer ')) throw AppError.unauthorized();
    const raw = header.slice(7).trim();
    if (!raw || raw.length < PREFIX_LEN + 8) throw AppError.unauthorized();

    const prefix = raw.slice(0, PREFIX_LEN);
    const requestMode = raw.startsWith('mp_live_') ? 'live' : 'test';

    // Single round-trip: join api_keys to developers so we get billing
    // state in the same query.
    const { data, error } = await supabase
      .from('manishapay_api_keys')
      .select(
        `
        id, developer_id, project_id, key_hash, mode, status, plan, last_used_at,
        manishapay_developers ( billing_status, status )
        `,
      )
      .eq('prefix', prefix)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      throw new AppError({
        status: 500,
        code: 'AUTH_LOOKUP_FAILED',
        message: error.message,
      });
    }
    if (!data) throw AppError.unauthorized('No active key matches that prefix');
    if (data.mode !== requestMode) {
      throw AppError.unauthorized(`Key is in ${data.mode} mode, request asked for ${requestMode}`);
    }

    const ok = await bcrypt.compare(raw, data.key_hash);
    if (!ok) throw AppError.unauthorized();

    const dev = data.manishapay_developers || {};
    const billingStatus = dev.billing_status || 'good';
    const devStatus = dev.status || 'active';

    if (devStatus === 'suspended' || devStatus === 'deleted') {
      throw new AppError({
        status: 403,
        code: 'DEVELOPER_SUSPENDED',
        message: `Developer account is ${devStatus}`,
      });
    }
    if (billingStatus === 'disabled') {
      throw new AppError({
        status: 402,
        code: 'BILLING_DISABLED',
        message: 'Account disabled for non-payment. Settle outstanding invoices to resume.',
      });
    }
    if (billingStatus === 'read_only' && WRITE_METHODS.has(req.method)) {
      throw new AppError({
        status: 402,
        code: 'BILLING_READ_ONLY',
        message: 'Account is read-only pending payment. Settle outstanding invoices to resume.',
      });
    }

    req.developer = {
      id: data.developer_id,
      projectId: data.project_id,
      mode: data.mode,
      plan: data.plan || 'free',
      keyId: data.id,
      billingStatus,
    };

    // Best-effort touch — we don't await it on the hot path.
    supabase
      .from('manishapay_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)
      .then(() => {});

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate };
