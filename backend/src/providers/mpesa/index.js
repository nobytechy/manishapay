/**
 * M-Pesa (Safaricom Daraja, Kenya) — STK Push / Lipa na M-Pesa Online provider.
 *
 * A thin, in-house REST client for the Daraja API (the community SDKs are all
 * stale). Implements the neutral PaymentProvider contract so the rest of
 * ManishaPay never sees a Safaricom-shaped payload.
 *
 * Flow (mobilePush, NOT redirect):
 *   1. OAuth: GET /oauth/v1/generate?grant_type=client_credentials with
 *      Basic base64(consumerKey:consumerSecret). Token TTL ~3600s → we cache it
 *      per (mode, consumerKey) for ~50min and refresh on a 401.
 *   2. initiate → STK Push: POST /mpesa/stkpush/v1/processrequest. We build the
 *      Timestamp (YYYYMMDDHHMMSS) ONCE and derive Password =
 *      base64(shortcode + passkey + timestamp) with the SAME timestamp — the #1
 *      Daraja encoding bug. The synchronous 200 only means "prompt sent"; the
 *      real result arrives asynchronously on the callback.
 *   3. Status: Safaricom POSTs Body.stkCallback to OUR public CallBackURL
 *      (ManishaPay owns it — the merchant never supplies one, which structurally
 *      eliminates the "localhost/http callback fails silently" failure). We
 *      correlate by CheckoutRequestID and fan out to the merchant webhook.
 *      pollStatus (STK Push Query) is a best-effort fallback only (unreliable in
 *      sandbox).
 *
 * ⚠️ Daraja = KENYA ONLY (KES). Tanzania/Moz/DRC M-Pesa is a separate platform
 *    (Vodacom OpenAPI, different auth) — do not point this client at it.
 *
 * @see docs/PROVIDER-ARCHITECTURE.md
 */
'use strict';

const axios = require('axios');
const { withRetry } = require('../../services/retry');
const AppError = require('../../errors/AppError');
const env = require('../../config/env');
const { get } = require('../catalog');

const meta = get('mpesa');

const HOSTS = Object.freeze({
  test: 'https://sandbox.safaricom.co.ke',
  live: 'https://api.safaricom.co.ke',
});

const HTTP_TIMEOUT_MS = 30_000; // bounded — a hung Daraja call must not wedge us.

// Token cache keyed by `${mode}:${consumerKey}` → { token, expiresAt }.
// Daraja tokens live ~3600s; we cap our own cache at ~50min so we always
// refresh with comfortable margin (pain point #1).
const TOKEN_TTL_MS = 50 * 60 * 1000;
const _tokenCache = new Map();

// ─── helpers (all pure + unit-tested; exported at the bottom) ────────────────

/** Base host for the current mode. Sandbox for test, api for live. */
function baseUrl(mode) {
  return HOSTS[mode === 'live' ? 'live' : 'test'];
}

/**
 * M-Pesa amounts are WHOLE KES — no decimals, no subunits. We accept any
 * plausible representation of a major-unit amount and coerce to an integer,
 * refusing fractional values loudly rather than silently rounding (which would
 * over/undercharge). `"10.00"` → 10; `10` → 10; `"10.50"` → thrown.
 */
function toGatewayAmount(input) {
  if (input == null) throw AppError.badRequest('amount is required');
  const cleaned = String(input).replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) {
    throw AppError.badRequest(`amount '${input}' is not a positive number`, { received: input });
  }
  if (!Number.isInteger(n)) {
    throw new AppError({
      status: 400,
      code: 'AMOUNT_NOT_INTEGER',
      message: `M-Pesa (KES) amounts must be whole numbers — received '${input}'.`,
      resolution: 'Round the amount to whole KES before charging (M-Pesa STK Push does not accept cents).',
      details: { received: input },
    });
  }
  return n;
}

/**
 * Normalizes a Kenyan mobile number to Safaricom MSISDN form `2547XXXXXXXX`
 * (also `2541XXXXXXXX`). Without this the STK prompt is never delivered.
 *   0712345678 / +254 712 345 678 / 712345678 / 254712345678 → 254712345678
 */
function normalizeMsisdn(input) {
  if (!input) return null;
  const digits = String(input).replace(/[^\d]/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0') && digits.length === 10) return '254' + digits.slice(1);
  if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) return '254' + digits;
  return digits; // Let Daraja reject a truly malformed number with its own error.
}

/** Two-digit zero-pad. */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Timestamp in Daraja's `YYYYMMDDHHMMSS` format. Build it ONCE per request and
 * feed the SAME string into buildPassword — a mismatch is the classic silent
 * "Invalid Access Token / bad password" failure.
 */
