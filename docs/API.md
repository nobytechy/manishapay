# ManishaPay API reference

Base URL: `https://api.manishapay.dev` (or your self-hosted gateway).

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
| `reference`  | string (≤64)     | yes      | Your unique invoice number                            |
| `amount`     | string \| number | yes      | Any decimal format — gateway normalises               |
| `description`| string           | no       | Buyer-facing line item                                |
| `email`      | string (email)   | no       | Used for receipt + dispute lookups                    |
| `phone`      | string           | no       | Auto-formatted to MSISDN. Required when `method` set  |
| `method`     | enum             | no       | `ecocash`, `onemoney`, `innbucks`, `omari`, `zimswitch`|
| `return_url` | url              | no       | Falls back to project default                         |
| `result_url` | url              | no       | Falls back to project default                         |

### Response — 201

```json
{
  "data": {
    "ok": true,
    "browser_url": "https://www.paynow.co.zw/Payment/ConfirmPayment/1234567",
    "poll_url":    "https://www.paynow.co.zw/Interface/CheckPayment/?guid=...",
    "instructions": "Dial *151# on your phone to confirm.",
    "reference": "INV-001",
    "status": "Sent"
  },
  "requestId": "rid-c5b9a8de1729000000"
}
```

If `method` is omitted you get a redirect-style flow — send the buyer to `browser_url`.
If `method` is set, the customer is prompted on their phone immediately; you only poll status.

---

## GET /v1/pay/{reference}/status

Look up the latest known status of a transaction. The gateway will also call PayNow's poll URL once and update the cached row if status has changed.

```bash
curl https://api.manishapay.dev/v1/pay/INV-001/status \
  -H "Authorization: Bearer mp_test_xxxx"
```

### Response — 200

```json
{
  "data": {
    "reference": "INV-001",
    "amount": "10.00",
    "status": "Paid",
    "mode": "test",
    "live": {
      "ok": true,
      "status": "Paid",
      "amount": "10.00",
      "paynow_reference": "1234567"
    }
  },
  "requestId": "rid-..."
}
```

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

Server-to-server endpoint that PayNow POSTs to. **You don't call this** — it's where PayNow sends the result. Configure it as your `result_url` in the dashboard.

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
