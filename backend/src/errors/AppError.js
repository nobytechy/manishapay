/**
 * Structured error class — every error thrown inside the gateway should
 * be (or extend) AppError so the central handler can format it consistently.
 *
 * The shape we send to clients:
 *   { status, code, message, resolution, requestId }
 *
 * `resolution` is the field that makes ManishaPay distinctive — every error
 * comes with a copy-pasteable hint, taken from the real-world forum issues
 * we collected during the design phase.
 */
'use strict';

class AppError extends Error {
  /**
   * @param {object} opts
   * @param {number} opts.status      HTTP status (e.g. 400, 502)
   * @param {string} opts.code        Stable machine-readable code (e.g. 'HASH_MISMATCH')
   * @param {string} opts.message     Human-readable message
   * @param {string} [opts.resolution] What the developer should try next
   * @param {object} [opts.details]   Free-form payload (debug info, field map, etc.)
   * @param {Error}  [opts.cause]     Original error if this is a wrap
   */
  constructor({ status, code, message, resolution, details, cause }) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.resolution = resolution;
    this.details = details;
    if (cause) this.cause = cause;
  }

  toJSON() {
    return {
      status: this.status,
      code: this.code,
      message: this.message,
      resolution: this.resolution,
      details: this.details,
    };
  }
}

// ─── Common factory helpers ───────────────────────────────
AppError.badRequest = (msg, details) =>
  new AppError({ status: 400, code: 'BAD_REQUEST', message: msg, details });

AppError.unauthorized = (msg = 'Missing or invalid API key') =>
  new AppError({
    status: 401,
    code: 'UNAUTHORIZED',
    message: msg,
    resolution: 'Generate a new key in the dashboard → API Keys, then send it as `Authorization: Bearer <key>`.',
  });

AppError.forbidden = (msg = 'Forbidden') =>
  new AppError({ status: 403, code: 'FORBIDDEN', message: msg });

AppError.notFound = (resource = 'Resource') =>
  new AppError({ status: 404, code: 'NOT_FOUND', message: `${resource} not found` });

AppError.rateLimited = () =>
  new AppError({
    status: 429,
    code: 'RATE_LIMITED',
    message: 'Too many requests',
    resolution: 'Back off and retry — limit resets every 60 seconds. Upgrade your plan for higher limits.',
  });

AppError.upstream = (cause) =>
  new AppError({
    status: 502,
    code: 'UPSTREAM_FAILURE',
    message: 'PayNow upstream failed after retries',
    resolution: 'Check https://status.manishapay.dev — if PayNow is down, switch on MOCK_MODE while you wait.',
    cause,
  });

AppError.hashMismatch = (expected, actual) =>
  new AppError({
    status: 400,
    code: 'HASH_MISMATCH',
    message: 'Computed hash does not match the hash returned by PayNow',
    resolution:
      'This usually means a field is being stripped or re-ordered between you and PayNow. Use POST /v1/tools/hash to see the canonical concatenation.',
    details: { expected, actual },
  });

module.exports = AppError;