function buildTimestamp(date = new Date()) {
  return (
    date.getFullYear().toString() +
    pad2(date.getMonth() + 1) +
    pad2(date.getDate()) +
    pad2(date.getHours()) +
    pad2(date.getMinutes()) +
    pad2(date.getSeconds())
  );
}

/**
 * Password = base64(shortcode + passkey + timestamp). Passkey is trimmed to
 * defend against a trailing newline pasted from the Daraja portal.
 * Canonical Safaricom vector:
 *   174379 + <passkey> + 20160216165627
 *   → MTc0Mzc5YmZiMjc5Zjlh...MjAxNjAyMTYxNjU2Mjc=  (see mpesa.test.js)
 */
function buildPassword(shortcode, passkey, timestamp) {
  const raw = String(shortcode) + String(passkey).trim() + String(timestamp);
  return Buffer.from(raw, 'utf8').toString('base64');
}

/**
 * Maps a Daraja ResultCode (from a callback or STK Query) to a canonical status.
 * ResultCode 0 = paid. Known terminal failure codes → failed. A "still being
 * processed" wrapper errorCode (e.g. 500.001.1001) or no result yet → pending.
 * Unknown → pending (never silently paid). NOTE: this is the ResultCode, NOT the
 * synchronous ResponseCode of the STK accept (0 there only means "prompt sent").
 */
function normalizeStatus(raw) {
  if (raw === 0 || raw === '0') return 'paid';
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (s === '' || s === 'pending' || s === 'accepted' || s === 'sent' || s === 'processing') {
    return 'pending';
  }
  if (s === 'refunded' || s === 'reversed') return 'refunded';
  // Plain non-zero integer ResultCode → terminal failure (1, 17, 1032, 1037…).
  if (/^\d+$/.test(s)) return 'failed';
  // Dotted wrapper codes (500.001.1001 "being processed") → keep polling.
  return 'pending';
}

/** Human-readable reason for the common terminal ResultCodes (for merchant UX). */
function resultReason(code) {
  const map = {
    1: 'Insufficient M-Pesa balance.',
    17: 'Unable to lock subscriber — a similar transaction is in progress.',
    1001: 'Subscriber account is locked / a transaction is already in process.',
    1019: 'Transaction expired — the prompt timed out before it was completed.',
    1025: 'Unable to process — request error (e.g. message length).',
    1032: 'Request cancelled by the user.',
    1037: 'No response from the user — the STK prompt timed out (DS timeout).',
    2001: 'Wrong M-Pesa PIN entered.',
  };
  return map[Number(code)] || null;
}

/**
 * Parses an inbound STK callback body (Body.stkCallback) into a neutral shape.
 * ManishaPay owns the callback endpoint; this helper turns Safaricom's payload
 * into { valid, providerRef, status, receipt, amount, phone, reason }.
 * Idempotency (dedupe on MpesaReceiptNumber) is the caller's job.
 */
function parseCallback(body) {
  const cb = body && body.Body && body.Body.stkCallback;
  if (!cb || cb.CheckoutRequestID == null) return { valid: false };

  const resultCode = cb.ResultCode;
  const out = {
    valid: true,
    providerRef: cb.CheckoutRequestID,
    merchantRequestId: cb.MerchantRequestID,
    resultCode,
    rawStatus: String(resultCode),
    status: normalizeStatus(resultCode),
    reason: cb.ResultDesc,
  };

  const meta_ = cb.CallbackMetadata && Array.isArray(cb.CallbackMetadata.Item)
    ? Object.fromEntries(cb.CallbackMetadata.Item.map((i) => [i.Name, i.Value]))
    : null;

  if (out.status === 'paid' && meta_) {
    out.receipt = meta_.MpesaReceiptNumber;
    out.amount = meta_.Amount;
    out.phone = meta_.PhoneNumber != null ? String(meta_.PhoneNumber) : undefined;
    out.transactionDate = meta_.TransactionDate != null ? String(meta_.TransactionDate) : undefined;
  } else if (out.status === 'failed') {
    out.reason = resultReason(resultCode) || cb.ResultDesc;
  }
  return out;
}

// ─── credential + config plumbing ────────────────────────────────────────────

const REQUIRED_CRED_KEYS = ['consumerKey', 'consumerSecret', 'shortcode', 'passkey'];

