# ManishaPay — Cloud Deploy (Supabase + Render + Netlify)

The current hosting plan. Three services:

| Service | Hosts | Config |
|---|---|---|
| **Supabase** (new project) | Postgres + Auth + RLS | `supabase/install.sql` |
| **Render** | Node/Express API (`backend/`) | `render.yaml` |
| **Netlify** | React/Vite dashboard (`frontend/`) | `netlify.toml` |

Repo: `github.com/nobytechy/manishapay`. Everything below is account-level work
(only you can do it). Code, configs and tests are green and pushed.

Have these two secrets ready (generated for you — keep them safe):
- `MANISHAPAY_MASTER_KEY` — **permanent** once any credential is saved; back it up.
- `JWT_SECRET`

---

## 1. Supabase (5 min)

1. supabase.com → **New project** (pick a region close to ZW, e.g. EU). Save the DB password.
2. **SQL Editor → New query** → paste all of `supabase/install.sql` → **Run**. It's idempotent.
3. Verify in **Table Editor** that the `manishapay_*` tables exist (developers, projects, api_keys, paynow_credentials, transactions, webhook_endpoints, webhook_deliveries, usage_daily, invoices, logs, button_configs, announcements).
4. **Settings → API** → copy three values:
   - **Project URL** → `https://<ref>.supabase.co`
   - **anon public** key
   - **service_role** key (secret — server only)

---

## 2. Render — the API (10 min)

1. render.com → **New → Blueprint** → connect the `manishapay` repo. Render reads `render.yaml` and proposes the `manishapay-api` web service (rootDir `backend`, `npm install`, `npm start`, health `/health`).
2. It will ask for the `sync: false` env vars. Set them:

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | your Supabase Project URL |
   | `SUPABASE_SERVICE_ROLE` | service_role key |
   | `SUPABASE_ANON_KEY` | anon public key |
   | `JWT_SECRET` | (generated) |
   | `MANISHAPAY_MASTER_KEY` | (generated) |
   | `PAYNOW_RETURN_URL` | `https://<your-netlify-site>.netlify.app/return` |
   | `PAYNOW_RESULT_URL` | `https://<this-render-url>.onrender.com/v1/webhook` |
   | `SIMULATOR_BASE_URL` | `https://<this-render-url>.onrender.com` |
   | `ALLOW_CORS_ORIGINS` | `https://<your-netlify-site>.netlify.app` |

   You won't know the Render or Netlify URLs until each is created — set placeholders now, then come back in step 4 to fix the cross-references and redeploy.
3. **Create** → wait for the build → note the service URL `https://<name>.onrender.com`.
4. Smoke test: open `https://<name>.onrender.com/health` → `{ "ok": true, ... }`.

> ⚠️ Render's **free plan sleeps after ~15 min idle** — fine for testing, but PayNow webhooks can be missed while asleep. Before a real merchant goes live, either keep it warm (an uptime pinger on `/health`) or move to the Starter plan.

---

## 3. Netlify — the dashboard (5 min)

1. netlify.com → **Add new site → Import from Git** → pick the `manishapay` repo. Netlify reads `netlify.toml` (base `frontend`, build `npm install && npm run build`, publish `dist`, SPA redirect).
2. **Site settings → Environment variables** → add:

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Supabase Project URL |
   | `VITE_SUPABASE_ANON` | anon public key |
   | `VITE_API_BASE` | `https://<your-render-url>.onrender.com` |
3. **Deploy** → note the site URL `https://<name>.netlify.app`.

---

## 4. Wire the cross-references (3 min)

Now both URLs exist — go back and fix the placeholders, then redeploy each:

- **Render** env: set `ALLOW_CORS_ORIGINS` and `PAYNOW_RETURN_URL` to the real Netlify URL; set `PAYNOW_RESULT_URL` + `SIMULATOR_BASE_URL` to the real Render URL → **Manual Deploy / Save**.
- **Netlify** env: confirm `VITE_API_BASE` is the real Render URL → **Trigger deploy**.

---

## 5. End-to-end smoke test (5 min)

1. Open the Netlify URL → landing page loads.
2. **Get started** → register (the `app=manishapay` marker is passed automatically) → confirm email if required → log in.
3. **Projects** → create one. **API Keys** → create a test key → copy it (shown once) → set active.
4. From a terminal:
   ```bash
   curl -X POST https://<render-url>.onrender.com/v1/pay \
     -H "Authorization: Bearer <PASTE_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"reference":"smoke-1","amount":"1.00"}'
   ```
   Expect `"mode": "simulated"` + a `browser_url` to the simulator.
5. Open `browser_url` → **Mark as Paid** → check **Transactions** in the dashboard flips to Paid.

If all five pass, hand the URL to your dev friends.

### (Optional) test the real PayNow path
Dashboard → **PayNow Credentials** → add your `manishapay-dev` Integration ID + Key (mode `test`) → re-run the curl: `"mode"` becomes `"test"` and `browser_url` points at paynow.co.zw. Use PayNow's test numbers (`0771111111`, …) to trigger outcomes.

---

Built by Noby Tebulo · nobytechy@gmail.com
