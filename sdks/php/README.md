# manishapay/manishapay (PHP SDK)

Official PHP client for [ManishaPay](https://manishapay.netlify.app) — one API for many payment gateways (PayNow, Stripe, Paystack, Flutterwave, PayPal, M-Pesa, PayFast and more). Pick the gateway per call with a `provider` field; your code stays the same.

PHP 7.4+. Only requires `ext-curl` and `ext-json` (both standard).

## Install

```bash
composer require manishapay/manishapay
```

Or, without Composer, drop `src/ManishaPay.php` into your project and `require` it directly.

## Usage

```php
<?php
require 'vendor/autoload.php';

$mp = new ManishaPay\ManishaPay(getenv('MANISHAPAY_API_KEY'));

$r = $mp->pay([
  'reference'   => 'order-1234',
  'amount'      => '5.00',
  'description' => 'Pro plan — annual',
  'email'       => 'buyer@example.com',
]);

// Redirect customer:
header('Location: ' . $r['browser_url']);
exit;
```

### Choosing a gateway (`provider`)

`provider` is optional and defaults to `'paynow'`. Set it to route the same call
through any live gateway — the request and response shape don't change:

```php
$r = $mp->pay([
  'provider'  => 'stripe',   // paynow (default) | stripe | paystack | flutterwave | paypal | mpesa | payfast
  'reference' => 'order-1234',
  'amount'    => '5.00',
  'currency'  => 'USD',
  'email'     => 'buyer@example.com',
]);
```

### Express checkout (mobile money)

```php
$r = $mp->pay([
  'reference' => 'order-1234',
  'amount'    => '5.00',
  'method'    => 'ecocash',         // or onemoney | innbucks | omari | zimswitch | vmc
  'phone'     => '0772123456',      // any format — auto-normalised
]);
```

### Hosted checkout (method routing)

A **payment link** is a no-code hosted checkout at `/pay/<slug>`. It offers the
customer a set of methods (EcoCash, Card, …) and routes each to whichever gateway
you've connected that serves it. Just share the hosted page — or build your own
checkout UI with these two public endpoints (no API key required):

```php
// 1. Fetch the checkout + the methods the customer can pay with right now
$checkout = $mp->getCheckout('ab12cd34ef56');
// $checkout['methods'] → [['method'=>..., 'label'=>..., 'needsPhone'=>..., 'kind'=>..., 'provider'=>..., 'mode'=>...], …]

// 2. The customer picks a method; start the payment (phone needed when needsPhone)
$r = $mp->payCheckout('ab12cd34ef56', [
  'method' => 'ecocash',
  'phone'  => '0771234567',
]);

if (!empty($r['browser_url'])) { header('Location: ' . $r['browser_url']); exit; }
// else: a phone push (EcoCash / M-Pesa STK) is already on the customer's device
```

Links are created from the dashboard (**Payment Links**), or via `POST /v1/links`
with your dashboard session — set `enabled_methods` to choose which methods a link
offers. Prefer a fully custom flow with no link? `pay()` already takes `method`.

### Webhook verification

```php
<?php
require 'vendor/autoload.php';

$WEBHOOK_SECRET = getenv('MANISHAPAY_WEBHOOK_SECRET');
$rawBody = file_get_contents('php://input');
$sig     = $_SERVER['HTTP_X_MANISHAPAY_SIGNATURE'] ?? null;

if (!ManishaPay\ManishaPay::verifyWebhook($rawBody, $sig, $WEBHOOK_SECRET)) {
    http_response_code(401);
    exit('bad signature');
}

$evt = json_decode($rawBody, true);
// $evt['data']['reference'], $evt['data']['status_normalized'], …
http_response_code(200);
echo 'ok';
```

## Test mode

A `mp_test_*` key without configured PayNow credentials runs in fully simulated
mode. The `browser_url` will point to `manishapay.netlify.app/simulator/<tracker>`
where you can click Paid / Cancelled / Timeout to fire signed webhooks.

## Author

Built by **Noby Tebulo** — [nobie.netlify.app](https://nobie.netlify.app) · nobytechy@gmail.com

## License

MIT © 2026 Noby Tebulo
