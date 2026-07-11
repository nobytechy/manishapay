# Changelog

All notable changes to the ManishaPay Node.js SDK are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-07-10

First stable release.

### Added
- `ManishaPay` client with `pay()` and `status()` methods.
- `ManishaPay.verifyWebhook()` — HMAC-SHA256 signature verification with
  timestamp-tolerance replay protection.
- `ManishaPayError` with `code`, `status`, `requestId` and `details`.
- Configurable `baseUrl`, request `timeout`, and injectable `fetch` (for tests).
- Smoke test suite (`npm test`, Node ≥18).
