/**
 * /v1/projects — JWT-authenticated CRUD for the developer's own projects.
 *
 * A "project" in ManishaPay maps 1:1 to a PayNow integration. Most devs
 * create a single project; some create one per environment (staging/prod)
 * or one per side-business. Each project has its own credentials, API keys,
 * webhook endpoints, and transaction history.
 */
'use strict';

const router = require('express').Router();
const { z } = require('zod');
const { jwtAuthenticate, requireCapability } = require('../middleware/jwtAuth');
const { supabase } = require('../config/supabase');
const AppError = require('../errors/AppError');

router.use(jwtAuthenticate);

const projectSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  return_url: z.string().url().optional().nullable(),
  result_url: z.string().url().optional().nullable(),
  default_mode: z.enum(['test', 'live']).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('manishapay_projects')
      .select('id, name, description, return_url, result_url, default_mode, created_at, updated_at')
      .eq('developer_id', req.developer.id)
      .order('created_at', { ascending: false });
    if (error) throw new AppError({ status: 500, code: 'LIST_FAILED', message: error.message });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireCapability('manage'), async (req, res, next) => {
  try {
    const parsed = projectSchema.parse(req.body);
    const { data, error } = await supabase
      .from('manishapay_projects')
      .insert({ ...parsed, developer_id: req.developer.id })
      .select('id, name, description, return_url, result_url, default_mode, created_at, updated_at')
      .single();
    if (error) throw new AppError({ status: 500, code: 'CREATE_FAILED', message: error.message });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireCapability('manage'), async (req, res, next) => {
  try {
    const parsed = projectSchema.partial().parse(req.body);
    const { data, error } = await supabase
      .from('manishapay_projects')
      .update(parsed)
      .eq('id', req.params.id)
      .eq('developer_id', req.developer.id)
      .select('id, name, description, return_url, result_url, default_mode, updated_at')
      .maybeSingle();
    if (error) throw new AppError({ status: 500, code: 'UPDATE_FAILED', message: error.message });
    if (!data) throw AppError.notFound('Project');
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireCapability('manage'), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('manishapay_projects')
      .delete()
      .eq('id', req.params.id)
      .eq('developer_id', req.developer.id);
    if (error) throw new AppError({ status: 500, code: 'DELETE_FAILED', message: error.message });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
