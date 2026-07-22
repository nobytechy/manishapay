/**
 * PaynowProvider — the first (and, for launch, only) live PaymentProvider.
 *
 * This is a thin adapter over services/paynow.js. All the PayNow-specific logic
 * (hash compute/verify, decimal + phone normalization, Express-Checkout rules,
 * the forum-issue resolutions, retry/backoff) stays in the service, untouched.
 * This module only re-shapes the service's return values into the neutral
 * InitiateResult / status shapes the rest of the platform speaks.
 *
 * @see docs/PROVIDER-ARCHITECTURE.md
 */
'use strict';

const service = require('../../services/paynow');
const { get } = require('../catalog');

const meta = get('paynow');

/** @type {import('../contract').PaymentProvider} */
module.exports = {
  id: 'paynow',
  displayName: meta.displayName,
  capabilities: meta.capabilities,
  credentialSchema: meta.credentialSchema,

  /**
   * @param {Object} input - merchant request body
   * @param {Object} ctx   - { mode, creds, project }
   * @returns {Promise<import('../contract').InitiateResult>}
   */
  async initiate(input, ctx) {
    const r = await service.initiate(input, ctx);
    return {
      providerRef: r.tracker,
      checkoutUrl: r.browser_url,
      pollUrl: r.poll_url,
      rawStatus: r.status,
      status: service.normalizeStatus(r.status),
      mode: r.mode,
      instructions: r.instructions,
      raw: r,
    };
  },

  /**
   * @param {string} pollUrl
   * @param {Object} creds
   */
  async pollStatus(pollUrl, creds) {
    const r = await service.pollStatus(pollUrl, creds);
    return { ...r, rawStatus: r.status, status: service.normalizeStatus(r.status) };
  },

  normalizeStatus: service.normalizeStatus,

  // Convenience passthrough — callers that need PayNow's amount invariant.
  normalizeAmount: service.normalizeAmount,
};
