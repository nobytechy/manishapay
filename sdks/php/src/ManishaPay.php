<?php
/**
 * ManishaPay — official PHP SDK.
 *
 * PHP 7.4+, only requires php-curl and php-json (both standard).
 * Composer-installable as `manishapay/manishapay` from Packagist.
 *
 * Usage:
 *   $mp = new ManishaPay\ManishaPay(getenv('MANISHAPAY_API_KEY'));
 *   $r = $mp->pay(['reference' => 'order-1', 'amount' => '5.00']);
 *   header('Location: ' . $r['browser_url']);
 */

declare(strict_types=1);

namespace ManishaPay;

class ManishaPayError extends \Exception
{
    public string $errorCode;
    public ?string $requestId;
    public $details;

    public function __construct(string $message, string $errorCode, int $status, ?string $requestId = null, $details = null)
    {
        parent::__construct($message, $status);
        $this->errorCode = $errorCode;
        $this->requestId = $requestId;
        $this->details   = $details;
    }
}

class ManishaPay
{
    public const DEFAULT_BASE = 'https://pay.aizim.co.zw/api';

    private string $apiKey;
    private string $baseUrl;
    private int    $timeout;

    public function __construct(string $apiKey, array $options = [])
    {
        if (!preg_match('/^mp_(test|live)_/', $apiKey)) {
            throw new \InvalidArgumentException('apiKey must start with mp_test_ or mp_live_');
        }
        $this->apiKey  = $apiKey;
        $this->baseUrl = rtrim($options['baseUrl'] ?? self::DEFAULT_BASE, '/');
        $this->timeout = (int)($options['timeout'] ?? 15);
    }

    /**
     * Initiate a payment. Returns the data block from /v1/pay.
     *
     * @param array $input  reference, amount, description?, email?, phone?, method?, return_url?, result_url?
     * @return array  { tracker, browser_url, poll_url, status, mode, instructions? }
     */
    public function pay(array $input): array
    {
        return $this->request('POST', '/v1/pay', $input);
    }

    /**
     * Look up a transaction by your merchant reference.
     */
    public function status(string $reference): array
    {
        return $this->request('GET', '/v1/pay/' . rawurlencode($reference) . '/status');
    }

    /**
     * Verify a webhook signature header against the raw request body.
     * Returns true if valid + within tolerance, false otherwise.
     *
     * @param string $rawBody          file_get_contents('php://input')
     * @param string $signatureHeader  $_SERVER['HTTP_X_MANISHAPAY_SIGNATURE']
     * @param string $secret           the project's webhook secret
     * @param int    $toleranceSeconds max age of timestamp (default 300s)
     */
    public static function verifyWebhook(string $rawBody, ?string $signatureHeader, string $secret, int $toleranceSeconds = 300): bool
    {
        if (!$signatureHeader || !$secret) {
            return false;
        }
        $parts = [];
        foreach (explode(',', $signatureHeader) as $kv) {
            $i = strpos($kv, '=');
            if ($i !== false) {
                $parts[trim(substr($kv, 0, $i))] = trim(substr($kv, $i + 1));
            }
        }
        $ts  = isset($parts['t']) ? (int)$parts['t'] : 0;
        $sig = $parts['v1'] ?? '';
        if (!$ts || !$sig) {
            return false;
        }
        if (abs(time() - $ts) > $toleranceSeconds) {
            return false;
        }
        $expected = hash_hmac('sha256', $ts . '.' . $rawBody, $secret);
        return hash_equals($expected, $sig);
    }

    // ─── Internal ────────────────────────────────────────────────────

    private function request(string $method, string $path, ?array $body = null): array
    {
        $ch = curl_init($this->baseUrl . $path);
        $headers = [
            'Authorization: Bearer ' . $this->apiKey,
            'Content-Type: application/json',
            'X-Request-Id: php-' . bin2hex(random_bytes(8)),
        ];
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => $this->timeout,
            CURLOPT_HEADER         => false,
        ];
        if ($body !== null) {
            $opts[CURLOPT_POSTFIELDS] = json_encode($body);
        }
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $err = curl_errno($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if ($err) {
            throw new ManishaPayError('curl error: ' . curl_strerror($err), 'NETWORK', 0);
        }

        $json = $raw === false ? null : json_decode($raw, true);

        if ($status >= 400 || !is_array($json)) {
            $e = (is_array($json) && isset($json['error'])) ? $json['error'] : [];
            throw new ManishaPayError(
                $e['message'] ?? ('HTTP ' . $status),
                $e['code'] ?? 'NETWORK',
                $status,
                $json['requestId'] ?? null,
                $e['details'] ?? null
            );
        }
        return $json['data'] ?? $json;
    }
}
