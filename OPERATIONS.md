# ManishaPay — Operations Manual

How to run and manage the live app day-to-day. Audience: you (Noby) plus any
admin you grant the `admin` role to in `manishapay_developers.role`.

> **First time setup:** see `HANDOFF.md`.
> **Marketing / public-facing:** see `README.md`.
> **Public API reference:** see `docs/API.md`, `docs/ERRORS.md`, `docs/INTEGRATION.md`.

---

## Contents

1. [Quick reference card](#1-quick-reference-card)
2. [Where to look (daily ops)](#2-where-to-look-daily-ops)
3. [Managing developers](#3-managing-developers)
4. [Managing transactions](#4-managing-transactions)
5. [Managing webhooks](#5-managing-webhooks)
6. [Managing PayNow credentials](#6-managing-paynow-credentials)
7. [Managing API keys](#7-managing-api-keys)
8. [Billing](#8-billing)
9. [Master key rotation](#9-master-key-rotation-the-careful-one)
10. [Logs & debugging](#10-logs--debugging)
11. [Common SQL recipes](#11-common-sql-recipes)
12. [Backup & restore](#12-backup--restore)
13. [Deploying changes](#13-deploying-changes)
14. [Incident response](#14-incident-response)
15. [Support playbook](#15-support-playbook)

---

## 1. Quick reference card

| What | Where |
|---|---|
| Live frontend | https://pay.aizim.co.zw |
| Live API | https://pay.aizim.co.zw/api |
| Simulator | https://pay.aizim.co.zw/simulator/`<tracker>` |
| Status (TBD) | https://status.pay.aizim.co.zw |
| GitHub | https://github.com/nobytechy/manishapay |
| Supabase project | (the one shared with chikoro/church — check `backend/.env.local`) |
| cPanel SSH alias | `aizim` |
| API app folder on server | `~/manishapay-api/` |
| Frontend folder on server | `~/public_html/pay/` |
| Backend env file | `~/manishapay-api/.env` (Passenger reads it) |
| Local repo | `C:\xampp\htdocs\manisha\` |
| Local backend tests | `cd backend && npm test` (must stay 21/21) |

**Critical secrets** (kept in `backend/.env` on the server, NOT in git):
- `MANISHAPAY_MASTER_KEY` — encrypts every merchant's PayNow creds. **Never lose. Never change without rotation script.**
- `SUPABASE_SERVICE_ROLE` — bypasses RLS. Server-side only.
- `JWT_SECRET` — for the management plane.

---

## 2. Where to look (daily ops)

| Symptom | First place to look |
|---|---|
| "Sign-ups are failing" | Supabase Studio → Auth → Users (is the user there?) → `manishapay_developers` (does the row exist? if not, the trigger didn't fire — check `app=manishapay` marker) |
| "API returns 500" | cPanel → Setup Node.js App → ManishaPay → Logs |
| "Webhook isn't reaching merchant" | Dashboard → Admin → Webhook monitor (or `manishapay_webhook_deliveries` table) |
| "PayNow callback is being rejected" | `manishapay_logs` table filtered by `level=warn`, look for "signature mismatch" |
| "Transaction stuck in Sent" | Either PayNow never called back, or the merchant's poll URL stopped working. Trigger a manual poll via `/v1/pay/<ref>/status` |
| "Bill is wrong" | `manishapay_invoices` joined to `manishapay_usage_daily` — see SQL in §11 |
| "Site is slow" | Supabase → Database → Reports (slow query log); cPanel → Resource Usage |

The **Admin dashboard** at `https://pay.aizim.co.zw/admin` covers most of these visually. To grant yourself admin access on first login:

```sql
-- run once in Supabase Studio → SQL Editor
update public.manishapay_developers
set role = 'admin'
where email = 'centuriongrill@gmail.com';
```

---

## 3. Managing developers

### Approve a new signup

Signups land in `status='pending'`. To activate manually (once email is verified):

```sql
update public.manishapay_developers
set status = 'active'
where email = 'newdev@example.com';
```

> If you set Supabase → Auth → Email confirmation, that auto-activates and you don't need this step.

### Suspend a developer

Stops their API calls immediately (auth middleware checks `status`):

```sql
update public.manishapay_developers
set status = 'suspended'
where email = 'baduser@example.com';
```

Re-enable with `set status = 'active'`. Audit trail is implicit via `updated_at`.

### Adjust free-tier or per-transaction fee

```sql
update public.manishapay_developers
set free_tier_monthly = 200,
    per_txn_fee_usd = 0.0300
where id = '<developer_uuid>';
```

### Promote to admin

```sql
update public.manishapay_developers
set role = 'admin'
where email = 'co-founder@example.com';
```

Admin role gives access to the `/admin` dashboard pages. Demote with `role = 'developer'`.

### Delete a developer (GDPR-style)

The cascade deletes everything they own. **Cannot be undone.**

```sql
-- soft delete first (better than hard):
update public.manishapay_developers set status = 'deleted' where id = '<uuid>';

-- if they really insist on hard delete:
delete from auth.users where id = '<uuid>';   -- cascades through manishapay_developers
```

---

## 4. Managing transactions

### View a transaction by ID, tracker, or merchant reference

```sql
select * from public.manishapay_transactions
where tracker = 'mp_a1b2c3d4e5f6g7h8'
   or merchant_reference = 'order-1234';
```

### Re-poll PayNow for stuck transactions

Stuck = `status_normalized = 'pending'` for >1 hour:

```sql
select tracker, merchant_reference, mode, status, created_at
from public.manishapay_transactions
where status_normalized = 'pending'
  and created_at < now() - interval '1 hour'
  and mode != 'simulated'
order by created_at;
```

For each row, hit `GET /v1/pay/<merchant_reference>/status` from the developer's
API key to trigger a live poll. The route updates the DB if PayNow has a newer
status.

### Force a manual status update (refund, dispute)

ManishaPay can't issue refunds itself — PayNow must. After PayNow processes
the refund (in their dashboard), our row stays out of date. Sync manually:

```sql
update public.manishapay_transactions
set status = 'Refunded',
    status_normalized = 'refunded',
    updated_at = now()
where tracker = 'mp_xxxx';
```

Same pattern for disputes (`status = 'Disputed', status_normalized = 'disputed'`).

### Don't bill a transaction

Mark `billable = false` so it's skipped in the monthly invoice calc. Useful
when a merchant complains about a duplicated charge:

```sql
update public.manishapay_transactions
set billable = false
where tracker in ('mp_xxx', 'mp_yyy');
```

---

## 5. Managing webhooks

### Investigate a failed delivery

`manishapay_webhook_deliveries` is append-only — every attempt is its own row:

```sql
select wd.*, we.url, t.merchant_reference
from public.manishapay_webhook_deliveries wd
join public.manishapay_webhook_endpoints we on we.id = wd.endpoint_id
left join public.manishapay_transactions t on t.id = wd.transaction_id
where wd.status = 'failed'
order by wd.created_at desc
limit 50;
```

### Replay a webhook to a merchant

If the merchant fixes their endpoint and asks for a replay, find the
transaction and re-trigger. Easiest path: load the simulator page and click
the outcome button again **only for simulated transactions**. For real ones,
write a small admin script that POSTs the same payload + signature to their
URL (or just have them poll `/v1/pay/<ref>/status` themselves).

### Pause a misbehaving endpoint

If a merchant's webhook URL is hammering us with errors and we want to back
off without notifying them:

```sql
update public.manishapay_webhook_endpoints
set status = 'paused'
where id = '<endpoint_uuid>';
```

In-flight retries finish; new events skip this endpoint. `set status='active'` to resume.

---

## 6. Managing PayNow credentials

### Help a merchant who can't get live mode working

```sql
-- See what they've configured
select pc.id, pc.mode, pc.integration_id_last4, pc.status, pc.created_at, pc.last_used_at
from public.manishapay_paynow_credentials pc
join public.manishapay_projects p on p.id = pc.project_id
join public.manishapay_developers d on d.id = p.developer_id
where d.email = 'merchant@example.com'
order by pc.created_at desc;
```

If `last_used_at` is null and they're getting `CREDENTIALS_REQUIRED`, they
saved test creds but their request used `mp_live_*` (or vice versa).

### Force-revoke a credential

If a merchant says their PayNow key was compromised:

```sql
update public.manishapay_paynow_credentials
set status = 'revoked', rotated_at = now()
where id = '<credential_uuid>';
```

Their API calls in that mode will fall back to simulated (test) or fail
with `CREDENTIALS_REQUIRED` (live) until they re-add. Tell them to **also**
rotate the key on PayNow — the encrypted blob in our DB is now useless,
but if PayNow's copy was leaked elsewhere, they need a new key.

### "I deleted my project — can you recover the credentials?"

**No.** Project deletion cascades to credentials. Even if we could undelete
the row, the encrypted blob requires the master key — which we have, but
re-importing into a new project is more work than just having the merchant
re-paste from PayNow's email. Tell them to use PayNow's "Email Key to
Company Address" again.

---

## 7. Managing API keys

### Audit which keys exist for a merchant

```sql
select k.id, k.prefix, k.label, k.mode, k.status, k.last_used_at
from public.manishapay_api_keys k
join public.manishapay_developers d on d.id = k.developer_id
where d.email = 'merchant@example.com'
order by k.created_at desc;
```

### Force-revoke a leaked key

```sql
update public.manishapay_api_keys set status = 'revoked'
where prefix = 'mp_live_xxxx';
```

The merchant's apps will start receiving 401 within seconds.

### Create a key on behalf of a merchant (support scenario)

You can't — bcrypt happens server-side and the plaintext is shown once. Tell
the merchant to log in and click **Create key**. If they've truly lost
access, reset their Supabase auth password from the Supabase dashboard.

---

## 8. Billing

### See current month's billable transactions for a developer

```sql
select count(*) filter (where status_normalized = 'paid' and billable) as billable_paid,
       count(*) filter (where status_normalized = 'paid')              as total_paid,
       sum(merchant_amount) filter (where status_normalized = 'paid')  as gross_volume
from public.manishapay_transactions
where developer_id = '<uuid>'
  and mode = 'live'
  and created_at >= date_trunc('month', now());
```

### Generate the monthly invoice (manual SQL — until the cron is built)

Replace the period with the last fully-completed month:

```sql
with usage as (
  select developer_id,
         count(*) filter (where status_normalized = 'paid' and billable) as billable_paid,
         sum(merchant_amount) filter (where status_normalized = 'paid')  as gross_volume
  from public.manishapay_transactions
  where mode = 'live'
    and created_at >= date_trunc('month', now() - interval '1 month')
    and created_at <  date_trunc('month', now())
  group by developer_id
),
dev as (
  select id, free_tier_monthly, per_txn_fee_usd from public.manishapay_developers
)
insert into public.manishapay_invoices
  (developer_id, period_start, period_end, txn_count,
   free_tier_used, billable_count, amount_due, currency, status)
select u.developer_id,
       date_trunc('month', now() - interval '1 month')::date,
       (date_trunc('month', now()) - interval '1 day')::date,
       u.billable_paid,
       least(u.billable_paid, d.free_tier_monthly),
       greatest(u.billable_paid - d.free_tier_monthly, 0),
       round(greatest(u.billable_paid - d.free_tier_monthly, 0) * d.per_txn_fee_usd, 2),
       'USD',
       case when greatest(u.billable_paid - d.free_tier_monthly, 0) > 0 then 'open' else 'paid' end
from usage u join dev d on d.id = u.developer_id
where u.billable_paid > 0
on conflict (developer_id, period_start, period_end) do nothing;
```

Email the developers who received an open invoice with payment instructions.

### Mark an invoice paid

When PayNow confirms the developer paid us:

```sql
update public.manishapay_invoices
set status = 'paid', paid_at = now(), paid_via_paynow_ref = '<paynow_ref>'
where id = '<invoice_uuid>';
```

### Step a developer through billing enforcement

Three stages, each more aggressive:

```sql
-- 1. Warning (visible in dashboard, no API impact yet)
update public.manishapay_developers set billing_status = 'warning' where id = '<uuid>';

-- 2. Read-only (writes blocked, existing transactions can complete)
update public.manishapay_developers set billing_status = 'read_only' where id = '<uuid>';

-- 3. Disabled (all calls 402)
update public.manishapay_developers set billing_status = 'disabled' where id = '<uuid>';

-- Restore once paid:
update public.manishapay_developers set billing_status = 'good' where id = '<uuid>';
```

---

## 9. Master key rotation (the careful one)

### The danger

`MANISHAPAY_MASTER_KEY` encrypts every per-merchant data key. Replacing it
without first re-wrapping every credential row makes **every merchant's
PayNow credentials unrecoverable**. There is no recovery from this — they'd
all have to re-paste from PayNow.

### When to rotate

- Suspected leak (server compromise, ex-employee with prod access, etc.)
- Annual hygiene rotation (recommended)
- Never on a whim

### How to rotate (procedure)

This walks you through a zero-downtime rotation using the `rewrapDataKey`
helper already in `services/crypto.js`:

```bash
# 0. STOP — confirm the new key is generated AND backed up before you start.
NEW_KEY=$(openssl rand -hex 32)
echo "$NEW_KEY" >> ~/manishapay-master-key-backup-$(date +%F).txt   # store offline

# 1. Re-wrap every data key.
ssh aizim
cd ~/manishapay-api
node -e '
  const sodium = require("libsodium-wrappers");
  const { supabase } = require("./src/config/supabase");
  const crypto = require("./src/services/crypto");
  (async () => {
    await sodium.ready;
    const oldKey = crypto._internals.loadMasterKey();
    process.env.MANISHAPAY_MASTER_KEY = "'"$NEW_KEY"'";
    const newKey = crypto._internals.loadMasterKey();
    const { data } = await supabase.from("manishapay_paynow_credentials").select("id, data_key_encrypted").eq("status","active");
    for (const row of data) {
      const rewrapped = await crypto.rewrapDataKey(row, oldKey, newKey);
      await supabase.from("manishapay_paynow_credentials").update({ data_key_encrypted: rewrapped, rotated_at: new Date().toISOString() }).eq("id", row.id);
      console.log("rewrapped", row.id);
    }
    console.log("DONE");
  })();
'

# 2. Update the env var Passenger reads
nano .env
# replace MANISHAPAY_MASTER_KEY with $NEW_KEY

# 3. Restart the Node app via cPanel UI
# (Setup Node.js App → ManishaPay → Restart)

# 4. Smoke test: load Dashboard → PayNow Credentials, ensure last4 still
# matches. Make a test transaction in test mode and confirm it succeeds.

# 5. Securely delete the OLD key from your records (the new one is now
# the source of truth).
```

If anything fails between steps 1 and 3, the data keys are partially
re-wrapped — DO NOT update the env until step 1 finishes for ALL rows.
Re-running step 1 with the same NEW_KEY is idempotent (rows already
rewrapped will fail to decrypt with `oldKey`; add a `where rotated_at is
null` filter to skip them).

> **Always do a dry run on a test project's row first.** Better still,
> snapshot the table before starting: `pg_dump -t manishapay_paynow_credentials > before-rotation.sql`.

---

## 10. Logs & debugging

### Backend (Node) logs

Pino structured JSON to stdout, captured by Passenger:

```
~/logs/manishapay-api.log     ← cPanel → Setup Node.js App → ManishaPay → Logs
```

Useful greps:

```bash
# Last 50 errors
grep '"level":50' ~/logs/manishapay-api.log | tail -50

# Specific request id (from response or merchant report)
grep 'requestId":"rid-xxxxxxx' ~/logs/manishapay-api.log

# Webhook signature mismatches
grep 'signature mismatch' ~/logs/manishapay-api.log
```

### App-level logs (in DB)

The `manishapay_logs` table (filterable in Admin → Logs):

```sql
select level, message, context, created_at
from public.manishapay_logs
where developer_id = '<uuid>'
order by created_at desc
limit 100;
```

### Apache / cPanel access logs

```
~/access-logs/pay.aizim.co.zw      ← static SPA + /api/* through Passenger
```

### Supabase Postgres logs

Supabase Studio → Database → Logs · filter by HTTP code or query duration.

---

## 11. Common SQL recipes

```sql
-- Total volume processed this month (live mode only)
select sum(merchant_amount) as gross_usd
from public.manishapay_transactions
where mode = 'live'
  and status_normalized = 'paid'
  and created_at >= date_trunc('month', now());

-- Top 10 merchants by transaction count this month
select d.email, count(*) as txns, sum(t.merchant_amount) as volume
from public.manishapay_transactions t
join public.manishapay_developers d on d.id = t.developer_id
where t.mode = 'live'
  and t.status_normalized = 'paid'
  and t.created_at >= date_trunc('month', now())
group by d.email
order by txns desc
limit 10;

-- Conversion rate (paid / total) per merchant
select d.email,
       count(*)                                              as total,
       count(*) filter (where t.status_normalized = 'paid')  as paid,
       round(100.0 * count(*) filter (where t.status_normalized = 'paid') / count(*), 1) as pct
from public.manishapay_transactions t
join public.manishapay_developers d on d.id = t.developer_id
where t.mode = 'live'
  and t.created_at >= now() - interval '7 days'
group by d.email
having count(*) >= 5
order by pct;

-- Webhook delivery health (last 24h)
select status, count(*), avg(latency_ms)::int as avg_ms
from public.manishapay_webhook_deliveries
where created_at >= now() - interval '24 hours'
group by status;

-- Find merchants with no PayNow credentials configured (they're stuck in simulated)
select d.email, p.name
from public.manishapay_projects p
join public.manishapay_developers d on d.id = p.developer_id
where not exists (
  select 1 from public.manishapay_paynow_credentials pc
  where pc.project_id = p.id and pc.status = 'active'
);
```

---

## 12. Backup & restore

### What to back up

- **Supabase Postgres** (auto by Supabase, but keep your own copies too)
- **`backend/.env`** (especially MANISHAPAY_MASTER_KEY) — store offline (e.g. printed in a safe, 1Password)
- **GitHub repo** — already backed up via origin

### Manual database snapshot

From your laptop (via Supabase pooler or direct):

```bash
PGPASSWORD=<service-role-or-direct-pwd> pg_dump \
  -h <region>.pooler.supabase.com -p 6543 -U postgres -d postgres \
  --schema=public \
  --table='manishapay_*' \
  --no-owner --no-privileges --clean --if-exists \
  > manishapay-backup-$(date +%F).sql
```

### Restore (smoke or DR)

```bash
psql -h <host> -U postgres -d postgres -f manishapay-backup-2026-04-30.sql
```

⚠️ Restoring `manishapay_paynow_credentials` requires the **master key in
effect at the time the backup was taken**. If you've rotated since, see §9
before restoring.

---

## 13. Deploying changes

### Frontend (static SPA)

```bash
cd C:/xampp/htdocs/manisha/frontend
# Edit code, then:
npm run build
cd dist && tar -czf ../dist.tar.gz . && cd ..
scp dist.tar.gz aizim:public_html/pay/dist.tar.gz
ssh aizim 'cd ~/public_html/pay && tar -xzf dist.tar.gz && rm dist.tar.gz'
rm dist.tar.gz
```

`cache-control: no-cache` on `index.html` means changes are visible
immediately. Hashed bundles are cached for a year — the new `index.html`
references the new hash so users always get fresh JS.

### Backend (Node API)

```bash
cd C:/xampp/htdocs/manisha
git push                                # push to GitHub first (audit trail)
ssh aizim
cd ~/manishapay-api
git pull origin main                    # if you've git-cloned the api folder
# OR scp specific changed files into ~/manishapay-api/
npm install --production                # if dependencies changed
exit
# Then in cPanel UI: Setup Node.js App → ManishaPay → Restart
```

### Schema migration (additive only)

For incremental schema changes after `install.sql` is applied:

1. Write a forward-only `0002_<feature>.sql` (don't reuse install.sql)
2. Test it in Supabase Studio against a copy of production first (use Supabase's branching feature or a duplicated project)
3. Apply via Studio → SQL Editor → Run
4. Tag the version in git: `git tag schema-v2 && git push --tags`

> Avoid destructive migrations (`drop column`, `drop table`) without a
> deprecation window. RLS-protected tables can have new columns added
> safely; test the trigger still fires.

---

## 14. Incident response

### PayNow is down

- Symptom: live transactions failing with `PAYNOW_REJECTED` or 5xx upstream
- What to do: tweet at PayNow / check forum, post to status page, do nothing
  to your code. Simulated mode keeps working — surface that on the dashboard.
- After: write a postmortem in `docs/incidents/YYYY-MM-DD-paynow-outage.md`

### Supabase is down

- Symptom: nothing works — dashboard, API, signups all fail
- What to do: check Supabase status page; nothing you can do. The frontend
  serves a generic error; backend health endpoint will return 503.
- Long-term mitigation: the deferred Phase 9 retry queue + dead-letter
  table would let writes queue up locally and replay when Supabase returns.

### Suspected credential leak

- Rotate the master key immediately (§9)
- For each affected merchant: revoke their `manishapay_paynow_credentials`
  row + tell them to **also** rotate on PayNow (revoking on our side doesn't
  invalidate the key in PayNow's system).
- Audit `manishapay_logs` for unusual access patterns in the past 30 days.

### Webhook spam from your own server

If a runaway loop fires the same webhook 1000 times in a minute:

```sql
-- Pause all active endpoints temporarily
update public.manishapay_webhook_endpoints set status = 'paused' where status = 'active';
```

Investigate the source, fix the loop, then reactivate.

---

## 15. Support playbook

### Common merchant complaints + diagnostic flow

| Complaint | First check |
|---|---|
| "I'm getting HASH_MISMATCH" | Did they rotate their PayNow key in PayNow dashboard without updating ours? §6 |
| "My customers reach PayNow but the page hangs" | Their `return_url` is wrong or unreachable. Check `manishapay_projects.return_url`. |
| "Webhook isn't reaching my server" | Look in `manishapay_webhook_deliveries` for that endpoint. HTTP 4xx → their endpoint is wrong. HTTP 5xx → their endpoint is broken. Connection error → DNS / firewall. |
| "I can't see my transactions" | Are they logged in as the developer who owns the project? RLS scopes per developer. |
| "I added live creds but I'm still in simulated" | They're using a `mp_test_*` API key. Test keys + live creds = you still get test mode (matched by mode field). |
| "I want to refund a transaction" | They go to PayNow → Transactions → Refund. We don't have a refund API (PayNow doesn't expose one). Then sync the status (§4). |
| "Can I have a higher free tier?" | Yes, on a case-by-case basis. Update `manishapay_developers.free_tier_monthly`. |

### How to escalate

If you can't reproduce or fix in 30 minutes:

1. Capture the request ID from the merchant's screenshot or response body
2. Grep the Node logs (§10) for that request ID
3. Look up the transaction in the DB
4. Reply to the merchant with **what you found** (specific row, log line),
   **what you tried**, and an ETA. Vague replies destroy trust.
5. If it's a real bug, file a GitHub issue with the request ID and
   reproduction steps.

---

## Author

Operations runbook by [Noby Tebulo](https://noby.aizim.co.zw) ·
[centuriongrill@gmail.com](mailto:centuriongrill@gmail.com)
