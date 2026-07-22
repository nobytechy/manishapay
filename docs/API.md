# ManishaPay API reference

Base URL: `https://manishapay.netlify.app/api` (or your self-hosted gateway).

ManishaPay is a **multi-gateway** payments API: one request/response shape over
PayNow, Stripe, Paystack, Flutterwave, PayPal, M-Pesa and PayFast (with Yoco,
Pesepay, Ozow and DPO Pay coming soon). Choose the gateway per call with the
optional `provider` field (defaults to `paynow`).

All endpoints accept and return JSON. Authentication is via a bearer API key:

```
Authorization: Bearer mp_(test|live)_xxxxxxxxxxxxxxxxxxxxxxxx
```

Every response includes a `requestId` field — quote it in support tickets.
Errors follow the `{ status, code, message, resolution }` shape (see [ERRORS.md](ERRORS.md)).

---

## POST /v1/pay

Initiate a payment.

### Request

```json
{
  "provider": "paynow",
  "reference": "INV-001",
  "amount": "10.00",
  "description": "Pro plan",
  "email": "buyer@test.com",
  "phone": "0772123456",
  "method": "ecocash",
  "return_url": "https://your.app/return",
  "result_url": "https://api.your.app/webhook"
}
```

| Field        | Type             | Required | Notes                                                 |
|--------------|------------------|----------|-------------------------------------------------------|
| `provider`   | enum             | no       | Which gateway moves the money. Default `paynow`. Live: `paynow`, `stripe`, `paystack`, `flutterwave`, `paypal`, `mpesa`, `payfast` |
| `reference`  | string (≤64)     | yes      | Your unique invoice number                            |
| `amount`     | string \| number | yes      | Any decimal format — gateway normalises               |
| `description`| string           | no       | Buyer-facing line item                                |
| `email`      | string (email)   | no       | Used for receipt + dispute lookups                    |
| `phone`      | string           | no       | Auto-formatted to MSISDN. Required when `method` set  |
| `method`     | enum             | no       | Payment rail — the valid values depend on `provider` (e.g. PayNow: `ecocash`, `onemoney`, `innbucks`, `omari`, `zimswitch`, `card`) |
| `return_url` | url              | no       | Falls back to project default                         |
| `result_url` | url              | no       | Falls back to project default                         |

### Response — 201

```json
{
  "data": {
    "ok": true,
    "provider": "paynow",
    "browser_url": "https://www.paynow.co.zw/Payment/ConfirmPayment/1234567",
    "poll_url":    "https://www.paynow.co.zw/Interface/CheckPayment/?guid=...",
    "instructions": "Dial *151# on your phone to confirm.",
    "reference": "INV-001",
    "status": "pending"
  },
  "requestId": "rid-c5b9a8de1729000000"
}
```

`status` is normalized to one canonical value across every gateway:
**`paid` · `pending` · `failed` · `disputed` · `refunded`**.

If `method` is omitted you get a redirect-style flow — send the buyer to `browser_url`.
If `method` is set (and the provider supports mobile push), the customer is prompted on their device immediately; you only poll status.

---

## GET /v1/pay/{reference}/status

Look up the latest known status of a transaction. ManishaPay will also re-poll the
provider once (for gateways that support polling) and update the cached row if the
status has changed.

```bash
curl https://manishapay.netlify.app/api/v1/pay/INV-001/status \
  -H "Authorization: Bearer mp_test_xxxx"
```

### Response — 200

```json
{
  "data": {
    "reference": "INV-001",
    "amount": "10.00",
    "provider": "paynow",
    "status": "paid",
    "mode": "test",
    "live": {
      "ok": true,
      "status": "paid",
      "amount": "10.00",
      "provider_reference": "1234567"
    }
  },
  "requestId": "rid-..."
}
```

`status` is one of the canonical values `paid | pending | failed | disputed | refunded`.

---

## Hosted checkout links (multi-method routing)

A **payment link** is a no-code hosted checkout at `/pay/{slug}`. It can offer the
customer a set of payment **methods**; when the customer picks one, ManishaPay
routes it to whichever gateway you've connected that serves that method.

**Routing precedence** when several connected gateways serve the same method:
1. an explicit per-checkout override (`method_routing[method] = provider`), then
2. the checkout's **primary** provider (`provider`), then
3. the first connected gateway in catalog order (curated local-first).

If a link declares no `enabled_methods`, it offers the **primary provider's own
methods** — so a PayNow link automatically shows EcoCash / OneMoney / InnBucks /
Zimswitch / Card. Legacy links keep working unchanged (single Pay button).

> Building your own checkout UI instead of the hosted page? `POST /v1/pay` already
> takes both `provider` and `method` — call it directly with the method the
> customer chose.

### POST /v1/links — create a checkout link

Auth: **dashboard session (JWT)**, not the `mp_` API key.

