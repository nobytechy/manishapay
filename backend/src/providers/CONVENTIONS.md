# Provider implementation conventions (READ before writing a provider)

Every gateway lives in `backend/src/providers/<id>/index.js` and implements the `PaymentProvider`
contract in `../contract.js`. Follow these rules exactly so all providers behave identically to the
rest of ManishaPay.

## Module shape
```js
'use strict';
const axios = require('axios');
const crypto = require('crypto');                 // Node built-in — AES/HMAC/MD5/SHA512, base64
const { withRetry } = require('../../services/retry');
const AppError = require('../../errors/AppError');
const { get } = require('../catalog');
const meta = get('<id>');

module.exports = {
  id: '<id>',
  displayName: meta.displayName,
  capabilities: meta.capabilities,
  credentialSchema: meta.credentialSchema,
  async initiate(input, ctx) { /* ... */ },
  async pollStatus(ref, creds) { /* ... */ },
  normalizeStatus(raw) { /* ... */ },
  verifyWebhook(rawBody, headers, creds) { /* return { valid, event, status, providerRef } */ }, // if webhook gateway
  // async refund(input, ctx) {}   // only if capabilities.refund
};
```

## initiate(input, ctx)
- `input`: `{ reference, amount, currency, method?, email?, phone?, description?, return_url?, result_url? }`.
  `amount` is a decimal in **major units** (e.g. `"10.00"`). Convert to the gateway's unit yourself.
- `ctx`: `{ mode: 'test'|'live', creds: <decrypted config object> | null, project: { return_url, result_url } }`.
  `creds` keys match this provider's `credentialSchema` keys (e.g. Stripe → `{ secretKey, webhookSecret }`).
  If `creds` is null → throw `AppError` code `CREDENTIALS_REQUIRED` with a clear resolution (PayNow's
  simulator is the only zero-cred path; other gateways require creds).
- Choose the base URL by `ctx.mode` (sandbox host for `test`, live host for `live`).
- **Return the neutral `InitiateResult`** — nothing gateway-specific leaks out:
  ```js
  return {
    providerRef,          // the gateway's own txn id / token / checkout id
    checkoutUrl,          // hosted-checkout / redirect URL (if capabilities.redirect)
    pollUrl,              // status URL (if capabilities.poll)
    rawStatus,            // the gateway's own status string
    status: this.normalizeStatus(rawStatus),
    mode: ctx.mode,
    instructions,         // optional human hint (e.g. "approve the prompt on your phone")
    raw,                  // the full gateway response (for logs)
  };
  ```

## Amounts (get this right — it's the #1 real-world bug)
- Stripe / Paystack / Yoco → **minor subunits** (× 100 integer).
- PayFast / Ozow / Pesepay / PayNow → **decimal 2dp string** (`"10.00"`).
- M-Pesa → **integer** (no decimals).
- Flutterwave → string major units. PayPal → string 2dp. DPO → integer/decimal per docs.
Write a small `toGatewayAmount()` in the module; never trust the caller to pre-format.

## Status → always map to canonical
`normalizeStatus(raw)` must return one of `paid | pending | failed | disputed | refunded`.
Use the `status_map` from this gateway's research note. Unknown/unrecognised → `pending` (and it will be re-polled), never silently `paid`.

## Webhooks (if the gateway pushes callbacks)
- `verifyWebhook(rawBody, headers, creds)` must verify the signature over the **RAW request bytes**
  (never a re-serialised body). Return `{ valid: false }` on mismatch — never throw for a bad sig.
- Encapsulate the exact scheme from the research note (Stripe HMAC-SHA256 `t.body`; Paystack
  HMAC-SHA512; Yoco Svix; PayPal transmission-sig/cert; PayFast 4-step ITN; Ozow SHA512; Flutterwave
  v3 plain `verif-hash`). **Never trust a redirect return as proof of payment** — verify server-side.

## HTTP
- Use `axios`; wrap idempotent network calls in `withRetry(() => axios..., { label: '<id>.initiate' })`.
- On upstream 5xx throw `AppError.upstream(...)`; on gateway rejection throw `AppError` with a
  `resolution` string that tells the merchant how to fix it (mirror PayNow's helpful errors).

## Errors
`require('../../errors/AppError')`. Helpers: `AppError.badRequest(msg, details)`, `AppError.upstream(err)`,
`new AppError({ status, code, message, resolution })`.

## Hard constraints
- Create ONLY `providers/<id>/index.js` and `tests/<id>.test.js`. Do NOT edit `providers/index.js`,
  `catalog.js`, `app.js`, or `package.json` — integration is done centrally.
- Use only installed deps: `axios`, `uuid`, `zod`, and Node built-ins (`crypto`). No `crypto-js`, no new installs.
- Tests (`node:test` + `node:assert/strict`, mirror `tests/paynow.test.js`) must run with **no network**:
  test `normalizeStatus` across all raw values, `toGatewayAmount`, and any signature/encryption helper
  with a known input→output vector (e.g. Pesepay AES round-trip, PayFast/Ozow hash string, an HMAC).
  Do not make real HTTP calls.
