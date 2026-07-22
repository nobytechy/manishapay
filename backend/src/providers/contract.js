/**
 * PaymentProvider — the contract every payment gateway implements.
 *
 * This is the linchpin of ManishaPay's orchestration architecture: the word
 * "gateway" exists ONLY inside backend/src/providers/. Routes, SDKs, the web
 * dashboard, payment links, plugins and docs all speak the normalized shapes
 * defined here — never a specific gateway's API.
 *
 * Adding a gateway = copy providers/_template, implement the methods below,
 * add one line to providers/index.js, add a catalog entry. Nothing else changes.
 *
 * @see docs/PROVIDER-ARCHITECTURE.md
 */
'use strict';

/**
 * The five canonical statuses every provider must map its raw statuses into.
 * This single enum is what lets one API, one webhook shape and one doc cover
 * every gateway.
 * @typedef {'paid'|'pending'|'failed'|'disputed'|'refunded'} CanonicalStatus
 */
const CANONICAL_STATUSES = Object.freeze(['paid', 'pending', 'failed', 'disputed', 'refunded']);

/**
 * @typedef {Object} Capabilities
 * @property {boolean} redirect    - returns a hosted checkout URL (PayNow web, Stripe, PayFast)
 * @property {boolean} poll        - status is fetched by polling a URL (PayNow, Pesepay)
 * @property {boolean} webhook     - gateway pushes async callbacks
 * @property {boolean} mobilePush  - can push an OTP/USSD/STK prompt to a phone (PayNow Express, M-Pesa)
 * @property {boolean} refund      - supports programmatic refunds (Stripe yes; PayNow no)
 * @property {boolean} recurring   - native tokenised recurring (Stripe yes; PayNow no)
 * @property {string[]} methods    - rails this gateway unlocks, e.g. ['ecocash','onemoney','card']
 */

/**
 * A single credential field the Connect App renders. The dashboard form and
 * backend validation are BOTH driven by this — a new gateway ships its own form.
 * @typedef {Object} CredentialField
 * @property {string}  key       - stored key, e.g. 'integrationId'
 * @property {string}  label     - human label, e.g. 'Integration ID'
 * @property {'text'|'password'} type
 * @property {boolean} required
 * @property {string=} help      - where the merchant finds this value (onboarding UX)
 */

/**
 * The provider-neutral result of initiating a payment. Routes persist this
 * verbatim into manishapay_transactions and echo it (via the {data:...}
 * envelope) to every surface.
 * @typedef {Object} InitiateResult
 * @property {string}  providerRef    - the gateway's own id for this txn (PayNow: the tracker)
 * @property {string=} checkoutUrl    - hosted checkout / redirect URL
 * @property {string=} pollUrl        - present when capabilities.poll
 * @property {string}  rawStatus      - the gateway's own status string (stored for debugging)
 * @property {CanonicalStatus} status - normalized status
 * @property {'simulated'|'test'|'live'} mode
 * @property {string=} instructions
 * @property {Object=} raw            - full gateway payload (logs/debug)
 */

/**
 * @typedef {Object} PaymentProvider
 * @property {string} id                     - stable slug: 'paynow' | 'stripe' | ...
 * @property {string} displayName
 * @property {Capabilities} capabilities
 * @property {CredentialField[]} credentialSchema
 * @property {(input: Object, ctx: Object) => Promise<InitiateResult>} initiate
 * @property {(ref: string, creds: Object) => Promise<Object>} pollStatus
 * @property {(raw: string) => CanonicalStatus} normalizeStatus
 * @property {(payload, headers, creds) => Object} [verifyWebhook]  - optional (impl'd when wiring webhooks)
 * @property {(input, ctx) => Promise<Object>} [refund]             - optional
 */

/** Methods a live provider MUST implement to be routable. */
const REQUIRED_METHODS = Object.freeze(['initiate', 'pollStatus', 'normalizeStatus']);

/**
 * Validates that a module satisfies the contract. Called by the registry at
 * load time so a malformed provider fails fast and loudly, not mid-payment.
 * `planned` providers (no working initiate yet) are allowed to skip the method
 * check — they only need metadata to appear in the catalog/Connect UI.
 *
 * @param {PaymentProvider} p
 * @param {{ requireMethods?: boolean }} [opts]
 */
function assertProvider(p, opts = {}) {
  const requireMethods = opts.requireMethods !== false;
  if (!p || typeof p !== 'object') throw new Error('provider must be an object');
  if (!p.id || typeof p.id !== 'string') throw new Error('provider.id (string) is required');
  if (!p.displayName) throw new Error(`provider '${p.id}': displayName is required`);
  if (!p.capabilities || !Array.isArray(p.capabilities.methods)) {
    throw new Error(`provider '${p.id}': capabilities.methods[] is required`);
  }
  if (!Array.isArray(p.credentialSchema)) {
    throw new Error(`provider '${p.id}': credentialSchema[] is required`);
  }
  if (requireMethods) {
    for (const m of REQUIRED_METHODS) {
      if (typeof p[m] !== 'function') {
        throw new Error(`provider '${p.id}': missing required method '${m}()'`);
      }
    }
  }
  return p;
}

module.exports = { CANONICAL_STATUSES, REQUIRED_METHODS, assertProvider };
