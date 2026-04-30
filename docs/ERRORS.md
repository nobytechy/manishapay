# Error catalogue

Every error from the gateway has the same shape:

```json
{
  "error": {
    "status": 400,
    "code": "HASH_MISMATCH",
    "message": "Computed hash does not match the hash returned by PayNow",
    "resolution": "Use POST /v1/tools/hash to see the canonical concatenation.",
    "details": { "expected": "ABC…", "actual": "DEF…" },
    "requestId": "rid-..."
  }
}
```

* `code` is stable — match against this in client code.
* `message` is human-readable — show it to support, never to end users.
* `resolution` is the actionable next step.
* `requestId` is the gateway's request id; quote it in support tickets.

| HTTP | Code                | Why it happens                                              | What to do                                                                              |
|------|---------------------|-------------------------------------------------------------|------------------------------------------------------------------------------------------|
| 400  | `BAD_REQUEST`       | Field missing/wrong type                                    | Check the request body against the API reference.                                       |
| 400  | `HASH_MISMATCH`     | SHA-512 doesn't match                                       | Run `/v1/tools/hash`. Most common cause: a field was added/removed between attempts.    |
| 400  | `PAYNOW_REJECTED`   | PayNow returned `status=Error`                              | The `details` block contains PayNow's own error text — fix and retry.                    |
| 401  | `UNAUTHORIZED`      | Bearer key invalid, revoked, or wrong mode                  | Generate a new key on the API Keys page. Make sure test ↔ test, live ↔ live.            |
| 403  | `FORBIDDEN`         | Trying to access another developer's resource               | RLS denied the read. Use the right key.                                                  |
| 404  | `NOT_FOUND`         | Reference doesn't exist for this developer                  | Check spelling. Test keys can't see live transactions and vice versa.                    |
| 413  | `PAYLOAD_TOO_LARGE` | Body > 256 KB                                               | Strip blobs from your payload — payment fields don't need them.                          |
| 429  | `RATE_LIMITED`      | Burst exceeded the per-key cap                              | Back off using `RateLimit-Reset`. Upgrade your plan for higher limits.                    |
| 500  | `INTERNAL_ERROR`    | Bug in the gateway                                          | Quote the `requestId` to support; we have it in the logs.                                |
| 502  | `UPSTREAM_FAILURE`  | PayNow timed out or 5xx-d after 3 retries                   | Check status.manishapay.dev. Enable `MOCK_MODE` while you wait.                          |
| 503  | `SERVICE_UNAVAILABLE`| Health check failed (Supabase down, etc.)                  | Watch the status page; the gateway recovers automatically.                               |

## Mapping forum errors to ManishaPay codes

| Forum symptom                                  | ManishaPay code     | Fix link                                              |
|------------------------------------------------|---------------------|-------------------------------------------------------|
| `HashMismatchException`                        | `HASH_MISMATCH`     | [/v1/tools/hash](API.md#post-v1toolshash)             |
| `Connection reset (os error 104)`              | (handled silently)  | Retries with backoff — no client change needed        |
| `System.FormatException` parsing `'2.00'`      | (handled silently)  | Gateway normalises; pass any decimal format           |
| Browser stuck after payment                    | n/a                 | Use `/v1/tools/redirect/{ref}` as a bridge URL        |
| Express payout: no phone prompt                | n/a                 | Pass the phone field — gateway formats to MSISDN      |