```json
{
  "project_id": "3f1c…uuid",
  "provider": "paynow",
  "title": "Consulting session",
  "amount": "20.00",
  "currency": "USD",
  "description": "60-minute session",
  "enabled_methods": ["ecocash", "onemoney", "card"],
  "method_routing": { "card": "stripe" }
}
```

| Field             | Type            | Required | Notes                                                            |
|-------------------|-----------------|----------|------------------------------------------------------------------|
| `project_id`      | uuid            | yes      | The project that collects the payment                            |
| `provider`        | enum            | no       | Primary gateway (default `paynow`) — wins the routing tie-break  |
| `title`           | string (≤120)   | yes      | Buyer-facing title                                               |
| `amount`          | string \| number| yes      | Normalised to two decimals                                       |
| `currency`        | enum            | no       | `USD` \| `ZWL` (default `USD`)                                   |
| `description`     | string          | no       | Buyer-facing detail                                              |
| `enabled_methods` | string[]        | no       | Methods to offer. Omit → the primary provider's own methods      |
| `method_routing`  | object          | no       | Pin a method to a gateway, e.g. `{ "card": "stripe" }`           |

**Response — 201:** `{ "data": { "id", "slug", "title", "amount", "currency", "description", "active", "created_at" } }`.
Share the checkout at `/pay/{slug}`. An unknown method name returns `400`.

### GET /v1/links/{slug} — checkout details + method chooser

**Public — no API key.** Returns the amount and the methods the customer can pay
with right now (only methods with a connected gateway appear).

```bash
curl https://manishapay.netlify.app/api/v1/links/ab12cd34ef56
```

```json
{
  "data": {
    "slug": "ab12cd34ef56",
    "title": "Consulting session",
    "amount": "20.00",
    "currency": "USD",
    "description": "60-minute session",
    "active": true,
    "primary_provider": "paynow",
    "methods": [
      { "method": "ecocash", "label": "EcoCash", "needsPhone": true,  "kind": "mobile", "provider": "paynow", "mode": "live" },
      { "method": "card",    "label": "Card",    "needsPhone": false, "kind": "card",   "provider": "stripe", "mode": "live" }
    ]
  }
}
```

`methods` empty → render a single Pay button. `kind` ∈ `mobile | card | bank |
wallet | voucher | ussd`; `needsPhone` tells you to collect a mobile number.

### POST /v1/links/{slug}/pay — start a payment

**Public — no API key.** Pass the `method` the customer chose; omit it to use the
primary provider.

```bash
curl -X POST https://manishapay.netlify.app/api/v1/links/ab12cd34ef56/pay \
  -H "Content-Type: application/json" \
  -d '{ "method": "ecocash", "phone": "0771234567" }'
```

**Response — 201:** `{ "data": { "provider", "reference", "tracker", "browser_url", "status", "mode", "qr_code" } }`.
For phone-push rails (EcoCash / M-Pesa STK) there may be no `browser_url` — the
prompt is already on the customer's phone. If no connected gateway serves the
chosen method, you get `400`.

---

## POST /v1/tools/hash

Recompute the SHA-512 hash for a set of fields. Use it whenever you suspect a `HashMismatchException`.

```json
{
  "fields": {
    "id": "12345",
    "reference": "INV-001",
    "amount": "10.00"
  },
  "received_hash": "ABCDEF…"
}
```

Response includes the expected hash, the concatenation preview (so you can spot the field ordering bug), and a boolean `ok`.

---

## POST /v1/tools/decimal

```json
{ "amount": "2,00" }
```

```json
{ "data": { "input": "2,00", "normalized": "2.00" } }
```

---

## POST /v1/tools/phone

```json
{ "phone": "+263 77 212 3456" }
```

```json
{ "data": { "input": "+263 77 212 3456", "msisdn": "263772123456", "valid": true } }
```

---

## POST /v1/tools/mock/pay

Identical to `POST /v1/pay`, but never calls PayNow — returns a deterministic fake response. Use it from tests and CI.

---

## GET /v1/tools/redirect/{reference}

Server-side redirect bridge. Useful when your real return URL is a Firebase dynamic link or app deep-link that PayNow can't open directly.

---

## POST /v1/webhook

Server-to-server endpoint that the active payment gateway POSTs to. **You don't call this** — it's where the gateway (PayNow, Stripe, Paystack, …) sends the result. ManishaPay verifies the gateway's signature, normalizes the payload, and forwards a single signed `payment.updated` event to your own webhook. Configure it as your `result_url` in the dashboard.

---

## GET /health , GET /health/deep

Liveness and readiness probes. `deep` pings Supabase + PayNow.

---

## Rate limits

| Plan         | Per-key   | Window  |
|--------------|-----------|---------|
| Free         | 100       | 1 minute|
| Pro          | 600       | 1 minute|
| Enterprise   | 6000      | 1 minute|

Hitting the limit returns `429 RATE_LIMITED` with the standard `RateLimit-*` headers.
