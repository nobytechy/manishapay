-- ════════════════════════════════════════════════════════════════════════
--  ManishaPay — RESET / WIPE   ⚠️  DESTRUCTIVE — DELETES ALL APP DATA
--
--  Run ONLY when you want a clean slate. This TRUNCATEs every ManishaPay
--  table. It does NOT touch auth.users, and it does NOT touch any other app
--  in this shared Supabase project (chikoro / church / etc.).
--
--  Kept SEPARATE from setup.sql on purpose — a routine setup re-run must never
--  be able to wipe your data. After wiping, run setup.sql again is NOT needed
--  (the tables still exist — only their rows are cleared).
-- ════════════════════════════════════════════════════════════════════════

truncate table
  public.manishapay_admin_audit,
  public.manishapay_announcements,
  public.manishapay_api_keys,
  public.manishapay_button_configs,
  public.manishapay_idempotency,
  public.manishapay_invoices,
  public.manishapay_logs,
  public.manishapay_payment_links,
  public.manishapay_paynow_credentials,
  public.manishapay_platform_settings,
  public.manishapay_projects,
  public.manishapay_subscriptions,
  public.manishapay_support_tickets,
  public.manishapay_team_members,
  public.manishapay_transactions,
  public.manishapay_usage_daily,
  public.manishapay_webhook_deliveries,
  public.manishapay_webhook_endpoints,
  public.manishapay_developers
restart identity cascade;

-- ── After the wipe: become super-admin ────────────────────────────────────
-- 1. Sign up nobytechy@gmail.com in the app (this creates the developer row).
-- 2. THEN run the line below to promote yourself:
--
--    update public.manishapay_developers
--    set role = 'admin', status = 'active'
--    where email = 'nobytechy@gmail.com';
--
-- (auth.users is untouched by the wipe, so if you already signed up you can
--  just run that update — no need to re-register.)
