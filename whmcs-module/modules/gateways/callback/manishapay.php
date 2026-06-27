<?php
/**
 * ManishaPay → WHMCS callback (webhook receiver) — BETA.
 *
 * ⚠️  BETA — test in a staging WHMCS before production use.
 *
 * Receives the signed `payment.updated` webhook from ManishaPay, verifies the
 * X-ManishaPay-Signature (HMAC-SHA256 over `<t>.<rawBody>` using the webhook
 * endpoint's signing secret), and marks the matching WHMCS invoice paid.
 */

require_once __DIR__ . '/../../../init.php';
require_once __DIR__ . '/../../../includes/gatewayfunctions.php';
require_once __DIR__ . '/../../../includes/invoicefunctions.php';

$gatewayModuleName = 'manishapay';
$gatewayParams = getGatewayVariables($gatewayModuleName);

if (!$gatewayParams['type']) {
    die('Module Not Activated');
}

$rawBody = file_get_contents('php://input');
$sigHeader = isset($_SERVER['HTTP_X_MANISHAPAY_SIGNATURE']) ? $_SERVER['HTTP_X_MANISHAPAY_SIGNATURE'] : '';

// Parse the "t=<unix>,v1=<hex>" signature header.
$ts = null;
$sig = null;
foreach (explode(',', $sigHeader) as $part) {
    $kv = explode('=', trim($part), 2);
    if (count($kv) === 2) {
        if ($kv[0] === 't') {
            $ts = $kv[1];
        } elseif ($kv[0] === 'v1') {
            $sig = $kv[1];
        }
    }
}

$secret = $gatewayParams['webhookSecret'];
$expected = hash_hmac('sha256', $ts . '.' . $rawBody, (string) $secret);

if (!$sig || !$ts || !hash_equals($expected, $sig)) {
    http_response_code(400);
    logTransaction($gatewayParams['name'], $rawBody, 'Signature mismatch');
    die('signature mismatch');
}

$event = json_decode($rawBody, true);
$data = isset($event['data']) ? $event['data'] : array();
$invoiceId = isset($data['reference']) ? $data['reference'] : null;        // = WHMCS invoice id we sent
$statusNorm = isset($data['status_normalized']) ? $data['status_normalized'] : null;
$amount = isset($data['amount']) ? $data['amount'] : 0;
$transId = isset($data['tracker']) ? $data['tracker'] : null;             // ManishaPay tracker = unique txn id

if (!$invoiceId || !$transId) {
    http_response_code(200);
    die('missing fields');
}

if ($statusNorm === 'paid') {
    $invoiceId = checkCbInvoiceID($invoiceId, $gatewayParams['name']);
    checkCbTransID($transId);                                              // prevents double-posting
    addInvoicePayment($invoiceId, $transId, $amount, 0, $gatewayModuleName);
    logTransaction($gatewayParams['name'], $rawBody, 'Successful (paid)');
} else {
    // Acknowledge non-paid updates so ManishaPay/PayNow stops retrying; just log.
    logTransaction($gatewayParams['name'], $rawBody, 'Status: ' . $statusNorm);
}

http_response_code(200);
echo 'ok';
