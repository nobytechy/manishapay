/**
 * ── ADD A GATEWAY IN 5 STEPS ────────────────────────────────────────────────
 *
 * 1. Copy this folder to  providers/<your-gateway-id>/
 * 2. Add a catalog entry for <your-gateway-id> in providers/catalog.js
 *    (displayName, region, currencies, capabilities.methods, credentialSchema).
 * 3. Implement initiate() + pollStatus() (or verifyWebhook, if the gateway is
 *    webhook-only and doesn't support polling — see capabilities.poll).
 * 4. Implement normalizeStatus() — map the gateway's raw statuses to one of the
 *    5 canonical values: paid | pending | failed | disputed | refunded.
 * 5. Register it in providers/index.js:  <id>: require('./<id>')
 *
 * That's it. No route, DB, SDK, docs, or dashboard change — every surface picks
 * it up from the catalog + registry automatically.
 *
 * @see docs/PROVIDER-ARCHITECTURE.md  §Add a gateway
 */
'use strict';

const { get } = require('../catalog');

const GATEWAY_ID = 'template'; // ← change to your gateway id
const meta = get(GATEWAY_ID) || { displayName: 'Template', capabilities: { methods: [] }, credentialSchema: [] };

/** @type {import('../contract').PaymentProvider} */
module.exports = {
  id: GATEWAY_ID,
  displayName: meta.displayName,
  capabilities: meta.capabilities,
  credentialSchema: meta.credentialSchema,

  /**
   * Start a payment. Talk to the gateway with ctx.creds (the merchant's own
   * credentials, already decrypted), then return the NEUTRAL shape below.
   *
   * @param {Object} input - { reference, amount, currency, method?, email?, phone?, return_url?, result_url? }
   * @param {Object} ctx   - { mode: 'test'|'live', creds, project }
   * @returns {Promise<import('../contract').InitiateResult>}
   */
  async initiate(/* input, ctx */) {
    throw new Error(`provider '${GATEWAY_ID}': initiate() not implemented yet`);
    // return {
    //   providerRef: gatewayTxnId,
    //   checkoutUrl: hostedCheckoutOrRedirectUrl, // if capabilities.redirect
    //   pollUrl: statusUrl,                        // if capabilities.poll
    //   rawStatus: gatewayStatus,
    //   status: this.normalizeStatus(gatewayStatus),
    //   mode: ctx.mode,
    //   raw: fullGatewayResponse,
    // };
  },

  /**
   * Fetch the latest status. Only needed if capabilities.poll is true; for
   * webhook-only gateways, implement verifyWebhook() instead and leave this
   * as a no-op that returns the last-known status.
   */
  async pollStatus(/* ref, creds */) {
    throw new Error(`provider '${GATEWAY_ID}': pollStatus() not implemented yet`);
  },

  /**
   * Map the gateway's raw status string → one canonical value.
   * @param {string} raw
   * @returns {import('../contract').CanonicalStatus}
   */
  normalizeStatus(/* raw */) {
    return 'pending';
  },

  // Optional — implement only if the gateway pushes signed webhooks:
  // verifyWebhook(payload, headers, creds) { ... return { valid, event }; },
  // Optional — implement only if capabilities.refund:
  // async refund(input, ctx) { ... },
};
