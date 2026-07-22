# ManishaPay SDKs

## Client SDKs — moved to their own repo

The **Node.js** and **PHP** client SDKs now live in a single dedicated repository:

**→ https://github.com/nobytechy/manishapay-sdks**

- **Node.js** — [`manishapay`](https://www.npmjs.com/package/manishapay) on npm (`packages/nodejs`)
- **PHP** — [`manishapay/manishapay`](https://packagist.org/packages/manishapay/manishapay) on Packagist (`packages/php`)

That repo is the single source of truth for those SDKs (code, tests, CI, releases).
**Do not add Node/PHP SDK code here** — edit them in `manishapay-sdks` instead.

## What stays here

- [`cli/`](./cli) — the `manishapay listen` CLI, a repo-specific dev tool tied to
  this backend's `/v1/cli/events` endpoint.
