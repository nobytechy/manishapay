<?php
/**
 * ManishaPay — PHP example. PHP 7.4+, no Composer required.
 *
 * Run:
 *   API_KEY=mp_test_xxx php example.php
 */

$apiBase = getenv('API_BASE') ?: 'https://api.manishapay.dev';
$apiKey  = getenv('API_KEY');

if (!$apiKey) {
    fwrite(STDERR, "Set API_KEY=mp_test_xxx first.\n");
    exit(1);
}

$payload = json_encode([
    'reference'   => 'INV-' . time(),
    'amount'      => '10.00',
    'description' => 'Pro plan',
    'email'       => 'buyer@test.com',
]);

$ch = curl_init($apiBase . '/v1/pay');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json',
        'X-Request-Id: php-' . uniqid(),
    ],
    CURLOPT_TIMEOUT        => 15,
]);

$response = curl_exec($ch);
$status   = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$err      = curl_error($ch);
curl_close($ch);

if ($err) {
    fwrite(STDERR, "Network error: $err\n");
    exit(1);
}

$body = json_decode($response, true);

if ($status >= 400) {
    fwrite(STDERR, "ManishaPay error: " . ($body['error']['message'] ?? 'unknown') . "\n");
    exit(1);
}

echo "Browser URL: " . ($body['data']['browser_url'] ?? '(express payment, no redirect)') . "\n";
echo "Reference:   " . ($body['data']['reference'] ?? '?') . "\n";
echo "Trace:       " . ($body['requestId'] ?? '?') . "\n";
