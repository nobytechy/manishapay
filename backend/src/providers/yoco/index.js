/**
 * YocoProvider — South African card gateway (Yoco Online / Checkout API).
 * ZA only · ZAR only · card only (3DS-backed), minimum charge R2.00.
 *
 * Yoco publishes no official Node SDK, so this provider talks to the REST
 * Checkout API directly with axios. There is a SINGLE host — payments.yoco.com —
 * and TEST vs LIVE is decided entirely by the secret-key prefix (sk_test_ /
 * sk_live_), exactly like Stripe/Paystack.
 *
 * The real-world traps this module is built to defeat (see research/yoco.md):
 *   1. Amount is in CENTS (minor subunits) — always × 100 integer, and Yoco
 *      rejects anything below R2.00, so we guard the 200-cent floor locally.
 *   2. successUrl is a browser redirect, NOT proof of payment — the real outcome
 *      only arrives on the webhook (payment.succeeded) or a checkout re-fetch.
 *   3. Webhooks are Svix-signed: strip the `whsec_` prefix, base64-decode the
 *      secret, HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{rawBody}`,
 *      base64-compare, and reject anything outside a 3-minute replay window.
 *   4. No default idempotency — we auto-attach an Idempotency-Key on every
 *      mutating call so a retry can never double-charge.
 *
 * @see docs/PROVIDER-ARCHITECTURE.md
 */
'use strict';

const axios = require('axios');
const crypto = require('crypto'); // Node built-in — HMAC-SHA256, base64, timingSafeEqual
const { v4: uuidv4 } = require('uuid');
const { withRetry } = require('../../services/retry');
const AppError = require('../../errors/AppError');
const { get } = require('../catalog');

const meta = get('yoco');

const BASE_URL = 'https://payments.yoco.com/api';

/** Yoco's hard floor: R2.00 = 200 cents. Below this the API rejects the charge. */
const MIN_CENTS = 200;

/** Svix replay window — reject events whose timestamp drifts more than this. */
const REPLAY_WINDOW_SECONDS = 180; // 3 minutes

/**
 * Canonical status map (raw Yoco checkout status OR webhook event type →
 * ManishaPay canonical). Both are lower-cased before lookup. Anything
 * unrecognised → 'pending' so the transaction is re-checked rather than
 * silently marked paid. Yoco does NOT expose disputes, so 'disputed' is never
 * produced here.
 */
const STATUS_MAP = Object.freeze({
  // checkout lifecycle (GET /checkouts/{id}.status)
  created: 'pending',
  started: 'pending',
  processing: 'pending',
  pending: 'pending',
  completed: 'paid',
  succeeded: 'paid',
  failed: 'failed',
  cancelled: 'failed',
  canceled: 'failed',
  refunded: 'refunded',
  // webhook event types (payload.type)
  'payment.succeeded': 'paid',
  'payment.failed': 'failed',
  'payment.cancelled': 'failed',
  'refund.succeeded': 'refunded',
  'refund.failed': 'failed',
});

/**
 * Map a raw Yoco status / event type → one canonical value.
 * Unknown/empty → 'pending' (safe: it gets re-checked, never silently 'paid').
 * @param {string} raw
 * @returns {import('../contract').CanonicalStatus}
 */
function normalizeStatus(raw) {
  if (!raw) return 'pending';
  return STATUS_MAP[String(raw).trim().toLowerCase()] || 'pending';
}

/**
 * Convert a major-unit decimal amount ("10.00", 10, "10") into an INTEGER number
 * of CENTS (× 100), enforcing Yoco's R2.00 minimum. This is the single most
 * common Yoco integration bug, so we never trust the caller to pre-format.
 * @param {string|number} amount major units (ZAR)
 * @param {string} [currency] must be ZAR (Yoco is ZAR-only)
 * @returns {number} integer cents (>= 200)
 */
