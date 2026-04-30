# Integration walkthrough

The five-minute version. Pick the path that matches your stack.

---

## Path 1 — REST (any language)

### 1. Sign up + create a key

1. Go to your dashboard → **API Keys** → **Create key** (mode = test).
2. Copy the plaintext value. You will not see it again.

### 2. Send a payment

```bash
curl -X POST https://api.manishapay.dev/v1/pay \
  -H "Authorization: Bearer mp_test_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "reference": "INV-001",
    "amount": "10.00",
    "email": "buyer@test.com",
    "description": "Pro plan"
  }'
```

### 3. Send the buyer to `browser_url`

```js
window.location.href = response.data.browser_url;
```

### 4. Configure the webhook

Dashboard → **Webhooks** → **Register endpoint** → paste the URL on your server. ManishaPay will POST `payment.updated` events there with an `X-ManishaPay-Signature` header (HMAC-SHA256 of the body using your endpoint secret).

```js
// Express example
app.post('/webhooks/manishapay', express.json(), (req, res) => {
  const sig = req.header('x-manishapay-signature');
  const expected = crypto.createHmac('sha256', SECRET).update(JSON.stringify(req.body)).digest('hex');
  if (sig !== expected) return res.status(401).send('bad sig');
  // req.body.data has the transaction
  res.sendStatus(200);
});
```

That's it.

---

## Path 2 — WordPress / WooCommerce

1. Install **PayNow Bridge Connect** (`wordpress-plugin/paynow-bridge-connect.zip`).
2. Settings → PayNow Bridge → paste your API key.
3. WooCommerce → Settings → Payments → enable PayNow Bridge.

Or, on a non-Woo page:

```
[paynow_bridge_button amount="10" description="Pro plan"]
```

---

## Path 3 — Mobile app

You don't need a native SDK — the REST API works fine from any platform.

For iOS / Android:

1. From your backend, call `POST /v1/pay` and return the `browser_url` to the app.
2. Open the URL in a `SFSafariViewController` (iOS) or `Custom Tabs` (Android) — never embed PayNow in a `WebView`, since their CSP blocks it.
3. When the buyer comes back via the return URL, your app deep-link handler kicks in.

If you need to bridge a Firebase dynamic link, use:

```
https://api.manishapay.dev/v1/tools/redirect/{reference}
```

instead of your dynamic link directly. The gateway 302s to whatever you've configured as the project's `return_url`, which you can update from the dashboard without touching the app.

---

## Testing

* Set `MOCK_MODE=true` on the gateway and every payment becomes a fake.
* Or call `POST /v1/tools/mock/pay` for a one-off mock without flipping env vars.
* Use the **Webhook tester** in the dashboard to send a sample event at your endpoint.

---

## Going live

1. Create a `live` key (toggle in the create-key modal).
2. Update your environment variable / WP plugin setting.
3. Update `PAYNOW_RETURN_URL` and `PAYNOW_RESULT_URL` to your production hostnames.
4. Point your DNS to cPanel and follow `deployment/DEPLOY.md`.
