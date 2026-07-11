-- ════════════════════════════════════════════════════════════════════════
--  ManishaPay — pending migrations (RUN ONCE)
--
--  Apply this whole file once in the Supabase SQL Editor (project
--  ywfuydrreunrgfnyjzlv). It is fully idempotent — safe to re-run.
--  Requires the base schema from install.sql to already be applied
--  (provides manishapay_is_admin() and manishapay_touch_updated_at()).
--
--  Covers:
--    1. Per-credential PayNow merchant email (authemail)
--    2. Admin action audit trail
--    3. Developer support tickets / queries
-- ════════════════════════════════════════════════════════════════════════


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

-- ════════════════════════════════════════════════════════════════════════
--  Done. After this runs: PayNow merchant email, admin audit trail, support
--  desk, idempotency keys, dynamic WhatsApp settings, and customer-phone
--  receipts are all live.
-- ════════════════════════════════════════════════════════════════════════
