/**
 * OzowProvider — South Africa instant EFT (bank redirect), formerly i-Pay.
 *
 * ZAR only, SA only. Three credentials per site:
 *   • siteCode   — sent in the body/query (public-ish, identifies the site)
 *   • privateKey — the SHA512 salt; NEVER transmitted, only appended before hashing
 *   • apiKey     — sent as the HTTP `ApiKey` header on REST calls
 *
 * The notorious pain point is the HashCheck. Ozow concatenates a FIXED,
 * ORDER-SENSITIVE list of field VALUES (no separators), appends the raw
 * PrivateKey, lowercases the WHOLE resulting string, then SHA512-hexes it:
 *
 *     strtolower( implode('', values_in_table_order) . privateKey )  ->  sha512 hex
 *
 * Two different field orders are used: one for the outbound payment request,
 * a DIFFERENT one for the inbound notification. Both are hardcoded below.
 *
 * ⚠️ UNVERIFIED (confirm against live hub.ozow.com docs before production):
 *    - NOTIFICATION_FIELD_ORDER (inbound webhook hash field order)
 *    - the refund endpoint + its field order (refund is capability-gated off
 *      in the catalog for now, so no refund() is implemented here)
 *    - whether staging sends NotifyUrl webhooks for IsTest=true transactions
 *
 * @see docs/PROVIDER-ARCHITECTURE.md
 */
'use strict';

const axios = require('axios');
const crypto = require('crypto'); // Node built-in — SHA512 hex, no crypto-js
const { withRetry } = require('../../services/retry');
const AppError = require('../../errors/AppError');
const { get } = require('../catalog');

const meta = get('ozow');

// ── Hosts by mode ──────────────────────────────────────────────────────────
// Staging shares one host (stagingapi.ozow.com) for both the redirect form-POST
// and the REST API. Live splits them: pay.ozow.com (redirect) + api.ozow.com (REST).
const HOSTS = Object.freeze({
  test: { pay: 'https://stagingapi.ozow.com', api: 'https://stagingapi.ozow.com' },
  live: { pay: 'https://pay.ozow.com', api: 'https://api.ozow.com' },
});

// ── Field orders (LOAD-BEARING — do not reorder) ────────────────────────────
// Outbound payment-request hash order. VERIFIED against Ozow integration docs.
const REQUEST_FIELD_ORDER = Object.freeze([
  'SiteCode',
  'CountryCode',
  'CurrencyCode',
  'Amount',
  'TransactionReference',
  'BankReference',
  'Optional1',
  'Optional2',
  'Optional3',
  'Optional4',
  'Optional5',
  'Customer',
  'CancelUrl',
  'ErrorUrl',
  'SuccessUrl',
  'NotifyUrl',
  'IsTest',
]);

// Inbound notification hash order. ⚠️ UNVERIFIED — differs from the request
// order (this is a classic source of "hash mismatch" bugs). Confirm the exact
// list + order against live hub.ozow.com before trusting webhooks in prod.
const NOTIFICATION_FIELD_ORDER = Object.freeze([
  'SiteCode',
  'TransactionId',
  'TransactionReference',
  'Amount',
  'Status',
  'Optional1',
  'Optional2',
  'Optional3',
  'Optional4',
  'Optional5',
  'CurrencyCode',
  'IsTest',
  'StatusMessage',
]);

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Ozow wants a plain decimal with EXACTLY 2 places ("%.2f"), e.g. "25.01".
 * @param {string|number} amount - major units
 * @returns {string}
 */
function toGatewayAmount(amount) {
  const n = typeof amount === 'number' ? amount : Number(String(amount).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) {
    throw AppError.badRequest(`Ozow amount must be a positive number, got '${amount}'`, { amount });
  }
  return n.toFixed(2);
}

/** IsTest is serialised as a lowercase STRING ("true"/"false"), never a bool. */
function isTestString(mode) {
  return mode === 'test' ? 'true' : 'false';
}

/**
 * THE HASHCHECK. Concatenate the field VALUES in `order` (missing/empty → ''),
 * append the raw privateKey, lowercase the WHOLE string, SHA512 → lowercase hex.
 *
 * @param {Object} fields
 * @param {readonly string[]} order
 * @param {string} privateKey
 * @returns {string} 128-char lowercase hex
 */
function computeHashCheck(fields, order, privateKey) {
  const concat = order
    .map((key) => {
      const v = fields[key];
      return v === undefined || v === null ? '' : String(v);
    })
    .join('');
  const input = (concat + privateKey).toLowerCase();
  return crypto.createHash('sha512').update(input, 'utf8').digest('hex');
}

/** Map Ozow's raw status → the 5-value canonical enum. */
function normalizeStatus(raw) {
  switch (String(raw || '').trim().toLowerCase()) {
    case 'complete':
      return 'paid';
    case 'pending':
    case 'pendinginvestigation':
      return 'pending';
    case 'cancelled':
    case 'abandoned':
    case 'error':
    case 'voided':
      return 'failed';
    case 'refunded':
      return 'refunded';
    default:
      // Unknown/unrecognised → pending so it gets re-polled, never silently paid.
      return 'pending';
  }
}

