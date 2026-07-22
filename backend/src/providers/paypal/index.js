/**
 * PayPalProvider — PayPal REST **Orders v2** adapter.
 *
 * Flow (intent = CAPTURE):
 *   1. initiate()  → POST /v2/checkout/orders            → order id + approve link
 *   2. buyer approves on PayPal (redirect)               → CHECKOUT.ORDER.APPROVED (NO money yet!)
 *   3. capture()   → POST /v2/checkout/orders/{id}/capture → PAYMENT.CAPTURE.COMPLETED (money settled)
 *
 * Everything gateway-specific stays in this file; the rest of ManishaPay only
 * ever sees the neutral InitiateResult / canonical status shapes.
 *
 * Mitigations baked in (from the research note's PAIN list):
 *   • central access-token cache w/ single-flight, refreshed at 80% of expires_in
 *   • PayPal-Request-Id idempotency on every mutating call (dedupe retries)
 *   • APPROVED is mapped to `pending`, never `paid` — only a capture COMPLETED is money
 *   • webhook signature verified OFFLINE over the RAW body (crc32), never a re-serialised body
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

const meta = get('paypal');

const HOSTS = Object.freeze({
  test: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
});
const HTTP_TIMEOUT = 30000;

/** Sandbox host for `test`, live host for anything else (`live`). */
function baseUrl(mode) {
  return mode === 'live' ? HOSTS.live : HOSTS.test;
}

/** Derive mode from a PayPal API URL host (used when polling by stored URL). */
function modeFromUrl(url) {
  return String(url).includes('api-m.sandbox.paypal.com') ? 'test' : 'live';
}

// ─── Amount ────────────────────────────────────────────────────────────────
// PayPal wants a **string with exactly 2 decimals** in major units ("10.00").
function toGatewayAmount(amount) {
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) {
    throw AppError.badRequest(`Invalid amount '${amount}' for PayPal — must be a positive number.`, {
      amount,
    });
  }
  return n.toFixed(2);
}

// ─── Redirect link extraction ────────────────────────────────────────────────
// Newer Orders API returns rel:"payer-action"; older returns rel:"approve".
// Match BOTH, preferring payer-action.
function extractRedirectLink(links) {
  if (!Array.isArray(links)) return undefined;
  const byRel = (rel) => links.find((l) => l && l.rel === rel);
  const link = byRel('payer-action') || byRel('approve');
  return link ? link.href : undefined;
}

// ─── CRC-32 (IEEE) ────────────────────────────────────────────────────────────
// Needed for the offline webhook-signature message. Implemented with Node
// built-ins only (no crypto-js, no reliance on zlib.crc32 which is newer).
let _crcTable;
function crc32(input) {
  if (!_crcTable) {
    _crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      _crcTable[n] = c;
    }
  }
  const b = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  let crc = -1;
  for (let i = 0; i < b.length; i++) crc = (crc >>> 8) ^ _crcTable[(crc ^ b[i]) & 0xff];
  return (crc ^ -1) >>> 0; // unsigned 32-bit
}

// ─── Credential guards ────────────────────────────────────────────────────────
function credsFrom(creds) {
  if (!creds || !creds.clientId || !creds.clientSecret) {
    throw new AppError({
      status: 400,
      code: 'CREDENTIALS_REQUIRED',
      message: 'PayPal requires a Client ID and Client Secret.',
      resolution:
        'Add your PayPal REST app credentials in the dashboard → Connect → PayPal (from PayPal Developer → Apps & Credentials). Sandbox creds are instant; live needs a verified Business account.',
    });
  }
  return creds;
}

function wrapAxiosError(err, label) {
  const status = err && err.response && err.response.status;
  const data = err && err.response && err.response.data;
  if (status === 401) {
    return new AppError({
      status: 401,
      code: 'CREDENTIALS_INVALID',
      message: 'PayPal rejected the Client ID / Secret.',
      resolution:
        'Confirm the credentials match the selected environment (a sandbox key will 401 against live and vice-versa) in PayPal Developer → Apps & Credentials.',
    });
  }
  if (status && status >= 500) return AppError.upstream(err);
  if (status && status >= 400) {
    const detail = data && (data.message || (Array.isArray(data.details) && data.details[0] && data.details[0].description));
    return new AppError({
      status,
      code: 'PAYPAL_REQUEST_REJECTED',
      message: detail || `PayPal rejected the ${label} request.`,
      resolution:
        'Check the amount/currency and that your merchant account can RECEIVE this currency. Zimbabwe PayPal accounts are historically send-only — verify receive capability before going live.',
      details: data,
    });
  }
  return AppError.upstream(err);
}