function toGatewayAmount(amount, currency = 'ZAR') {
  if (currency && String(currency).toUpperCase() !== 'ZAR') {
    throw AppError.badRequest(`Yoco only settles in ZAR — got '${currency}'.`, {
      resolution: 'Send ZAR amounts to Yoco. Route non-ZAR payments to a different gateway.',
    });
  }
  const n = typeof amount === 'string' ? Number(amount.trim().replace(',', '.')) : Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw AppError.badRequest(`Invalid amount '${amount}' — expected a positive number in major units.`, {
      resolution: 'Send amount as a positive decimal in Rand (e.g. "100.00"); ManishaPay multiplies by 100 to cents.',
    });
  }
  // Round to the nearest cent to avoid float artefacts (10.005 → 1001, not 1000.4999…).
  const cents = Math.round(n * 100);
  if (cents < MIN_CENTS) {
    throw AppError.badRequest(`Yoco's minimum charge is R2.00 — got R${(cents / 100).toFixed(2)}.`, {
      resolution: 'Increase the amount to at least R2.00 (200 cents) or aggregate small charges before sending to Yoco.',
    });
  }
  return cents;
}

/** Authorization + JSON headers for a secret key, with an auto Idempotency-Key. */
function authHeaders(secretKey, idempotencyKey) {
  return {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
    // No default idempotency on Yoco — we always attach one so a retry can't double-charge.
    'Idempotency-Key': idempotencyKey || uuidv4(),
  };
}

/** Require decrypted creds with a secret key, or throw a helpful error. */
function requireSecretKey(creds) {
  if (!creds || !creds.secretKey) {
    throw new AppError({
      status: 400,
      code: 'CREDENTIALS_REQUIRED',
      message: 'Yoco requires your Secret Key before it can move money.',
      resolution: 'Add your Yoco Secret Key (starts sk_test_ / sk_live_) in the Connect App → Yoco. Get it from the Yoco dashboard → Sell Online → Payment Gateway → API keys.',
    });
  }
  return creds.secretKey;
}

/**
 * Wrap an axios call in retry-with-backoff and map upstream failures onto
 * AppError. Yoco 4xx are terminal (bad request / auth / currency / below-min)
 * and surfaced with the gateway's own message + a resolution hint; 5xx are
 * retried by withRetry and, if still failing, become a 502.
 */
async function request(fn, label) {
  try {
    return await withRetry(fn, { label });
  } catch (err) {
    const res = err && err.response;
    if (res && res.status >= 400 && res.status < 500) {
      const data = res.data || {};
      const msg = data.message || data.error || (data.description) || 'Yoco rejected the request';
      throw new AppError({
        status: res.status === 401 ? 401 : 400,
        code: res.status === 401 ? 'YOCO_AUTH_FAILED' : 'YOCO_REJECTED',
        message: `Yoco: ${msg}`,
        resolution:
          res.status === 401
            ? 'Check the Secret Key — it must match the mode (sk_test_ for test, sk_live_ for live) and belong to this merchant.'
            : 'Fix the reported field. Common causes: amount below R2.00, non-ZAR currency, or a malformed successUrl/cancelUrl.',
        details: res.data,
        cause: err,
      });
    }
    throw AppError.upstream(err);
  }
}

/**
 * Compute a Svix signature: base64( HMAC-SHA256( key, `{id}.{timestamp}.{body}` ) )
 * where `key` is the base64-decoded secret with its `whsec_` prefix stripped.
 * Exposed for tests (Svix known-answer vector).
 * @param {string} secret   the whsec_… webhook secret
 * @param {string} id        webhook-id header
 * @param {string} timestamp webhook-timestamp header
 * @param {string} body      the RAW request body (exact bytes, as a string)
 * @returns {string} base64 signature
 */
function signSvix(secret, id, timestamp, body) {
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const signedContent = `${id}.${timestamp}.${body}`;
  return crypto.createHmac('sha256', key).update(signedContent, 'utf8').digest('base64');
}

/** Lower-case all header keys so lookups are case-insensitive. */
function lowerHeaders(headers) {
  const out = {};
  if (headers) {
    for (const k of Object.keys(headers)) out[k.toLowerCase()] = headers[k];
  }
  return out;
}

