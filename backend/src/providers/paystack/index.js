/**
 * PaystackProvider — Pan-African card / bank / USSD / mobile-money aggregator
 * (NG · GH · ZA · KE, plus USD). Paystack is a Stripe company; the REST API is
 * a thin, well-documented HTTPS surface, so this provider talks to it directly
 * with axios rather than pulling in the official SDK.
 *
 * Base URL: https://api.paystack.co (single host — there is no separate sandbox
 * host; TEST vs LIVE is decided entirely by the key prefix sk_test_ / sk_live_).
 *
 * The four real-world traps this module is built to defeat (see paystack.md):
 *   1. Amount is in SUBUNITS (kobo/pesewas/cents) — always × 100. #1 mistake.
 *   2. `status:true` at the TOP LEVEL only means "the API call worked" — the real
 *      payment outcome is `data.status`, and it must be re-checked against amount
 *      + currency before anything is fulfilled.
 *   3. Webhook signature is HMAC-SHA512 of the RAW request bytes with the secret
 *      key — a re-serialised body will never match.
 *   4. Redirect ↔ webhook race — treat verify-poll + webhook as two backstops and
 *      dedupe on the (unique) reference; never trust the browser redirect as proof.
 *
 * @see docs/PROVIDER-ARCHITECTURE.md
 */
'use strict';

const axios = require('axios');
const crypto = require('crypto'); // Node built-in — HMAC-SHA512, timingSafeEqual
const { withRetry } = require('../../services/retry');
const AppError = require('../../errors/AppError');
const { get } = require('../catalog');

const meta = get('paystack');

const BASE_URL = 'https://api.paystack.co';

/**
 * Canonical status map (raw Paystack status/event → ManishaPay canonical).
 * Keyed on `data.status` values from /transaction/verify AND on the webhook
 * `event` names, both lower-cased. Anything unrecognised → 'pending' so the
 * transaction is re-polled rather than silently marked paid.
 */
const STATUS_MAP = Object.freeze({
  // transaction outcomes (data.status)
  success: 'paid',
  failed: 'failed',
  abandoned: 'failed',
  pending: 'pending',
  ongoing: 'pending',
  processing: 'pending',
  queued: 'pending',
  reversed: 'refunded',
  // webhook event names
  'charge.success': 'paid',
  'refund.processed': 'refunded',
  'refund.pending': 'pending',
  'refund.failed': 'failed',
  'dispute.create': 'disputed',
  'dispute.created': 'disputed',
  'dispute.remind': 'disputed',
  'dispute.resolve': 'disputed',
});

/**
 * Convert a major-unit decimal amount ("10.00", 10, "10") into an INTEGER number
 * of subunits (× 100). This is the single most common Paystack integration bug,
 * so we never trust the caller to pre-format — we validate and convert here.
 * @param {string|number} amount major units
 * @returns {number} integer subunits
 */
function toGatewayAmount(amount) {
  const n = typeof amount === 'string' ? Number(amount.trim().replace(',', '.')) : Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw AppError.badRequest(`Invalid amount '${amount}' — expected a positive number in major units.`, {
      resolution: 'Send amount as a positive decimal in major units (e.g. "100.00"); ManishaPay multiplies by 100 to kobo/cents.',
    });
  }
  // Round to the nearest subunit to avoid float artefacts (10.005 → 1001, not 1000.4999).
  return Math.round(n * 100);
}

/** Authorization header for a secret key. */
function authHeaders(secretKey) {
  return {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
  };
}

/** Require decrypted creds with a secret key, or throw a helpful error. */
function requireSecretKey(creds) {
  if (!creds || !creds.secretKey) {
    throw new AppError({
      status: 400,
      code: 'CREDENTIALS_REQUIRED',
      message: 'Paystack requires your Secret Key before it can move money.',
      resolution: 'Add your Paystack Secret Key (starts sk_test_ / sk_live_) in the Connect App → Paystack. Get it from Paystack dashboard → Settings → API Keys & Webhooks.',
    });
  }
  return creds.secretKey;
}

/**
 * Wrap an axios call in retry-with-backoff and map upstream failures onto
 * AppError. Paystack 4xx are terminal (bad request / auth / currency) and are
 * surfaced with the gateway's own message + a resolution hint; 5xx are retried
 * by withRetry and, if still failing, become a 502.
 */
