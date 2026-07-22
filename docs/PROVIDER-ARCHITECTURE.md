# ManishaPay — Provider Abstraction Design

> Goal: adding any future gateway (Pesepay, Stripe, Flutterwave, PayFast, Yoco, …)
> becomes **"implement one class + register it + add a credentials schema"** — with
> **zero changes to route code, the DB shape, the SDKs, or existing merchants.**
>
> Non-goal (for now): actually building those gateways. This design only makes them
> *cheap and safe to add later*. PayNow stays the one shipping implementation.

---

## 1. Why now, and why it's cheap

The current code is PayNow-coupled at the *naming* level, not the *structural* level.
The seam already exists:

| Provider-neutral thing that already exists | Where |
| --- | --- |
| `initiate(input, ctx)` returning `{ tracker, browser_url, poll_url, status, mode }` | `services/paynow.js` |
| `pollStatus(ref, creds)` | `services/paynow.js` |
| `normalizeStatus(raw)` → 5-value canonical enum (`paid/pending/failed/disputed/refunded`) | `services/paynow.js` |
| `status_normalized`, `poll_url`, `browser_url`, `mode`, `method` columns | `manishapay_transactions` |
| Per-merchant encrypted creds loaded at call time | `services/credentials.js` |

So this is a **rename + one indirection + one new column**, not a rewrite. All 187
backend tests must stay green through every phase.

---

## 2. The contract — `PaymentProvider`

Every provider is a module exporting this shape. Nothing outside `providers/`
may reference a specific gateway again.

```js
// backend/src/providers/contract.js  (JSDoc typedef — plain JS, no TS)
/**
 * @typedef {Object} PaymentProvider
 * @property {string}  id            - stable slug, e.g. 'paynow' | 'pesepay' | 'stripe'
 * @property {string}  displayName   - 'PayNow' — shown in dashboard connect UI
 * @property {Capabilities} capabilities
 * @property {CredentialField[]} credentialSchema - drives the dashboard connect form + validation
 *
 * @property {(input, ctx) => Promise<InitiateResult>} initiate
 * @property {(ref, creds) => Promise<PollResult>}      pollStatus
 * @property {(raw: string) => CanonicalStatus}         normalizeStatus
 * @property {(payload, headers, creds) => VerifyResult} verifyWebhook
 * @property {(input, ctx) => Promise<RefundResult>}    [refund]   - optional
 */

/**
 * @typedef {Object} Capabilities
 * @property {boolean} redirect     - returns a hosted checkout URL (PayNow web, Stripe, PayFast)
 * @property {boolean} poll         - status is fetched by polling (PayNow, Pesepay)
 * @property {boolean} webhook      - gateway pushes async callbacks (all)
 * @property {boolean} mobilePush   - can push an OTP/USSD prompt to a phone (PayNow Express, Pesepay)
 * @property {boolean} refund       - supports programmatic refunds (Stripe yes; PayNow no)
 * @property {boolean} recurring    - native tokenised recurring (Stripe yes; PayNow no)
 * @property {string[]} methods     - ['ecocash','onemoney','innbucks','zimswitch','vmc', ...]
 */

/**
 * @typedef {Object} InitiateResult   // provider-neutral; route persists this verbatim
 * @property {string}  providerRef    - the gateway's own id for this txn (was `tracker` for PayNow)
 * @property {string=} checkoutUrl    - hosted checkout / redirect (was `browser_url`)
 * @property {string=} pollUrl        - if capabilities.poll (was `poll_url`)
 * @property {string}  rawStatus      - gateway's own status string
 * @property {CanonicalStatus} status - normalized 5-value
 * @property {'simulated'|'test'|'live'} mode
 * @property {string=} instructions
 * @property {object}  raw            - full gateway payload, for logs/debugging
 */

/** @typedef {'paid'|'pending'|'failed'|'disputed'|'refunded'} CanonicalStatus */
```

**Why `capabilities`:** gateways drive differently. PayNow you *poll*; Stripe you
*wait for a webhook*; PayNow Express *pushes to a phone*. The orchestrator reads
capabilities to decide the flow instead of hardcoding PayNow's poll loop. The
transaction table already supports both (nullable `poll_url`), so no schema fight.

