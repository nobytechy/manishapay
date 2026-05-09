/**
 * Auth bootstrap.
 *
 * Why this exists:
 *   ManishaPay shares one Supabase project with chikoro/church/etc. The
 *   `manishapay_handle_new_user` trigger only creates a manishapay_developers
 *   row when `auth.users.raw_user_meta_data.app === 'manishapay'`. That works
 *   for fresh email signups via the dashboard (we set the marker explicitly).
 *
 *   It does NOT work for two cases:
 *     1. Google OAuth signups — Supabase creates the auth.users row from the
 *        provider data; our marker isn't set, so the trigger skips it.
 *     2. Existing users from sibling apps (chikoro/church) signing in to
 *        ManishaPay — the auth.users row already exists, no INSERT, no trigger.
 *
 *   `POST /v1/auth/bootstrap` patches both:
 *     • Verifies the caller's Supabase access token.
 *     • Idempotently upserts a row into manishapay_developers.
 *     • Stamps `app: 'manishapay'` onto raw_user_meta_data via the admin API.
 *     • Returns the developer profile.
 *
 *   The endpoint is safe to call on every dashboard load — repeated calls
 *   are a no-op once the row exists.
 */
'use strict';

const router = require('express').Router();
const { supabase } = require('../config/supabase');
const AppError = require('../errors/AppError');
const { logger } = require('../services/logger');

router.post('/bootstrap', async (req, res, next) => {
  try {
    const header = req.header('Authorization') || '';
    if (!header.startsWith('Bearer ')) {
      throw AppError.unauthorized('Missing Authorization header');
    }
    const token = header.slice(7).trim();
    if (!token) throw AppError.unauthorized();

    // Verify the JWT and fetch the auth.users record.
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) {
      throw AppError.unauthorized('Invalid or expired session');
    }
    const user = userData.user;
    const meta = user.user_metadata || {};
    const fullName = meta.full_name || meta.name || null;

    // Idempotent upsert keyed on the auth.users id (PK + FK on developers).
    const { error: upsertErr } = await supabase
      .from('manishapay_developers')
      .upsert(
        {
          id: user.id,
          email: user.email,
          full_name: fullName,
        },
        { onConflict: 'id', ignoreDuplicates: false }
      );
    if (upsertErr) {
      throw new AppError({
        status: 500,
        code: 'BOOTSTRAP_FAILED',
        message: upsertErr.message,
      });
    }

    // Stamp the app marker so AuthContext / future trigger-based flows recognise this user.
    // Do this in a separate step so a metadata failure doesn't roll back the developer row.
    if (meta.app !== 'manishapay') {
      const { error: metaErr } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { ...meta, app: 'manishapay' },
      });
      if (metaErr) {
        logger.warn({ err: metaErr.message, userId: user.id }, 'bootstrap: app marker update failed');
        // Continue — the developer row is the source of truth.
      }
    }

    const { data: dev, error: readErr } = await supabase
      .from('manishapay_developers')
      .select('id, email, full_name, role, status, billing_status, created_at')
      .eq('id', user.id)
      .single();
    if (readErr || !dev) {
      throw new AppError({
        status: 500,
        code: 'BOOTSTRAP_READBACK_FAILED',
        message: readErr?.message || 'developer row vanished after upsert',
      });
    }

    res.json({ developer: dev });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
