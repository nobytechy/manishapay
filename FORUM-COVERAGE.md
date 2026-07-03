# ManishaPay × PayNow Developer Forum — Coverage Map

Every recurring problem on the [PayNow forum](https://forums.paynow.co.zw/) mapped
to how ManishaPay handles it. This is both the product thesis ("ManishaPay makes
the forum problems disappear") and our coverage checklist.

Legend: ✅ handled · 🔶 partial / to-improve · ⬜ gap to build

---

## A. PayNow fails when called from Supabase  ✅ (architectural)
> "Paynow API Access – Supabase IP Restrictions", "Paynow failing on supabase",
> "Connection Reset from Supabase Edge Functions (NodeJS SDK)", "Connection Reset (os error 104)"

PayNow has blocked several Supabase egress IP ranges (abuse by other merchants),
so calling PayNow **directly from Supabase Edge Functions** fails with connection
resets. **ManishaPay runs every PayNow call from a dedicated Node API (Render /
cPanel) — never from Supabase.** The merchant's app (or Edge Function) calls
ManishaPay; ManishaPay calls PayNow from non-blocked IPs; Supabase is used only
as the database. This single design decision removes the most-reported failure.

## B. Amount format — `System.FormatException: '2.00'`  ✅
> "System.FormatException: '2.00' was not in a correct format (C#/.NET)"

`normalizeAmount()` coerces any amount (number, `"2,50"`, `"2.00 "`) to PayNow's
required `0.00` invariant string before sending. (Unit-tested.)

## C. Hash mismatch  ✅
> "HashMismatchException", "Getting a hash error"

`hash.compute()` / `hash.verify()` build the SHA-512 hash in PayNow's exact field
order and verify every response — tested byte-for-byte against PayNow's own
published example. The `/v1/tools/hash` endpoint returns an expected-vs-actual
diff so a merchant can debug their own hashing in seconds.

## D. Express checkout — no PIN prompt  ✅
> "In app mobile payment checkout not sending pin prompt", "Express payout problems… phone prompts"

`normalizePhone()` rewrites the number to `2637XXXXXXXX` MSISDN form and sends
`method` + `phone` together in the `/remotetransaction` payload — without that,
PayNow silently skips the prompt.

## E. Status not updating  ✅
> "Payment Status Not Updating After EcoCash PIN", "Payments status updated to paid in db", "Status not set error"

Three layers: (1) PayNow result-URL **webhook** → we update the txn; (2) **poll
fallback** on `/v1/pay/:ref/status` re-checks PayNow live; (3) `normalizeStatus()`
maps PayNow's 8 raw statuses to a stable 5-value enum. "Status not set" is avoided
because we always send the required `status` field on initiate. Webhook
**idempotency** stops PayNow's retries double-processing.

## F. Test vs live confusion  🔶
> "The merchant is currently in testing and cannot accept payments", "Payment Integration Still in Test Mode", "Making Keys Live"

ManishaPay keys are explicitly `mp_test_*` / `mp_live_*`, and the API returns the
mode on every call, so there's no ambiguity about which integration ran.
**To improve:** map PayNow's "merchant is currently in testing" rejection string
to a targeted resolution (use a live key + a live PayNow integration, or test the
sandbox). → implemented in `paynow.js` error mapping.

## G. Network connection resets / timeouts  ✅
> "Connection Reset (os error 104)", intermittent upstream failures

`withRetry()` wraps PayNow calls with exponential backoff; upstream 5xx surfaces a
clean `UPSTREAM` error rather than a raw stack trace.

## H. Getting started — keys & sandbox  ✅
> "API Key – how do I obtain one", "Accessing the Integration Sandbox / Test Mode", "API request for testing"

The ManishaPay dashboard issues API keys and a sandbox. With the **shared sandbox
test integration** wired (`PAYNOW_TEST_INTEGRATION_*`), a test key hits real PayNow
test with zero per-project setup; without it, the built-in **simulator** lets devs
onboard in 30s with no PayNow account at all.

## I. Currency (ZWL / USD)  ✅
> "Currency code rectification"

PayNow currency is a property of the integration (the sandbox account is ZWL).
`/v1/pay` now accepts an optional `currency` (`USD` / `ZWL`), stores it on the
transaction, and **echoes it back on every response** (initiate, status, and the
signed merchant webhook) — so there's no ambiguity about which currency a payment
ran in. *(Future: store currency per credential to also reject obvious mismatches
server-side.)*

## J. Payment methods — Innbucks / Omari / Zimswitch / QR  ✅
> "Innbucks integration", "Qr code payment tickets"

`method` enum supports `ecocash, onemoney, innbucks, omari, zimswitch, vmc`.
✅ QR / payment-ticket flow: `/v1/pay` returns a `qr_code` (scannable PNG data URL
of the checkout URL) so a merchant can show a ticket the customer scans to pay.

## K. Platform plugins (WHMCS / WooCommerce / Shopify / Wix / EDD / Android / captive portal / Firebase / Lovable)  🔶
> many "plugin not working" threads

ManishaPay's answer is one clean REST API + SDKs (Node, PHP) + a drop-in
`checkout.js` widget, so any platform integrates once against a stable surface
instead of fighting per-platform plugins. ✅ WordPress/WooCommerce plugin shipped;
🔶 WHMCS gateway module scaffolded (`whmcs-module/`, BETA — needs a WHMCS test
install); ✅ Shopify integration guide (`docs/SHOPIFY.md`) — note a *native* Shopify
Checkout gateway is gated behind Shopify Partner approval, so the widget/offsite
flow is the supported path.

## L. Platform wants "API Key / API Secret / Webhook Secret"  ✅
> "Paynow API Credentials for Sopraent Integration" — need an API Key, API Secret &
> Webhook Secret, can't find where to generate them (2026). Recurs for WHMCS, ISP
> billing systems, and any Stripe-style platform.

PayNow never issues these — it only gives an **Integration ID + Integration Key** and
authenticates by SHA‑512 hashing with that key; account verification is **not** needed
for test transactions. ManishaPay **is** the missing layer: it wraps the Integration
ID/Key and issues the credential model these platforms expect — a scoped **API key**
(`mp_test_*` / `mp_live_*`) plus per-endpoint **HMAC‑SHA256‑signed webhooks** (the
"webhook secret"). Map: platform *API Key/Secret* → ManishaPay key; platform *Webhook
Secret* → the endpoint's signing secret. This is ManishaPay's core positioning.

---

## Open punch-list (to fully "cover the forum")
1. ✅ PayNow error-string → friendly resolution mapping (merchant-in-testing, invalid id, currency) — done in `paynow.js` (`paynowResolution`).
2. ✅ Surface integration currency on `/v1/pay` responses (initiate + status + webhook). *(Per-credential currency + server-side mismatch rejection = future.)*
3. ✅ QR-code / payment-ticket flow — `qr_code` on `/v1/pay`.
4. 🔶 Platform adapters: ✅ WooCommerce (WordPress plugin) · 🔶 WHMCS (`whmcs-module/`, BETA — needs WHMCS test install) · ✅ Shopify guide (`docs/SHOPIFY.md`; native gateway gated by Shopify). Separate artifacts — not part of the Render/Netlify deploy.

_Paste new forum threads here and we'll slot them into this map and close gaps._