**Why `credentialSchema`:** the dashboard "Connect PayNow" form is currently
hardcoded to `integrationId` + `integrationKey`. Making each provider *declare*
its fields means the connect UI and backend validation become data-driven — a new
gateway ships its own form. PayNow declares `[integrationId, integrationKey, merchantEmail]`;
Stripe would declare `[secretKey, webhookSecret]`; etc.

---

## 3. The registry

```js
// backend/src/providers/index.js
const providers = {
  paynow: require('./paynow'),   // the only real one, for now
  // pesepay:  require('./pesepay'),
  // stripe:   require('./stripe'),
};

function getProvider(id = 'paynow') {
  const p = providers[id];
  if (!p) throw AppError.badRequest(`Unknown payment provider '${id}'`, {
    supported: Object.keys(providers),
  });
  return p;
}
module.exports = { getProvider, listProviders: () => Object.values(providers) };
```

Adding a gateway = drop a file in `providers/`, add one line here. **That is the
entire "how do I add a gateway" story.**

---

## 4. What `PaynowProvider` becomes

`services/paynow.js` → `providers/paynow/index.js`, wrapped to the contract.
The PayNow-specific internals (hash compute/verify, `buildInitiateBody`,
`assertRemoteFields`, `paynowResolution`, phone/amount normalization, the
forum-fix logic) stay **exactly as-is** — they just become private to the module.
Only the *shape* of what `initiate`/`pollStatus` return changes to `InitiateResult`
(`tracker`→`providerRef`, `browser_url`→`checkoutUrl`, `poll_url`→`pollUrl`).
Behavior identical; 187 tests stay green (tests updated only for the renamed fields).

`capabilities` for PayNow:
```js
{ redirect: true, poll: true, webhook: true, mobilePush: true,
  refund: false, recurring: false,
  methods: ['ecocash','onemoney','innbucks','omari','zimswitch','vmc'] }
```

---

## 5. How the routes change (minimal)

`routes/pay.js` today does `const result = await paynow.initiate(...)`. It becomes:

```js
const { getProvider } = require('../providers');
const provider = getProvider(req.body.provider || project.default_provider || 'paynow');
const result = await provider.initiate(parsed.data, { mode, creds, project });
// persist result.providerRef / result.checkoutUrl / result.pollUrl + a new `provider` column
```

Same for `GET /:reference/status` (poll path), `webhooks.js`, `reconcile.js`,
`subscriptions.js`. Each stops importing `paynow` directly and resolves the
provider from the transaction row's `provider` column.

---

## 6. Database changes (additive, non-breaking)

1. **`manishapay_transactions.provider text not null default 'paynow'`**
   — backfills every existing row to `paynow`. No data migration risk.

2. **Generalize credentials.** Today: `manishapay_paynow_credentials`.
   Add a generic table so any gateway stores creds the same way:
   ```sql
   create table if not exists public.manishapay_gateway_credentials (
     id uuid primary key default gen_random_uuid(),
     project_id uuid not null references manishapay_projects(id) on delete cascade,
     provider   text not null,                 -- 'paynow' | 'stripe' | ...
     mode       text not null,                 -- 'test' | 'live'
     config     jsonb not null,                -- ENCRYPTED per-field; shape per credentialSchema
     active     boolean not null default true,
     created_at timestamptz not null default now(),
     unique (project_id, provider, mode)
   );
   ```
   `services/credentials.js` gains a `loadActive(projectId, provider, mode)` that
   reads this table. **PayNow keeps working** during transition: `loadActive`
   falls back to `manishapay_paynow_credentials` when no generic row exists, then a
   one-off migration copies existing PayNow creds into the generic table. Old table
   dropped only after verification.

> Everything else ChatGPT's Task 4 lists (api_keys, webhooks, refunds, audit_logs,
> subscriptions, invoices, usage/billing) **already exists** — see the 19
> `manishapay_*` tables. No redesign needed there.

---

## 7. API response — backward-compatible, not ChatGPT's breaking shape

ChatGPT proposed a **flat** envelope: `{ success, provider, transaction_id, ... }`.
Your live SDKs (Node v1.0.0, PHP, WHMCS, Shopify guide) already consume
`{ data: { reference, tracker, browser_url, poll_url, status, mode, currency, qr_code }, requestId }`.
**Switching to the flat shape is a breaking change for every integrated merchant.**