function requireCreds(creds) {
  if (!creds) {
    throw new AppError({
      status: 400,
      code: 'CREDENTIALS_REQUIRED',
      message: 'M-Pesa requires Daraja credentials configured for this project.',
      resolution:
        'Open your ManishaPay dashboard → Project → M-Pesa credentials and add the Consumer Key, Consumer Secret, Business Shortcode and Lipa na M-Pesa Passkey from the Safaricom Daraja portal.',
    });
  }
  const missing = REQUIRED_CRED_KEYS.filter((k) => !creds[k]);
  if (missing.length) {
    throw AppError.badRequest(`M-Pesa credentials are missing: ${missing.join(', ')}`, { missing });
  }
}

/**
 * Maps the merchant's transactionType hint to Daraja's enum. Paybill →
 * CustomerPayBillOnline (default), Till/Buy-Goods → CustomerBuyGoodsTill.
 */
function resolveTransactionType(hint) {
  const h = String(hint || '').trim().toLowerCase();
  if (h === 'till' || h === 'buygoods' || h === 'customerbuygoodstill' || h === 'buy_goods') {
    return 'CustomerBuyGoodsTill';
  }
  return 'CustomerPayBillOnline';
}

/**
 * The public HTTPS callback URL Safaricom will POST the result to. ManishaPay
 * OWNS this (the merchant never supplies one) — we take it from the project /
 * platform config. Daraja silently drops callbacks to http/localhost, so we
 * fail loudly here instead (pain point #2).
 */
function resolveCallbackUrl(input, ctx) {
  const project = (ctx && ctx.project) || {};
  const url = project.result_url || (input && input.result_url) || env.PAYNOW_RESULT_URL;
  if (!url || !/^https:\/\//i.test(url) || /^https:\/\/(localhost|127\.|0\.0\.0\.0)/i.test(url)) {
    throw new AppError({
      status: 500,
      code: 'CALLBACK_URL_INVALID',
      message: 'M-Pesa needs a public HTTPS callback URL owned by ManishaPay.',
      resolution:
        'Safaricom silently discards STK callbacks sent to http:// or localhost. Configure ManishaPay with a public HTTPS result URL — this is the platform callback, not one the merchant supplies.',
      details: { callbackUrl: url || null },
    });
  }
  return url;
}

// ─── HTTP: OAuth token cache + authed POST with single 401 refresh ───────────

