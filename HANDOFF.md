# ManishaPay — Handoff

This is the runbook for finishing what only you can finish. Everything else
is built. Should take **15–25 minutes** end to end.

## Status (as of this commit)

| Area | Done | What's left |
|---|---|---|
| Schema (`supabase/install.sql`) | ✅ written, namespaced, RLS, app marker | Apply once in Supabase Studio |
| Backend API (Node + Express) | ✅ 21 unit tests pass, all routes wired | Set env vars, install on cPanel as Node.js app |
| Encryption (libsodium envelope) | ✅ helper + tests | Generate `MANISHAPAY_MASTER_KEY` |
| Frontend (React + Vite) | ✅ built, deployed to `pay.aizim.co.zw/` | Set Supabase env vars + rebuild |
| SDKs | ✅ Node + PHP packages | Publish to npm/Packagist (optional) |
| Drop-in checkout.js | ✅ deployed at `/checkout.js` | — |
| Simulator | ✅ `/simulator/<tracker>` HTML + outcome trigger | needs API running to be reachable |
| Webhook signing + delivery | ✅ HMAC-SHA256, t-prefixed | Production retry queue (defer to v2) |
| Author attribution | ✅ Noby Tebulo, noby.aizim.co.zw | — |
| Live frontend at https://pay.aizim.co.zw | ✅ shipped | — |

---

## What only you can do

### 1. Apply the schema (5 min)

Open Supabase Studio (the one shared with chikoro/church) → SQL Editor → paste the contents of `supabase/install.sql` → **Run**.

It's idempotent (`create if not exists`) so re-running is safe. It adds 12 tables prefixed `manishapay_` plus three helper functions and a trigger that filters by `raw_user_meta_data.app = 'manishapay'` — chikoro/church flows are untouched.

After it runs, verify in Studio's Table Editor that you can see:
- `manishapay_developers`, `manishapay_projects`, `manishapay_api_keys`
- `manishapay_paynow_credentials`, `manishapay_transactions`, `manishapay_webhook_endpoints`, `manishapay_webhook_deliveries`
- `manishapay_usage_daily`, `manishapay_invoices`, `manishapay_logs`, `manishapay_button_configs`, `manishapay_announcements`

### 2. Generate the master encryption key (1 min)

```bash
cd backend
cp .env.example .env.local
echo "MANISHAPAY_MASTER_KEY=$(openssl rand -hex 32)" >> .env.local
```

⚠️ **Critical**: once any merchant has saved credentials in production, this key cannot be changed without re-encrypting every credential. Back up `.env.local` somewhere safe (1Password, etc.).

### 3. Fill in the rest of `backend/.env.local` (5 min)

```bash
# Supabase (the shared project, same one chikoro/church use):
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE=eyJ…              # Settings → API → service_role (secret!)
SUPABASE_ANON_KEY=eyJ…                  # Settings → API → anon public

# Auth
JWT_SECRET=$(openssl rand -hex 32)      # any 32+ random bytes

# PayNow URLs (default for projects that don't override)
PAYNOW_RETURN_URL=https://pay.aizim.co.zw/return
PAYNOW_RESULT_URL=https://pay.aizim.co.zw/api/v1/webhook
PAYNOW_API_BASE=https://www.paynow.co.zw/interface

# Simulator hosting (this server)
SIMULATOR_BASE_URL=https://pay.aizim.co.zw

# Master key (from step 2)
MANISHAPAY_MASTER_KEY=...

# CORS — let the dashboard call the API from the same host
ALLOW_CORS_ORIGINS=https://pay.aizim.co.zw

# Optional: ManishaPay's own PayNow account, used to charge developer
# invoices via dogfood billing later. Leave blank for now.
# MANISHAPAY_OWN_PAYNOW_INTEGRATION_ID=
# MANISHAPAY_OWN_PAYNOW_INTEGRATION_KEY=
```

### 4. Set up the Node API on cPanel (5–10 min, UI-only — I can't automate this)

cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
|---|---|
| Node.js version | **20.x** (or latest) |
| Application mode | Production |
| Application root | `manishapay-api` (cPanel will create `~/manishapay-api/`) |
| Application URL | `pay.aizim.co.zw/api` |
| Application startup file | `server.js` |
| Passenger log file | `~/logs/manishapay-api.log` |

After creating, click **Edit** to add the env vars from step 3 (Passenger reads them).

Then upload the backend code:

```bash
# From your laptop, into the cPanel app folder:
scp -r backend/* aizim:~/manishapay-api/

# SSH to install deps using the version Passenger uses
ssh aizim
source ~/nodevenv/manishapay-api/20/bin/activate    # path cPanel shows you on the app's Edit page
cd ~/manishapay-api
npm install --production
exit
```

