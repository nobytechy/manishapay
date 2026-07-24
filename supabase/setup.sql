-- ════════════════════════════════════════════════════════════════════════
--  ManishaPay — pending migrations (RUN ONCE)
--
--  Apply this whole file once in the Supabase SQL Editor (project
--  ywfuydrreunrgfnyjzlv). It is fully idempotent — safe to re-run.
--  Requires the base schema from install.sql to already be applied
--  (provides manishapay_is_admin() and manishapay_touch_updated_at()).
--
--  Covers:
--    1.  Per-credential PayNow merchant email (authemail)
--    2.  Admin action audit trail
--    3.  Developer support tickets / queries
--    4.  Idempotency keys (no duplicate charges on retry)
--    5.  Platform settings (dynamic WhatsApp / UltraMsg)
--    6.  Customer phone on transactions (WhatsApp receipts)
--    7.  Refund tracking on transactions (bridge)
--    8.  Restricted / scoped API keys (scopes, expiry, IP allowlist)
--    9.  No-code payment links (hosted checkout)
--    10. Subscriptions (recurring billing)
--    11. Team / organisation members
--    12. Flat-team shared access (teammate RLS + is_teammate function)
-- ════════════════════════════════════════════════════════════════════════


-- Fail fast on lock contention instead of deadlocking. The live app may be
-- querying these tables; if a statement can't get its lock within 5s it errors
-- cleanly — just re-run the script (it's idempotent). For the smoothest run,
-- apply this when traffic is low (or right after a fresh reset, before use).
set lock_timeout = '5s';


-- ── 1. Per-credential PayNow merchant email ───────────────────────────────
-- Sent to PayNow as `authemail`. Required for mobile / Express-Checkout, and
-- in TEST mode must equal the merchant's registered email. Previously a single
-- global env var — now per credential so multiple merchants work.
alter table public.manishapay_paynow_credentials
  add column if not exists merchant_email text;


-- ── 2. Admin action audit trail ───────────────────────────────────────────
create table if not exists public.manishapay_admin_audit (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.manishapay_developers(id) on delete set null,
  actor_email  text,
  action       text not null,
  target_id    uuid,
  target_email text,
  detail       jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists manishapay_admin_audit_created_idx
  on public.manishapay_admin_audit (created_at desc);

alter table public.manishapay_admin_audit enable row level security;

drop policy if exists manishapay_admin_audit_read on public.manishapay_admin_audit;
create policy manishapay_admin_audit_read on public.manishapay_admin_audit
  for select using (public.manishapay_is_admin());

drop policy if exists manishapay_admin_audit_insert on public.manishapay_admin_audit;
create policy manishapay_admin_audit_insert on public.manishapay_admin_audit
  for insert with check (public.manishapay_is_admin() and actor_id = auth.uid());


-- ── 3. Developer support tickets / queries ────────────────────────────────
create table if not exists public.manishapay_support_tickets (
  id              uuid primary key default gen_random_uuid(),
  developer_id    uuid not null references public.manishapay_developers(id) on delete cascade,
  developer_email text,
  category        text not null default 'other'
                    check (category in ('paynow', 'billing', 'bug', 'account', 'other')),
  subject         text not null,
  message         text not null,
  status          text not null default 'open'
                    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  admin_response  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists manishapay_support_dev_idx
  on public.manishapay_support_tickets(developer_id);
create index if not exists manishapay_support_status_idx
  on public.manishapay_support_tickets(status, created_at desc);

drop trigger if exists manishapay_support_touch on public.manishapay_support_tickets;
create trigger manishapay_support_touch before update on public.manishapay_support_tickets
  for each row execute function public.manishapay_touch_updated_at();

alter table public.manishapay_support_tickets enable row level security;

drop policy if exists manishapay_support_read on public.manishapay_support_tickets;
create policy manishapay_support_read on public.manishapay_support_tickets
  for select using (developer_id = auth.uid() or public.manishapay_is_admin());

drop policy if exists manishapay_support_insert on public.manishapay_support_tickets;
create policy manishapay_support_insert on public.manishapay_support_tickets
  for insert with check (developer_id = auth.uid());

drop policy if exists manishapay_support_admin_update on public.manishapay_support_tickets;
create policy manishapay_support_admin_update on public.manishapay_support_tickets
  for update using (public.manishapay_is_admin()) with check (public.manishapay_is_admin());

-- ── 4. Idempotency keys (prevent duplicate charges on retry) ──────────────
-- POST /v1/pay stores its response per (developer, Idempotency-Key); a repeat
-- with the same key returns the stored response instead of charging again.
-- Written only by the service-role backend, so RLS denies client access.
create table if not exists public.manishapay_idempotency (
  id           uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.manishapay_developers(id) on delete cascade,
  idem_key     text not null,
  status_code  int  not null,
  response     jsonb not null,
  created_at   timestamptz not null default now(),
  unique (developer_id, idem_key)
);
create index if not exists manishapay_idempotency_lookup
  on public.manishapay_idempotency(developer_id, idem_key);
alter table public.manishapay_idempotency enable row level security;


-- ── 5. Platform settings (super-admin) — dynamic WhatsApp (UltraMsg) ───────
-- Singleton row. The UltraMsg token is encrypted with the same envelope
-- helper as PayNow credentials; only the service-role backend reads it.
create table if not exists public.manishapay_platform_settings (
  id                        boolean primary key default true check (id),
  ultramsg_instance         text,
  integration_id_encrypted  text,
  integration_key_encrypted text,
  data_key_encrypted        text,
  whatsapp_enabled          boolean not null default false,
  updated_at                timestamptz not null default now()
);
alter table public.manishapay_platform_settings enable row level security;

-- Platform receiving / payout details (super-admin configurable, not hardcoded).
-- Bank fields are display-for-payer (shown on ManishaPay's own invoices) so they
-- stay plaintext; the billing-PayNow credential is encrypted like every other.
alter table public.manishapay_platform_settings
  add column if not exists bank_name                     text;
alter table public.manishapay_platform_settings
  add column if not exists bank_account_name             text;
alter table public.manishapay_platform_settings
  add column if not exists bank_account_number           text;
alter table public.manishapay_platform_settings
  add column if not exists bank_branch                   text;
alter table public.manishapay_platform_settings
  add column if not exists bank_swift                    text;
alter table public.manishapay_platform_settings
  add column if not exists bank_currency                 text;
alter table public.manishapay_platform_settings
  add column if not exists bank_enabled                  boolean not null default false;
alter table public.manishapay_platform_settings
  add column if not exists billing_notes                 text;
-- ManishaPay's OWN PayNow account, used to collect developer/platform fees.
alter table public.manishapay_platform_settings
  add column if not exists billing_paynow_config_encrypted   text;
alter table public.manishapay_platform_settings
  add column if not exists billing_paynow_datakey_encrypted  text;
alter table public.manishapay_platform_settings
  add column if not exists billing_paynow_enabled        boolean not null default false;


-- ── 5b. Active API key + retrievable TEST keys ────────────────────────────
-- is_active: the developer's currently-in-use key (one per developer), remembered
-- server-side so it persists across devices. key_encrypted: TEST keys are also
-- stored encrypted so they can be re-revealed / loaded on any device (like Stripe
-- test keys). LIVE keys keep only the bcrypt hash and are never retrievable.
alter table public.manishapay_api_keys
  add column if not exists is_active               boolean not null default false;
alter table public.manishapay_api_keys
  add column if not exists key_encrypted           text;
alter table public.manishapay_api_keys
  add column if not exists key_data_key_encrypted  text;


-- ── 6. Customer phone on transactions (for WhatsApp receipts) ──────────────
alter table public.manishapay_transactions
  add column if not exists customer_phone text;

-- ── 7. Refund tracking on transactions (bridge: PayNow moves the money) ────
alter table public.manishapay_transactions
  add column if not exists refund_amount  numeric(12,2);
alter table public.manishapay_transactions
  add column if not exists refund_reason  text;
alter table public.manishapay_transactions
  add column if not exists refunded_at    timestamptz;

-- ── 8. Restricted / scoped API keys ───────────────────────────────────────
-- scopes: 'pay' (create payments/refunds) and 'read' (status/lookups). A key
-- without 'pay' is read-only. expires_at expires the key. ip_allowlist, when
-- set, restricts the key to those source IPs.
alter table public.manishapay_api_keys
  add column if not exists scopes       text[] not null default array['pay','read']::text[];
alter table public.manishapay_api_keys
  add column if not exists expires_at   timestamptz;
alter table public.manishapay_api_keys
  add column if not exists ip_allowlist text[];


-- ── 9. No-code payment links (hosted checkout) ────────────────────────────
create table if not exists public.manishapay_payment_links (
  id           uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.manishapay_developers(id) on delete cascade,
  project_id   uuid not null references public.manishapay_projects(id) on delete cascade,
  slug         text not null unique,
  title        text not null,
  amount       numeric(12,2) not null,
  currency     text not null default 'USD',
  description  text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists manishapay_payment_links_dev_idx
  on public.manishapay_payment_links(developer_id);
alter table public.manishapay_payment_links enable row level security;

drop policy if exists manishapay_links_owner on public.manishapay_payment_links;
create policy manishapay_links_owner on public.manishapay_payment_links
  for all using (developer_id = auth.uid()) with check (developer_id = auth.uid());


-- ── 10. Subscriptions (recurring billing) ─────────────────────────────────
create table if not exists public.manishapay_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  developer_id   uuid not null references public.manishapay_developers(id) on delete cascade,
  project_id     uuid not null references public.manishapay_projects(id) on delete cascade,
  title          text not null,
  amount         numeric(12,2) not null,
  currency       text not null default 'USD',
  billing_interval text not null default 'monthly' check (billing_interval in ('weekly','monthly','yearly')),
  customer_email text,
  customer_phone text,
  status         text not null default 'active' check (status in ('active','paused','cancelled')),
  next_charge_at timestamptz,
  last_charge_at timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists manishapay_subs_dev_idx on public.manishapay_subscriptions(developer_id);
alter table public.manishapay_subscriptions enable row level security;

drop policy if exists manishapay_subs_owner on public.manishapay_subscriptions;
create policy manishapay_subs_owner on public.manishapay_subscriptions
  for all using (developer_id = auth.uid()) with check (developer_id = auth.uid());


-- ── 11. Team / organisation members ───────────────────────────────────────
-- An account owner can invite teammates (by email) with a role. Lightweight
-- membership record; the owner remains the data owner.
create table if not exists public.manishapay_team_members (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.manishapay_developers(id) on delete cascade,
  member_email  text not null,
  member_id     uuid references public.manishapay_developers(id) on delete set null,
  role          text not null default 'member' check (role in ('member','admin')),
  status        text not null default 'invited' check (status in ('invited','active','removed')),
  created_at    timestamptz not null default now(),
  unique (owner_id, member_email)
);
create index if not exists manishapay_team_owner_idx on public.manishapay_team_members(owner_id);
-- widen roles to include 'viewer' (idempotent: drop + re-add)
alter table public.manishapay_team_members drop constraint if exists manishapay_team_members_role_check;
alter table public.manishapay_team_members add constraint manishapay_team_members_role_check check (role in ('member','admin','viewer'));
alter table public.manishapay_team_members enable row level security;

drop policy if exists manishapay_team_owner on public.manishapay_team_members;
create policy manishapay_team_owner on public.manishapay_team_members
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- A member can see rows where they are the member.
drop policy if exists manishapay_team_member_read on public.manishapay_team_members;
create policy manishapay_team_member_read on public.manishapay_team_members
  for select using (member_id = auth.uid());


-- ── 12. Flat-team shared access ───────────────────────────────────────────
-- An ACTIVE teammate of an owner can access that owner's account data. These
-- policies are additive (RLS is permissive) — a stranger still sees nothing.
create or replace function public.manishapay_is_teammate(owner uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.manishapay_team_members tm
    where tm.owner_id = owner and tm.member_id = auth.uid() and tm.status = 'active'
  );
$$;

drop policy if exists manishapay_team_dev_read on public.manishapay_developers;
create policy manishapay_team_dev_read on public.manishapay_developers
  for select using (public.manishapay_is_teammate(id));

drop policy if exists manishapay_team_projects on public.manishapay_projects;
create policy manishapay_team_projects on public.manishapay_projects
  for all using (public.manishapay_is_teammate(developer_id)) with check (public.manishapay_is_teammate(developer_id));

drop policy if exists manishapay_team_keys on public.manishapay_api_keys;
create policy manishapay_team_keys on public.manishapay_api_keys
  for all using (public.manishapay_is_teammate(developer_id)) with check (public.manishapay_is_teammate(developer_id));

drop policy if exists manishapay_team_endpoints on public.manishapay_webhook_endpoints;
create policy manishapay_team_endpoints on public.manishapay_webhook_endpoints
  for all using (public.manishapay_is_teammate(developer_id)) with check (public.manishapay_is_teammate(developer_id));

drop policy if exists manishapay_team_links on public.manishapay_payment_links;
create policy manishapay_team_links on public.manishapay_payment_links
  for all using (public.manishapay_is_teammate(developer_id)) with check (public.manishapay_is_teammate(developer_id));

drop policy if exists manishapay_team_subs on public.manishapay_subscriptions;
create policy manishapay_team_subs on public.manishapay_subscriptions
  for all using (public.manishapay_is_teammate(developer_id)) with check (public.manishapay_is_teammate(developer_id));

drop policy if exists manishapay_team_txns on public.manishapay_transactions;
create policy manishapay_team_txns on public.manishapay_transactions
  for select using (public.manishapay_is_teammate(developer_id));

drop policy if exists manishapay_team_invoices on public.manishapay_invoices;
create policy manishapay_team_invoices on public.manishapay_invoices
  for select using (public.manishapay_is_teammate(developer_id));

drop policy if exists manishapay_team_creds on public.manishapay_paynow_credentials;
create policy manishapay_team_creds on public.manishapay_paynow_credentials
  for select using (public.manishapay_is_teammate(
    (select p.developer_id from public.manishapay_projects p where p.id = project_id)));

drop policy if exists manishapay_team_deliveries on public.manishapay_webhook_deliveries;
create policy manishapay_team_deliveries on public.manishapay_webhook_deliveries
  for select using (public.manishapay_is_teammate(
    (select e.developer_id from public.manishapay_webhook_endpoints e where e.id = endpoint_id)));

-- ════════════════════════════════════════════════════════════════════════
--  Multi-gateway orchestration: provider column + generic gateway credentials
--  (2026-07 provider-abstraction release — every gateway stores creds here)
-- ════════════════════════════════════════════════════════════════════════

-- Which gateway processed each transaction. Backfills existing rows → 'paynow'.
alter table public.manishapay_transactions
  add column if not exists provider text not null default 'paynow';

-- Which gateway collects on a payment link / bills a subscription. Backfills
-- existing rows → 'paynow', so all pre-multi-gateway links & subs keep working.
alter table public.manishapay_payment_links
  add column if not exists provider text not null default 'paynow';
alter table public.manishapay_subscriptions
  add column if not exists provider text not null default 'paynow';

-- Multi-method hosted checkout: the methods a link offers the customer, plus an
-- optional per-method gateway override. Both null on legacy links → the link
-- behaves as a single-gateway checkout (fully backward compatible).
alter table public.manishapay_payment_links
  add column if not exists enabled_methods jsonb;
alter table public.manishapay_payment_links
  add column if not exists method_routing jsonb;

-- One generic, encrypted credential store for ALL gateways. Each gateway keeps
-- its own config shape (per its credentialSchema) as an envelope-encrypted blob,
-- so adding a new gateway never requires a schema change.
create table if not exists public.manishapay_gateway_credentials (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.manishapay_projects(id) on delete cascade,
  provider           text not null,                       -- 'stripe' | 'paystack' | ...
  mode               text not null check (mode in ('test','live')),
  config_encrypted   text not null,                       -- envelope-sealed JSON config
  data_key_encrypted text not null,
  hint               text,                                -- non-secret display label (e.g. last4)
  status             text not null default 'active',
  added_by           uuid,
  last_used_at       timestamptz,
  rotated_at         timestamptz,
  created_at         timestamptz not null default now()
);

-- Exactly one active credential per (project, provider, mode).
create unique index if not exists manishapay_gwcred_one_active
  on public.manishapay_gateway_credentials (project_id, provider, mode)
  where status = 'active';
create index if not exists manishapay_gwcred_lookup
  on public.manishapay_gateway_credentials (project_id, provider, mode, status);

-- Least privilege: enable RLS with NO policies → readable/writable ONLY by the
-- service role (the backend). The dashboard never touches this table directly;
-- it reads credential metadata exclusively through the ManishaPay API.
alter table public.manishapay_gateway_credentials enable row level security;

-- ════════════════════════════════════════════════════════════════════════
--  Done. After this runs: PayNow merchant email, admin audit trail, support
--  desk, idempotency keys, dynamic WhatsApp settings, customer-phone receipts,
--  and multi-gateway provider credentials are all live.
-- ════════════════════════════════════════════════════════════════════════
