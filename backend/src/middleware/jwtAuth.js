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
    // An anonymous merchant is a real account with a real id — they just have
    // no way to prove who they are yet. They can do everything in TEST mode;
    // requirePermanentAccount() below blocks the handful of routes where a
    // recoverable identity actually matters (real money, real keys, billing).
    const isAnonymous = !!user.is_anonymous || dev.status === 'anonymous';

    if (dev.status === 'suspended' || dev.status === 'deleted') {
      throw new AppError({ status: 403, code: 'DEVELOPER_SUSPENDED', message: `Account ${dev.status}` });
    }

    // ── Workspace resolution (flat teams) ────────────────────────────────
    // X-Account-Id lets a teammate operate a different account they belong to.
    // We validate active membership, then scope ALL data ops to that account by
    // setting req.developer.id — and record the caller's team role for
    // capability checks. Owner (own account) has the full role set.
    const realUserId = dev.id;
    let accountId = realUserId;
    let teamRole = 'owner';
    const requested = req.header('X-Account-Id');
    if (requested && requested !== realUserId) {
      const { data: membership } = await supabase
        .from('manishapay_team_members')
        .select('role')
        .eq('owner_id', requested)
        .eq('member_id', realUserId)
        .eq('status', 'active')
        .maybeSingle();
      if (!membership) {
        throw new AppError({ status: 403, code: 'NOT_A_TEAMMATE', message: 'You are not a member of that account.' });
      }
      accountId = requested;
      teamRole = membership.role; // 'admin' | 'member' | 'viewer'
    }

    req.developer = {
      id: accountId,          // data operations scope to this account
      realUserId,             // the actual signed-in user
      email: dev.email,
      role: dev.role,         // platform role (super-admin gate)
      teamRole,               // owner | admin | member | viewer
      billingStatus: dev.billing_status,
      isAnonymous,
    };
    next();
  } catch (err) {
    next(err);
  }
}

// Capabilities per team role. Owner/admin can do everything in the account;
// member can build (payments + manage resources) but not manage team/billing;
// viewer is read-only.
const ROLE_CAPS = {
  owner:  ['read', 'payments', 'manage', 'team', 'billing'],
  admin:  ['read', 'payments', 'manage', 'team', 'billing'],
  member: ['read', 'payments', 'manage'],
  viewer: ['read'],
};

function requireCapability(cap) {
  return (req, _res, next) => {
    const role = req.developer?.teamRole || 'owner';
    if (!(ROLE_CAPS[role] || []).includes(cap)) {
      return next(new AppError({ status: 403, code: 'FORBIDDEN_ROLE', message: `Your role (${role}) is not allowed to ${cap === 'payments' ? 'take payments/refunds' : cap === 'manage' ? 'manage projects & keys' : cap} in this account.` }));
    }
    next();
  };
}

/**
 * Blocks a route for merchants who have not yet secured their account.
 *
 * Anonymous accounts exist so a merchant can be inside the dashboard in one
 * tap and take a TEST payment within minutes. The line is real money: if an
 * account can be lost by clearing browser data, it must not be able to hold
 * live gateway credentials, mint live API keys, or run up a bill. Hitting this
 * is not an error state — it's the prompt to link an email or a provider, and
 * the client turns ACCOUNT_NOT_SECURED into the "Secure your account" step.
 */
function assertPermanentAccount(developer) {
  if (developer?.isAnonymous) {
    throw new AppError({
      status: 403,
      code: 'ACCOUNT_NOT_SECURED',
      message: 'Add an email or sign-in method to your account first — everything you have set up stays exactly as it is.',
    });
  }
}

function requirePermanentAccount(req, _res, next) {
  if (!req.developer) return next(AppError.unauthorized());
  try { assertPermanentAccount(req.developer); next(); } catch (err) { next(err); }
}

function requireAdmin(req, _res, next) {
  if (!req.developer) return next(AppError.unauthorized());
  if (req.developer.role !== 'admin') {
    return next(new AppError({ status: 403, code: 'ADMIN_ONLY', message: 'Admin role required' }));
  }
  next();
}

module.exports = { jwtAuthenticate, requireAdmin, requireCapability, requirePermanentAccount, assertPermanentAccount, ROLE_CAPS };
