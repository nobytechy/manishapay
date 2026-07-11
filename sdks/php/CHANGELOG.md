# Changelog

All notable changes to the ManishaPay PHP SDK are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-07-10

First stable release.

### Added
- `ManishaPay\ManishaPay` client with `pay()` and `status()` methods.
- `ManishaPay::verifyWebhook()` — HMAC-SHA256 signature verification with
  timestamp-tolerance replay protection.
- `ManishaPay\ManishaPayError` with `errorCode`, `requestId` and `details`.
- Configurable `baseUrl` and request `timeout`.
- Smoke test suite (`php test.php` / `composer test`).
- PHP 7.4+, requires only `ext-curl` and `ext-json`.
