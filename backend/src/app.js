/**
 * Express app factory.
 *
 * Wires middleware (security, logging, CORS, rate limiting), mounts routes,
 * and installs the central error handler. Exporting a factory (rather than
 * a singleton) keeps tests honest — every test gets a fresh app.
 */
'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const pinoHttp = require('pino-http');

const { logger } = require('./services/logger');
const requestId = require('./middleware/requestId');
const errorHandler = require('./middleware/errorHandler');
const { devRateLimiter } = require('./middleware/rateLimit');

const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const payRouter = require('./routes/pay');
const webhookRouter = require('./routes/webhooks');
const toolsRouter = require('./routes/tools');
const projectsRouter = require('./routes/projects');
const keysRouter = require('./routes/keys');
const credentialsRouter = require('./routes/credentials');
const simulatorRouter = require('./routes/simulator');
const reconcileRouter = require('./routes/reconcile');
const adminRouter = require('./routes/admin');
const transactionsRouter = require('./routes/transactions');
const paymentLinksRouter = require('./routes/paymentlinks');

function buildApp() {
  const app = express();

  // Trust the first proxy hop — required so rate limiters and req.ip work
  // correctly behind cPanel/Apache or any reverse proxy.
  app.set('trust proxy', 1);

  // ─── Security headers ──────────────────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false, // CSP is enforced by the static .htaccess in front of the SPA
    })
  );

  // ─── CORS ──────────────────────────────────────────────
  const allowed = (process.env.ALLOW_CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin(origin, cb) {
        // Allow same-origin / curl / mobile apps with no Origin header.
        if (!origin) return cb(null, true);
        if (allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
        return cb(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    })
  );

  // ─── Body parsing ──────────────────────────────────────
  // Webhooks need the raw body for signature validation, so we capture it
  // before JSON parsing turns it into an object.
  app.use(
    express.json({
      limit: '256kb',
      verify(req, _res, buf) {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  // ─── Cross-cutting concerns ────────────────────────────
  app.use(requestId);
  app.use(pinoHttp({ logger, customProps: (req) => ({ requestId: req.id }) }));
  app.use(compression());

  // ─── Public routes (no auth needed) ────────────────────
  app.use('/health', healthRouter);
  app.use('/v1/auth', authRouter);         // Bootstrap a developer profile from any Supabase session
  app.use('/v1/webhook', webhookRouter);   // PayNow → us, signature-validated inside the router
  app.use('/v1/reconcile', reconcileRouter); // Cron-secret-guarded missed-webhook sweep
  app.use('/simulator', simulatorRouter);  // Simulated checkout pages + outcome triggers

  // ─── Data-plane (API key auth) ─────────────────────────
  app.use('/v1/pay', devRateLimiter, payRouter);
  app.use('/v1/tools', devRateLimiter, toolsRouter);

  // ─── Management plane (Supabase JWT auth) ──────────────
  app.use('/v1/projects', projectsRouter);
  app.use('/v1/keys', keysRouter);
  app.use('/v1/credentials', credentialsRouter);
  app.use('/v1/admin', adminRouter);
  app.use('/v1/transactions', transactionsRouter);
  app.use('/v1/links', devRateLimiter, paymentLinksRouter);

  // 404 — explicit so the error handler can format it.
  app.use((req, _res, next) => {
    const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
    err.status = 404;
    err.code = 'ROUTE_NOT_FOUND';
    next(err);
  });

  app.use(errorHandler);

  return app;
}

module.exports = { buildApp };