async function request(fn, label) {
  try {
    return await withRetry(fn, { label });
  } catch (err) {
    const res = err && err.response;
    if (res && res.status >= 400 && res.status < 500) {
      const msg = (res.data && (res.data.message || res.data.error)) || 'Paystack rejected the request';
      throw new AppError({
        status: res.status === 401 ? 401 : 400,
        code: res.status === 401 ? 'PAYSTACK_AUTH_FAILED' : 'PAYSTACK_REJECTED',
        message: `Paystack: ${msg}`,
        resolution:
          res.status === 401
            ? 'Check the Secret Key — it must match the mode (sk_test_ for test, sk_live_ for live) and belong to this merchant.'
            : 'Fix the reported field. Common causes: currency not enabled on your Paystack account, duplicate reference, or amount below the minimum.',
        details: res.data,
        cause: err,
      });
    }
    throw AppError.upstream(err);
  }
}

/** @type {import('../contract').PaymentProvider} */
module.exports = {
  id: 'paystack',
  displayName: meta.displayName,
  capabilities: meta.capabilities,
  credentialSchema: meta.credentialSchema,

  // Exposed for tests / callers that need the amount invariant directly.
  toGatewayAmount,

  /**
   * Start a Paystack transaction — POST /transaction/initialize. Returns a
   * hosted `authorization_url` we redirect the customer to. The payment is
   * `pending` until the customer completes it (confirmed by webhook / verify).
   *
   * @param {Object} input - { reference, amount, currency?, email, method?, description?, return_url? }
   * @param {Object} ctx   - { mode: 'test'|'live', creds: { secretKey } | null, project }
   * @returns {Promise<import('../contract').InitiateResult>}
   */
  async initiate(input, ctx) {
    const secretKey = requireSecretKey(ctx && ctx.creds);

    if (!input || !input.email) {
      throw AppError.badRequest('Paystack requires a customer `email` to initialize a transaction.', {
        resolution: 'Include an `email` on the payment request — Paystack uses it to create/track the customer and send receipts.',
      });
    }
    if (!input.reference) {
      throw AppError.badRequest('A unique `reference` is required.', {
        resolution: 'Generate a unique reference per attempt and map it to your ManishaPay transaction id (idempotency key).',
      });
    }

    const amount = toGatewayAmount(input.amount); // subunits — the whole point

    const body = {
      email: input.email,
      amount, // integer subunits
      reference: input.reference, // unique → idempotent per attempt
    };
    if (input.currency) body.currency = String(input.currency).toUpperCase();
    const callbackUrl = input.return_url || (ctx.project && ctx.project.return_url);
    if (callbackUrl) body.callback_url = callbackUrl;
    if (input.method) body.channels = [input.method];
    if (input.description) body.metadata = { description: input.description };

    const res = await request(
      () => axios.post(`${BASE_URL}/transaction/initialize`, body, { headers: authHeaders(secretKey), timeout: 30000 }),
      'paystack.initiate',
    );

    // Top-level `status:true` only means the API call succeeded — never a payment.
    const data = (res.data && res.data.data) || {};
    if (!res.data || res.data.status !== true || !data.authorization_url) {
      throw new AppError({
        status: 502,
        code: 'PAYSTACK_INIT_FAILED',
        message: `Paystack did not return a checkout URL: ${(res.data && res.data.message) || 'unknown error'}`,
        resolution: 'Retry the request; if it persists, verify the Secret Key, currency and amount against your Paystack dashboard.',
        details: res.data,
      });
    }

    // At initialize time the transaction is always pending until the customer pays.
    const rawStatus = 'pending';
    const reference = data.reference || input.reference;

    return {
      providerRef: reference, // Paystack keys everything on the (unique) reference
      checkoutUrl: data.authorization_url,
      pollUrl: `${BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
      rawStatus,
      status: this.normalizeStatus(rawStatus),
      mode: ctx.mode,
      instructions: 'Redirect the customer to the checkout URL to complete payment.',
      raw: res.data,
    };
  },

  /**
   * Verify a transaction — GET /transaction/verify/{reference}. The REAL outcome
   * is `data.status`; we re-expose amount + currency so the caller can re-check
   * them against the order before fulfilling (guarding against tampering).
   *
   * @param {string} ref     the transaction reference (or a full verify URL)
   * @param {Object} creds   { secretKey }
   */
  async pollStatus(ref, creds) {
    const secretKey = requireSecretKey(creds);
    // Accept either a bare reference or the pollUrl we returned from initiate.
    const reference = /^https?:\/\//i.test(ref) ? ref.split('/').pop() : ref;

    const res = await request(
      () => axios.get(`${BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, { headers: authHeaders(secretKey), timeout: 30000 }),
      'paystack.pollStatus',
    );

    const data = (res.data && res.data.data) || {};
    const rawStatus = data.status || 'pending'; // key on data.status, NOT res.data.status
    return {
      providerRef: data.reference || reference,
      rawStatus,
      status: this.normalizeStatus(rawStatus),
      amount: typeof data.amount === 'number' ? data.amount : undefined, // subunits — recheck vs order
      currency: data.currency,
      paidAt: data.paid_at || data.paidAt,
      gatewayResponse: data.gateway_response,
      raw: res.data,
    };
  },

  /**
   * Map a raw Paystack status or event name → one canonical value.
   * Unknown → 'pending' (safe: it gets re-polled, never silently 'paid').
   * @param {string} raw
   * @returns {import('../contract').CanonicalStatus}
   */
  normalizeStatus(raw) {
    if (!raw) return 'pending';
    return STATUS_MAP[String(raw).trim().toLowerCase()] || 'pending';
  },

  /**
   * Verify a Paystack webhook. Signature is in the `x-paystack-signature`
   * header and equals HMAC-SHA512 of the RAW request body using the merchant's
   * SECRET KEY (not a separate webhook secret). Must be computed over the exact
   * bytes received — a re-serialised JSON body will not match.
   *
   * Returns { valid:false } on any mismatch — never throws for a bad signature.
   *
   * @param {Buffer|string} rawBody  raw request bytes (pre-JSON-parse)
   * @param {Object} headers         request headers (lower-cased keys expected)
   * @param {Object} creds           { secretKey }
   * @returns {{ valid: boolean, event?: string, status?: string, providerRef?: string }}
   */
  verifyWebhook(rawBody, headers, creds) {
    try {
      const secretKey = creds && creds.secretKey;
      const provided = headers && (headers['x-paystack-signature'] || headers['X-Paystack-Signature']);
      if (!secretKey || !provided || rawBody == null) return { valid: false };

      const expected = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');

      // Constant-time compare; unequal lengths → definitely invalid.
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(String(provided), 'utf8');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { valid: false };

      // Signature good — parse the (now-trusted) body for event details.
      let payload = {};
      try {
        payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody);
      } catch {
        // Signature matched but body isn't JSON — treat as valid-but-opaque.
        return { valid: true };
      }
      const event = payload.event;
      const data = payload.data || {};
      // Prefer the transaction status; fall back to the event name for refunds/disputes.
      const rawStatus = data.status || event;
      return {
        valid: true,
        event,
        status: this.normalizeStatus(rawStatus),
        providerRef: data.reference,
      };
    } catch {
      return { valid: false };
    }
  },

  /**
   * Refund a transaction — POST /refund. Full refund by default; pass a major-unit
   * `amount` for a partial refund (converted to subunits here).
   *
   * @param {Object} input - { transaction|providerRef|reference, amount?, currency? }
   * @param {Object} ctx   - { creds: { secretKey } }
   */
  async refund(input, ctx) {
    const secretKey = requireSecretKey(ctx && ctx.creds);
    const transaction = input && (input.transaction || input.providerRef || input.reference);
    if (!transaction) {
      throw AppError.badRequest('A `transaction` reference or id is required to refund.', {
        resolution: 'Pass the Paystack transaction reference/id (the providerRef returned from initiate/verify).',
      });
    }

    const body = { transaction };
    if (input.amount != null) body.amount = toGatewayAmount(input.amount); // partial, in subunits
    if (input.currency) body.currency = String(input.currency).toUpperCase();

    const res = await request(
      () => axios.post(`${BASE_URL}/refund`, body, { headers: authHeaders(secretKey), timeout: 30000 }),
      'paystack.refund',
    );

    const data = (res.data && res.data.data) || {};
    const rawStatus = data.status || 'pending'; // refund status: pending|processing|processed|failed
    return {
      providerRef: transaction,
      refundId: data.id,
      rawStatus,
      status: this.normalizeStatus(rawStatus === 'processed' ? 'refund.processed' : rawStatus),
      raw: res.data,
    };
  },
};