/** @type {import('../contract').PaymentProvider} */
module.exports = {
  id: 'yoco',
  displayName: meta.displayName,
  capabilities: meta.capabilities,
  credentialSchema: meta.credentialSchema,

  // Exposed for tests / callers that need the invariants directly.
  toGatewayAmount,
  signSvix,

  /**
   * Start a Yoco checkout — POST /checkouts. Returns a hosted `redirectUrl` we
   * send the customer to. The checkout is `created` (pending) until the customer
   * completes payment — confirmed by the payment.succeeded webhook or a re-fetch.
   * NEVER treat the successUrl redirect as proof of payment.
   *
   * @param {Object} input - { reference, amount, currency?, description?, return_url?, cancel_url?, failure_url?, idempotencyKey? }
   * @param {Object} ctx   - { mode: 'test'|'live', creds: { secretKey } | null, project }
   * @returns {Promise<import('../contract').InitiateResult>}
   */
  async initiate(input, ctx) {
    const secretKey = requireSecretKey(ctx && ctx.creds);

    if (!input || !input.reference) {
      throw AppError.badRequest('A unique `reference` is required.', {
        resolution: 'Generate a unique reference per attempt and map it to your ManishaPay transaction id (idempotency key).',
      });
    }

    const amount = toGatewayAmount(input.amount, input.currency); // CENTS — the whole point

    const body = {
      amount, // integer cents
      currency: 'ZAR', // Yoco is ZAR-only
    };

    const project = (ctx && ctx.project) || {};
    const successUrl = input.return_url || project.return_url;
    const cancelUrl = input.cancel_url || input.return_url || project.return_url;
    const failureUrl = input.failure_url || input.return_url || project.return_url;
    if (successUrl) body.successUrl = successUrl;
    if (cancelUrl) body.cancelUrl = cancelUrl;
    if (failureUrl) body.failureUrl = failureUrl;

    // Carry our reference through so the webhook can be reconciled back to us.
    body.metadata = { manishapayReference: String(input.reference) };
    if (input.description) body.metadata.description = String(input.description);

    // Deterministic idempotency key per attempt → a retry can never double-charge.
    const idempotencyKey = input.idempotencyKey || `mp_${input.reference}`;

    const res = await request(
      () => axios.post(`${BASE_URL}/checkouts`, body, { headers: authHeaders(secretKey, idempotencyKey), timeout: 20000 }),
      'yoco.initiate',
    );

    const data = res.data || {};
    if (!data.id || !data.redirectUrl) {
      throw new AppError({
        status: 502,
        code: 'YOCO_INIT_FAILED',
        message: `Yoco did not return a checkout redirect URL: ${data.message || 'unknown error'}`,
        resolution: 'Retry the request; if it persists, verify the Secret Key, amount (>= R2.00) and URLs against your Yoco dashboard.',
        details: data,
      });
    }

    const rawStatus = data.status || 'created'; // created at initiate time
    return {
      providerRef: data.id,
      checkoutUrl: data.redirectUrl,
      pollUrl: `${BASE_URL}/checkouts/${encodeURIComponent(data.id)}`,
      rawStatus,
      status: normalizeStatus(rawStatus),
      mode: ctx.mode,
      instructions: 'Redirect the customer to the checkout URL to complete the card payment. Confirm the outcome on the webhook, not the successUrl redirect.',
      raw: data,
    };
  },

  /**
   * Fetch the latest checkout state — GET /checkouts/{id}. The real outcome is
   * `status`; we re-expose amount + currency so the caller can re-check them
   * against the order before fulfilling (guarding against tampering / a spoofed
   * successUrl).
   *
   * @param {string} ref     the checkout id (or the full pollUrl from initiate)
   * @param {Object} creds   { secretKey }
   */
  async pollStatus(ref, creds) {
    const secretKey = requireSecretKey(creds);
    // Accept either a bare checkout id or the pollUrl we returned from initiate.
    const id = /^https?:\/\//i.test(ref) ? ref.split('/').pop() : ref;

    const res = await request(
      () => axios.get(`${BASE_URL}/checkouts/${encodeURIComponent(id)}`, { headers: authHeaders(secretKey), timeout: 20000 }),
      'yoco.pollStatus',
    );

    const data = res.data || {};
    const rawStatus = data.status || 'created';
    return {
      providerRef: data.id || id,
      rawStatus,
      status: normalizeStatus(rawStatus),
      amount: typeof data.amount === 'number' ? data.amount : undefined, // cents — recheck vs order
      currency: data.currency,
      raw: data,
    };
  },

  normalizeStatus,

  /**
   * Verify a Yoco webhook (Svix scheme). Headers `webhook-id`,
   * `webhook-timestamp`, `webhook-signature`; the signature is
   * base64( HMAC-SHA256( base64decode(secret w/o whsec_), `{id}.{timestamp}.{rawBody}` ) ).
   * The `webhook-signature` header may carry several space-separated
   * `v1,<sig>` entries — a match against any one is enough. Events older than the
   * 3-minute replay window are rejected.
   *
   * Returns { valid:false } on any mismatch — never throws for a bad signature.
   *
   * @param {Buffer|string} rawBody  raw request bytes (pre-JSON-parse)
   * @param {Object} headers         request headers (any casing)
   * @param {Object} creds           { webhookSecret }
   * @returns {{ valid: boolean, event?: string, status?: string, providerRef?: string }}
   */
  verifyWebhook(rawBody, headers, creds) {
    try {
      const secret = creds && creds.webhookSecret;
      if (!secret || rawBody == null) return { valid: false };

      const h = lowerHeaders(headers);
      const id = h['webhook-id'] || h['svix-id'];
      const timestamp = h['webhook-timestamp'] || h['svix-timestamp'];
      const sigHeader = h['webhook-signature'] || h['svix-signature'];
      if (!id || !timestamp || !sigHeader) return { valid: false };

      // Replay guard — reject anything outside the 3-minute window.
      const ts = Number(timestamp);
      if (!Number.isFinite(ts)) return { valid: false };
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - ts) > REPLAY_WINDOW_SECONDS) return { valid: false };

      const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
      const expected = signSvix(secret, id, timestamp, body);
      const expectedBuf = Buffer.from(expected, 'base64');

      // The header is a space-separated list of `v1,<b64sig>` (or bare <b64sig>).
      const provided = String(sigHeader)
        .split(' ')
        .map((p) => (p.includes(',') ? p.substring(p.indexOf(',') + 1) : p))
        .filter(Boolean);

      const match = provided.some((sig) => {
        const b = Buffer.from(sig, 'base64');
        return b.length === expectedBuf.length && crypto.timingSafeEqual(b, expectedBuf);
      });
      if (!match) return { valid: false };

      // Signature good — parse the (now-trusted) body for event details.
      let event = {};
      try {
        event = JSON.parse(body);
      } catch {
        return { valid: true }; // signature matched but body isn't JSON — valid-but-opaque
      }
      const type = event.type || event.event;
      const payload = event.payload || event.data || {};
      const providerRef =
        payload.id ||
        payload.checkoutId ||
        (payload.metadata && (payload.metadata.checkoutId || payload.metadata.manishapayReference));

      return {
        valid: true,
        event: type,
        status: normalizeStatus(type),
        providerRef,
      };
    } catch {
      return { valid: false };
    }
  },

  /**
   * Refund a checkout — POST /checkouts/{id}/refund. Full refund by default; pass
   * a major-unit `amount` for a partial refund (converted to cents here).
   *
   * @param {Object} input - { providerRef|checkoutId|id, amount?, currency? }
   * @param {Object} ctx   - { creds: { secretKey } }
   */
  async refund(input, ctx) {
    const secretKey = requireSecretKey(ctx && ctx.creds);
    const id = input && (input.providerRef || input.checkoutId || input.id);
    if (!id) {
      throw AppError.badRequest('A checkout id (`providerRef`) is required to refund.', {
        resolution: 'Pass the Yoco checkout id (the providerRef returned from initiate/poll).',
      });
    }

    const body = {};
    // Partial refund → cents. Omit amount for a full refund.
    if (input.amount != null) body.amount = toGatewayAmount(input.amount, input.currency);

    const idempotencyKey = input.idempotencyKey || `mp_refund_${id}`;
    const res = await request(
      () => axios.post(`${BASE_URL}/checkouts/${encodeURIComponent(id)}/refund`, body, { headers: authHeaders(secretKey, idempotencyKey), timeout: 20000 }),
      'yoco.refund',
    );

    const data = res.data || {};
    const rawStatus = data.status || 'refund.succeeded';
    return {
      providerRef: id,
      refundId: data.id,
      rawStatus,
      status: normalizeStatus(rawStatus),
      raw: data,
    };
  },
};
