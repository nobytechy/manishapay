/**
 * PesepayProvider — Zimbabwean aggregator (EcoCash / OneMoney / ZimSwitch / card).
 *
 * Pesepay is unusual among ManishaPay's gateways: EVERY request body and EVERY
 * response body is AES-encrypted and wrapped in a `{ "payload": "<base64>" }`
 * envelope. The Integration Key authenticates the HTTP call (a header); the
 * Encryption Key never leaves the server — it is the symmetric AES key.
 *
 * Encryption scheme (from the research note — get this EXACTLY right):
 *   • cipher   : AES-CBC, key size chosen from the key length (128/192/256-bit)
 *   • key      : the Encryption Key, UTF-8 bytes (MUST be 16/24/32 chars → validated)
 *   • IV       : the FIRST 16 bytes of the key (NOT random, NOT prepended)
 *   • padding  : PKCS#7 (Node's default auto-padding)
 *   • encoding : Base64, carried as { payload: "<base64>" } on request AND response
 *
 * Flows:
 *   • redirect (hosted)  : POST /v1/payments/initiate      → redirectUrl + pollUrl
 *   • seamless (mobile)  : POST /v2/payments/make-payment   → pushes the prompt, pollUrl
 *   • poll               : GET  /v1/payments/check-payment?referenceNumber=
 *   • method discovery   : GET  /v1/payment-methods/for-currency?currencyCode=
 *
 * @see docs/PROVIDER-ARCHITECTURE.md
 */
'use strict';

const axios = require('axios');
const crypto = require('crypto');
const { withRetry } = require('../../services/retry');
const AppError = require('../../errors/AppError');
const { get } = require('../catalog');

const meta = get('pesepay');

// ─── Endpoints ──────────────────────────────────────────────────────────────
// The base already includes /api/payments-engine; endpoints append /v1|/v2/...
const BASE_LIVE = 'https://api.pesepay.com/api/payments-engine';
// ⚠️ UNVERIFIED sandbox host — the research note could not confirm it. We fall
// back to the live base for `test` mode so we never point at a host that 404s.
// If/when Pesepay confirms a sandbox host, set BASE_TEST and flip TEST_HOST_CONFIRMED.
const TEST_HOST_CONFIRMED = false;
const BASE_TEST = 'https://api.test.sandbox.pesepay.com/api/payments-engine';

const EP_INITIATE = '/v1/payments/initiate';        // redirect / hosted checkout
const EP_MAKE_PAYMENT = '/v2/payments/make-payment'; // seamless mobile push (v2!)
const EP_CHECK = '/v1/payments/check-payment';       // poll
const EP_METHODS = '/v1/payment-methods/for-currency';

// ─── Auth header ─────────────────────────────────────────────────────────────
// ⚠️ AMBIGUITY: community SDKs disagree on the header NAME for the Integration
// Key — some send `key: <integrationKey>`, others `authorization: <integrationKey>`.
// The value is the raw Integration Key (NOT a Bearer token). We pin `authorization`
// here (most common in the JS/PHP clients); make this the single place to flip it
// if a live account rejects the call with 401.
const AUTH_HEADER_NAME = 'authorization';

// ─── Status map (research note) ──────────────────────────────────────────────
// Only SUCCESS is money-in-the-bank. PARTIALLY_PAID stays pending (a split
// payment is not complete). liquidationStatus is settlement — NOT payment — and
// is deliberately ignored here.
const STATUS_MAP = Object.freeze({
  SUCCESS: 'paid',

  INITIATED: 'pending',
  PENDING: 'pending',
  PROCESSING: 'pending',
  PARTIALLY_PAID: 'pending',
  AUTHORIZATION_REQUIRED: 'pending',

  FAILED: 'failed',
  DECLINED: 'failed',
  CANCELLED: 'failed',
  CANCELED: 'failed',
  ERROR: 'failed',
  INSUFFICIENT_FUNDS: 'failed',
  TERMINATED: 'failed',
  TIME_OUT: 'failed',
  TIMED_OUT: 'failed',
  SERVICE_UNAVAILABLE: 'failed',
  CLOSED: 'failed',
  CLOSED_PERIOD_ELAPSED: 'failed',

  REVERSED: 'refunded',
});

