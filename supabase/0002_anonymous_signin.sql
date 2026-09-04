-- ════════════════════════════════════════════════════════════════════════════
-- 0002 — Anonymous sign-in support
--
-- Forward-only. Apply after install.sql + setup.sql.
--
-- Why:
--   A merchant can now enter the dashboard with supabase.auth.signInAnonymously()
--   — no email, no password, no OAuth. Supabase creates a real auth.users row
--   with a stable UUID, so /v1/auth/bootstrap still creates the matching
--   manishapay_developers row and every FK below it behaves exactly as before.
--
--   The ONLY thing that breaks is `email text not null unique`: an anonymous
--   user has no email yet. Dropping NOT NULL is enough — Postgres permits many
--   NULLs under a unique constraint, so unrelated anonymous accounts never
--   collide, and the constraint still blocks two permanent accounts sharing
--   an address.
--
-- Nothing is lost when the merchant later links an email or a provider:
-- linking attaches an identity to the SAME auth.users row, so the developer id
-- never changes and projects / credentials / keys / transactions stay attached.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.manishapay_developers
  alter column email drop not null;

-- Guard rail: a permanent (non-anonymous) account must still have an email.
-- Anonymous rows are marked by status = 'anonymous'; bootstrap flips the row
-- to 'pending'/'active' at the moment an identity is linked.
alter table public.manishapay_developers
  drop constraint if exists manishapay_developers_status_check;

alter table public.manishapay_developers
  add constraint manishapay_developers_status_check
  check (status in ('anonymous', 'pending', 'active', 'suspended', 'deleted'));

alter table public.manishapay_developers
  drop constraint if exists manishapay_developers_email_required;

alter table public.manishapay_developers
  add constraint manishapay_developers_email_required
  check (status = 'anonymous' or email is not null);

-- Lets operators find accounts that were never secured (e.g. to sweep stale
-- ones), and keeps the "is this account real yet" check cheap.
create index if not exists manishapay_developers_anonymous_idx
  on public.manishapay_developers (created_at)
  where status = 'anonymous';

comment on column public.manishapay_developers.email is
  'Null only while status = ''anonymous''. Set when the merchant links an email or an OAuth identity — the row id never changes, so nothing they built is lost.';
