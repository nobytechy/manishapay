# manishapay (Node.js SDK)

Official Node.js client for [ManishaPay](https://pay.aizim.co.zw) — middleware for the PayNow Zimbabwe payment gateway.

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
console.log(status.status_normalized); // 'paid' | 'pending' | 'failed' | …
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
`browser_url` it returns points to `pay.aizim.co.zw/simulator/<tracker>` where
you can click Paid / Cancelled / Timeout buttons to fire signed webhooks
to your endpoint.

## License

MIT