// Rail-name → keywords we look for in a discovered method's name. Codes
// (PZW201 etc.) are currency-scoped and unstable, so we NEVER hardcode them —
// we resolve them live from /payment-methods/for-currency and match by name.
const RAIL_NAME_HINTS = Object.freeze({
  ecocash: ['ecocash'],
  onemoney: ['onemoney', 'one money'],
  omari: ['omari'],
  innbucks: ['innbucks'],
  zimswitch: ['zimswitch', 'zim switch', 'zipit'],
  card: ['card', 'visa', 'mastercard'],
});

const MOBILE_RAILS = new Set(['ecocash', 'onemoney', 'omari', 'innbucks']);

// ─── Crypto helpers (exported for unit tests — no network) ───────────────────

/** Select the AES-CBC variant from the key's byte length. */
function pickAlgorithm(keyBuf) {
  switch (keyBuf.length) {
    case 16: return 'aes-128-cbc';
    case 24: return 'aes-192-cbc';
    case 32: return 'aes-256-cbc';
    default:
      throw AppError.badRequest(
        `Pesepay encryption key must be 16, 24 or 32 bytes (got ${keyBuf.length}).`,
        { resolution: 'Copy the Encryption Key exactly from the Pesepay dashboard → Integration → API keys.' },
      );
  }
}

/** Throw a clear AppError unless the encryption key is a valid AES key length. */
function assertKeyLength(encryptionKey) {
  const len = Buffer.byteLength(encryptionKey || '', 'utf8');
  if (![16, 24, 32].includes(len)) {
    throw new AppError({
      status: 400,
      code: 'PESEPAY_BAD_KEY_LENGTH',
      message: `Pesepay Encryption Key must be 16, 24 or 32 characters (got ${len}).`,
      resolution:
        'The Encryption Key doubles as the AES key AND its first 16 chars are the IV. ' +
        'Paste it exactly as shown in the Pesepay dashboard — a truncated/space-padded key breaks all traffic.',
    });
  }
  return len;
}

/** Key buffer + IV (= first 16 bytes of the key). */
function keyAndIv(encryptionKey) {
  assertKeyLength(encryptionKey);
  const key = Buffer.from(encryptionKey, 'utf8');
  const iv = key.subarray(0, 16); // IV = first 16 chars of the key (NOT random)
  return { key, iv };
}

/**
 * Encrypt a JS object → the on-the-wire envelope `{ payload: "<base64>" }`.
 * @param {Object} data
 * @param {string} encryptionKey
 * @returns {{ payload: string }}
 */
function encryptPayload(data, encryptionKey) {
  const { key, iv } = keyAndIv(encryptionKey);
  const cipher = crypto.createCipheriv(pickAlgorithm(key), key, iv); // PKCS7 auto-padding on
  const json = JSON.stringify(data);
  const enc = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  return { payload: enc.toString('base64') };
}

/**
 * Decrypt an envelope (or a bare base64 string) → the original JS object.
 * @param {string|{payload:string}} envelope
 * @param {string} encryptionKey
 * @returns {Object}
 */
