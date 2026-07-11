-- ─── Developer support tickets / queries ─────────────────────────────────
-- Lets developers raise issues/queries that the super-admin sees and responds
-- to in the admin console. Run once on the Supabase project (SQL Editor).
--
-- Depends on public.manishapay_is_admin() and public.manishapay_touch_updated_at()
-- from install.sql.

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

-- A developer sees their own tickets; an admin sees all.
drop policy if exists manishapay_support_read on public.manishapay_support_tickets;
create policy manishapay_support_read on public.manishapay_support_tickets
  for select using (developer_id = auth.uid() or public.manishapay_is_admin());

-- A developer may raise a ticket attributed to themselves.
drop policy if exists manishapay_support_insert on public.manishapay_support_tickets;
create policy manishapay_support_insert on public.manishapay_support_tickets
  for insert with check (developer_id = auth.uid());

-- Only an admin can respond / change status.
drop policy if exists manishapay_support_admin_update on public.manishapay_support_tickets;
create policy manishapay_support_admin_update on public.manishapay_support_tickets
  for update using (public.manishapay_is_admin()) with check (public.manishapay_is_admin());
