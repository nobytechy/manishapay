/**
 * Stale-guest sweep.
 *
 * Anonymous sign-in means every curious visitor who taps "See a payment work"
 * leaves behind a developer row, a default project, an API key and a demo
 * transaction. That is the correct trade — the alternative is a signup form
 * nobody fills in — but the rows are permanent and the visitors are not.
 *
 * Left alone this does two kinds of damage. It grows a table that nobody will
 * ever read, and it quietly corrupts the only numbers worth trusting: a
 * developer count that is mostly people who glanced at a link is a count of
 * nothing.
 *
 * What is safe to delete is narrower than "anonymous and old". A guest who
 * connected a gateway invested real effort and may well come back to a phone
 * they still have. A guest whose account holds a real (billable) payment is
 * not a tyre-kicker. Both are kept regardless of age; only the untouched ones
 * go, and the cascade on manishapay_developers.id clears everything beneath.
 *
 * @see supabase/0002_anonymous_signin.sql — manishapay_developers_anonymous_idx
 */
'use strict';

const { supabase } = require('../config/supabase');
const { logger } = require('./logger');

const DEFAULT_AGE_DAYS = 30;

/**
 * @param {{ olderThanDays?: number, dryRun?: boolean, limit?: number }} [opts]
 * @returns {Promise<{ examined: number, deleted: number, kept: number, keptReasons: object, dryRun: boolean }>}
 */
async function sweepAnonymous(opts = {}) {
  const olderThanDays = Number.isFinite(opts.olderThanDays) ? opts.olderThanDays : DEFAULT_AGE_DAYS;
  const dryRun = opts.dryRun !== false; // deleting is opt-in, never the default
  const limit = Math.min(Math.max(opts.limit || 500, 1), 2000);

  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error } = await supabase
    .from('manishapay_developers')
    .select('id, created_at')
    .eq('status', 'anonymous')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`sweepAnonymous: candidate lookup failed: ${error.message}`);

  const summary = {
    examined: (candidates || []).length,
    deleted: 0,
    kept: 0,
    keptReasons: { connectedGateway: 0, realPayment: 0 },
    dryRun,
  };
  if (!summary.examined) return summary;

  const ids = candidates.map((c) => c.id);

  // Projects first — gateway credentials hang off project_id, not developer_id.
  const { data: projects } = await supabase
    .from('manishapay_projects')
    .select('id, developer_id')
    .in('developer_id', ids);
  const projectsByDeveloper = new Map();
  for (const p of projects || []) {
    if (!projectsByDeveloper.has(p.developer_id)) projectsByDeveloper.set(p.developer_id, []);
    projectsByDeveloper.get(p.developer_id).push(p.id);
  }
  const allProjectIds = (projects || []).map((p) => p.id);

  const withGateway = new Set();
  if (allProjectIds.length) {
    const { data: creds } = await supabase
      .from('manishapay_gateway_credentials')
      .select('project_id')
      .in('project_id', allProjectIds)
      .eq('status', 'active');
    const ownerOf = new Map((projects || []).map((p) => [p.id, p.developer_id]));
    for (const c of creds || []) {
      const owner = ownerOf.get(c.project_id);
      if (owner) withGateway.add(owner);
    }
  }

  // The demo payment is inserted with billable:false precisely so it can be
  // distinguished from a payment somebody actually cared about.
  const withRealPayment = new Set();
  const { data: txns } = await supabase
    .from('manishapay_transactions')
    .select('developer_id')
    .in('developer_id', ids)
    .eq('billable', true);
  for (const t of txns || []) withRealPayment.add(t.developer_id);

  const deletable = [];
  for (const id of ids) {
    if (withGateway.has(id)) { summary.kept += 1; summary.keptReasons.connectedGateway += 1; continue; }
    if (withRealPayment.has(id)) { summary.kept += 1; summary.keptReasons.realPayment += 1; continue; }
    deletable.push(id);
  }

  if (!deletable.length || dryRun) {
    summary.deleted = dryRun ? 0 : 0;
    if (dryRun) summary.wouldDelete = deletable.length;
    return summary;
  }

  // Deleting the auth user cascades to manishapay_developers (FK on id) and
  // everything below it. Done one at a time so a single failure doesn't abort
  // the batch and leave a half-swept state.
  for (const id of deletable) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(id);
    if (delErr) {
      logger.warn({ err: delErr.message, developerId: id }, 'sweepAnonymous: delete failed');
      continue;
    }
    summary.deleted += 1;
  }

  logger.info(summary, 'sweepAnonymous complete');
  return summary;
}

module.exports = { sweepAnonymous, DEFAULT_AGE_DAYS };
