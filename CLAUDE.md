# CLAUDE.md — working context for `manishapay`

Context for anyone picking this repo up cold. `README.md` explains the product;
`OPERATIONS.md` covers running it. This file covers *why things are the way they
are* and *what is unfinished*.

---

## Shape

- **Backend** — Node/Express on Render. Routers mounted in `src/app.js`. Supabase
  with `manishapay_`-prefixed tables. Uses the **service-role key**, so RLS is
  bypassed on every API route and ownership is enforced in handlers via
  `.eq('developer_id', req.developer.id)`. RLS still matters for the few direct
  client→Supabase queries.
- **Frontend** — React/Vite on Netlify. `/api/*` proxies to Render.
- **Positioning** — ManishaPay is a **payment gateway aggregator**, never
  "middleware". Merchants connect their own gateway accounts; funds are never
  held. That framing is load-bearing for merchant trust.

Tests: 234 backend (`npm test` in `backend/`), 9 frontend (`npx vitest run` in
`frontend/`). Both green.

---

## Recent work (Sept 2026) and the reasoning behind it

### Payment methods: three screens became one

Connecting a gateway used to live in three places that all asked for PayNow keys —
*Connect Your App* step 2, *Payment Gateways*, and *PayNow Credentials* — and the
Gateways page listed PayNow only to dead-end into a modal telling you to go
somewhere else.

Now: `/app/methods`, one wizard, one question per screen. PayNow is no longer
special-cased. `loadPaynow()` reads `manishapay_gateway_credentials` first and
falls back to the legacy `manishapay_credentials`, so every credential saved
before the change still works.

`requiredInTest` on a credential schema field means "mandatory in test mode only".
PayNow's `merchantEmail` uses it: optional on a live integration, but PayNow
rejects any authemail that isn't the registered one on a **test** integration.
Both the wizard and the API read the same flag.

### Anonymous sign-in

`supabase.auth.signInAnonymously()` puts a merchant in the dashboard in one tap.
Bootstrap creates the developer row with `status='anonymous'`, a null email, and
**a default project** — nothing worked before that, because every write path needs
a `project_id` and a brand-new account had none. Merchants were reaching the final
step of the wizard and getting a uuid validation error.

Linking an email or provider attaches the identity to the **same** `auth.users`
row, so the developer id never changes and nothing is migrated. The one way to
lose data is signing up fresh instead of linking — which is why an anonymous user
must never be shown a signup form.

Three things used to silently destroy these accounts and are now handled: idle
auto-logout (skipped for anonymous — for them it was deletion by walking away),
sign-out (now confirms and says what it ends), and a banner that never
auto-dismisses.

`assertPermanentAccount()` blocks live credentials and live API keys. Test mode is
wide open.

Migration `supabase/0002_anonymous_signin.sql` is **applied**. Supabase
*Anonymous sign-ins* and *Manual linking* are **enabled**.

### Performance

Everything shipped in one 805 KB bundle. Route-level splitting brought the entry
to ~149 KB gzip. Also: vendor chunks, non-blocking Google Fonts, build-time
preconnect (a Vite plugin, since the origins come from env), a `/health` warm-up
ping on window load so Render's cold start lands before the merchant needs it,
bootstrap retries across that cold start, and immutable cache headers.

`lazyRoute()` retries a failed chunk import once then reloads. Without it, a
browser holding a pre-deploy `index.html` requests a chunk that no longer exists
and renders a blank screen.

### Home, and the first sixty seconds

Traffic arrives from LinkedIn: a phone, mid-scroll, forty seconds of attention.
Landing leads with **See a payment work** → guest session → `/app`.

Home is state-aware. No method and no payments → the whole page is one button.
`FirstRun.jsx` calls `POST /v1/demo/payment`, which is pinned to the **simulated**
path deliberately: with platform sandbox keys configured, a normal test payment
hits PayNow's real test environment and cannot be completed from our side, so the
demo would hang forever.

