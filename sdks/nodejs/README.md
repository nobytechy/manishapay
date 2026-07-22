# manishapay (Node.js SDK)

Official Node.js client for [ManishaPay](https://manishapay.netlify.app) — one API for many payment gateways (PayNow, Stripe, Paystack, Flutterwave, PayPal, M-Pesa, PayFast and more). Pick the gateway per call with a `provider` field; your code stays the same.

## Install

```bash
npm install manishapay
```

Requires Node ≥ 18 (uses built-in `fetch`).

## Usage

```js
const ManishaPay = require('manishapay');

const mp = new ManishaPay(process.env.MANISHAPAY_API_KEY);

const r = await mp.pay({
  reference: 'order-1234',
  amount: '5.00',
  description: 'Pro plan — annual',
  email: 'buyer@example.com',
});

// Redirect customer:
console.log(r.browser_url);

// Or poll for status:
const status = await mp.status('order-1234');
console.log(status.status_normalized); // 'paid' | 'pending' | 'failed' | 'disputed' | 'refunded'
```

### Choosing a gateway (`provider`)

`provider` is optional and defaults to `'paynow'`. Set it to route the same call
through any live gateway — the request and response shape don't change:

```js
const r = await mp.pay({
  provider: 'stripe',        // paynow (default) | stripe | paystack | flutterwave | paypal | mpesa | payfast
  reference: 'order-1234',
  amount: '5.00',
  currency: 'USD',
  email: 'buyer@example.com',
});
```

### Express checkout (mobile money)

```js
const r = await mp.pay({
  reference: 'order-1234',
  amount: '5.00',
  method: 'ecocash',         // ecocash | onemoney | innbucks | omari | zimswitch | vmc
  phone: '0772123456',       // any format — auto-normalised to 263…
});
```

### Hosted checkout (method routing)

A **payment link** is a no-code hosted checkout at `/pay/<slug>`. It offers the
customer a set of methods (EcoCash, Card, …) and routes each to whichever gateway
you've connected that serves it. The simplest path is to just share the hosted
page. To build your **own** checkout UI, fetch the method chooser and start the
payment — both endpoints are public (no API key required):

```js
// 1. Fetch the checkout + the methods the customer can pay with right now
const checkout = await mp.getCheckout('ab12cd34ef56');
// checkout.methods → [{ method, label, needsPhone, kind, provider, mode }, …]

// 2. The customer picks a method; start the payment (phone needed when needsPhone)
const r = await mp.payCheckout('ab12cd34ef56', {
  method: 'ecocash',
  phone: '0771234567',
});

if (r.browser_url) window.location = r.browser_url;   // redirect rails
// else: a phone push (EcoCash / M-Pesa STK) is already on the customer's device
```

Links are created from the dashboard (**Payment Links**), or via `POST /v1/links`
with your dashboard session — set `enabled_methods` to choose which methods a link
offers. Prefer a fully custom flow with no link? `pay()` already takes `method`.

### Webhook verification

```js
const express = require('express');
const ManishaPay = require('manishapay');

const app = express();
const WEBHOOK_SECRET = process.env.MANISHAPAY_WEBHOOK_SECRET;

app.post('/webhooks/manishapay',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const sig = req.header('X-ManishaPay-Signature');
    if (!ManishaPay.verifyWebhook(req.body, sig, WEBHOOK_SECRET)) {
      return res.status(401).send('bad signature');
    }
    const evt = JSON.parse(req.body.toString('utf8'));
    console.log('Payment update:', evt.data.reference, evt.data.status_normalized);
    res.send('ok');
  });
```

## Test mode

When you create a `mp_test_*` API key and haven't yet added PayNow credentials,
ManishaPay runs in fully simulated mode — no real PayNow call. The
`browser_url` it returns points to `manishapay.netlify.app/simulator/<tracker>` where
you can click Paid / Cancelled / Timeout buttons to fire signed webhooks
to your endpoint.

## Author

Built by **Noby Tebulo** — [nobie.netlify.app](https://nobie.netlify.app) · nobytechy@gmail.com

## License

MIT © 2026 Noby Tebulo