/** Parse a notification payload (object OR urlencoded/query string) into a flat map. */
function parseNotification(rawBody) {
  if (rawBody && typeof rawBody === 'object' && !Buffer.isBuffer(rawBody)) {
    return rawBody;
  }
  const str = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  const params = new URLSearchParams(str.replace(/^\?/, ''));
  const out = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

function requireCreds(creds) {
  if (!creds || !creds.siteCode || !creds.privateKey) {
    throw new AppError({
      status: 400,
      code: 'CREDENTIALS_REQUIRED',
      message: 'Ozow requires siteCode + privateKey (and apiKey for REST/poll).',
      resolution:
        'Add your Ozow credentials in the Connect App → Ozow: Site Code, Private Key and API Key from the Ozow merchant dashboard → your site.',
    });
  }
}

// ── Provider ─────────────────────────────────────────────────────────────────

/** @type {import('../contract').PaymentProvider} */
module.exports = {
  id: 'ozow',
  displayName: meta.displayName,
  capabilities: meta.capabilities,
  credentialSchema: meta.credentialSchema,

  /**
   * Build the Ozow payment request (fields in EXACT order + HashCheck).
   *
   * Default flow = form-POST redirect: we return `checkoutUrl` (the Ozow host to
   * POST to) plus `raw.fields` (every field incl. HashCheck) so the caller can
   * render a self-submitting form. Set `input.useApi = true` to instead call the
   * REST endpoint POST /postpaymentrequest (ApiKey header) and have Ozow return a
   * ready redirect URL.
   *
   * @param {Object} input - { reference, amount, currency?, email?, useApi?, optional1..5, bankReference }
   * @param {Object} ctx   - { mode, creds: { siteCode, privateKey, apiKey }, project }
   * @returns {Promise<import('../contract').InitiateResult>}
   */
  async initiate(input, ctx) {
    const mode = ctx.mode === 'live' ? 'live' : 'test';
    requireCreds(ctx.creds);
    const { siteCode, privateKey, apiKey } = ctx.creds;
    const project = ctx.project || {};

    const currency = (input.currency || 'ZAR').toUpperCase();
    if (currency !== 'ZAR') {
      throw AppError.badRequest(`Ozow only supports ZAR, got '${currency}'.`, { currency });
    }

    // BankReference shows on the payer's bank statement (≤20 chars).
    const bankReference = String(input.bankReference || input.reference || '').slice(0, 20);

    // Build the field set in EXACT REQUEST order. Empty optionals stay ''.
    const fields = {
      SiteCode: siteCode,
      CountryCode: 'ZA',
      CurrencyCode: 'ZAR',
      Amount: toGatewayAmount(input.amount),
      TransactionReference: String(input.reference || '').slice(0, 50),
      BankReference: bankReference,
      Optional1: input.optional1 || '',
      Optional2: input.optional2 || '',
      Optional3: input.optional3 || '',
      Optional4: input.optional4 || '',
      Optional5: input.optional5 || '',
      Customer: input.email || input.customer || '',
      CancelUrl: input.return_url || project.return_url || '',
      ErrorUrl: input.return_url || project.return_url || '',
      SuccessUrl: input.return_url || project.return_url || '',
      NotifyUrl: input.result_url || project.result_url || '',
      IsTest: isTestString(mode),
    };
    fields.HashCheck = computeHashCheck(fields, REQUEST_FIELD_ORDER, privateKey);

    // ── REST flow: POST /postpaymentrequest (Ozow returns a redirect url) ──
    if (input.useApi) {
      if (!apiKey) {
        throw new AppError({
          status: 400,
          code: 'CREDENTIALS_REQUIRED',
          message: 'Ozow REST (useApi) requires an apiKey.',
          resolution: 'Add your Ozow API Key in the Connect App, or omit useApi to use the form-POST redirect.',
        });
      }
      const url = `${HOSTS[mode].api}/postpaymentrequest`;
      let res;
      try {
        res = await withRetry(
          () =>
            axios.post(url, fields, {
              headers: { ApiKey: apiKey, Accept: 'application/json', 'Content-Type': 'application/json' },
              timeout: 20000,
            }),
          { label: 'ozow.initiate' },
        );
      } catch (err) {
        if (err.response && err.response.status < 500) {
          throw new AppError({
            status: 400,
            code: 'OZOW_REQUEST_REJECTED',
            message: `Ozow rejected the payment request (HTTP ${err.response.status}).`,
            resolution:
              'Most Ozow 4xx here are a HashCheck mismatch: verify field ORDER, that Amount is "%.2f", IsTest is the lowercase string "true"/"false", and that the WHOLE concatenation (values + PrivateKey) is lowercased before SHA512.',
            details: { body: err.response.data },
            cause: err,
          });
        }
        throw AppError.upstream(err);
      }
      const data = res.data || {};
      const checkoutUrl = data.url || data.Url || data.paymentRequestUrl;
      const providerRef = data.paymentRequestId || data.PaymentRequestId || fields.TransactionReference;
      return {
        providerRef,
        checkoutUrl,
        pollUrl: `${HOSTS[mode].api}/GetTransactionByReference?siteCode=${encodeURIComponent(siteCode)}&transactionReference=${encodeURIComponent(fields.TransactionReference)}`,
        rawStatus: 'PendingInvestigation',
        status: normalizeStatus('PendingInvestigation'),
        mode,
        instructions: 'Redirect the customer to the Ozow secure page to choose their bank and approve the EFT.',
        raw: { fields, response: data },
      };
    }

    // ── Default flow: form-POST redirect ──
    // No network call — the caller renders a self-submitting POST form to
    // `checkoutUrl` carrying every field in `raw.fields` (HashCheck included).
    const checkoutUrl = HOSTS[mode].pay + '/';
    return {
      providerRef: fields.TransactionReference,
      checkoutUrl,
      pollUrl: `${HOSTS[mode].api}/GetTransactionByReference?siteCode=${encodeURIComponent(siteCode)}&transactionReference=${encodeURIComponent(fields.TransactionReference)}`,
      rawStatus: 'PendingInvestigation',
      status: normalizeStatus('PendingInvestigation'),
      mode,
      instructions:
        'POST raw.fields (form-urlencoded) to checkoutUrl to send the customer to the Ozow secure EFT page.',
      raw: { fields, method: 'form-post', order: REQUEST_FIELD_ORDER },
    };
  },

  /**
   * Poll a transaction by our reference.
   * GET {api}/GetTransactionByReference?siteCode=&transactionReference=  (ApiKey header).
   * @param {string} ref   - our TransactionReference
   * @param {Object} creds - { siteCode, privateKey, apiKey, mode? }
   */
  async pollStatus(ref, creds) {
    requireCreds(creds);
    if (!creds.apiKey) {
      throw new AppError({
        status: 400,
        code: 'CREDENTIALS_REQUIRED',
        message: 'Ozow polling requires an apiKey.',
        resolution: 'Add your Ozow API Key in the Connect App → Ozow.',
      });
    }
    const mode = creds.mode === 'live' ? 'live' : 'test';
    const url = `${HOSTS[mode].api}/GetTransactionByReference`;
    let res;
    try {
      res = await withRetry(
        () =>
          axios.get(url, {
            params: { siteCode: creds.siteCode, transactionReference: ref },
            headers: { ApiKey: creds.apiKey, Accept: 'application/json' },
            timeout: 20000,
          }),
        { label: 'ozow.pollStatus' },
      );
    } catch (err) {
      throw AppError.upstream(err);
    }
    // Ozow returns an array (most-recent first) or a single object.
    const record = Array.isArray(res.data) ? res.data[0] || {} : res.data || {};
    const rawStatus = record.Status || record.status || '';
    return { ...record, rawStatus, status: normalizeStatus(rawStatus) };
  },

  normalizeStatus,

  /**
   * Verify an inbound Ozow notification (NotifyUrl POST — the authoritative
   * event; never trust the redirect return alone). Recompute the hash over the
   * NOTIFICATION field order + PrivateKey, lowercase whole, SHA512, compare
   * case-insensitively against the payload's Hash.
   *
   * ⚠️ NOTIFICATION_FIELD_ORDER is UNVERIFIED — confirm w/ live hub.ozow.com.
   *
   * @param {Object|string|Buffer} rawBody - notification fields (object or urlencoded)
   * @param {Object} headers
   * @param {Object} creds - { privateKey, ... }
   * @returns {{ valid: boolean, event?: string, status?: string, providerRef?: string, rawStatus?: string }}
   */
  verifyWebhook(rawBody, headers, creds) {
    if (!creds || !creds.privateKey) return { valid: false };
    const fields = parseNotification(rawBody);
    const provided = fields.Hash || fields.hash || fields.HashCheck || fields.hashCheck;
    if (!provided) return { valid: false };

    const computed = computeHashCheck(fields, NOTIFICATION_FIELD_ORDER, creds.privateKey);
    const valid = computed.toLowerCase() === String(provided).toLowerCase();
    const rawStatus = fields.Status || fields.status || '';
    return {
      valid,
      event: 'payment.notification',
      status: valid ? normalizeStatus(rawStatus) : undefined,
      providerRef: fields.TransactionId || fields.TransactionReference,
      rawStatus,
    };
  },

  // Exposed for unit tests / callers that need the raw hash pipeline.
  _internal: { computeHashCheck, toGatewayAmount, isTestString, REQUEST_FIELD_ORDER, NOTIFICATION_FIELD_ORDER, HOSTS },

  // NOTE: capabilities.refund is FALSE in the catalog, so no refund() is wired.
  // Ozow refunds use a SEPARATE Refunds API (GetToken bearer → POST refund with
  // TransactionId + HashCheck, paid from the Ozow float). ⚠️ endpoint + field
  // order UNVERIFIED — confirm w/ live hub.ozow.com before implementing.
};
