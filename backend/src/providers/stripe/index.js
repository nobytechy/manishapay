/**
 * StripeProvider — global card / wallet PaymentProvider.
 *
 * Speaks the real Stripe REST API directly (no `stripe` SDK) so ManishaPay
 * stays a single thin dependency surface:
 *   • initiate()      → POST /v1/checkout/sessions   (hosted Checkout, amount in minor units)
 *   • pollStatus()    → GET  /v1/checkout/sessions/{id}  or  /v1/payment_intents/{id}
 *   • verifyWebhook() → Stripe-Signature HMAC-SHA256 over `${t}.${rawBody}` vs whsec_ (300s tol.)
 *   • refund()        → POST /v1/refunds
 *
 * ctx.creds = { secretKey, webhookSecret }.
 *
 * Real-world pain points this adapter preempts (see dataset/gateways/stripe.json):
 *   1. Webhook sig fails on a mutated body   → verify over RAW bytes only, never a re-serialised JSON.
 *   2. Duplicate at-least-once delivery      → we surface event.id so routes can dedupe.
 *   3. Out-of-order events / redirect race   → never trust the redirect; confirm via webhook/poll.
 *   5. Duplicate charges on retry            → auto-attach an `Idempotency-Key` on every POST.
 *   6. cents vs zero-decimal confusion       → single decimal API amount, converted via a zero-decimal table.
 *   7. SCA / 3DS `requires_action` stalls    → mapped to `pending` (hosted Checkout handles 3DS).
 *   8. test/live key-mode mismatch           → validate the sk_ prefix against ctx.mode up front.
 *
 * @see docs/PROVIDER-ARCHITECTURE.md
 */
'use strict';

const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { withRetry } = require('../../services/retry');
const AppError = require('../../errors/AppError');
const { get } = require('../catalog');

const meta = get('stripe');

// Stripe uses ONE host for both test and live — the key prefix (sk_test_ /
// sk_live_) selects the environment, not the URL. So there is no separate
// sandbox host to switch on by ctx.mode; we validate the key prefix instead.
const STRIPE_API_BASE = 'https://api.stripe.com';
const WEBHOOK_TOLERANCE_SECONDS = 300;

const http = axios.create({
  baseURL: STRIPE_API_BASE,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  validateStatus: () => true, // we branch on status ourselves (mirrors services/paynow.js)
});

/**
 * Zero-decimal currencies — Stripe expects the amount as a WHOLE number of the
 * major unit (¥500 = `500`, not `50000`). Every other currency is × 100.
 * Source: https://docs.stripe.com/currencies#zero-decimal
 */
const ZERO_DECIMAL = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

/**
 * Canonical status map. Covers BOTH Checkout Session `payment_status`
 * (paid/unpaid/no_payment_required), PaymentIntent/Charge/Refund `status`
 * (succeeded/processing/requires_action/canceled), and the two event-type tokens
 * we synthesise for dispute/refund webhooks. Anything unknown → `pending`
 * (re-polled), never silently `paid`.
 */
const STATUS_MAP = {
  // Checkout Session payment_status
  paid: 'paid',
  unpaid: 'pending',
  no_payment_required: 'paid',
  // Checkout Session status
  open: 'pending',
  complete: 'paid',
  expired: 'failed',
  // PaymentIntent / Charge status
  succeeded: 'paid',
  processing: 'pending',
  requires_action: 'pending',
  requires_confirmation: 'pending',
  requires_capture: 'pending',
  requires_payment_method: 'failed',
  canceled: 'failed',
  cancelled: 'failed',
  // Synthesised from webhook event types
  'charge.dispute.created': 'disputed',
  disputed: 'disputed',
  'charge.refunded': 'refunded',
  refunded: 'refunded',
};

/**
 * Maps a Stripe raw status (or a dispute/refund event token) → one canonical
 * value. @param {string} raw @returns {import('../contract').CanonicalStatus}
 */
function normalizeStatus(raw) {
  return STATUS_MAP[String(raw || '').trim().toLowerCase()] || 'pending';
}

/**
 * Converts a decimal major-unit amount ("10.00") to the integer minor unit
 * Stripe expects, honouring zero-decimal currencies. This is the single point
 * where cents conversion happens — the ManishaPay API only ever speaks decimals.
 * @param {string|number} amount  major units, e.g. "10.00"
 * @param {string} currency       ISO 4217, e.g. "usd" | "jpy"
 * @returns {number} integer in Stripe's smallest unit
 */
function toGatewayAmount(amount, currency) {
  if (amount == null) throw AppError.badRequest('amount is required');
  const n = Number(String(amount).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) {
    throw AppError.badRequest(`amount '${amount}' is not a positive number`, { received: amount });
  }
  const cur = String(currency || 'usd').toLowerCase();
  // Math.round absorbs float noise (10.10 * 100 === 1009.9999999999999).
  return ZERO_DECIMAL.has(cur) ? Math.round(n) : Math.round(n * 100);
}

