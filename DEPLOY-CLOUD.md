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
   | `PAYNOW_RETURN_URL` | `https://manishapay.netlify.app/return` |
   | `PAYNOW_RESULT_URL` | `https://<this-render-url>.onrender.com/v1/webhook` &nbsp;*(direct to Render — webhooks should not go through the Netlify proxy)* |
   | `SIMULATOR_BASE_URL` | `https://manishapay.netlify.app` &nbsp;*(the Netlify domain — simulator pages are proxied to Render)* |
   | `ALLOW_CORS_ORIGINS` | `https://manishapay.netlify.app` |

   You won't know the Render or Netlify URLs until each is created — set placeholders now, then come back in step 4 to fix the cross-references and redeploy.

   > **Single-domain setup (Option A).** The whole app lives under one domain
   > (`manishapay.netlify.app`); `netlify.toml` proxies `/api/*` and `/simulator/*`
   > to the Render API. **Name the Render service `manishapay-api`** so its URL is
   > `https://manishapay-api.onrender.com` (the proxy target in `netlify.toml`). If
   > Render assigns a different URL, update the two `to =` lines in `netlify.toml`.
3. **Create** → wait for the build → note the service URL `https://<name>.onrender.com`.
4. Smoke test: open `https://<name>.onrender.com/health` → `{ "ok": true, ... }`.

> ⚠️ Render's **free plan sleeps after ~15 min idle** — fine for testing, but PayNow webhooks can be missed while asleep. The reconciliation sweep (step 6) recovers those; keeping the service warm (step 6) also prevents the cold-start that drops them in the first place.

### Reconciliation env (set alongside the others)
| Key | Value |
|---|---|
| `CRON_SECRET` | a long random token — `openssl rand -hex 24` (used to authenticate the sweep trigger) |
| `RECONCILE_INTERVAL_MS` | `120000` (already in `render.yaml`) — in-process sweep every 2 min while the service is awake |

---

## 3. Netlify — the dashboard (5 min)

1. netlify.com → **Add new site → Import from Git** → pick the `manishapay` repo. Netlify reads `netlify.toml` (base `frontend`, build `npm install && npm run build`, publish `dist`, SPA redirect).
2. **Site settings → Environment variables** → add:

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Supabase Project URL |
   | `VITE_SUPABASE_ANON` | anon public key |
   | `VITE_API_BASE` | `/api` &nbsp;*(same-origin — Netlify proxies it to Render; no cross-origin calls)* |
3. **Set the site name to `manishapay`** (Site settings → Change site name) so the URL is `https://manishapay.netlify.app`.
4. **Deploy** → confirm the site URL is `https://manishapay.netlify.app`.

---

## 4. Wire the cross-references (3 min)

Now both URLs exist — go back and fix the placeholders, then redeploy each:

- **Render** env: `ALLOW_CORS_ORIGINS`, `PAYNOW_RETURN_URL` and `SIMULATOR_BASE_URL` → `https://manishapay.netlify.app`; `PAYNOW_RESULT_URL` → `https://<your-render>.onrender.com/v1/webhook` (direct) → **Save / Manual Deploy**.
- **Netlify**: `VITE_API_BASE` stays `/api`. Confirm the `netlify.toml` proxy `to =` URLs match your real Render URL → **Trigger deploy**.

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

---

## 6. Keep-warm + reconciliation (3 min) — do this before any real money

On Render free the service sleeps after ~15 min idle, so a real PayNow webhook
can hit a cold start (or be missed). Two layers fix this:

**a) Keep it warm.** Create a free monitor that GETs `https://<render-url>.onrender.com/health`
every 5 minutes (UptimeRobot, cron-job.org, or Better Uptime). This keeps the
process alive, so the in-process reconciliation sweep (`RECONCILE_INTERVAL_MS=120000`)
runs every 2 minutes and the cold-start window disappears.

**b) Reconciliation as the safety net.** Even with keep-warm, a deploy or a
brief outage can drop a webhook. The sweep re-polls every pending, non-simulated
transaction against PayNow and fires the merchant webhook if it resolved while
we weren't listening — so a missed callback becomes "caught within minutes"
instead of "lost". It's idempotent (a webhook fires only when a payment leaves
the pending state), so it never double-notifies.

For belt-and-braces, also schedule an external POST to the trigger every
5–10 min — this runs the sweep even if the process restarted and the in-process
timer hasn't fired yet:

```bash
curl -X POST https://<render-url>.onrender.com/v1/reconcile \
  -H "Authorization: Bearer <CRON_SECRET>"
# → { "data": { "scanned": N, "updated": N, "dispatched": N, "errors": 0 }, ... }
```

A 401 means the `CRON_SECRET` header doesn't match; a 503 means `CRON_SECRET`
isn't set on the server (the trigger is disabled until it is).

### (Optional) test the real PayNow path
Dashboard → **PayNow Credentials** → add your `manishapay-dev` Integration ID + Key (mode `test`) → re-run the curl: `"mode"` becomes `"test"` and `browser_url` points at paynow.co.zw. Use PayNow's test numbers (`0771111111`, …) to trigger outcomes.

---

Built by Noby Tebulo · nobytechy@gmail.com
