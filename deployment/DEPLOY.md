# Deploying ManishaPay to cPanel

This guide is the long-form version of the README's "Deploying to cPanel" section.
Follow the parts you need; the rest is reference.

---

## 0. Prerequisites

* A cPanel host with Node.js (Setup Node.js App is the easiest path).
* SSH access (optional but recommended).
* A subdomain for the API, e.g. `api.yourdomain.com`.
* Your Supabase project URL + service-role key.
* Your PayNow integration ID + key.

---

## 1. Build the SPA

```bash
cd frontend
cp .env.example .env
# Edit .env so VITE_SUPABASE_URL / VITE_API_BASE point at production.
npm ci
npm run build
```

Output lands in `frontend/dist/`. That folder is everything the browser needs.

---

## 2. Upload the SPA to public_html

Two options:

### Option A — File Manager (no SSH)

1. Compress `frontend/dist/` to a zip.
2. cPanel → File Manager → upload to `public_html`.
3. Right-click → Extract.
4. Upload `deployment/.htaccess` to `public_html/.htaccess`.

### Option B — `deploy.sh` (SSH, much faster)

```bash
./deployment/deploy.sh user@yourhost.com /home/user/public_html /home/user/manishapay-api
```

---

## 3. Set up the Node API

The gateway is a normal Express app. cPanel runs it via Phusion Passenger.

### Step 1 — upload the backend folder

Upload the `backend/` directory to a path **outside** `public_html`, e.g. `/home/user/manishapay-api`. Do NOT upload `node_modules`. The deploy script handles this for you.

### Step 2 — create the Node app in cPanel

1. cPanel → **Setup Node.js App** → **Create Application**.
2. Node version: 18 or newer.
3. Application mode: Production.
4. Application root: `/home/user/manishapay-api` (the path you uploaded to).
5. Application URL: `api.yourdomain.com` (the subdomain you created).
6. Application startup file: `server.js`.
7. Click **Create**.

### Step 3 — paste environment variables

In the same panel, scroll down and add every key from `backend/.env.example`. The required ones are:

* `NODE_ENV=production`
* `PORT=8787` (or whichever port cPanel auto-assigns — usually leave the cPanel default)
* `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY`, `PAYNOW_RETURN_URL`, `PAYNOW_RESULT_URL`
* `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, `SUPABASE_ANON_KEY`
* `JWT_SECRET` — generate with `openssl rand -hex 32`
* `ALLOW_CORS_ORIGINS=https://yourdomain.com`

### Step 4 — install dependencies

In the cPanel app panel, click **Run NPM Install**. (If you used `deploy.sh`, this is already done.)

### Step 5 — start the app

Click **Start App**. The status should flip to "Running".

Visit `https://api.yourdomain.com/health` — you should see:

```json
{ "status": "ok", "service": "manishapay-gateway", "uptime_seconds": 1 }
```

---

## 4. Run the database migration

In Supabase Studio:

1. SQL editor → New query.
2. Paste the contents of `supabase/migrations/0001_initial_schema.sql`.
3. Click **Run**. You should see "Success. No rows returned."
4. (Optional) Repeat with `supabase/seed.sql` for sample data.

---

## 5. Wire up the webhook-relay edge function

```bash
# from your laptop
supabase functions deploy webhook-relay --project-ref your-ref
```

Then in Supabase Studio → **Database → Cron Jobs → New Cron**:

| Field    | Value                |
|----------|----------------------|
| Name     | `webhook-relay`      |
| Schedule | `*/5 * * * *`        |
| Type     | Edge Function        |
| Function | `webhook-relay`      |

This re-tries failed webhook deliveries every five minutes for up to 24 hours.

---

## 6. Configure the WordPress plugin (optional)

```bash
cd wordpress-plugin
zip -r paynow-bridge-connect.zip paynow-bridge-connect
```

Upload via WP Admin → **Plugins → Add New → Upload Plugin**, activate, then go to **Settings → PayNow Bridge** and paste your ManishaPay API key. Done.

---

## 7. Smoke test

```bash
# Liveness
curl https://api.yourdomain.com/health

# Mock payment (no PayNow call)
curl -X POST https://api.yourdomain.com/v1/tools/mock/pay \
  -H "Authorization: Bearer mp_test_xxxx" \
  -H "Content-Type: application/json" \
  -d '{"reference":"smoke-1","amount":"1.00"}'
```

Both should return `200 OK` JSON.

---

## 8. Cron jobs

You don't *need* any cron jobs on cPanel — the webhook replay lives on Supabase. But if you want a heartbeat-style status check, add:

```cron
*/5 * * * * curl -fsS https://api.yourdomain.com/health/deep > /dev/null || \
  echo "ManishaPay degraded at $(date)" | mail -s "Gateway alert" you@example.com
```

---

## Troubleshooting

| Symptom                                          | Likely cause                                              | Fix                                                                 |
|--------------------------------------------------|------------------------------------------------------------|---------------------------------------------------------------------|
| `502 Bad Gateway` on the API subdomain           | Node app crashed or wasn't started                         | cPanel → Setup Node.js App → Start                                  |
| `MODULE_NOT_FOUND` in error logs                 | `npm ci` wasn't run                                        | Run NPM Install in the cPanel panel                                 |
| Static assets 404 after deploy                   | Old `.htaccess` overrode SPA fallback                      | Re-upload `deployment/.htaccess`                                    |
| Supabase calls fail with `RLS`                   | Forgot to apply the migration                              | Re-run `0001_initial_schema.sql`                                    |
| Webhooks signed mismatch                         | API key changed but plugin still has old one               | Update plugin settings → API key                                    |
