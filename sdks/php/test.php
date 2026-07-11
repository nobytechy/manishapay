<?php

/**
 * Smoke tests for the ManishaPay PHP SDK. Run: `php test.php` (or `composer test`).
 * No network — exercises key validation and webhook-signature verification.
 */
declare(strict_types=1);

require __DIR__ . '/src/ManishaPay.php';

use ManishaPay\ManishaPay;

$failures = 0;
function check(bool $cond, string $msg): void
{
    global $failures;
    if ($cond) {
        echo "  ok   - $msg\n";
    } else {
        $failures++;
        echo "  FAIL - $msg\n";
    }
}

// Constructor validation
try {
    new ManishaPay('nope');
    check(false, 'rejects an invalid API key');
} catch (\InvalidArgumentException $e) {
    check(true, 'rejects an invalid API key');
}
check((new ManishaPay('mp_test_abc')) instanceof ManishaPay, 'accepts a valid test key');

// Webhook signature verification
$secret = 'whsec_test';
$body   = json_encode(['event' => 'payment.updated']);
$ts     = time();
$sig    = hash_hmac('sha256', $ts . '.' . $body, $secret);
$header = "t=$ts,v1=$sig";

check(ManishaPay::verifyWebhook($body, $header, $secret) === true, 'valid signature passes');
check(ManishaPay::verifyWebhook($body . ' ', $header, $secret) === false, 'tampered body fails');

$old  = time() - 10000;
$sig2 = hash_hmac('sha256', $old . '.' . $body, $secret);
check(ManishaPay::verifyWebhook($body, "t=$old,v1=$sig2", $secret) === false, 'stale timestamp fails');

echo $failures === 0 ? "\nAll tests passed.\n" : "\n$failures test(s) failing.\n";
exit($failures === 0 ? 0 : 1);
