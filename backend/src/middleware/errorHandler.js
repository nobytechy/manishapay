/**
 * Central Express error handler.
 *
 * Every error eventually reaches this middleware. We:
 *   1. Normalize whatever was thrown into the AppError shape
 *   2. Log it with the request id so it's findable in cPanel logs
 *   3. Hide internal stack traces in production
 *   4. Always include `requestId` so a developer can quote it in support
 */
'use strict';

const AppError = require('../errors/AppError');
const env = require('../config/env');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, _next) {
  let appErr;

  if (err instanceof AppError) {
    appErr = err;
  } else if (err && err.status === 404) {
    appErr = new AppError({ status: 404, code: err.code || 'NOT_FOUND', message: err.message });
  } else if (err && err.type === 'entity.too.large') {
    appErr = new AppError({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds 256 KB',
      resolution: 'Send only the fields documented at /docs/api — large blobs belong on object storage, not in payment payloads.',
    });
  } else {
    appErr = new AppError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Unknown error',
      cause: err,
    });
  }

  // pino-http made req.log for us.
  if (req.log) {
    req.log.error({ err: appErr, requestId: req.id }, 'request failed');
  }

  res.status(appErr.status).json({
    error: {
      ...appErr.toJSON(),
      requestId: req.id,
    },
  });
};
