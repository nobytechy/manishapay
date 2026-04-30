# manishapay/manishapay (PHP SDK)

Official PHP client for [ManishaPay](https://pay.aizim.co.zw) — middleware for the PayNow Zimbabwe payment gateway.

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

### Express checkout (mobile money)

```php
$r = $mp->pay([
  'reference' => 'order-1234',
  'amount'    => '5.00',
  'method'    => 'ecocash',         // or onemoney | innbucks | omari | zimswitch | vmc
  'phone'     => '0772123456',      // any format — auto-normalised
]);
```

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
mode. The `browser_url` will point to `pay.aizim.co.zw/simulator/<tracker>`
where you can click Paid / Cancelled / Timeout to fire signed webhooks.

## License

MIT
