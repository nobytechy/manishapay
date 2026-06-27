<?php
/**
 * ManishaPay payment gateway for WHMCS — BETA.
 *
 * ⚠️  BETA: this module is structurally complete and follows the documented
 *     WHMCS gateway pattern, but it has NOT yet been tested inside a live
 *     WHMCS install. Test it on a staging WHMCS (with a ManishaPay test key)
 *     and confirm the callback marks invoices paid BEFORE using in production.
 *
 * Routes WHMCS invoice payments through ManishaPay (PayNow Zimbabwe — and, on
 * the ManishaPay roadmap, Stripe and other gateways) via the ManishaPay REST
 * API. The customer is redirected to the ManishaPay / PayNow checkout; payment
 * is confirmed by a signed ManishaPay webhook delivered to
 * modules/gateways/callback/manishapay.php.
 *
 * Install:
 *   1. Copy this file to            <whmcs>/modules/gateways/manishapay.php
 *   2. Copy the callback file to    <whmcs>/modules/gateways/callback/manishapay.php
 *   3. WHMCS Admin → Setup → Payments → Payment Gateways → activate "ManishaPay"
 *   4. Fill in API Base URL, API Key (mp_live_… / mp_test_…) and Webhook Secret.
 *   5. In the ManishaPay dashboard, add a webhook endpoint pointing to
 *      <whmcs>/modules/gateways/callback/manishapay.php and copy its signing
 *      secret into the module's "Webhook Signing Secret" field.
 */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

function manishapay_MetaData()
{
    return array(
        'DisplayName' => 'ManishaPay (PayNow Zimbabwe)',
        'APIVersion' => '1.1',
        'DisableLocalCreditCardInput' => true,
        'TokenisedStorage' => false,
    );
}

function manishapay_config()
{
    return array(
        'FriendlyName' => array(
            'Type' => 'System',
            'Value' => 'ManishaPay (PayNow Zimbabwe)',
        ),
        'apiBase' => array(
            'FriendlyName' => 'ManishaPay API Base URL',
            'Type' => 'text',
            'Size' => '50',
            'Default' => 'https://your-api.onrender.com',
            'Description' => 'e.g. https://your-render-app.onrender.com (no trailing slash)',
        ),
        'apiKey' => array(
            'FriendlyName' => 'API Key',
            'Type' => 'password',
            'Size' => '50',
            'Description' => 'Your ManishaPay API key (mp_live_… for production, mp_test_… for testing)',
        ),
        'webhookSecret' => array(
            'FriendlyName' => 'Webhook Signing Secret',
            'Type' => 'password',
            'Size' => '50',
            'Description' => 'Signing secret of your ManishaPay webhook endpoint — used to verify callbacks.',
        ),
    );
}

/**
 * Generates the "Pay with ManishaPay" button shown on the WHMCS invoice.
 * Calls ManishaPay /v1/pay to create the checkout and links the customer to it.
 */
function manishapay_link($params)
{
    $apiBase = rtrim($params['apiBase'], '/');
    $apiKey = $params['apiKey'];

    $invoiceId = $params['invoiceid'];
    $amount = $params['amount'];           // pre-formatted by WHMCS
    $currency = $params['currencycode'];   // e.g. USD / ZWL
    $description = $params['description'];

    $systemUrl = rtrim($params['systemurl'], '/');
    $returnUrl = $systemUrl . '/viewinvoice.php?id=' . $invoiceId;
    $resultUrl = $systemUrl . '/modules/gateways/callback/manishapay.php';

    $payload = json_encode(array(
        'reference'   => (string) $invoiceId,
        'amount'      => $amount,
        'currency'    => in_array($currency, array('USD', 'ZWL'), true) ? $currency : 'USD',
        'description' => $description,
        'return_url'  => $returnUrl,
        'result_url'  => $resultUrl,
    ));

    $ch = curl_init($apiBase . '/v1/pay');
    curl_setopt_array($ch, array(
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => array(
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey,
        ),
    ));
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($response === false || $httpCode >= 400) {
        return '<div style="color:#b91c1c">Unable to start ManishaPay checkout. Please try again.</div>';
    }

    $data = json_decode($response, true);
    $browserUrl = isset($data['data']['browser_url']) ? $data['data']['browser_url'] : null;
    $qr = isset($data['data']['qr_code']) ? $data['data']['qr_code'] : null;

    if (!$browserUrl) {
        return '<div style="color:#b91c1c">ManishaPay did not return a checkout URL.</div>';
    }

    $html = '<a href="' . htmlspecialchars($browserUrl) . '" '
          . 'style="display:inline-block;padding:10px 18px;background:#10b981;color:#fff;'
          . 'border-radius:8px;text-decoration:none;font-weight:600">Pay with ManishaPay</a>';
    if ($qr) {
        $html .= '<div style="margin-top:12px">'
               . '<div style="font-size:12px;color:#64748b;margin-bottom:4px">Or scan to pay:</div>'
               . '<img src="' . htmlspecialchars($qr) . '" alt="Scan to pay" width="180" height="180"/></div>';
    }
    return $html;
}
