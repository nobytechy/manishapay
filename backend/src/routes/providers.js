/**
 * /v1/providers — the public gateway catalog.
 *
 * Provider-agnostic and unauthenticated: the Connect App renders its gateway
 * menu + credential forms from here, the docs generate the methods matrix from
 * here, and SDKs/plugins can discover what's available. Nothing secret is
 * exposed — only public metadata (never a merchant's stored credentials).
 */
'use strict';

const router = require('express').Router();
const { listCatalog, methodMatrix } = require('../providers');

// GET /v1/providers → [{ id, displayName, status, region, capabilities, credentialSchema, ... }]
router.get('/', (req, res) => {
  res.json({ data: listCatalog(), requestId: req.id });
});

// GET /v1/providers/matrix → methods × providers grid (drives the docs table)
router.get('/matrix', (req, res) => {
  res.json({ data: methodMatrix(), requestId: req.id });
});

module.exports = router;