async function getToken(mode, creds, { force = false } = {}) {
  const key = `${mode}:${creds.consumerKey}`;
  const cached = _tokenCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.token;

  const basic = Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`, 'utf8').toString('base64');
  const res = await withRetry(
    () =>
      axios.get(`${baseUrl(mode)}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${basic}` },
        timeout: HTTP_TIMEOUT_MS,
        validateStatus: () => true,
      }),
    { label: 'mpesa.oauth' },
  );

  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new AppError({
      status: 400,
      code: 'CREDENTIALS_REQUIRED',
      message: 'Daraja rejected the Consumer Key / Secret.',
      resolution:
        'Re-check the Consumer Key and Consumer Secret from the Safaricom Daraja portal (your app → Keys), and confirm you are using sandbox keys in test mode and production keys in live mode.',
      details: { status: res.status },
    });
  }
  if (res.status >= 500) throw AppError.upstream(new Error(`Daraja OAuth returned ${res.status}`));

  const token = res.data && res.data.access_token;
  if (!token) throw AppError.upstream(new Error('Daraja OAuth returned no access_token'));

  _tokenCache.set(key, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

/** POST to Daraja with a Bearer token, retrying ONCE on a 401 (expired token). */
async function authedPost(mode, creds, path, payload, label) {
  const send = (token) =>
    withRetry(
      () =>
        axios.post(`${baseUrl(mode)}${path}`, payload, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: HTTP_TIMEOUT_MS,
          validateStatus: () => true,
        }),
      { label },
    );

  let res = await send(await getToken(mode, creds));
  if (res.status === 401) {
    // Token rejected mid-flight — force a refresh and retry exactly once.
    res = await send(await getToken(mode, creds, { force: true }));
  }
  return res;
}

// ─── provider contract ───────────────────────────────────────────────────────

/** @type {import('../contract').PaymentProvider} */
module.exports = {
  id: 'mpesa',
  displayName: meta.displayName,
  capabilities: meta.capabilities,
  credentialSchema: meta.credentialSchema,

  /**
   * Start an STK Push. Returns providerRef=CheckoutRequestID and NO checkoutUrl
   * (this is a phone prompt, not a redirect). The payment is still pending — the
   * real outcome arrives on our callback.
   *
   * @param {Object} input - { reference, amount, phone, description?, result_url? }
   * @param {Object} ctx   - { mode: 'test'|'live', creds, project }
   * @returns {Promise<import('../contract').InitiateResult>}
   */
  async initiate(input, ctx) {
    requireCreds(ctx.creds);
    const creds = ctx.creds;
    const mode = ctx.mode === 'live' ? 'live' : 'test';

    const amount = toGatewayAmount(input.amount);
    const msisdn = normalizeMsisdn(input.phone);
    if (!msisdn) {
      throw AppError.badRequest("M-Pesa requires the customer's phone (the STK prompt is pushed to it).", {
        resolution: 'Add the payer phone (e.g. 0712345678). ManishaPay normalises it to 2547XXXXXXXX.',
      });
    }
    const callbackUrl = resolveCallbackUrl(input, ctx);

    // Build the timestamp ONCE and derive the password from the SAME value.
    const timestamp = buildTimestamp();
    const password = buildPassword(creds.shortcode, creds.passkey, timestamp);

    const payload = {
      BusinessShortCode: String(creds.shortcode),
      Password: password,
      Timestamp: timestamp,
      TransactionType: resolveTransactionType(creds.transactionType),
      Amount: amount,
      PartyA: msisdn,
      PartyB: String(creds.shortcode),
      PhoneNumber: msisdn,
      CallBackURL: callbackUrl,
      AccountReference: String(input.reference || 'ManishaPay').slice(0, 12),
      TransactionDesc: String(input.description || 'Payment').slice(0, 13),
    };

    const res = await authedPost(mode, creds, '/mpesa/stkpush/v1/processrequest', payload, 'mpesa.initiate');

    if (res.status >= 500) throw AppError.upstream(new Error(`Daraja STK Push returned ${res.status}`));

    const data = res.data || {};
    // Daraja rejects a malformed STK Push with a non-"0" ResponseCode or an
    // errorMessage — surface it with a fix.
    const responseCode = data.ResponseCode;
    if (responseCode !== '0' && responseCode !== 0) {
      const errMsg = data.errorMessage || data.ResponseDescription || 'M-Pesa rejected the STK Push request.';
      throw new AppError({
        status: 400,
        code: 'MPESA_REJECTED',
        message: errMsg,
        resolution:
          'Verify the Business Shortcode + Passkey belong to the same Lipa na M-Pesa Online integration, the phone is a Safaricom number (2547…), and the amount is a whole KES value. Sandbox uses shortcode 174379.',
        details: data,
      });
    }

    return {
      providerRef: data.CheckoutRequestID,
      // No checkoutUrl — mobilePush flow, the customer approves on their phone.
      rawStatus: 'pending', // STK accepted ≠ paid; the callback carries the real result.
      status: 'pending',
      mode,
      instructions:
        data.CustomerMessage || 'Approve the M-Pesa prompt on your phone (enter your PIN to complete the payment).',
      raw: data,
    };
  },

  /**
   * Best-effort STK Push Query fallback (for the reconciliation sweep / missed
   * callbacks). Unreliable in sandbox — the callback is the source of truth.
   *
   * @param {string} ref  - CheckoutRequestID from initiate()
   * @param {Object} creds
   * @param {'test'|'live'} [mode]
   */
  async pollStatus(ref, creds, mode) {
    requireCreds(creds);
    if (!ref) throw AppError.badRequest('CheckoutRequestID (providerRef) is required to query an STK Push');
    // Honor an explicit mode, else the mode stamped on the creds (by loadActive),
    // else default to sandbox — so a live poll never hits the sandbox host.
    const m = (mode || (creds && creds.mode)) === 'live' ? 'live' : 'test';

    const timestamp = buildTimestamp();
    const password = buildPassword(creds.shortcode, creds.passkey, timestamp);
    const payload = {
      BusinessShortCode: String(creds.shortcode),
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: ref,
    };

    const res = await authedPost(m, creds, '/mpesa/stkpushquery/v1/query', payload, 'mpesa.poll');
    const data = res.data || {};

    // "Still being processed" comes back as a 4xx/5xx wrapper with an errorCode
    // (e.g. 500.001.1001) — treat as pending, not failed.
    if (data.ResultCode == null) {
      const wrapper = data.errorCode || data.ResponseCode || '';
      return { ok: true, rawStatus: String(wrapper), status: 'pending', raw: data };
    }
    return {
      ok: true,
      rawStatus: String(data.ResultCode),
      status: normalizeStatus(data.ResultCode),
      reason: resultReason(data.ResultCode) || data.ResultDesc,
      raw: data,
    };
  },

  normalizeStatus,

  // Exposed for the callback route + unit tests (not part of the core contract).
  parseCallback,
  toGatewayAmount,
  normalizeMsisdn,
  buildTimestamp,
  buildPassword,
  resultReason,
};