Decision: **keep the `data` envelope, add fields.** New responses include
`data.provider` and `data.status_normalized`. Existing consumers ignore the new
fields; nothing breaks. If we ever want the flat shape, it ships as `/v2/` — never
by mutating `/v1/`.

**Trade-off flagged for approval:** cleaner spec vs. zero-breakage. I recommend
zero-breakage (additive) because you have live SDK consumers. Your call.

---

## 8. Phased rollout — each phase independently shippable, 187 tests green throughout

| Phase | Scope | Breaking? | Effort |
| --- | --- | --- | --- |
| **1** | Contract + registry + move PayNow behind it. No new gateway. No DB change yet (provider hardcoded 'paynow' in the one indirection). Routes call `getProvider('paynow')`. Tests renamed to new field shape. | No | **Medium** |
| **2** | Add `provider` column + `manishapay_gateway_credentials` + provider-aware `credentials.loadActive`. Backfill/migrate PayNow creds. Response gains `data.provider`. | No (additive) | **Medium** |
| **3** | Data-drive the dashboard "Connect gateway" UI from `credentialSchema`. Add `default_provider` to projects. | No | **Low–Med** |
| **4** | *(future, not now)* First real second gateway (recommend **Pesepay** — closest Zim peer to PayNow, same redirect+poll+mobile model → validates the abstraction with the least new surface). | No | **Med** per gateway |

**Recommendation:** do **Phase 1 now**, verify 187 green + app still initiates a
PayNow payment end-to-end, commit. Then Phase 2. Stop before Phase 4 until you
actually want a second gateway live — the point today is that Phase 4 is *ready*,
not *done*.

---

## 8b. Product model — decided

**Money model: Model A (Bring-Your-Own-Credentials).** Merchants use their own
gateway accounts; money flows directly merchant↔customer; ManishaPay orchestrates
and never holds funds. Model B (merchant-of-record aggregator) is a future,
licensed-only ambition — the abstraction stays clean enough to slot in a
ManishaPay-owned-account provider later without redesign.

**Connect App = per-gateway, not per-method.** In the Connect App / project setup,
the merchant **ticks each gateway they want** (PayNow, Stripe, Pesepay, Flutterwave, …)
and enters **that gateway's** credentials — a form rendered from the provider's
`credentialSchema`. One gateway connection unlocks *all* the methods that gateway
supports (one PayNow = ecocash/onemoney/innbucks/omari/zimswitch/card).

```
Connect App › Payment Gateways
 ☑ PayNow      → Integration ID + Key        ✓ connected
 ☑ Stripe      → Secret key + Webhook secret ✓ connected
 ☐ Pesepay     → (tick to connect)
```

Connect UX rules:
- **Lazy/demand-driven:** only prompt for a gateway's creds when a chosen method
  needs a gateway that isn't connected yet ("InnBucks needs PayNow — connect it").
  No gateway is ever forced; connect the minimum that covers selected methods.
- **Test with zero creds:** the existing simulated sandbox lets a dev click through
  the whole flow before supplying any real credentials.
- **Connect once, reuse:** store credentials at **account level, reusable by any
  project**, with an optional per-project override (today they're project-scoped;
  the generic `manishapay_gateway_credentials` table is where we make them
  account-level + overridable).

**Integration flow (developer code) stays one API regardless of gateways connected:**
either name a method (`method: "ecocash"` → routed to a connected gateway that serves
it) or use hosted checkout (`enabled_methods: [...]` → one `checkout_url`, customer
picks, ManishaPay routes).

## 9. Zimbabwe reality check (design constraint, not a task)

The client's list conflates two different layers:

- **Aggregator gateways** (peers of PayNow): PayNow, **Pesepay**. These are the
  things that get a `PaymentProvider` class.
- **Methods *under* an aggregator**: EcoCash, OneMoney, InnBucks, Zimswitch, Omari,
  Visa/Mastercard. In Zimbabwe these route **through** PayNow/Pesepay — they are
  `capabilities.methods` values, **not** separate providers.

So the abstraction is **two-level**: `provider` (who moves the money) × `method`
(which rail). Modeling EcoCash as a top-level provider would be an architectural
mistake baked in from ChatGPT's blind guess. This design avoids it: `method` already
lives on the transaction and on `capabilities.methods`.
</content>
</invoke>
