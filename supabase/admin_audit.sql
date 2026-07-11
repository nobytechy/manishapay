-- ─── Admin action audit trail ────────────────────────────────────────────
-- Append-only record of every privileged admin action (suspend/blacklist,
-- role change, plan/billing change). Run this once on the Supabase project
-- (SQL Editor) to enable the audit trail in the admin console.
--
-- Depends on public.manishapay_is_admin() from install.sql.

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

-- Admins can read the whole trail.
drop policy if exists manishapay_admin_audit_read on public.manishapay_admin_audit;
create policy manishapay_admin_audit_read on public.manishapay_admin_audit
  for select using (public.manishapay_is_admin());

-- Admins may only append rows attributed to themselves (no editing history).
drop policy if exists manishapay_admin_audit_insert on public.manishapay_admin_audit;
create policy manishapay_admin_audit_insert on public.manishapay_admin_audit
  for insert with check (public.manishapay_is_admin() and actor_id = auth.uid());