function decryptPayload(envelope, encryptionKey) {
  const b64 = typeof envelope === 'string' ? envelope : envelope && envelope.payload;
  if (!b64) {
    throw new AppError({
      status: 502,
      code: 'PESEPAY_NO_PAYLOAD',
      message: 'Pesepay response did not contain an encrypted { payload }.',
      resolution: 'The Integration Key may be wrong, or the request reached the wrong host. Re-check credentials/mode.',
    });
  }
  const { key, iv } = keyAndIv(encryptionKey);
  const decipher = crypto.createDecipheriv(pickAlgorithm(key), key, iv);
  const dec = Buffer.concat([decipher.update(Buffer.from(b64, 'base64')), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

// ─── Amount ──────────────────────────────────────────────────────────────────
// Pesepay carries amount as a numeric field (amountDetails.amount), 2dp precision.
function toGatewayAmount(amount) {
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) {
    throw AppError.badRequest(`Invalid amount "${amount}" — must be a positive number.`);
  }
  return Math.round(n * 100) / 100; // 2dp numeric
}

// ─── HTTP plumbing ───────────────────────────────────────────────────────────
function baseUrl(mode) {
  if (mode === 'test') return TEST_HOST_CONFIRMED ? BASE_TEST : BASE_LIVE;
  return BASE_LIVE;
}

function authHeaders(creds) {
  return { [AUTH_HEADER_NAME]: creds.integrationKey, 'content-type': 'application/json' };
}

function requireCreds(creds) {
  if (!creds || !creds.integrationKey || !creds.encryptionKey) {
    throw new AppError({
      status: 400,
      code: 'CREDENTIALS_REQUIRED',
      message: 'Pesepay needs an Integration Key and an Encryption Key.',
      resolution: 'Add both in the Connect App → Pesepay. Find them in the Pesepay dashboard → Integration → API keys.',
    });
  }
  assertKeyLength(creds.encryptionKey);
}

async function postEncrypted(url, body, creds, label) {
  const req = encryptPayload(body, creds.encryptionKey);
  let res;
  try {
    res = await withRetry(() => axios.post(url, req, { headers: authHeaders(creds), timeout: 20000 }), { label });
  } catch (err) {
    if (err.response && err.response.status >= 500) throw AppError.upstream(err);
    if (err.response && err.response.status === 401) {
      throw new AppError({
        status: 401,
        code: 'PESEPAY_UNAUTHORIZED',
        message: 'Pesepay rejected the Integration Key.',
        resolution: `Check the key, and whether it should be sent as '${AUTH_HEADER_NAME}' vs 'key' (SDKs differ).`,
        cause: err,
      });
    }
    if (err.response) {
      throw new AppError({
        status: 502, code: 'PESEPAY_REJECTED',
        message: `Pesepay rejected the request (HTTP ${err.response.status}).`,
        resolution: 'Verify amount/currency and that the currency is enabled on your Pesepay account.',
        details: { status: err.response.status }, cause: err,
      });
    }
    throw AppError.upstream(err);
  }
  return decryptPayload(res.data, creds.encryptionKey);
}

/** GET that may or may not be encrypted (discovery is typically plain JSON). */
async function getMaybeEncrypted(url, creds, label) {
  const res = await withRetry(() => axios.get(url, { headers: authHeaders(creds), timeout: 20000 }), { label });
  const data = res.data;
  if (data && typeof data === 'object' && typeof data.payload === 'string') {
    return decryptPayload(data, creds.encryptionKey);
  }
  return data;
}

/**
 * Discover the currency-scoped method code for one of our rail names.
 * Never hardcodes PZW*** codes.
 */
async function resolveMethodCode(rail, currency, mode, creds) {
  const url = `${baseUrl(mode)}${EP_METHODS}?currencyCode=${encodeURIComponent(currency)}`;
  const data = await getMaybeEncrypted(url, creds, 'pesepay.methods');
  const list = Array.isArray(data) ? data : (data && (data.paymentMethods || data.result || data.data)) || [];
  const hints = RAIL_NAME_HINTS[rail] || [rail];
  const match = list.find((m) => {
    const name = String(m.name || m.paymentMethodName || '').toLowerCase();
    return hints.some((h) => name.includes(h));
  });
  const code = match && (match.code || match.paymentMethodCode || match.id);
  if (!code) {
    throw new AppError({
      status: 400,
      code: 'PESEPAY_METHOD_UNAVAILABLE',
      message: `Pesepay has no '${rail}' method enabled for ${currency}.`,
      resolution: 'Enable the method for this currency in the Pesepay dashboard, or use the redirect flow (no method code needed).',
      details: { rail, currency, available: list.map((m) => m.name).filter(Boolean) },
    });
  }
  return { code, requiredFields: match.paymentMethodRequiredFieldsList || match.requiredFields || [] };
}

// ─── Provider contract ───────────────────────────────────────────────────────

/** @type {import('../contract').PaymentProvider} */
module.exports = {
  id: 'pesepay',
  displayName: meta.displayName,
  capabilities: meta.capabilities,
  credentialSchema: meta.credentialSchema,

  /**
   * @param {Object} input - { reference, amount, currency, method?, email?, phone?, description?, return_url?, result_url? }
   * @param {Object} ctx   - { mode, creds, project }
   * @returns {Promise<import('../contract').InitiateResult>}
   */
  async initiate(input, ctx) {
    requireCreds(ctx.creds);
    const creds = ctx.creds;
    const mode = ctx.mode === 'live' ? 'live' : 'test';
    const currency = (input.currency || 'USD').toUpperCase();
    const amount = toGatewayAmount(input.amount);
    const reason = input.description || `Payment ${input.reference || ''}`.trim();
    const resultUrl = input.result_url || (ctx.project && ctx.project.result_url);
    const returnUrl = input.return_url || (ctx.project && ctx.project.return_url);

    const amountDetails = { amount, currencyCode: currency };
    const rail = input.method && String(input.method).toLowerCase();

    // Seamless (mobile push) when a mobile rail + a phone number are supplied;
    // otherwise the hosted redirect flow (Pesepay collects the details).
    const seamless = rail && MOBILE_RAILS.has(rail) && input.phone;

    if (seamless) {
      const { code, requiredFields } = await resolveMethodCode(rail, currency, mode, creds);
      const requiredMap = {};
      // Best-effort fill of the required-field map (name varies by method).
      for (const f of requiredFields) {
        const fname = String(f.name || f.fieldName || '').toLowerCase();
        if (fname.includes('phone') || fname.includes('msisdn') || fname.includes('mobile')) {
          requiredMap[f.name || f.fieldName] = input.phone;
        }
      }
      if (Object.keys(requiredMap).length === 0) requiredMap.customerPhoneNumber = input.phone;

      const body = {
        amountDetails,
        merchantReference: input.reference,
        reasonForPayment: reason,
        resultUrl,
        returnUrl,
        paymentMethodCode: code,
        customer: { phoneNumber: input.phone, email: input.email },
        paymentMethodRequiredFields: requiredMap,
      };
      const decoded = await postEncrypted(`${baseUrl(mode)}${EP_MAKE_PAYMENT}`, body, creds, 'pesepay.makePayment');
      const rawStatus = decoded.transactionStatus || 'INITIATED';
      return {
        providerRef: decoded.referenceNumber,
        pollUrl: decoded.pollUrl,
        rawStatus,
        status: this.normalizeStatus(rawStatus),
        mode: ctx.mode,
        instructions: `Approve the ${rail} prompt on ${input.phone}.`,
        raw: decoded,
      };
    }

    // Redirect / hosted-checkout flow.
    const body = {
      amountDetails,
      merchantReference: input.reference,
      reasonForPayment: reason,
      resultUrl,
      returnUrl,
    };
    const decoded = await postEncrypted(`${baseUrl(mode)}${EP_INITIATE}`, body, creds, 'pesepay.initiate');
    const rawStatus = decoded.transactionStatus || 'INITIATED';
    return {
      providerRef: decoded.referenceNumber,
      checkoutUrl: decoded.redirectUrl,
      pollUrl: decoded.pollUrl,
      rawStatus,
      status: this.normalizeStatus(rawStatus),
      mode: ctx.mode,
      instructions: decoded.redirectRequired === false ? undefined : 'Redirect the customer to checkoutUrl to complete payment.',
      raw: decoded,
    };
  },

  /**
   * Fetch the latest status. Accepts either a full pollUrl (as returned by
   * initiate) or a bare referenceNumber. The resultUrl callback is only a
   * "go poll now" nudge — we always re-verify server-side here.
   *
   * @param {string} ref  - pollUrl OR referenceNumber
   * @param {Object} creds
   */
  async pollStatus(ref, creds) {
    requireCreds(creds);
    let url;
    if (/^https?:\/\//i.test(ref)) {
      url = ref;
    } else {
      const mode = creds && creds.mode === 'live' ? 'live' : 'live'; // no mode on creds → live host
      url = `${baseUrl(mode)}${EP_CHECK}?referenceNumber=${encodeURIComponent(ref)}`;
    }
    const decoded = await getMaybeEncrypted(url, creds, 'pesepay.poll');
    const rawStatus = decoded.transactionStatus || decoded.status || '';
    return { ...decoded, rawStatus, status: this.normalizeStatus(rawStatus) };
  },

  /**
   * Map a Pesepay transactionStatus → one canonical value.
   * Unknown → pending (safe: it gets re-polled, never silently paid).
   * @param {string} raw
   * @returns {import('../contract').CanonicalStatus}
   */
  normalizeStatus(raw) {
    if (!raw) return 'pending';
    return STATUS_MAP[String(raw).trim().toUpperCase()] || 'pending';
  },

  // ── Exposed for unit tests / advanced callers (no network) ──
  encryptPayload,
  decryptPayload,
  assertKeyLength,
  pickAlgorithm,
  toGatewayAmount,
  AUTH_HEADER_NAME,
};