// ─── Access-token cache (single-flight) ───────────────────────────────────────
// OAuth2 client-credentials token, valid ~9h. Cache per (mode, clientId) and
// refresh at 80% of expires_in. A single in-flight promise per key stops a
// thundering herd of token requests when the cache is cold (PAIN #3).
const _tokenCache = new Map(); // key -> { token, expiresAt }
const _tokenInflight = new Map(); // key -> Promise<string>

async function getAccessToken(mode, creds) {
  const { clientId, clientSecret } = credsFrom(creds);
  const key = `${mode}:${clientId}`;

  const cached = _tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const pending = _tokenInflight.get(key);
  if (pending) return pending;

  const p = (async () => {
    const url = `${baseUrl(mode)}/v1/oauth2/token`;
    let resp;
    try {
      resp = await withRetry(
        () =>
          axios.post(url, 'grant_type=client_credentials', {
            auth: { username: clientId, password: clientSecret }, // HTTP Basic client_id:secret
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
            },
            timeout: HTTP_TIMEOUT,
          }),
        { label: 'paypal.token' },
      );
    } catch (err) {
      throw wrapAxiosError(err, 'authentication');
    }
    const token = resp.data && resp.data.access_token;
    if (!token) {
      throw new AppError({
        status: 502,
        code: 'PAYPAL_NO_TOKEN',
        message: 'PayPal did not return an access_token.',
        resolution: 'Retry; if it persists, check PayPal status and your app credentials.',
      });
    }
    const expiresInSec = Number(resp.data.expires_in) || 32400; // ~9h fallback
    _tokenCache.set(key, { token, expiresAt: Date.now() + expiresInSec * 1000 * 0.8 });
    return token;
  })().finally(() => _tokenInflight.delete(key));

  _tokenInflight.set(key, p);
  return p;
}

// ─── Webhook event → canonical status ─────────────────────────────────────────
const WEBHOOK_EVENT_STATUS = Object.freeze({
  'CHECKOUT.ORDER.APPROVED': 'pending', // approved, but money NOT captured yet
  'CHECKOUT.ORDER.COMPLETED': 'paid',
  'PAYMENT.CAPTURE.COMPLETED': 'paid',
  'PAYMENT.CAPTURE.PENDING': 'pending',
  'PAYMENT.CAPTURE.DENIED': 'failed',
  'PAYMENT.CAPTURE.DECLINED': 'failed',
  'PAYMENT.CAPTURE.REFUNDED': 'refunded',
  'PAYMENT.CAPTURE.REVERSED': 'refunded',
  'CUSTOMER.DISPUTE.CREATED': 'disputed',
});

function eventToStatus(event) {
  if (!event || typeof event !== 'object') {
    return { event_type: undefined, status: 'pending', providerRef: undefined, orderId: undefined, captureId: undefined };
  }
  const type = event.event_type;
  const resource = event.resource || {};
  const orderId =
    (resource.supplementary_data &&
      resource.supplementary_data.related_ids &&
      resource.supplementary_data.related_ids.order_id) ||
    (type === 'CHECKOUT.ORDER.APPROVED' || type === 'CHECKOUT.ORDER.COMPLETED' ? resource.id : undefined);
  const captureId = type && type.indexOf('PAYMENT.CAPTURE') === 0 ? resource.id : undefined;
  return {
    event_type: type,
    status: WEBHOOK_EVENT_STATUS[type] || 'pending',
    providerRef: orderId || resource.id,
    orderId,
    captureId,
  };
}

function lowerHeaders(headers) {
  const out = {};
  if (headers && typeof headers === 'object') {
    for (const k of Object.keys(headers)) out[k.toLowerCase()] = headers[k];
  }
  return out;
}

