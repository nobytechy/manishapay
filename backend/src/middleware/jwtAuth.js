/**
 * JWT auth — for dashboard management routes (NOT the data-plane).
 *
 * The browser sends `Authorization: Bearer <supabase-access-token>` after
 * a successful supabase.auth.signIn. We hand the token to the Supabase
 * server SDK to verify it and extract the user. Then we look up the
 * developer profile (gating non-ManishaPay users out by checking
 * manishapay_developers existence — chikoro/church users will fail here).
 *
 * On success: req.developer = { id, email, role, billingStatus }
 *
 * Use this on /v1/projects, /v1/keys, /v1/credentials — anywhere a
 * dashboard user needs to manage their own resources.
 */
'use strict';

const { supabase } = require('../config/supabase');
const AppError = require('../errors/AppError');

async function jwtAuthenticate(req, _res, next) {
  try {
    const header = req.header('Authorization') || '';
    if (!header.startsWith('Bearer ')) throw AppError.unauthorized('Missing Authorization header');
    const token = header.slice(7).trim();
    if (!token) throw AppError.unauthorized();

    // supabase.auth.getUser(jwt) verifies the token signature against the
    // project's JWT secret and returns the user record on success.
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) {
      throw AppError.unauthorized('Invalid or expired session');
    }
    const user = userData.user;

    // Confirm this auth user actually has a ManishaPay developer profile.
    // chikoro/church users don't — they'd get a clean 403 here.
    const { data: dev, error: devErr } = await supabase
      .from('manishapay_developers')
      .select('id, email, role, status, billing_status')
      .eq('id', user.id)
      .maybeSingle();
    if (devErr) {
      throw new AppError({ status: 500, code: 'PROFILE_LOOKUP_FAILED', message: devErr.message });
    }
    if (!dev) {
      throw new AppError({
        status: 403,
        code: 'NOT_A_MANISHAPAY_DEVELOPER',
        message: 'Sign up via the ManishaPay app to create a developer profile.',
      });
    }
    if (dev.status === 'suspended' || dev.status === 'deleted') {
      throw new AppError({ status: 403, code: 'DEVELOPER_SUSPENDED', message: `Account ${dev.status}` });
    }

    req.developer = {
      id: dev.id,
      email: dev.email,
      role: dev.role,
      billingStatus: dev.billing_status,
    };
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, _res, next) {
  if (!req.developer) return next(AppError.unauthorized());
  if (req.developer.role !== 'admin') {
    return next(new AppError({ status: 403, code: 'ADMIN_ONLY', message: 'Admin role required' }));
  }
  next();
}

module.exports = { jwtAuthenticate, requireAdmin };
