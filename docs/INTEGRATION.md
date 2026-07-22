# Integration walkthrough

The five-minute version. Pick the path that matches your stack.

ManishaPay is a **multi-gateway** payments API — one integration over PayNow,
Stripe, Paystack, Flutterwave, PayPal, M-Pesa and PayFast (more coming). Add an
optional `provider` field to any `/v1/pay` call to choose the gateway; it defaults
to `paynow` and the rest of the request/response shape never changes.

---

## Path 1 — REST (any language)

### 1. Sign up + create a key

1. Go to your dashboard → **API Keys** → **Create key** (mode = test).
2. Copy the plaintext value. You will not see it again.

### 2. Send a payment

```bash
curl -X POST https://manishapay.netlify.app/api/v1/pay \
  -H "Authorization: Bearer mp_test_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "reference": "INV-001",
    "amount": "10.00",
    "email": "buyer@test.com",
    "description": "Pro plan"
  }'
```

To run the same payment through a different gateway, add `provider` (defaults to `paynow`):

```bash
curl -X POST https://manishapay.netlify.app/api/v1/pay \
  -H "Authorization: Bearer mp_test_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "stripe",
    "reference": "INV-001",
    "amount": "10.00",
    "currency": "USD",
    "email": "buyer@test.com"
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
https://manishapay.netlify.app/api/v1/tools/redirect/{reference}
```

instead of your dynamic link directly. The gateway 302s to whatever you've configured as the project's `return_url`, which you can update from the dashboard without touching the app.

---

## Path 4 — Hosted checkout links (no code)

Get paid without writing any integration code: create a **payment link** and share
`/pay/<slug>`. The hosted page shows a method chooser (EcoCash, Card, …) and routes
each method to whichever gateway you've connected that serves it.

1. **Create the link.** Dashboard → **Payment Links** → set the amount and tick the
   **payment methods** to offer. (Or `POST /v1/links` with your dashboard session and
   an `enabled_methods` array — see [API.md](API.md#post-v1links--create-a-checkout-link).)
   Leave methods empty to offer your primary gateway's own methods automatically.
2. **Share `/pay/<slug>`.** The customer picks a method and pays — no code on your side.

**Routing:** when several connected gateways serve the same method, ManishaPay picks
by (1) an explicit `method_routing` override, then (2) the checkout's primary
provider, then (3) catalog order (local-first). Connect gateways under
**Payment Gateways** first — only methods with a connected gateway appear.

Building your **own** checkout screen instead of the hosted page? Use the two public
endpoints — `GET /v1/links/<slug>` (returns the method chooser) and
`POST /v1/links/<slug>/pay` (`{ "method": "…" }`) — or the SDK helpers
`getCheckout(slug)` / `payCheckout(slug, …)`. The direct `POST /v1/pay` also takes
`provider` + `method` for a fully custom flow.

---

## Testing

* Set `MOCK_MODE=true` on the gateway and every payment becomes a fake.
* Or call `POST /v1/tools/mock/pay` for a one-off mock without flipping env vars.
* Use the **Webhook tester** in the dashboard to send a sample event at your endpoint.

---

## Going live

1. Create a `live` key (toggle in the create-key modal).
2. Update your environment variable / WP plugin setting.
3. Connect the gateway(s) you want in the dashboard (PayNow Integration ID/Key, Stripe keys, etc.) and set each to live mode.
4. Update the provider return/result URLs (e.g. `PAYNOW_RETURN_URL`, `PAYNOW_RESULT_URL`) to your production hostnames.

The hosted service already runs on **Render** (backend API) + **Netlify** (frontend), with Netlify proxying `/api` to Render — nothing DNS-level for you to do. If you self-host, follow `DEPLOY-CLOUD.md`.