Then back in the cPanel UI, click **Restart** on the app.

Smoke test:
```bash
curl https://pay.aizim.co.zw/api/health
# → { "ok": true, "configured": true }   ← if MASTER_KEY + Supabase set, both true
```

### 5. Rebuild + redeploy the frontend with real Supabase keys (3 min)

```bash
cd frontend

# Copy the template, then fill in the real values:
cp .env.production.example .env.production
# Edit .env.production:
#   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
#   VITE_SUPABASE_ANON=eyJ...
#   VITE_API_BASE=/api          ← keep as-is

npm run build

# Push the new dist to pay.aizim.co.zw:
cd dist && tar -czf ../dist.tar.gz . && cd ..
scp dist.tar.gz aizim:public_html/pay/dist.tar.gz
ssh aizim 'cd ~/public_html/pay && tar -xzf dist.tar.gz && rm dist.tar.gz'
```

### 6. End-to-end smoke test (5 min)

1. Open https://pay.aizim.co.zw → see landing page
2. Click "Get started" → register with a real email + `app=manishapay` marker is automatically passed
3. Confirm email if Supabase requires it; log in
4. **Projects** → create "First Project"
5. **API Keys** → create test key → **copy it** (shown once) → click "Use as active"
6. From your terminal:
   ```bash
   curl -X POST https://pay.aizim.co.zw/api/v1/pay \
     -H "Authorization: Bearer <PASTE_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"reference":"smoke-1","amount":"1.00"}'
   ```
   Response should include `"mode": "simulated"` and a `browser_url` pointing to the simulator.
7. Open that `browser_url` → click "Mark as Paid" → check **Transactions** in dashboard, status should flip to Paid.

If all 7 work, you can hand the URL to your dev friends.

### 7. (Optional) Add real PayNow creds to test the live path

1. PayNow → Receive Payments → create new integration named `manishapay-dev` → email key to yourself
2. Dashboard → **PayNow Credentials** → Add for your project, mode=test → paste the Integration ID + Key
3. Re-run the curl from step 6 — `"mode": "simulated"` should now become `"mode": "test"` and `browser_url` should point at `paynow.co.zw`
4. Use one of PayNow's test phone numbers (`0771111111`, etc.) to simulate outcomes

---

## What I deferred (and why)

- **BullMQ + Upstash Redis webhook retry queue** — needs a Redis account; in-process retry is fine for v1
- **Daily billing cron + invoice generation** — no real usage to bill yet; schema is in place
- **VitePress docs site** — the `docs/` folder + per-SDK READMEs cover v0.5; full docs site after first real users
- **Better Uptime status page** — sign up at betteruptime.com → CNAME `status.pay.aizim.co.zw` to it
- **Penetration testing / load testing** — needed before charging real money but not before friendly-dev demos
- **PayNow ToS check** — you said there is no ToS; revisit if PayNow ever pushes back on third-party key holding

## What changed in this autonomous session

| Commit | Change |
|---|---|
| Phase 1 (schema) | `supabase/install.sql` namespaced + 3 new tables (`manishapay_paynow_credentials`, `manishapay_usage_daily`, `manishapay_invoices`) |
| Phase 2 (per-merchant creds) | `services/{paynow,credentials,crypto}.js` rewrite — three modes (simulated, test, live), envelope encryption |
| Phase 3 (dashboard wiring) | New JWT middleware; new routes `/v1/{projects,keys,credentials}`; frontend `Credentials.jsx` page; AuthContext gated by app marker |
| Phase 3 (simulator) | `/simulator/<tracker>` HTML page with Paid/Cancelled/Timeout buttons firing signed webhooks + postMessage to drop-in widget |
| Phase 5 (rebrand) | Tailwind emerald gradient; SVG logo; landing page rewrite; sidebar logo |
| Phase 6 (drop-in widget) | `frontend/public/checkout.js` — 7 KB no-deps modal-iframe widget |
| Phase 7 (SDKs) | `sdks/nodejs/` (npm package) + `sdks/php/` (Composer package) with webhook verify helpers |
| Tests | 21/21 pass — includes byte-for-byte hash match against PayNow's own published example |

## Useful URLs

- **Dashboard / Landing**: https://pay.aizim.co.zw
- **API base** (once cPanel app is up): https://pay.aizim.co.zw/api
- **Simulator example**: https://pay.aizim.co.zw/simulator/mp_xxxxxxxxxxxxxxxx
- **Drop-in widget**: https://pay.aizim.co.zw/checkout.js
- **PayNow docs**: https://developers.paynow.co.zw/docs/paynow/quickstart
- **PayNow forum**: https://forums.paynow.co.zw/

## Contact

Built by [Noby Tebulo](https://noby.aizim.co.zw) · centuriongrill@gmail.com
