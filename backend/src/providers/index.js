/**
 * Provider registry — the one place that maps a gateway id to its
 * implementation. Routes call getProvider(id); they never require a gateway
 * module directly. Adding a gateway = one line here + a catalog entry.
 *
 * @see docs/PROVIDER-ARCHITECTURE.md
 */
'use strict';

const AppError = require('../errors/AppError');
const catalog = require('./catalog');
const { assertProvider } = require('./contract');

// ── Live provider implementations ──────────────────────────────────────────
// Only gateways with a working module go here. Everything else in the catalog
// is 'planned' and surfaces in the Connect UI / docs as "Coming soon".
const implementations = {
  paynow: require('./paynow'),
  pesepay: require('./pesepay'),
  flutterwave: require('./flutterwave'),
  paystack: require('./paystack'),
  stripe: require('./stripe'),
  paypal: require('./paypal'),
  payfast: require('./payfast'),
  yoco: require('./yoco'),
  ozow: require('./ozow'),
  mpesa: require('./mpesa'),
  dpo: require('./dpo'),
};

// Validate every registered provider at load time — fail fast, not mid-payment.
for (const impl of Object.values(implementations)) {
  assertProvider(impl, { requireMethods: true });
}

/** ids that actually move money today. */
function liveIds() {
  return Object.keys(implementations);
}

/**
 * Resolve a routable provider implementation.
 * @param {string} [id='paynow']
 * @returns {import('./contract').PaymentProvider}
 */
function getProvider(id = 'paynow') {
  const impl = implementations[id];
  if (impl) return impl;

  // Known-but-not-yet-built gateway → clear, honest error (not a 500).
  if (catalog.get(id)) {
    throw new AppError({
      status: 501,
      code: 'PROVIDER_NOT_YET_AVAILABLE',
      message: `The '${id}' gateway is on the ManishaPay roadmap but isn't live yet.`,
      resolution: `Use one of the live gateways for now: ${liveIds().join(', ')}.`,
    });
  }

  throw AppError.badRequest(`Unknown payment provider '${id}'`, {
    supported: liveIds(),
    roadmap: catalog.all().map((c) => c.id),
  });
}

/**
 * Catalog view for the Connect App / docs / SDKs. Merges each catalog entry
 * with its live/planned status. Provider-agnostic — every surface reads this.
 */
function listCatalog() {
  const live = new Set(liveIds());
  return catalog.all().map((c) => ({
    id: c.id,
    displayName: c.displayName,
    // Every gateway in the catalog is CODE-WIRED. `status` is a curation label:
    // 'coming_soon' for gateways whose credentials are hard to obtain (business
    // onboarding / KYC before any sandbox), 'live' for the rest. `implemented`
    // stays true either way — supplying a credential is the only step to use it.
    status: c.comingSoon ? 'coming_soon' : 'live',
    implemented: live.has(c.id),
    region: c.region,
    countries: c.countries,
    currencies: c.currencies,
    website: c.website,
    capabilities: c.capabilities,
    credentialSchema: c.credentialSchema,
  }));
}

module.exports = {
  getProvider,
  liveIds,
  listCatalog,
  methodMatrix: catalog.methodMatrix,
};
