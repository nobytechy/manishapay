# ManishaPay

[![Status](https://img.shields.io/badge/status-beta-10b981)]()
[![License](https://img.shields.io/badge/license-MIT-1e293b)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18-emerald)]()
[![PHP](https://img.shields.io/badge/php-%3E%3D7.4-amber)]()

> Middleware for the **PayNow Zimbabwe** payment gateway. Your code talks to a
> clean REST API; ManishaPay handles hash math, retries, payload normalization,
> phone formatting, webhook signing, and mock testing — so you ship payment
> flows in an afternoon instead of a week.

**Live:** [pay.aizim.co.zw](https://pay.aizim.co.zw) ·
**Author:** [Noby Tebulo](https://noby.aizim.co.zw)

📚 **Companion docs:**
- [`HANDOFF.md`](HANDOFF.md) — first-time deploy runbook (the 4 things only you can do)
- [`OPERATIONS.md`](OPERATIONS.md) — day-to-day operator manual (managing devs, transactions, billing, master-key rotation, support playbook)
- [`docs/API.md`](docs/API.md) · [`docs/ERRORS.md`](docs/ERRORS.md) · [`docs/INTEGRATION.md`](docs/INTEGRATION.md) — public API reference

---

## What you get

| Pain point on PayNow direct | ManishaPay fix |
|---|---|
| `HashMismatchException` (SHA-512 field-order is non-obvious) | Server-side compute + verify, byte-for-byte matches PayNow's docs example |
| C# `FormatException` on `'2.00'` decimals | Amount normalizer accepts any locale (`'2,50'`, `'2.50'`, `2.5`) |
| Express checkout silently skips OTP without `2637…` phone | Phone normalizer accepts any format and outputs MSISDN |
| "Where does the webhook URL go?" | Configure once per project; we sign + retry deliveries |
| Test vs live key mixups | `mp_test_*` / `mp_live_*` prefixes; mode is enforced server-side |
| 30-minute setup just to test | **Simulated mode** — sign up, get a test key, hit the API, no PayNow account required |

## Stack

- **Backend** — Node 20 + Express + Zod + Pino + libsodium-wrappers, hosted as a cPanel Node.js app at `pay.aizim.co.zw/api`
- **Frontend** — React 18 + Vite + Tailwind 3, static SPA at `pay.aizim.co.zw`
- **Database** — Supabase Postgres (shared with sibling apps; tables prefixed `manishapay_`)
- **Auth** — Supabase Auth (signup gated by `app=manishapay` user-metadata marker)
- **Encryption** — libsodium envelope encryption for merchant PayNow credentials at rest

## Repo layout

```
manisha/
├── backend/                Express API (pay.aizim.co.zw/api)
│   ├── src/
│   │   ├── middleware/    auth (API key) + jwtAuth (Supabase JWT)
│   │   ├── routes/        pay, webhooks, simulator, projects, keys, credentials, tools
│   │   └── services/      paynow, hash, crypto (envelope), credentials, retry, logger
│   ├── scripts/
│   │   └── seed-credentials.js   CLI to add a project's PayNow creds without the dashboard
│   └── tests/             21 unit tests (hash, crypto, paynow normalizers)
│
├── frontend/               Vite + React SPA (pay.aizim.co.zw)
│   ├── public/            logo.svg, checkout.js (drop-in widget), .htaccess
│   └── src/pages/{developer,admin}/   dashboard pages
│
├── sdks/
│   ├── nodejs/            `manishapay` npm package — Node 18+ client + webhook verify
│   └── php/               `manishapay/manishapay` Composer package — PHP 7.4+ client
│
├── supabase/
│   └── install.sql        single-file schema (apply once via Supabase Studio → SQL editor)
│
├── docs/                   API.md, ERRORS.md, INTEGRATION.md
├── examples/               6-language quick-start scripts
├── wordpress-plugin/       WooCommerce gateway shim
└── HANDOFF.md             ← read this first if you're picking up where we left off
```

## Quick start (developer's perspective)

```bash
# 1. Sign up at https://pay.aizim.co.zw
# 2. Generate a test API key (Dashboard → API Keys → Create)
# 3. Try the simulated flow — no PayNow account needed

curl -X POST https://pay.aizim.co.zw/api/v1/pay \
  -H "Authorization: Bearer mp_test_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"reference":"order-1","amount":"5.00"}'

# Response: { "data": { "tracker": "mp_a1b2…",
#                       "browser_url": "https://pay.aizim.co.zw/simulator/mp_a1b2…",
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

```bash
# 0. Apply the schema on your Supabase project (once):
#    Open Supabase Studio → SQL Editor → paste supabase/install.sql → Run

# 1. Backend env
cd backend
cp .env.example .env.local
# Fill in: SUPABASE_URL, SUPABASE_SERVICE_ROLE, SUPABASE_ANON_KEY, JWT_SECRET,
# PAYNOW_RETURN_URL, PAYNOW_RESULT_URL, MANISHAPAY_MASTER_KEY (= openssl rand -hex 32)
npm install
npm test              # 21 tests should pass
npm run dev           # starts on :8787

# 2. Frontend env
cd ../frontend
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON, VITE_API_BASE
npm install
npm run dev           # starts on :5173
```

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
