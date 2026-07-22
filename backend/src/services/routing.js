/**
 * Hosted-checkout routing — "one checkout, customer picks a method, we route".
 *
 * A hosted checkout (payment link) exposes a set of payment METHODS (ecocash,
 * card, mobile_money…). Each method rides on a GATEWAY (provider). When the
 * customer picks a method, this service decides WHICH connected gateway
 * fulfils it — the piece that turns ManishaPay from one-gateway-per-link into
 * a true "pick any method" checkout.
 *
 * The DB-touching part (which gateways does this project have credentials for?)
 * is isolated in connectedProviders(); the routing decision itself
 * (pickProvider / computeMethods) is PURE and unit-tested without a database.
 *
 * ── Precedence, when several connected gateways serve the same method ────────
 *   1. an explicit per-checkout override  (method_routing[method] = providerId)
 *   2. the checkout's PRIMARY provider     (link.provider — the merchant's pick)
 *   3. the first connected gateway in CATALOG ORDER (curated local-first)
 * This is deterministic and merchant-overridable — never a surprise gateway.
 */
'use strict';

const catalog = require('../providers/catalog');
const { liveIds } = require('../providers');
const { supabase } = require('../config/supabase');
const env = require('../config/env');
const credentials = require('./credentials');

/**
 * Choose the gateway that fulfils `method` for a checkout, given the map of
 * gateways this project can actually transact with. PURE — no I/O.
 *
 * @param {string} method
 * @param {Record<string,'test'|'live'>} connected  providerId → usable mode
 * @param {{ routing?: Record<string,string>, primaryProvider?: string }} [opts]
 * @returns {{ provider: string, mode: 'test'|'live' } | null}
 */
function pickProvider(method, connected, opts = {}) {
  const { routing = {}, primaryProvider = 'paynow' } = opts;

  // 1. explicit merchant override for this method
  const forced = routing && routing[method];
  if (forced && connected[forced] && catalog.providerServes(forced, method)) {
    return { provider: forced, mode: connected[forced] };
  }

  // 2. the checkout's primary provider, if it serves the method
  if (primaryProvider && connected[primaryProvider] && catalog.providerServes(primaryProvider, method)) {
    return { provider: primaryProvider, mode: connected[primaryProvider] };
  }

  // 3. first connected gateway in catalog order (curated, local-first)
  for (const c of catalog.all()) {
    if (connected[c.id] && c.capabilities.methods.includes(method)) {
      return { provider: c.id, mode: connected[c.id] };
    }
  }
  return null;
}

/**
 * Build the chooser the customer sees: every offered method that has a
 * connected gateway to fulfil it, with presentation metadata and the resolved
 * route. PURE — no I/O.
 *
 * If the checkout declares no `enabledMethods`, the offered set defaults to the
 * PRIMARY provider's own methods — so even a legacy single-gateway link gains a
 * proper method chooser (e.g. a PayNow link now shows EcoCash / OneMoney /
 * InnBucks / Card) instead of a bare "Pay" button.
 *
 * @param {Record<string,'test'|'live'>} connected
 * @param {{ enabledMethods?: string[], routing?: Record<string,string>, primaryProvider?: string }} opts
 * @returns {Array<{ method:string, label:string, needsPhone:boolean, kind:string, provider:string, mode:'test'|'live' }>}
 */
function computeMethods(connected, opts = {}) {
  const { primaryProvider = 'paynow' } = opts;
  const declared = Array.isArray(opts.enabledMethods) && opts.enabledMethods.length
    ? opts.enabledMethods
    : (catalog.get(primaryProvider)?.capabilities.methods || []);

  const out = [];
  const seen = new Set();
  for (const method of declared) {
    if (seen.has(method)) continue;
    seen.add(method);
    const route = pickProvider(method, connected, opts);
    if (!route) continue; // no connected gateway can fulfil it → hide it
    const meta = catalog.methodMeta(method);
    out.push({ method, label: meta.label, needsPhone: meta.needsPhone, kind: meta.kind, ...route });
  }
  return out;
}

/**
 * Which gateways can this project actually transact with right now, and in
 * which mode? live credentials win over test; a gateway with only test creds
 * (or the platform shared-sandbox keys) is usable in test. Two queries + the
 * env sandbox scan — cheap enough for a checkout page load.
 *
 * @param {string} projectId
 * @returns {Promise<Record<string,'test'|'live'>>}  providerId → usable mode
 */
async function connectedProviders(projectId) {
  const map = {};
  const setBest = (id, mode) => {
    if (mode === 'live') map[id] = 'live';
    else if (!map[id]) map[id] = 'test';
  };

  // Generic gateway credentials (stripe, paystack, flutterwave, …)
  const { data: gwRows } = await supabase
    .from('manishapay_gateway_credentials')
    .select('provider, mode')
    .eq('project_id', projectId)
    .eq('status', 'active');
  for (const r of gwRows || []) setBest(r.provider, r.mode);

  // PayNow lives in its own table
  const { data: pnRows } = await supabase
    .from('manishapay_paynow_credentials')
    .select('mode')
    .eq('project_id', projectId)
    .eq('status', 'active');
  for (const r of pnRows || []) setBest('paynow', r.mode);

  // Shared-sandbox fallback (test only): a gateway the platform has sandbox keys
  // for is payable with zero merchant setup — the same zero-friction demo path
  // PayNow already has. Never overrides a real live/test credential above.
  for (const id of liveIds()) {
    if (map[id]) continue;
    if (id === 'paynow') {
      if (env.PAYNOW_TEST_INTEGRATION_ID && env.PAYNOW_TEST_INTEGRATION_KEY) map[id] = 'test';
    } else if (credentials.sandboxFromEnv(id)) {
      map[id] = 'test';
    }
  }
  return map;
}

/**
 * The public chooser for a checkout: resolve connected gateways, then the
 * offered methods. Used by GET /v1/links/:slug.
 */
async function availableMethods(projectId, opts = {}) {
  const connected = await connectedProviders(projectId);
  return computeMethods(connected, opts);
}

/**
 * Resolve the single gateway that will process a chosen method for a checkout.
 * Used by POST /v1/links/:slug/pay. Returns null when nothing connected serves
 * the method (caller returns a clean 400).
 */
async function resolveRoute(projectId, method, opts = {}) {
  const connected = await connectedProviders(projectId);
  return pickProvider(method, connected, opts);
}

module.exports = {
  pickProvider,
  computeMethods,
  connectedProviders,
  availableMethods,
  resolveRoute,
};