/** @type {import('../contract').PaymentProvider} */
const provider = {
  id: 'paypal',
  displayName: meta.displayName,
  capabilities: meta.capabilities,
  credentialSchema: meta.credentialSchema,

  /**
   * Create a CAPTURE-intent order and return the approve/payer-action link.
   * @param {Object} input - { reference, amount, currency, description?, return_url?, result_url? }
   * @param {Object} ctx   - { mode, creds:{ clientId, clientSecret, webhookId? }, project }
   * @returns {Promise<import('../contract').InitiateResult>}
   */
  async initiate(input, ctx) {
    const mode = ctx.mode || 'test';
    const creds = credsFrom(ctx.creds);
    const base = baseUrl(mode);
    const token = await getAccessToken(mode, creds);

    const currency = String(input.currency || 'USD').toUpperCase();
    const value = toGatewayAmount(input.amount);
    // Idempotency: same reference ⇒ PayPal returns the same order, never a dup (PAIN #6).
    const requestId = input.reference ? `mp-order-${input.reference}` : `mp-order-${uuidv4()}`;

    const returnUrl = input.return_url || (ctx.project && ctx.project.return_url);
    const cancelUrl = input.cancel_url || returnUrl;

    const body = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: input.reference || undefined,
          description: input.description || undefined,
          amount: { currency_code: currency, value },
        },
      ],
    };
    if (returnUrl || cancelUrl) {
      body.application_context = {
        return_url: returnUrl || undefined,
        cancel_url: cancelUrl || undefined,
      };
    }

    let resp;
    try {
      resp = await withRetry(
        () =>
          axios.post(`${base}/v2/checkout/orders`, body, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'PayPal-Request-Id': requestId,
            },
            timeout: HTTP_TIMEOUT,
          }),
        { label: 'paypal.initiate' },
      );
    } catch (err) {
      throw wrapAxiosError(err, 'create-order');
    }

    const order = resp.data;
    const checkoutUrl = extractRedirectLink(order.links);
    if (!checkoutUrl) {
      throw new AppError({
        status: 502,
        code: 'PAYPAL_NO_APPROVE_LINK',
        message: 'PayPal returned an order with no approve / payer-action link.',
        resolution: 'Retry; if it persists, inspect the order.links[] in the raw payload.',
        details: order,
      });
    }

    return {
      providerRef: order.id,
      checkoutUrl,
      pollUrl: `${base}/v2/checkout/orders/${order.id}`,
      rawStatus: order.status,
      status: this.normalizeStatus(order.status),
      mode,
      instructions:
        'Redirect the payer to PayPal to approve. Approval alone does NOT collect money — capture the order (or auto-capture on the CHECKOUT.ORDER.APPROVED webhook) to settle funds.',
      raw: order,
    };
  },

  /**
   * Capture an APPROVED order to actually collect the money.
   * @param {string} orderId
   * @param {Object} ctx - { mode, creds }
   * @returns {Promise<{ providerRef, captureId, rawStatus, status, raw }>}
   */
  async capture(orderId, ctx) {
    const mode = (ctx && ctx.mode) || 'test';
    const creds = credsFrom(ctx && ctx.creds);
    const base = baseUrl(mode);
    const token = await getAccessToken(mode, creds);

    let resp;
    try {
      resp = await withRetry(
        () =>
          axios.post(
            `${base}/v2/checkout/orders/${orderId}/capture`,
            {},
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'PayPal-Request-Id': `mp-capture-${orderId}`,
              },
              timeout: HTTP_TIMEOUT,
            },
          ),
        { label: 'paypal.capture' },
      );
    } catch (err) {
      throw wrapAxiosError(err, 'capture-order');
    }

    const order = resp.data;
    const capture =
      order.purchase_units &&
      order.purchase_units[0] &&
      order.purchase_units[0].payments &&
      order.purchase_units[0].payments.captures &&
      order.purchase_units[0].payments.captures[0];
    const rawStatus = (capture && capture.status) || order.status; // capture is authoritative
    return {
      providerRef: order.id,
      captureId: capture && capture.id, // SAVE this — needed for refunds
      rawStatus,
      status: this.normalizeStatus(rawStatus),
      raw: order,
    };
  },

  /**
   * Fetch the latest order status. `ref` may be a stored full poll URL or a
   * bare order id (defaults to live host if given a bare id with no mode hint).
   * The capture status, when present, is authoritative over the order status.
   * @param {string} ref
   * @param {Object} creds
   */
  async pollStatus(ref, creds) {
    credsFrom(creds);
    const isUrl = /^https?:\/\//.test(String(ref));
    const url = isUrl ? String(ref) : `${baseUrl('live')}/v2/checkout/orders/${ref}`;
    const mode = modeFromUrl(url);
    const token = await getAccessToken(mode, creds);

    let resp;
    try {
      resp = await withRetry(
        () =>
          axios.get(url, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            timeout: HTTP_TIMEOUT,
          }),
        { label: 'paypal.pollStatus' },
      );
    } catch (err) {
      throw wrapAxiosError(err, 'get-order');
    }

    const order = resp.data;
    const capture =
      order.purchase_units &&
      order.purchase_units[0] &&
      order.purchase_units[0].payments &&
      order.purchase_units[0].payments.captures &&
      order.purchase_units[0].payments.captures[0];
    const rawStatus = (capture && capture.status) || order.status;
    return {
      providerRef: order.id,
      captureId: capture && capture.id,
      rawStatus,
      status: this.normalizeStatus(rawStatus),
      raw: order,
    };
  },

  /**
   * Map a PayPal order OR capture status → one canonical value.
   * Order:   CREATED/SAVED/APPROVED/PAYER_ACTION_REQUIRED → pending, COMPLETED → paid, VOIDED → failed.
   * Capture (authoritative): COMPLETED → paid, PENDING → pending, DECLINED/FAILED → failed,
   *          REFUNDED/PARTIALLY_REFUNDED → refunded.
   * Unknown → pending (safe: it gets re-polled, never silently `paid`).
   * @param {string} raw
   * @returns {import('../contract').CanonicalStatus}
   */
  normalizeStatus(raw) {
    if (!raw) return 'pending';
    const s = String(raw).trim().toUpperCase();
    const MAP = {
      // order statuses
      CREATED: 'pending',
      SAVED: 'pending',
      APPROVED: 'pending', // approved ≠ paid — money not captured yet
      PAYER_ACTION_REQUIRED: 'pending',
      VOIDED: 'failed',
      // capture statuses (authoritative)
      COMPLETED: 'paid',
      PENDING: 'pending',
      DECLINED: 'failed',
      FAILED: 'failed',
      DENIED: 'failed',
      EXPIRED: 'failed',
      REFUNDED: 'refunded',
      PARTIALLY_REFUNDED: 'refunded',
      // dispute (only ever seen via dispute webhooks)
      DISPUTED: 'disputed',
    };
    return MAP[s] || 'pending';
  },

  /**
   * Verify an inbound PayPal webhook **offline** over the RAW request bytes.
   *
   * PayPal signs the string:  transmissionId | transmissionTime | webhookId | crc32(rawBody)
   * with a cert served at PAYPAL-CERT-URL; the base64 PAYPAL-TRANSMISSION-SIG is
   * an RSA signature over that string using PAYPAL-AUTH-ALGO (e.g. SHA256withRSA).
   *
   * The cert must be fetched from the (paypal.com-only) cert URL and cached — pass
   * it in as `creds.certPem`. We never trust a redirect return as proof of payment.
   * On any mismatch/missing input we return { valid:false } — we never throw.
   *
   * @param {Buffer|string} rawBody - the RAW bytes, captured before JSON parsing (PAIN #1)
   * @param {Object} headers        - inbound HTTP headers (case-insensitive)
   * @param {Object} creds          - { webhookId, certPem? }
   * @returns {{ valid, event, status, providerRef, orderId?, captureId?, action?, reason?, message? }}
   */
  verifyWebhook(rawBody, headers, creds) {
    try {
      const h = lowerHeaders(headers);
      const transmissionId = h['paypal-transmission-id'];
      const transmissionTime = h['paypal-transmission-time'];
      const transmissionSig = h['paypal-transmission-sig'];
      const certUrl = h['paypal-cert-url'];
      const authAlgo = h['paypal-auth-algo'];
      const webhookId = creds && creds.webhookId;

      const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
      let event = null;
      try {
        event = JSON.parse(bodyStr);
      } catch (_) {
        event = null;
      }
      const parsed = eventToStatus(event);
      const base = {
        event: parsed.event_type,
        status: parsed.status,
        providerRef: parsed.providerRef,
        orderId: parsed.orderId,
        captureId: parsed.captureId,
        // For CAPTURE intent, an APPROVED order must be captured to collect funds (PAIN #2).
        action: parsed.event_type === 'CHECKOUT.ORDER.APPROVED' ? 'capture' : undefined,
      };

      // webhookId is REQUIRED for verification — note it as a credential.
      if (!webhookId) return { valid: false, reason: 'WEBHOOK_ID_MISSING', ...base };
      if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl) {
        return { valid: false, reason: 'MISSING_SIGNATURE_HEADERS', ...base };
      }
      // Guard against SSRF via a spoofed cert host.
      let certHost;
      try {
        certHost = new URL(String(certUrl)).hostname;
      } catch (_) {
        certHost = '';
      }
      if (!/(^|\.)paypal\.com$/.test(certHost)) {
        return { valid: false, reason: 'UNTRUSTED_CERT_URL', ...base };
      }

      const message = `${transmissionId}|${transmissionTime}|${webhookId}|${crc32(Buffer.from(bodyStr, 'utf8'))}`;

      // Verify the RSA signature with the (cached) PEM cert. If the caller hasn't
      // supplied the fetched cert yet, we can't confirm the signature offline.
      const certPem = creds && creds.certPem;
      if (!certPem) return { valid: false, reason: 'CERT_NOT_LOADED', message, ...base };

      const algo = String(authAlgo || 'SHA256withRSA').toUpperCase().includes('SHA256')
        ? 'RSA-SHA256'
        : 'RSA-SHA256';
      const verifier = crypto.createVerify(algo);
      verifier.update(message, 'utf8');
      verifier.end();
      const valid = verifier.verify(certPem, Buffer.from(String(transmissionSig), 'base64'));

      return { valid, message, ...base };
    } catch (err) {
      return { valid: false, reason: 'VERIFY_ERROR' };
    }
  },

  /**
   * Refund a capture (empty body = full refund, amount = partial).
   * @param {Object} input - { captureId, amount?, currency?, reference? }
   * @param {Object} ctx   - { mode, creds }
   */
  async refund(input, ctx) {
    const mode = (ctx && ctx.mode) || 'test';
    const creds = credsFrom(ctx && ctx.creds);
    const base = baseUrl(mode);
    const captureId = input.captureId || input.capture_id;
    if (!captureId) {
      throw AppError.badRequest('captureId is required to refund a PayPal payment.', {
        hint: 'Use the captures[].id saved from the capture step (also on PAYMENT.CAPTURE.COMPLETED webhooks).',
      });
    }
    const token = await getAccessToken(mode, creds);

    const body = {};
    if (input.amount != null) {
      body.amount = {
        currency_code: String(input.currency || 'USD').toUpperCase(),
        value: toGatewayAmount(input.amount),
      };
    }
    const requestId = input.reference ? `mp-refund-${input.reference}` : `mp-refund-${captureId}-${uuidv4()}`;

    let resp;
    try {
      resp = await withRetry(
        () =>
          axios.post(`${base}/v2/payments/captures/${captureId}/refund`, body, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'PayPal-Request-Id': requestId,
            },
            timeout: HTTP_TIMEOUT,
          }),
        { label: 'paypal.refund' },
      );
    } catch (err) {
      throw wrapAxiosError(err, 'refund-capture');
    }

    const r = resp.data;
    // A refund object's COMPLETED means REFUNDED (not paid) — map explicitly.
    const rs = String(r.status || '').toUpperCase();
    const status = rs === 'COMPLETED' ? 'refunded' : rs === 'PENDING' ? 'pending' : rs ? 'failed' : 'pending';
    return { providerRef: r.id, rawStatus: r.status, status, raw: r };
  },
};

// Non-contract helpers exposed for unit tests / internal callers (mirrors
// paynow attaching normalizeAmount). These don't affect assertProvider().
provider.toGatewayAmount = toGatewayAmount;
provider.extractRedirectLink = extractRedirectLink;
provider.crc32 = crc32;
provider.eventToStatus = eventToStatus;

module.exports = provider;
