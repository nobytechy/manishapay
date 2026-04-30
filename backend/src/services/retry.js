/**
 * Retry-with-backoff helper.
 *
 * Used by the PayNow client to absorb the transient `Connection reset
 * (os error 104)` failures that show up in the forum issues. The default
 * is 3 attempts with delays of 250ms, 750ms, 2250ms (jittered).
 *
 * Only retry for clearly-transient conditions — never retry on a 4xx,
 * because PayNow has already decided the request was malformed.
 */
'use strict';

const { setTimeout: sleep } = require('node:timers/promises');
const env = require('../config/env');
const { logger } = require('./logger');

const TRANSIENT_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN']);

function isRetryable(err) {
  if (!err) return false;
  if (TRANSIENT_CODES.has(err.code)) return true;
  if (err.response && err.response.status >= 500) return true;
  return false;
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {object} [opts]
 * @param {number} [opts.attempts]
 * @param {number} [opts.baseDelay]
 * @param {string} [opts.label]
 * @returns {Promise<T>}
 */
async function withRetry(fn, opts = {}) {
  const attempts = opts.attempts || env.MAX_RETRY_ATTEMPTS;
  const baseDelay = opts.baseDelay || 250;
  const label = opts.label || 'op';

  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts || !isRetryable(err)) throw err;
      // Exponential backoff with jitter (avoids retry storms hitting PayNow at once).
      const delay = Math.round(baseDelay * Math.pow(3, i - 1) * (0.7 + Math.random() * 0.6));
      logger.warn({ label, attempt: i, delay, code: err.code }, 'retrying after transient failure');
      await sleep(delay);
    }
  }
  throw lastErr;
}

module.exports = { withRetry, isRetryable };