/**
 * Guards against the #8 pain point: paying with a test key in live mode (or
 * vice-versa). Restricted keys (rk_) are allowed too.
 */
function assertKeyMode(secretKey, mode) {
  if (!secretKey || !/^(sk|rk)_(test|live)_/.test(secretKey)) {
    throw new AppError({
      status: 400,
      code: 'CREDENTIALS_INVALID',
      message: 'Stripe secret key is missing or malformed.',
      resolution: 'Use the Secret key from Stripe → Developers → API keys (starts with sk_test_ or sk_live_).',
    });
  }
  const isTestKey = secretKey.includes('_test_');
  if (mode === 'live' && isTestKey) {
    throw new AppError({
      status: 400,
      code: 'KEY_MODE_MISMATCH',
      message: 'A Stripe TEST key (sk_test_) was used for a LIVE payment.',
      resolution: 'Add your live secret key (sk_live_) to this project, or send the request with a test API key.',
    });
  }
  if (mode === 'test' && !isTestKey) {
    throw new AppError({
      status: 400,
      code: 'KEY_MODE_MISMATCH',
      message: 'A Stripe LIVE key (sk_live_) was used for a TEST payment.',
      resolution: 'Use your test secret key (sk_test_) for sandbox testing, or send the request with a live API key.',
    });
  }
}

/** Flattens a nested object into Stripe's bracketed form-encoding pairs. */
function flatten(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item && typeof item === 'object') flatten(item, `${key}[${i}]`, out);
        else out.push([`${key}[${i}]`, String(item)]);
      });
    } else if (v && typeof v === 'object') {
      flatten(v, key, out);
    } else {
      out.push([key, String(v)]);
    }
  }
}

/** Serialises a (possibly nested) object to an application/x-www-form-urlencoded string. */
function toFormBody(obj) {
  const out = [];
  flatten(obj, '', out);
  const p = new URLSearchParams();
  for (const [k, v] of out) p.append(k, v);
  return p.toString();
}

/** Turns a Stripe API error payload into a targeted, actionable resolution. */
function stripeResolution(err) {
  const code = String(err.code || '').toLowerCase();
  const type = String(err.type || '').toLowerCase();
  if (type === 'authentication_error' || code === 'api_key_expired') {
    return 'Stripe rejected the secret key. Re-check the key (and that its test/live mode matches this request) in Stripe → Developers → API keys.';
  }
  if (code === 'amount_too_small') {
    return 'The amount is below Stripe\'s minimum for this currency (about $0.50 / £0.30 / €0.50). Increase the amount.';
  }
  if (code === 'amount_too_large') {
    return 'The amount exceeds Stripe\'s maximum for this currency. Split the charge or lower the amount.';
  }
  if (code === 'parameter_invalid_empty' || type === 'invalid_request_error') {
    return `Stripe rejected a request parameter${err.param ? ` (${err.param})` : ''}. Check the currency is supported and success_url is an absolute https URL.`;
  }
  return 'See the Stripe dashboard → Developers → Logs for the full request, then correct the flagged parameter.';
}

/** Central status/error branching for every Stripe HTTP response. */
function ensureOk(res, label) {
  if (res.status >= 500) {
    throw AppError.upstream(new Error(`Stripe returned ${res.status} on ${label}`));
  }
  if (res.status >= 400) {
    const err = (res.data && res.data.error) || {};
    throw new AppError({
      status: res.status === 401 ? 401 : 400,
      code: 'STRIPE_REJECTED',
      message: err.message || `Stripe rejected ${label} (HTTP ${res.status})`,
      resolution: stripeResolution(err),
      details: { type: err.type, code: err.code, param: err.param, doc_url: err.doc_url },
    });
  }
  return res.data;
}

