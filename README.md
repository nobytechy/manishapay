# ManishaPay

[![Status](https://img.shields.io/badge/status-beta-10b981)]()
[![License](https://img.shields.io/badge/license-MIT-1e293b)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18-emerald)]()
[![PHP](https://img.shields.io/badge/php-%3E%3D7.4-amber)]()

> **One payments API for many gateways.** Integrate once with ManishaPay and accept
> payments across **PayNow, Stripe, Paystack, Flutterwave, PayPal, M-Pesa (Daraja),
> PayFast** and more — one clean REST API and one response shape, whichever gateway
> moves the money. ManishaPay handles auth, signatures, retries, amount/phone
> normalization, webhook verification and a zero-setup sandbox — so you ship payment
> flows in an afternoon instead of a week. Pick the gateway with a `provider` field;
> your code never changes when you switch.

**Live:** [manishapay.netlify.app](https://manishapay.netlify.app) ·
**Author:** [Noby Tebulo](https://noby.aizim.co.zw)

📚 **Companion docs:**
- [`HANDOFF.md`](HANDOFF.md) — first-time deploy runbook (the 4 things only you can do)
- [`OPERATIONS.md`](OPERATIONS.md) — day-to-day operator manual (managing devs, transactions, billing, master-key rotation, support playbook)
- [`docs/API.md`](docs/API.md) · [`docs/ERRORS.md`](docs/ERRORS.md) · [`docs/INTEGRATION.md`](docs/INTEGRATION.md) — public API reference

---

## What you get

**One integration, many gateways** — a single API over PayNow, Stripe, Paystack,
Flutterwave, PayPal, M-Pesa and PayFast (with Yoco, Pesepay, Ozow and DPO Pay coming
soon), normalized to one request + response shape and one 5-value status enum
(`paid | pending | failed | disputed | refunded`).

**One checkout, any method** — hosted payment links let the customer pick a method
(EcoCash, Card, …) and ManishaPay routes each to whichever gateway you've connected
that serves it. Share `/pay/<slug>`, or build your own UI over the public
`GET /v1/links/<slug>` + `POST /v1/links/<slug>/pay` endpoints.

Its Zimbabwe strength is **PayNow**, where it also fixes the integration pain that
fills the PayNow forums:

| Pain point on PayNow direct | ManishaPay fix |
|---|---|
| `HashMismatchException` (SHA-512 field-order is non-obvious) | Server-side compute + verify, byte-for-byte matches PayNow's docs example |
| C# `FormatException` on `'2.00'` decimals | Amount normalizer accepts any locale (`'2,50'`, `'2.50'`, `2.5`) |
| Express checkout silently skips OTP without `2637…` phone | Phone normalizer accepts any format and outputs MSISDN |
| "Where does the webhook URL go?" | Configure once per project; we sign + retry deliveries |
| Test vs live key mixups | `mp_test_*` / `mp_live_*` prefixes; mode is enforced server-side |
| 30-minute setup just to test | **Simulated mode** — sign up, get a test key, hit the API, no PayNow account required |

## Stack

- **Backend** — Node 20 + Express + Zod + Pino + libsodium-wrappers, hosted on **Render** (`manishapay-api-1ndn.onrender.com`) and reached at `manishapay.netlify.app/api` (Netlify proxies `/api` to Render)
- **Frontend** — React 18 + Vite + Tailwind 3, static SPA on **Netlify** at `manishapay.netlify.app`
- **Database** — Supabase Postgres (ManishaPay's own dedicated project; tables prefixed `manishapay_`)
- **Auth** — Supabase Auth (signup gated by `app=manishapay` user-metadata marker)
- **Encryption** — libsodium envelope encryption for merchant gateway credentials at rest

## Repo layout

```
manisha/
├── backend/                Express API (manishapay.netlify.app/api)
│   ├── src/
│   │   ├── middleware/    auth (API key) + jwtAuth (Supabase JWT)
│   │   ├── routes/        pay, webhooks, simulator, projects, keys, credentials, tools
│   │   └── services/      paynow, hash, crypto (envelope), credentials, retry, logger
│   ├── scripts/
│   │   └── seed-credentials.js   CLI to add a project's PayNow creds without the dashboard
│   └── tests/             187 unit tests (hash, crypto, paynow normalizers)
│
├── frontend/               Vite + React SPA (manishapay.netlify.app)
│   ├── public/            logo.svg, checkout.js (drop-in widget), .htaccess
│   └── src/pages/{developer,admin}/   dashboard pages
│
├── sdks/
│   ├── nodejs/            `manishapay` npm package — Node 18+ client + webhook verify
│   └── php/               `manishapay/manishapay` Composer package — PHP 7.4+ client
│
├── supabase/
│   ├── install.sql        base schema (apply once via Supabase Studio → SQL editor)
│   ├── setup.sql          multi-gateway add-ons (provider column + gateway_credentials) — run after install.sql
│   └── reset.sql          destructive clean-slate wipe (manishapay_* only)
│
├── docs/                   API.md, ERRORS.md, INTEGRATION.md
├── examples/               6-language quick-start scripts
├── wordpress-plugin/       WooCommerce gateway shim
└── HANDOFF.md             ← read this first if you're picking up where we left off
```

## Quick start (developer's perspective)

```bash
# 1. Sign up at https://manishapay.netlify.app
# 2. Generate a test API key (Dashboard → API Keys → Create)
# 3. Try the simulated flow — no PayNow account needed

curl -X POST https://manishapay.netlify.app/api/v1/pay \
  -H "Authorization: Bearer mp_test_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"reference":"order-1","amount":"5.00"}'

# Response: { "data": { "tracker": "mp_a1b2…",
#                       "browser_url": "https://manishapay.netlify.app/simulator/mp_a1b2…",
#                       "mode": "simulated", … } }
#
# Open browser_url, click "Mark as Paid" → a signed webhook fires to your
# configured endpoint within seconds.
```

When you're ready for real PayNow:

```text
Dashboard → PayNow Credentials → Add for your project (test or live mode)
```

The same `mp_test_*` key now hits real PayNow with your test integration. Switch to `mp_live_*` for production.

## Local development

Local dev runs on two ports — neither conflicts with XAMPP's Apache (80) or
MySQL (3306), so you can keep aizim running alongside.

### Local URLs

| Service | URL | What runs |
|---|---|---|
| **Frontend SPA** | `http://localhost:5173` | Vite dev server — hot reload, source maps |
| **Backend API** | `http://localhost:8787` | Express + the simulator HTML page |
| **Simulator** | `http://localhost:8787/simulator/<tracker>` | Backend serves the page; click Paid/Cancelled/Timeout to fire webhooks |
| **Drop-in widget** | `http://localhost:5173/checkout.js` | Same file as production |
| **Health check** | `http://localhost:8787/health` | `{ ok: true, configured: true }` |

### Setup (one-time)

```bash
# 0. Apply the schema on your Supabase project (once):
#    Open Supabase Studio → SQL Editor → paste supabase/install.sql → Run,
#    then paste supabase/setup.sql → Run (adds provider column + gateway_credentials)

# 1. Backend
cd backend
cp .env.example .env.local
# Fill in: SUPABASE_URL, SUPABASE_SERVICE_ROLE, SUPABASE_ANON_KEY, JWT_SECRET,
# PAYNOW_RETURN_URL, PAYNOW_RESULT_URL, MANISHAPAY_MASTER_KEY (= openssl rand -hex 32),
# SIMULATOR_BASE_URL=http://localhost:8787,
# ALLOW_CORS_ORIGINS=http://localhost:5173
npm install
npm test              # 187 tests should pass

# 2. Frontend
cd ../frontend
cp .env.example .env
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON=eyJ...
# VITE_API_BASE=http://localhost:8787
npm install
```

### Daily start (two terminals)

```bash
# Terminal 1 — backend (auto-restarts on save)
cd backend && npm run dev

# Terminal 2 — frontend (hot module reload)
cd frontend && npm run dev
```

Then open http://localhost:5173 — sign up, get a test key, hit the API
either via the dashboard's tools page or curl:

```bash
curl -X POST http://localhost:8787/v1/pay \
  -H "Authorization: Bearer mp_test_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"reference":"local-1","amount":"5.00"}'
```

### What works on bad internet

| Action | Needs internet? |
|---|---|
| Frontend code editing + hot reload | ❌ no — Vite is fully local once `npm install`ed |
| Backend code editing + nodemon restart | ❌ no — same |
| `npm test` (the 187 unit tests) | ❌ no — hash, crypto, normalizers all offline |
| Sign up / log in | ✅ yes — Supabase Auth is cloud-only |
| Simulated `POST /v1/pay` | ⚠️ tiny burst — one Supabase round-trip per call (~10 KB) |
| Click outcome on simulator → fire webhook | ⚠️ depends — if your webhook endpoint is also localhost, fully offline |
| Real PayNow test/live transaction | ✅ yes — has to reach paynow.co.zw |

**Bottom line:** if you can sign in once at the start of the day, the
session cookie auto-refreshes hourly and you can dev through brief
connectivity gaps. Simulated mode + tests + UI work give you ~80% of
the dev loop offline.

### Tunneling localhost for real PayNow webhooks

PayNow can't POST to `localhost:8787`. To test the real PayNow → your
laptop webhook path:

```bash
# Option A: Cloudflare Tunnel (no signup, fastest)
cloudflared tunnel --url http://localhost:8787

# Option B: ngrok
ngrok http 8787
```

Either gives you a public `https://xxx.trycloudflare.com` URL. Set it as
your `PAYNOW_RESULT_URL` (env) and the project's `result_url` (dashboard).
Real PayNow callbacks now reach your laptop.

For simulated mode you don't need any of this — both the simulator and
webhook delivery run on localhost.

## Architecture: where the money flows

```
   Customer                                            Merchant's PayNow wallet
       │                                                          ▲
       │ pays                                                     │ settles directly
       ▼                                                          │
  PayNow checkout ◄─────────────────────────────────────────  PayNow gateway
       │                                                          ▲
       │ initiates                                                │
       ▼                                                          │
   Browser ─→ Merchant's site                                     │
                  │                                               │
                  │ POST /api/v1/pay                              │
                  ▼                                               │
              ManishaPay  ──── decrypts merchant's PayNow creds ──┘
                  ▲
                  │ signed webhook (X-ManishaPay-Signature)
                  ▼
              Merchant's webhook URL
```

Money never touches ManishaPay. We're a developer-tools company that bills monthly per successful transaction; we're not a regulated payment processor.

## Pricing (planned)

- **Free tier**: first 50 successful transactions per month
- **Beyond free tier**: $0.05 per successful transaction
- Configurable per-developer in the admin dashboard

## License

MIT © [Noby Tebulo](https://noby.aizim.co.zw)
