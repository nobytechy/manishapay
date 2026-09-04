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
const env = require('../config/env');

// Emails that are automatically super-admins (config-driven, survives resets).
const SUPERADMIN_EMAILS = new Set(
  (env.SUPERADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);
const isSuperadmin = (email) => !!email && SUPERADMIN_EMAILS.has(email.toLowerCase());

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
    // A configured super-admin email is force-promoted on every bootstrap, so
    // the owner is admin again immediately after any data reset — no manual SQL.
    //
    // Anonymous users (supabase.auth.signInAnonymously) have no email yet. They
    // get a real auth.users row with a stable id, so the developer row is
    // created exactly like anyone else's — just marked `anonymous` and with a
    // null email. When the merchant later links an email or an OAuth identity,
    // Supabase attaches it to the SAME auth user, this endpoint runs again, and
    // the row is promoted in place. The id never changes, so every project,
    // credential, key and transaction stays attached. Nothing is migrated
    // because nothing moves.
    const row = {
      id: user.id,
      full_name: fullName,
    };
    if (user.is_anonymous) {
      row.status = 'anonymous';
    } else {
      row.email = user.email;
      // Promote an account that was anonymous until this moment. Untouched for
      // accounts that were already permanent, so a suspended account can't
      // launder itself back to active by re-bootstrapping.
      const { data: prior } = await supabase
        .from('manishapay_developers')
        .select('status')
        .eq('id', user.id)
        .maybeSingle();
      if (!prior || prior.status === 'anonymous') row.status = 'active';
    }
    if (isSuperadmin(user.email)) {
      row.role = 'admin';
      row.status = 'active';
    }
    const { error: upsertErr } = await supabase
      .from('manishapay_developers')
      .upsert(row, { onConflict: 'id', ignoreDuplicates: false });
    if (upsertErr) {
      throw new AppError({
        status: 500,
        code: 'BOOTSTRAP_FAILED',
        message: upsertErr.message,
      });
    }

    // Accept any pending team invites addressed to this email — link the
    // membership to this user and activate it. Best-effort.
    if (user.email) {
      await supabase
        .from('manishapay_team_members')
        .update({ member_id: user.id, status: 'active' })
        .eq('member_email', user.email.toLowerCase())
        .eq('status', 'invited')
        .then(() => {}, () => {});
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