`NextStep` shows one action at a time. It previously sat above a `GettingStarted`
checklist naming the same steps — Home told merchants what to do next twice. The
checklist is gone.

### Verification and cleanup

`POST /v1/demo/verify` — "Check it works" per connected method. Runs a real $1
**test** initiate and reports what the gateway said. Test-only via
`z.literal('test')`; verifying live would create a real pending charge. A gateway
rejection returns `200 ok:false`, not a 5xx — the check succeeded, the answer was
no. The response distinguishes `your-keys` from `platform-sandbox`, so a merchant
doesn't get a green tick that was really the shared sandbox answering.

`POST /v1/reconcile/anonymous` — sweeps abandoned guest accounts. Behind
`CRON_SECRET`, **dry-run by default**, `confirm:true` to delete. Never touches
non-anonymous accounts, guests with an active gateway credential, or guests with a
billable transaction (the demo payment is written `billable:false` precisely so
the two can be told apart).

---

## Pending

**Blocking everything else**

- [ ] **The payment flow has never been walked end to end on a real phone.** All
      of the above is verified only by tests and builds.

**Operational**

- [ ] Run the guest sweep dry (`/v1/reconcile/anonymous`, no body), read the
      numbers, then schedule the confirming version weekly. Written and deployed,
      never executed.
- [ ] Confirm which `*_TEST_*` / `*_SANDBOX_*` env vars are set on Render — they
      decide which gateways offer the no-keys fast path.
- [ ] Custom domain + branded email. Fixes OTP landing in spam, and is a
      prerequisite for passkeys (they bind to a hostname).

**Code**

- [ ] "Go live" says *go live* but not *what's missing* — the vaguest step in the
      funnel.
- [ ] Frontend tests cover only `ShareReceipt`. The payment-method wizard and
      `FirstRun` are the two paths everything now depends on and neither has one.
- [ ] Supabase is 57 KB gzip on the landing page where nobody needs it until
      sign-in. Deferring means lazy-loading `AuthProvider` — a real refactor.
- [ ] `public/marketing/` is ~6 MB of unreferenced flyers plus an mp4, shipped in
      every deploy.
- [ ] `/app/connect` overlaps Projects and API Keys enough that it's probably
      three pages doing one job.

**Decide with data, not instinct**

- [ ] Read umami before deleting anything. Fiscalisation, Subscriptions and
      Health are three full pages a first-time merchant will never open — but
      that's a guess, and the analytics are already installed.

---

## Related repos

- `manishapay-odoo` — Odoo 17 payment provider. Has its own `CLAUDE.md`.
  **The webhook signing scheme in `backend/src/services/webhookDelivery.js` is a
  contract with that module and nothing enforces it.** Changing the header name,
  the signed string format, or the payload shape breaks every Odoo merchant
  silently.
- `manishapay-php` — PHP SDK.
- `manishapay-dataset` — open knowledge base (CC BY), feeds ManishaAI's corpus.

**Next after Odoo:** a Java client plus `manishapay-spring-boot-starter`
(auto-configuration, `@ConfigurationProperties`, a webhook HMAC filter, an
Actuator health indicator). The starter is intended to be the real dependency of
a planned offline-first POS, not a throwaway learning exercise. Do **not** rewrite
this backend in Spring.

---

## Conventions

- Commit as `Noby Tebulo <nobytechy@gmail.com>`. **Never** commit as Claude and
  never add `Co-Authored-By` trailers — history was rewritten in Sept 2026 to
  remove all assistant attribution and this is presented publicly as a solo
  project.
- `frontend` needs `npm install --legacy-peer-deps`.
- Migrations are forward-only, numbered (`supabase/0002_…`), and `install.sql` is
  kept in sync so fresh installs match.
- **Never shallow-clone if history might be rewritten.** A `--depth 1` clone
  followed by a rewrite and force-push replaces the remote with a truncated
  history, and git gives no warning.
