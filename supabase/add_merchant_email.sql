-- ─── Per-credential PayNow merchant email ─────────────────────────────────
-- Adds the merchant's PayNow-registered email to each stored credential so
-- ManishaPay can supply the correct `authemail`. Required for mobile /
-- Express-Checkout payments, and in TEST mode PayNow rejects any authemail
-- that isn't the merchant's registered address. Previously this was a single
-- global env var (PAYNOW_TEST_AUTHEMAIL) — that can't work for multiple
-- merchants, so it now lives per credential.
--
-- Run once on the Supabase project (SQL Editor). Safe to re-run.

alter table public.manishapay_paynow_credentials
  add column if not exists merchant_email text;
