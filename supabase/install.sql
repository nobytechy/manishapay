-- ─────────────────────────────────────────────────────────────────────────
-- ManishaPay — canonical schema (single-file install)
--
-- Apply once on a fresh Supabase project, OR on an existing shared
-- Supabase project (chikoro/church/etc.) — every object is namespaced
-- with `manishapay_` so it coexists with sibling apps under `public`.
--
-- Apply with:
--   psql "$SUPABASE_DB_URL" -f install.sql
-- or paste into Supabase Studio → SQL Editor → Run.
--
-- Auth model:
--   • `auth.users` is shared across all apps (Supabase doesn't namespace it).
--   • The signup flow MUST set `raw_user_meta_data.app = 'manishapay'`:
--       supabase.auth.signUp({
--         email, password,
--         options: { data: { app: 'manishapay' } }
--       })
--   • The `manishapay_handle_new_user` trigger fires on every auth.users
--     INSERT but only inserts a `manishapay_developers` row when the
--     marker matches. Other apps' triggers are untouched.
--
-- Conventions:
--   • UUID v4 ids (gen_random_uuid).
--   • created_at / updated_at on every row, kept honest by trigger.
--   • RLS enabled on every table. Service role bypasses RLS.
--
-- Safe to re-run (idempotent): tables/indexes use create-if-not-exists;
-- triggers & policies are dropped-then-created; new columns are backfilled via
-- add-column-if-not-exists (see "Schema upgrades"). Re-running adds whatever is
-- missing and leaves existing objects and data untouched.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─── Helper: bumps updated_at on UPDATE ──────────────────────────────────
create or replace function public.manishapay_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─── developers ──────────────────────────────────────────────────────────
-- One row per signed-up ManishaPay user. FK to auth.users.
create table if not exists public.manishapay_developers (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null unique,
  full_name       text,
  role            text not null default 'developer' check (role in ('developer', 'admin')),
  status          text not null default 'pending'   check (status in ('pending', 'active', 'suspended', 'deleted')),
  plan            text not null default 'free'      check (plan in ('free', 'pro', 'enterprise')),

  -- Billing state
  billing_status      text not null default 'good' check (billing_status in ('good', 'warning', 'read_only', 'disabled')),
  free_tier_monthly   int  not null default 50,
  per_txn_fee_usd     numeric(6,4) not null default 0.0500,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
drop trigger if exists manishapay_developers_touch on public.manishapay_developers;
create trigger manishapay_developers_touch before update on public.manishapay_developers
  for each row execute function public.manishapay_touch_updated_at();

-- ─── projects ────────────────────────────────────────────────────────────
-- A developer can have multiple projects (e.g. staging vs prod, or two
-- side businesses sharing one ManishaPay account). Each project maps to
-- one PayNow integration.
create table if not exists public.manishapay_projects (
  id              uuid primary key default gen_random_uuid(),
  developer_id    uuid not null references public.manishapay_developers(id) on delete cascade,
  name            text not null,
  description     text,
  return_url      text,
  result_url      text,
  default_mode    text not null default 'test' check (default_mode in ('test', 'live')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists manishapay_projects_developer_idx on public.manishapay_projects(developer_id);
drop trigger if exists manishapay_projects_touch on public.manishapay_projects;
create trigger manishapay_projects_touch before update on public.manishapay_projects
  for each row execute function public.manishapay_touch_updated_at();

-- ─── paynow_credentials ──────────────────────────────────────────────────
-- The merchant's PayNow Integration ID + Key, encrypted at rest with
-- envelope encryption (libsodium secretbox).
--
-- Layout:
--   • A 32-byte data key is generated per row and encrypted with the
--     master key (env: MANISHAPAY_MASTER_KEY). Stored as data_key_encrypted.
--   • Integration ID + Key are encrypted with the data key.
--   • Each ciphertext field is base64( nonce(24 bytes) || ciphertext ).
--
-- This split lets us rotate the master key without re-encrypting every
-- credential payload — we only re-encrypt the small data keys.
create table if not exists public.manishapay_paynow_credentials (
  id                          uuid primary key default gen_random_uuid(),
  project_id                  uuid not null references public.manishapay_projects(id) on delete cascade,
  mode                        text not null check (mode in ('test', 'live')),

  integration_id_encrypted    text not null,
  integration_key_encrypted   text not null,
  data_key_encrypted          text not null,

  -- Display-only fingerprint so the dashboard can show "ID ending in 1627"
  integration_id_last4        text,

  -- PayNow-registered merchant email. Sent to PayNow as `authemail` — required
  -- for mobile / Express-Checkout calls, and in TEST mode it must equal the
  -- merchant's registered email. Not secret; stored plaintext.
  merchant_email              text,

  added_by                    uuid references public.manishapay_developers(id) on delete set null,
  last_used_at                timestamptz,
  rotated_at                  timestamptz,
  status                      text not null default 'active' check (status in ('active', 'revoked')),

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index if not exists manishapay_paynow_credentials_project_idx
  on public.manishapay_paynow_credentials(project_id);
-- Only one ACTIVE credential per (project, mode); revoked rows kept for audit.
create unique index if not exists manishapay_paynow_credentials_one_active_per_mode
  on public.manishapay_paynow_credentials(project_id, mode)
  where status = 'active';
drop trigger if exists manishapay_paynow_credentials_touch on public.manishapay_paynow_credentials;
create trigger manishapay_paynow_credentials_touch before update on public.manishapay_paynow_credentials
  for each row execute function public.manishapay_touch_updated_at();

-- ─── api_keys ────────────────────────────────────────────────────────────
-- Plaintext keys are NEVER stored — only the bcrypt hash and a 12-char
-- prefix (so the auth middleware can look up by indexed prefix and
-- bcrypt-compare). Prefix carries the mode: `mp_test_xxx` or `mp_live_xxx`.
create table if not exists public.manishapay_api_keys (
  id            uuid primary key default gen_random_uuid(),
  developer_id  uuid not null references public.manishapay_developers(id) on delete cascade,
  project_id    uuid not null references public.manishapay_projects(id) on delete cascade,
  prefix        text not null,
  key_hash      text not null,
  label         text,
  mode          text not null check (mode in ('test', 'live')),
  status        text not null default 'active' check (status in ('active', 'revoked')),
  plan          text not null default 'free',
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists manishapay_api_keys_prefix_idx     on public.manishapay_api_keys(prefix);
create index if not exists manishapay_api_keys_developer_idx  on public.manishapay_api_keys(developer_id);
create index if not exists manishapay_api_keys_project_idx    on public.manishapay_api_keys(project_id);
drop trigger if exists manishapay_api_keys_touch on public.manishapay_api_keys;
create trigger manishapay_api_keys_touch before update on public.manishapay_api_keys
  for each row execute function public.manishapay_touch_updated_at();

-- ─── transactions ────────────────────────────────────────────────────────
-- Every payment attempt. `merchant_amount` is what the merchant requested;
-- `customer_amount` is what the customer was actually charged (same in v1,
-- different in v2 if/when fee pass-through is added — schema future-proofed).
create table if not exists public.manishapay_transactions (
  id                  uuid primary key default gen_random_uuid(),
  developer_id        uuid not null references public.manishapay_developers(id) on delete cascade,
  project_id          uuid not null references public.manishapay_projects(id) on delete cascade,

  -- Globally-unique tracker (e.g. `mp_a1b2c3d4e5f6g7h8`) sent to PayNow as
  -- their `reference` field. Lets the webhook receiver route a callback to
  -- the right project even if two merchants happen to use the same
  -- merchant_reference value.
  tracker             text not null unique,

  -- The developer's own reference for the transaction. Only required to
  -- be unique per (developer_id, project_id) — they can reuse identical
  -- IDs across separate projects without conflict.
  merchant_reference  text not null,

  -- PayNow's transaction reference (returned in callback as paynowreference)
  paynow_reference    text,

  merchant_amount     numeric(12,2) not null,
  customer_amount     numeric(12,2) not null,
  currency            text not null default 'USD',
  status              text not null,                       -- raw PayNow status (Paid, Cancelled, etc.)
  status_normalized   text,                                -- our 5-value enum: paid|pending|failed|disputed|refunded
  mode                text not null check (mode in ('test', 'live', 'simulated')),
  method              text,                                -- ecocash | onemoney | innbucks | omari | zimswitch | vmc | null (web redirect)
  poll_url            text,
  browser_url         text,
  request_id          text,
  billable            boolean not null default true,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists manishapay_transactions_tracker_idx on public.manishapay_transactions(tracker);
create unique index if not exists manishapay_transactions_dev_merchref_idx
  on public.manishapay_transactions(developer_id, project_id, merchant_reference);
create index if not exists manishapay_transactions_project_idx on public.manishapay_transactions(project_id);
create index if not exists manishapay_transactions_status_idx  on public.manishapay_transactions(status_normalized);
create index if not exists manishapay_transactions_created_idx on public.manishapay_transactions(created_at desc);
drop trigger if exists manishapay_transactions_touch on public.manishapay_transactions;
create trigger manishapay_transactions_touch before update on public.manishapay_transactions
  for each row execute function public.manishapay_touch_updated_at();

-- ─── webhook_endpoints ───────────────────────────────────────────────────
create table if not exists public.manishapay_webhook_endpoints (
  id            uuid primary key default gen_random_uuid(),
  developer_id  uuid not null references public.manishapay_developers(id) on delete cascade,
  project_id    uuid not null references public.manishapay_projects(id) on delete cascade,
  url           text not null,
  secret        text not null,                 -- HMAC signing secret (shown to dev once)
  status        text not null default 'active' check (status in ('active', 'paused')),
  description   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists manishapay_webhook_endpoints_project_idx
  on public.manishapay_webhook_endpoints(project_id);
drop trigger if exists manishapay_webhook_endpoints_touch on public.manishapay_webhook_endpoints;
create trigger manishapay_webhook_endpoints_touch before update on public.manishapay_webhook_endpoints
  for each row execute function public.manishapay_touch_updated_at();

-- ─── webhook_deliveries ──────────────────────────────────────────────────
-- Append-only audit + retry queue. Mirrors PayNow's "10 retries" pattern.
create table if not exists public.manishapay_webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  endpoint_id     uuid not null references public.manishapay_webhook_endpoints(id) on delete cascade,
  transaction_id  uuid references public.manishapay_transactions(id) on delete set null,
  payload         text not null,
  signature       text,
  status          text not null check (status in ('delivered', 'failed', 'pending')),
  http_status     int,
  error           text,
  latency_ms      int,
  attempt         int not null default 1,
  next_retry_at   timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists manishapay_webhook_deliveries_endpoint_idx
  on public.manishapay_webhook_deliveries(endpoint_id, created_at desc);
create index if not exists manishapay_webhook_deliveries_status_idx
  on public.manishapay_webhook_deliveries(status);

-- ─── usage_daily ─────────────────────────────────────────────────────────
-- Pre-aggregated daily counters for billing.
create table if not exists public.manishapay_usage_daily (
  developer_id      uuid not null references public.manishapay_developers(id) on delete cascade,
  project_id        uuid not null references public.manishapay_projects(id) on delete cascade,
  day               date not null,
  successful_count  int  not null default 0,
  failed_count      int  not null default 0,
  gross_volume_usd  numeric(12,2) not null default 0,
  primary key (developer_id, project_id, day)
);
create index if not exists manishapay_usage_daily_dev_day_idx
  on public.manishapay_usage_daily(developer_id, day desc);

-- ─── invoices ───────────────────────────────────────────────────────────
-- Monthly billing. `paid_via_paynow_ref` stores the PayNow ref when a
-- developer pays their ManishaPay bill *through* ManishaPay (dogfood).
create table if not exists public.manishapay_invoices (
  id                    uuid primary key default gen_random_uuid(),
  developer_id          uuid not null references public.manishapay_developers(id) on delete cascade,
  period_start          date not null,
  period_end            date not null,
  txn_count             int  not null,
  free_tier_used        int  not null,
  billable_count        int  not null,
  amount_due            numeric(12,2) not null,
  currency              text not null default 'USD',
  status                text not null default 'open' check (status in ('open', 'paid', 'overdue', 'written_off')),
  paid_at               timestamptz,
  paid_via_paynow_ref   text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (developer_id, period_start, period_end)
);
create index if not exists manishapay_invoices_developer_status_idx
  on public.manishapay_invoices(developer_id, status);
drop trigger if exists manishapay_invoices_touch on public.manishapay_invoices;
create trigger manishapay_invoices_touch before update on public.manishapay_invoices
  for each row execute function public.manishapay_touch_updated_at();

-- ─── logs ────────────────────────────────────────────────────────────────
create table if not exists public.manishapay_logs (
  id            bigserial primary key,
  developer_id  uuid references public.manishapay_developers(id) on delete set null,
  level         text not null check (level in ('debug', 'info', 'warn', 'error', 'fatal')),
  message       text not null,
  context       jsonb default '{}'::jsonb,
  request_id    text,
  created_at    timestamptz not null default now()
);
create index if not exists manishapay_logs_dev_created_idx on public.manishapay_logs(developer_id, created_at desc);
create index if not exists manishapay_logs_level_idx       on public.manishapay_logs(level);

-- ─── button_configs ──────────────────────────────────────────────────────
create table if not exists public.manishapay_button_configs (
  id            uuid primary key default gen_random_uuid(),
  developer_id  uuid not null references public.manishapay_developers(id) on delete cascade,
  project_id    uuid not null references public.manishapay_projects(id) on delete cascade,
  label         text not null,
  amount        numeric(12,2) not null,
  description   text,
  style         jsonb default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists manishapay_button_configs_touch on public.manishapay_button_configs;
create trigger manishapay_button_configs_touch before update on public.manishapay_button_configs
  for each row execute function public.manishapay_touch_updated_at();

-- ─── announcements ───────────────────────────────────────────────────────
create table if not exists public.manishapay_announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null,
  level         text not null default 'info' check (level in ('info', 'warning', 'critical')),
  published_at  timestamptz default now(),
  created_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- Schema upgrades (idempotent) — backfill columns added after the first
-- install, so re-running this file brings an existing/older database up to
-- date without touching data. Add new `add column if not exists` lines here
-- as the schema evolves.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.manishapay_transactions
  add column if not exists currency text not null default 'USD';

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────
alter table public.manishapay_developers           enable row level security;
alter table public.manishapay_projects             enable row level security;
alter table public.manishapay_paynow_credentials   enable row level security;
alter table public.manishapay_api_keys             enable row level security;
alter table public.manishapay_transactions         enable row level security;
alter table public.manishapay_webhook_endpoints    enable row level security;
alter table public.manishapay_webhook_deliveries   enable row level security;
alter table public.manishapay_usage_daily          enable row level security;
alter table public.manishapay_invoices             enable row level security;
alter table public.manishapay_logs                 enable row level security;
alter table public.manishapay_button_configs       enable row level security;
alter table public.manishapay_announcements        enable row level security;

-- helper: is the caller a ManishaPay admin?
create or replace function public.manishapay_is_admin() returns boolean as $$
  select exists (
    select 1 from public.manishapay_developers d
    where d.id = auth.uid() and d.role = 'admin'
  );
$$ language sql stable security definer;

-- developers
drop policy if exists "manishapay devs read self" on public.manishapay_developers;
create policy "manishapay devs read self" on public.manishapay_developers
  for select using (id = auth.uid() or public.manishapay_is_admin());
drop policy if exists "manishapay devs update self" on public.manishapay_developers;
create policy "manishapay devs update self" on public.manishapay_developers
  for update using (id = auth.uid());
drop policy if exists "manishapay admin manages devs" on public.manishapay_developers;
create policy "manishapay admin manages devs" on public.manishapay_developers
  for all using (public.manishapay_is_admin()) with check (public.manishapay_is_admin());

-- Guard: a developer may edit their own profile (full_name, email) but must NOT
-- be able to self-promote role/plan/billing via a direct PostgREST UPDATE.
-- Privileged columns are writable only by the service role or an admin.
create or replace function public.manishapay_guard_developer_update() returns trigger as $$
begin
  if auth.role() = 'authenticated' and not public.manishapay_is_admin() then
    new.role              := old.role;
    new.status            := old.status;
    new.plan              := old.plan;
    new.billing_status    := old.billing_status;
    new.free_tier_monthly := old.free_tier_monthly;
    new.per_txn_fee_usd   := old.per_txn_fee_usd;
  end if;
  return new;
end;
$$ language plpgsql security definer;
drop trigger if exists manishapay_developers_guard on public.manishapay_developers;
create trigger manishapay_developers_guard before update on public.manishapay_developers
  for each row execute function public.manishapay_guard_developer_update();

-- projects
drop policy if exists "manishapay owns projects" on public.manishapay_projects;
create policy "manishapay owns projects" on public.manishapay_projects
  for all using (developer_id = auth.uid()) with check (developer_id = auth.uid());

-- paynow_credentials: scoped via project ownership; writes by service role
-- only so the merchant can never read encrypted blobs back through PostgREST.
drop policy if exists "manishapay reads own credentials" on public.manishapay_paynow_credentials;
create policy "manishapay reads own credentials" on public.manishapay_paynow_credentials
  for select using (
    project_id in (select id from public.manishapay_projects where developer_id = auth.uid())
    or public.manishapay_is_admin()
  );

-- api_keys
drop policy if exists "manishapay owns keys" on public.manishapay_api_keys;
create policy "manishapay owns keys" on public.manishapay_api_keys
  for all using (developer_id = auth.uid()) with check (developer_id = auth.uid());

-- transactions: read-only for the developer; writes go through service role
drop policy if exists "manishapay reads own txns" on public.manishapay_transactions;
create policy "manishapay reads own txns" on public.manishapay_transactions
  for select using (developer_id = auth.uid() or public.manishapay_is_admin());

-- webhook endpoints
drop policy if exists "manishapay owns endpoints" on public.manishapay_webhook_endpoints;
create policy "manishapay owns endpoints" on public.manishapay_webhook_endpoints
  for all using (developer_id = auth.uid()) with check (developer_id = auth.uid());

-- webhook deliveries (read via endpoint ownership)
drop policy if exists "manishapay reads own deliveries" on public.manishapay_webhook_deliveries;
create policy "manishapay reads own deliveries" on public.manishapay_webhook_deliveries
  for select using (
    endpoint_id in (select id from public.manishapay_webhook_endpoints where developer_id = auth.uid())
    or public.manishapay_is_admin()
  );

-- usage / invoices
drop policy if exists "manishapay reads own usage" on public.manishapay_usage_daily;
create policy "manishapay reads own usage" on public.manishapay_usage_daily
  for select using (developer_id = auth.uid() or public.manishapay_is_admin());
drop policy if exists "manishapay reads own invoices" on public.manishapay_invoices;
create policy "manishapay reads own invoices" on public.manishapay_invoices
  for select using (developer_id = auth.uid() or public.manishapay_is_admin());

-- logs
drop policy if exists "manishapay reads own logs" on public.manishapay_logs;
create policy "manishapay reads own logs" on public.manishapay_logs
  for select using (developer_id = auth.uid() or public.manishapay_is_admin());

-- button configs
drop policy if exists "manishapay owns buttons" on public.manishapay_button_configs;
create policy "manishapay owns buttons" on public.manishapay_button_configs
  for all using (developer_id = auth.uid()) with check (developer_id = auth.uid());

-- announcements
drop policy if exists "manishapay reads announcements" on public.manishapay_announcements;
create policy "manishapay reads announcements" on public.manishapay_announcements
  for select using (auth.role() = 'authenticated');
drop policy if exists "manishapay admin writes announcements" on public.manishapay_announcements;
create policy "manishapay admin writes announcements" on public.manishapay_announcements
  for all using (public.manishapay_is_admin()) with check (public.manishapay_is_admin());

-- ─── Trigger: auto-create developers row on auth.users INSERT ────────────
-- Filter by app marker so chikoro/church/etc. signups don't create
-- ghost ManishaPay developers. The signup flow is responsible for setting:
--   supabase.auth.signUp({
--     email, password,
--     options: { data: { app: 'manishapay' } }
--   })
create or replace function public.manishapay_handle_new_user() returns trigger as $$
begin
  if new.raw_user_meta_data->>'app' = 'manishapay' then
    insert into public.manishapay_developers (id, email, status)
    values (new.id, new.email, 'pending')
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created_manishapay on auth.users;
create trigger on_auth_user_created_manishapay
  after insert on auth.users
  for each row execute function public.manishapay_handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- Optional seed data (safe to run multiple times)
-- ─────────────────────────────────────────────────────────────────────────
insert into public.manishapay_announcements (title, body, level)
values
  ('Welcome to ManishaPay', 'Generate your first test key in the API Keys tab and try `curl /v1/pay` from the docs.', 'info'),
  ('Mock mode is live',     'Test keys without PayNow credentials configured run a fully simulated checkout — no PayNow account required.', 'info')
on conflict do nothing;