/** @type {import('../contract').PaymentProvider} */
module.exports = {
  id: 'stripe',
  displayName: meta.displayName,
  capabilities: meta.capabilities,
  credentialSchema: meta.credentialSchema,

  // Exposed for unit tests + internal reuse.
  normalizeStatus,
  toGatewayAmount,

  /**
   * Create a hosted Checkout Session and return the neutral InitiateResult.
   * @param {Object} input - { reference, amount, currency, email?, description?, return_url?, cancel_url?, result_url? }
   * @param {Object} ctx   - { mode, creds: { secretKey, webhookSecret }, project }
   * @returns {Promise<import('../contract').InitiateResult>}
   */
  async initiate(input, ctx) {
    const creds = ctx.creds;
    // Unlike PayNow, Stripe has no zero-credential simulator path.
    if (!creds || !creds.secretKey) {
      throw new AppError({
        status: 400,
        code: 'CREDENTIALS_REQUIRED',
        message: 'Stripe requires a secret key for every request (there is no simulator fallback).',
        resolution: 'Add your Stripe secret key in the ManishaPay dashboard → Project → Stripe credentials. Test keys are instant from Stripe → Developers → API keys.',
      });
    }
    assertKeyMode(creds.secretKey, ctx.mode);

    const project = ctx.project || {};
    const currency = String(input.currency || 'usd').toLowerCase();
    const unitAmount = toGatewayAmount(input.amount, currency);

    // Stripe REQUIRES success_url for mode=payment. Never gate fulfilment on it
    // (pain point #3) — it's only where the browser lands after checkout.
    const successUrl = input.return_url || project.return_url;
    if (!successUrl) {
      throw AppError.badRequest('A success/return URL is required to create a Stripe Checkout Session.', {
        resolution: 'Pass return_url in the request or configure a project return_url. It must be an absolute https URL.',
      });
    }
    const cancelUrl = input.cancel_url || successUrl;

    const payload = {
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: input.reference,
      customer_email: input.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: unitAmount,
            product_data: { name: input.description || input.reference || 'ManishaPay payment' },
          },
        },
      ],
      metadata: { reference: input.reference || '' },
    };

    // Idempotency-Key (pain point #5): the same key across retries of THIS
    // logical request means a reset connection can't double-create a session.
    const idempotencyKey = uuidv4();
    const res = await withRetry(
      () => http.post('/v1/checkout/sessions', toFormBody(payload), {
        auth: { username: creds.secretKey, password: '' },
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      { label: 'stripe.initiate' },
    );
    const session = ensureOk(res, 'checkout session create');
    const rawStatus = session.payment_status || session.status;

    return {
      providerRef: session.id, // cs_test_… — what we store + poll on later
      checkoutUrl: session.url,
      pollUrl: `${STRIPE_API_BASE}/v1/checkout/sessions/${session.id}`,
      rawStatus,
      status: normalizeStatus(rawStatus),
      mode: ctx.mode,
      instructions:
        'Redirect the customer to checkoutUrl. Do NOT treat the redirect back to success_url as proof of payment — confirm via the webhook or pollStatus.',
      raw: session,
    };
  },

  /**
   * Poll the latest status. `ref` may be a Checkout Session id (cs_…) or a
   * PaymentIntent id (pi_…); we pick the endpoint by prefix.
   * @param {string} ref
   * @param {Object} creds - { secretKey }
   */
  async pollStatus(ref, creds) {
    if (!creds || !creds.secretKey) {
      throw new AppError({
        status: 400,
        code: 'CREDENTIALS_REQUIRED',
        message: 'A Stripe secret key is required to poll status.',
        resolution: 'Provide the project\'s Stripe secret key.',
      });
    }
    if (!ref) throw AppError.badRequest('providerRef is required to poll status');

    // Callers (pay.js /status, reconcile) pass the stored `pollUrl` — a full URL —
    // OR a bare id. Accept both: reduce a URL to its last path segment (the id).
    if (/^https?:\/\//i.test(ref)) ref = ref.split('?')[0].split('/').pop();

    const isPI = ref.startsWith('pi_');
    const path = isPI ? `/v1/payment_intents/${ref}` : `/v1/checkout/sessions/${ref}`;

    const res = await withRetry(
      () => http.get(path, { auth: { username: creds.secretKey, password: '' } }),
      { label: 'stripe.poll' },
    );
    const obj = ensureOk(res, 'status poll');
    // Session → payment_status; PaymentIntent → status.
    const rawStatus = isPI ? obj.status : (obj.payment_status || obj.status);

    return {
      ok: true,
      providerRef: obj.id,
      paymentIntent: isPI ? obj.id : obj.payment_intent,
      rawStatus,
      status: normalizeStatus(rawStatus),
      amount: obj.amount_total != null ? obj.amount_total : obj.amount,
      currency: obj.currency,
      raw: obj,
    };
  },

  /**
   * Verify an inbound webhook over the RAW request bytes (pain point #1). Never
   * throws on a bad signature — returns `{ valid: false }` so the route can 400.
   *
   * @param {Buffer|string} rawBody - the untouched request body bytes
   * @param {Object} headers        - request headers (expects 'stripe-signature')
   * @param {Object} creds          - { webhookSecret }
   * @returns {{ valid: boolean, event?, type?, status?, providerRef?, eventId? }}
   */
  verifyWebhook(rawBody, headers, creds) {
    try {
      const secret = creds && creds.webhookSecret;
      if (!secret) return { valid: false };

      const sigHeader =
        (headers && (headers['stripe-signature'] || headers['Stripe-Signature'])) || '';
      if (!sigHeader) return { valid: false };

      // Header form: "t=1614556800,v1=hex,v1=hex2" (v0 legacy ignored).
      let t = null;
      const v1s = [];
      for (const part of String(sigHeader).split(',')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k === 't') t = v;
        else if (k === 'v1') v1s.push(v);
      }
      if (!t || v1s.length === 0) return { valid: false };

      // Replay protection: reject timestamps outside the 300s tolerance window.
      const now = Math.floor(Date.now() / 1000);
      if (!Number.isFinite(Number(t)) || Math.abs(now - Number(t)) > WEBHOOK_TOLERANCE_SECONDS) {
        return { valid: false };
      }

      // signed_payload = `${t}.${rawBody}` — HMAC over the RAW bytes.
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(`${t}.`, 'utf8');
      hmac.update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8'));
      const expected = hmac.digest('hex');
      const expectedBuf = Buffer.from(expected, 'hex');

      const matched = v1s.some((v) => {
        let vBuf;
        try {
          vBuf = Buffer.from(v, 'hex');
        } catch {
          return false;
        }
        return vBuf.length === expectedBuf.length && crypto.timingSafeEqual(vBuf, expectedBuf);
      });
      if (!matched) return { valid: false };

      const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
      const event = JSON.parse(bodyStr);
      const type = event.type || '';
      const obj = (event.data && event.data.object) || {};

      // Derive a raw status token from the event, then normalise it.
      let rawStatus;
      if (type === 'charge.dispute.created') rawStatus = 'charge.dispute.created';
      else if (type === 'charge.refunded' || (type === 'charge.updated' && obj.refunded)) {
        rawStatus = 'charge.refunded';
      } else if (type.startsWith('checkout.session')) {
        rawStatus = obj.payment_status || obj.status;
      } else if (type.startsWith('payment_intent')) {
        rawStatus = obj.status;
      } else {
        rawStatus = obj.payment_status || obj.status;
      }

      // providerRef: keep it aligned with what initiate() stored (cs_ for a
      // session). Charge events only carry the PaymentIntent id.
      let providerRef = obj.id;
      if (type.startsWith('charge.')) providerRef = obj.payment_intent || obj.id;

      return {
        valid: true,
        eventId: event.id, // for at-least-once dedupe (pain point #2)
        event,
        type,
        rawStatus,
        status: normalizeStatus(rawStatus),
        providerRef,
      };
    } catch {
      // Any parse/format failure is a rejected webhook, never a thrown 500.
      return { valid: false };
    }
  },

  /**
   * Refund a captured payment (full or partial).
   * @param {Object} input - { providerRef?|payment_intent?|charge?, amount?, currency? }
   * @param {Object} ctx   - { creds: { secretKey }, mode }
   */
  async refund(input, ctx) {
    const creds = ctx && ctx.creds;
    if (!creds || !creds.secretKey) {
      throw new AppError({
        status: 400,
        code: 'CREDENTIALS_REQUIRED',
        message: 'A Stripe secret key is required to issue a refund.',
        resolution: 'Provide the project\'s Stripe secret key.',
      });
    }

    const paymentIntent = input.payment_intent || (input.providerRef && input.providerRef.startsWith('pi_') ? input.providerRef : undefined);
    const charge = input.charge || (input.providerRef && input.providerRef.startsWith('ch_') ? input.providerRef : undefined);
    if (!paymentIntent && !charge) {
      throw AppError.badRequest('A payment_intent (pi_…) or charge (ch_…) is required to refund.', {
        resolution: 'Pass the PaymentIntent id you received from the payment (via pollStatus or the webhook).',
      });
    }

    const body = {};
    if (paymentIntent) body.payment_intent = paymentIntent;
    if (charge) body.charge = charge;
    // Partial refund: convert the decimal amount to the currency's minor unit.
    if (input.amount != null) body.amount = toGatewayAmount(input.amount, input.currency);

    const idempotencyKey = uuidv4();
    const res = await withRetry(
      () => http.post('/v1/refunds', toFormBody(body), {
        auth: { username: creds.secretKey, password: '' },
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      { label: 'stripe.refund' },
    );
    const refund = ensureOk(res, 'refund');

    // A refund's own lifecycle: succeeded → funds returned (canonical
    // 'refunded'); pending → still processing; anything else → failed.
    const rs = String(refund.status || '').toLowerCase();
    let status = 'failed';
    if (rs === 'succeeded') status = 'refunded';
    else if (rs === 'pending' || rs === 'requires_action') status = 'pending';

    return {
      ok: status !== 'failed',
      providerRef: refund.id, // re_…
      paymentIntent: refund.payment_intent,
      rawStatus: refund.status,
      status,
      amount: refund.amount,
      currency: refund.currency,
      raw: refund,
    };
  },
};
