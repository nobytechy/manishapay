# ManishaPay gateway for WHMCS — BETA

> ⚠️ **BETA / untested in production.** This module follows the documented WHMCS
> gateway pattern but has **not yet been validated inside a live WHMCS install**.
> Test it on a staging WHMCS (with a `mp_test_` key) and confirm the callback
> marks an invoice paid **before** using it for real payments.

Routes WHMCS invoice payments through [ManishaPay](https://github.com/nobytechy/manishapay)
(PayNow Zimbabwe today; Stripe + more on the roadmap) via the ManishaPay REST API.

## How it works
1. On an invoice, the module calls `POST /v1/pay` and shows a **Pay with ManishaPay**
   button (plus a scannable QR) linking to the PayNow/ManishaPay checkout.
2. The customer pays; ManishaPay sends a **signed `payment.updated` webhook** to
   `callback/manishapay.php`.
3. The callback verifies the `X-ManishaPay-Signature` and calls `addInvoicePayment()`
   to mark the invoice paid (idempotent via `checkCbTransID`).

## Install
```
<whmcs>/modules/gateways/manishapay.php
<whmcs>/modules/gateways/callback/manishapay.php
```
Then: **Admin → Setup → Payments → Payment Gateways → activate "ManishaPay"** and set:
- **API Base URL** — your ManishaPay API, e.g. `https://your-app.onrender.com`
- **API Key** — `mp_live_…` (or `mp_test_…` while testing)
- **Webhook Signing Secret** — the signing secret of a ManishaPay webhook endpoint
  whose URL points at `…/modules/gateways/callback/manishapay.php`

## Test checklist (do before going live)
- [ ] Activate with a `mp_test_` key; open a test invoice → button renders.
- [ ] Pay via the simulator/sandbox → webhook hits the callback.
- [ ] Signature verification passes; invoice flips to **Paid**.
- [ ] Re-deliver the same webhook → no double payment (idempotent).
- [ ] Switch to `mp_live_` + a live PayNow credential for production.
