/**
 * Rate limiters.
 *
 * Two tiers — developer (default 100/min) and admin (default 1000/min).
 * The key derives from the bearer token if present, otherwise the IP,
 * so unauthenticated bursts can't exhaust someone else's budget.
 */
'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const AppError = require('../errors/AppError');

function makeLimiter(maxPerMinute) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: maxPerMinute,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator(req) {
      const auth = req.header('Authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
      return token || req.ip || 'anonymous';
    },
    handler(_req, _res, next) {
      next(AppError.rateLimited());
    },
  });
}

module.exports = {
  devRateLimiter: makeLimiter(env.RATE_LIMIT_DEV),
  adminRateLimiter: makeLimiter(env.RATE_LIMIT_ADMIN),
};
