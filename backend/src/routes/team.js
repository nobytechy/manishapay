/**
 * /v1/team — flat-team management for the CURRENT account (workspace).
 *
 * Reads scope to req.developer.id (the resolved account). Mutations require the
 * 'team' capability — so the owner and admin teammates can invite/manage, while
 * members and viewers cannot. Roles: admin (full), member (build, no team/billing),
 * viewer (read-only).
 */
'use strict';

const router = require('express').Router();
const { z } = require('zod');
const { jwtAuthenticate, requireCapability } = require('../middleware/jwtAuth');
const { supabase } = require('../config/supabase');
const AppError = require('../errors/AppError');

router.use(jwtAuthenticate);

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('manishapay_team_members')
      .select('id, member_email, member_id, role, status, created_at')
      .eq('owner_id', req.developer.id)
      .neq('status', 'removed')
      .order('created_at', { ascending: false });
    if (error) throw new AppError({ status: 500, code: 'DB_ERROR', message: error.message });
    res.json({ data, meta: { your_role: req.developer.teamRole } });
  } catch (err) {
    next(err);
  }
});

const inviteSchema = z.object({
  member_email: z.string().email(),
  role: z.enum(['admin', 'member', 'viewer']).optional(),
});

router.post('/', requireCapability('team'), async (req, res, next) => {
  try {
    const p = inviteSchema.parse(req.body);
    const { data, error } = await supabase
      .from('manishapay_team_members')
      .upsert(
        { owner_id: req.developer.id, member_email: p.member_email.toLowerCase(), role: p.role || 'member', status: 'invited' },
        { onConflict: 'owner_id,member_email' },
      )
      .select('id, member_email, role, status, created_at')
      .single();
    if (error) throw new AppError({ status: 500, code: 'INVITE_FAILED', message: error.message });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireCapability('team'), async (req, res, next) => {
  try {
    const { role } = z.object({ role: z.enum(['admin', 'member', 'viewer']) }).parse(req.body);
    const { error } = await supabase
      .from('manishapay_team_members')
      .update({ role })
      .eq('id', req.params.id)
      .eq('owner_id', req.developer.id);
    if (error) throw new AppError({ status: 500, code: 'ROLE_UPDATE_FAILED', message: error.message });
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireCapability('team'), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('manishapay_team_members')
      .update({ status: 'removed' })
      .eq('id', req.params.id)
      .eq('owner_id', req.developer.id);
    if (error) throw new AppError({ status: 500, code: 'REMOVE_FAILED', message: error.message });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
