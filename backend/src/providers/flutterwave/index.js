/**
 * FlutterwaveProvider — Pan-African aggregator on the CURRENT **v4** API.
 *
 * v4 is a full break from v3 and is now Flutterwave's default:
 *   • Auth      — OAuth 2.0 client-credentials. POST the IdP token endpoint with
 *                 client_id/client_secret → a 10-minute Bearer access_token.
 *                 Tokens are cached per clientId and refreshed ~60s before expiry.
 *   • Initiate  — Orchestrator Flow: POST /orchestration/direct-charges with a
 *                 per-request `X-Idempotency-Key` (UUID). The response's
 *                 `next_action` drives the client (redirect_url / requires_otp /
 *                 payment_instruction …).
 *   • Cards     — sensitive fields are AES-256-GCM field-encrypted with the
 *                 Encryption Key; a fresh 12-char `nonce` is the IV and is echoed
 *                 inside payment_method.card. Mobile money / bank = NO encryption.
 *   • Poll      — GET /charges/{id}; `requires_requery` means "wait ~20s and
 *                 re-GET" (do NOT re-charge).
 *   • Webhook   — header `flutterwave-signature` = base64(HMAC-SHA256(rawBody,
 *                 secretHash)); constant-time compare over the RAW bytes.
 *                 (v3's plain `verif-hash` is gone — this is the header change.)
 *
 * ctx.creds = { clientId, clientSecret, encryptionKey, secretHash, baseUrl? }.
 *
 * Mitigations baked in (see the manishapay-dataset repo, gateways/flutterwave.json):
 *   1. Never trust the redirect return as proof of payment → confirm via
 *      pollStatus (GET /charges/{id}) or the verified webhook.
 *   2. Token expiry (10 min) → cache + refresh at T-60s + one 401 re-auth.
 *   3. Duplicate charges on retry → a UUID X-Idempotency-Key on every POST.
 *   4. Webhook header change (v3 verif-hash → v4 HMAC flutterwave-signature).
 *
 * @see docs/PROVIDER-ARCHITECTURE.md
 */
'use strict';

const axios = require('axios');
const crypto = require('crypto'); // Node built-in — AES-256-GCM + HMAC (NO crypto-js)
const { v4: uuidv4 } = require('uuid');
const { withRetry } = require('../../services/retry');
const AppError = require('../../errors/AppError');
const { get } = require('../catalog');

const meta = get('flutterwave');

// ─── hosts ────────────────────────────────────────────────────────────────
// OAuth token endpoint is the SAME for sandbox and live.
const TOKEN_URL =
  'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token';

// Sandbox host is fixed. The LIVE host is CONFIGURABLE via creds.baseUrl:
// ⚠️ DOCS CONFLICT — the v4 docs give the production host as
//   `https://f4bexperience.flutterwave.com` in one place and
//   `https://api.flutterwave.cloud/f4b/production` in another. We default to the
//   former and let the merchant override it (creds.baseUrl) until confirmed.
const SANDBOX_BASE = 'https://developersandbox-api.flutterwave.com';
const LIVE_BASE_DEFAULT = 'https://f4bexperience.flutterwave.com';

const HTTP_TIMEOUT = 30_000;
// Access tokens live ~600s; we never cache longer than this hard ceiling.
const TOKEN_TTL_CEILING_MS = 10 * 60 * 1000;
// Refresh this many seconds BEFORE the server-declared expiry.
const TOKEN_REFRESH_SKEW_S = 60;

/** Currencies this provider accepts, sourced from the catalog. */
const SUPPORTED_CURRENCIES = new Set((meta.currencies || []).map((c) => c.toUpperCase()));

/** ManishaPay method names that map to Flutterwave's mobile-money rail. */
const MOBILE_RAILS = new Set(['mobile_money', 'mobilemoney', 'momo']);

/**
 * Raw v4 charge status / event token → one of the 5 canonical statuses.
 * Unknown → 'pending' (safe: it gets re-polled, never silently 'paid').
 */
const STATUS_MAP = Object.freeze({
  // charge lifecycle
  succeeded: 'paid',
  successful: 'paid',
  completed: 'paid',
  'charge.completed': 'paid',
  pending: 'pending',
  processing: 'pending',
  new: 'pending',
  requires_requery: 'pending',
  requires_otp: 'pending',
  requires_pin: 'pending',
  requires_auth: 'pending',
  requires_additional_fields: 'pending',
  failed: 'failed',
  cancelled: 'failed',
  canceled: 'failed',
  error: 'failed',
  abandoned: 'failed',
  // refund / dispute resources + their webhook event tokens
  refunded: 'refunded',
  refund: 'refunded',
  'refund.completed': 'refunded',
  disputed: 'disputed',
  dispute: 'disputed',
  'dispute.created': 'disputed',
  chargeback: 'disputed',
  'chargeback.created': 'disputed',
});

const http = axios.create({
  timeout: HTTP_TIMEOUT,
  validateStatus: () => true, // we branch on status ourselves (mirrors stripe/index.js)
});

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * @param {string} raw @returns {import('../contract').CanonicalStatus}
 */
function normalizeStatus(raw) {
  if (!raw) return 'pending';
  return STATUS_MAP[String(raw).trim().toLowerCase()] || 'pending';
}

/**
 * Flutterwave v4 orchestration expects `amount` as a JSON **number** in major
 * units (e.g. 10.5), unlike v3's string. Never trust the caller to pre-format —
 * parse, validate positive, normalize comma-decimals, round to 2dp.
 * @param {string|number} amount @returns {number}
 */
function toGatewayAmount(amount) {
  const n =
    typeof amount === 'number' ? amount : Number(String(amount).replace(',', '.').trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw AppError.badRequest('Amount must be a positive number in major units', { amount });
  }
  // Math.round absorbs float noise (10.10 * 100 === 1009.9999999999999).
  return Math.round(n * 100) / 100;
}

/** Constant-time string equality (equal-length-guarded so it never throws). */
function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a == null ? '' : a));
  const bb = Buffer.from(String(b == null ? '' : b));
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba); // burn equivalent work; result is still false
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Split a display name into { first, last }. Flutterwave's customer object wants
 * both; we fall back so a single-word name still produces a valid payload.
 */
function customerName(input) {
  const first0 = input.first_name || input.firstName;
  const last0 = input.last_name || input.lastName;
  if (first0 || last0) return { first: first0 || 'Customer', last: last0 || 'ManishaPay' };
  const raw = String(input.name || input.customer_name || '').trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  return {
    first: parts[0] || 'Customer',
    last: parts.length > 1 ? parts.slice(1).join(' ') : 'ManishaPay',
  };
}

// ─── AES-256-GCM card field encryption ───────────────────────────────────────
// ⚠️ CONVENTION (verify against an official Flutterwave SDK before going live):
//   • KEY ENCODING — the Encryption Key is treated as base64 and decoded to 32
//     raw bytes (AES-256). If a live SDK uses the raw UTF-8 bytes instead, swap
//     the decode below.
//   • IV — the per-request 12-char `nonce` (its UTF-8 bytes) IS the GCM IV, and
//     is also echoed inside payment_method.card.nonce.
//   • TAG PLACEMENT — the 16-byte GCM auth tag is APPENDED to the ciphertext and
//     the concatenation is base64-encoded. Some SDKs send the tag separately.

/** base64-decode the Encryption Key to a 32-byte AES-256 key. */
function decodeEncryptionKey(encryptionKey) {
  if (!encryptionKey) {
    throw new AppError({
      status: 400,
      code: 'ENCRYPTION_KEY_REQUIRED',
      message: 'A Flutterwave v4 Encryption Key is required to charge a card directly.',
      resolution:
        'Add the Encryption Key (Flutterwave dashboard → Settings → API Keys, v4) to this gateway. It AES-256-GCM-encrypts the card fields before they leave your server.',
    });
  }
  const key = Buffer.from(String(encryptionKey), 'base64');
  if (key.length !== 32) {
    throw new AppError({
      status: 400,
      code: 'ENCRYPTION_KEY_INVALID',
      message: `The Flutterwave Encryption Key must base64-decode to 32 bytes (got ${key.length}).`,
      resolution:
        'Copy the v4 Encryption Key exactly from Settings → API Keys. It is a base64 string that decodes to a 32-byte AES-256 key.',
    });
  }
  return key;
}

/** A fresh 12-character url-safe nonce (used as the GCM IV and echoed in card.nonce). */
function generateNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[bytes[i] % chars.length];
  return out;
}

/**
 * AES-256-GCM encrypt one field. Returns base64(ciphertext || 16-byte authTag).
 * @param {string|number} plaintext
 * @param {Buffer} key  32 bytes
 * @param {Buffer} iv   12 bytes (the nonce)
 * @returns {string} base64
 */
function aesGcmEncrypt(plaintext, key, iv) {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes, appended per the convention above
  return Buffer.concat([enc, tag]).toString('base64');
}

/**
 * Inverse of aesGcmEncrypt (base64 → plaintext), splitting the trailing 16-byte
 * tag. Exposed so the unit test can prove the round-trip without a network call.
 */
function aesGcmDecrypt(b64, key, iv) {
  const buf = Buffer.from(String(b64), 'base64');
  const tag = buf.subarray(buf.length - 16);
  const enc = buf.subarray(0, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** base64(HMAC-SHA256(rawBody, secretHash)) — the v4 `flutterwave-signature`. */
function computeWebhookSignature(rawBody, secretHash) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  return crypto.createHmac('sha256', String(secretHash)).update(body).digest('base64');
}

// ─── OAuth client-credentials token manager ──────────────────────────────────
// Cache is keyed by clientId so multiple projects/tenants don't share a token.
const tokenCache = new Map(); // clientId -> { token, expiresAt }

function assertClientCreds(creds) {
  if (!creds || !creds.clientId || !creds.clientSecret) {
    throw new AppError({
      status: 400,
      code: 'CREDENTIALS_REQUIRED',
      message: 'Flutterwave v4 requires a Client ID and Client Secret (there is no simulator).',
      resolution:
        'Add the v4 Client ID and Client Secret (Flutterwave dashboard → Settings → API Keys) to this gateway in the Connect App.',
    });
  }
}

/** Exchange client-credentials for a fresh access token and cache it. */
async function fetchToken(creds) {
  const form = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: 'client_credentials',
  }).toString();

  const res = await withRetry(
    () =>
      http.post(TOKEN_URL, form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    { label: 'flutterwave.token' },
  );

  if (res.status >= 500) {
    throw AppError.upstream(new Error(`Flutterwave IdP returned ${res.status} on token exchange`));
  }
  if (res.status >= 400 || !res.data || !res.data.access_token) {
    throw new AppError({
      status: 401,
      code: 'FLUTTERWAVE_AUTH_FAILED',
      message: 'Flutterwave rejected the client-credentials token request.',
      resolution:
        'Re-check the v4 Client ID and Client Secret (Settings → API Keys). They are distinct from the legacy FLWSECK- v3 keys.',
      details: res.data,
    });
  }

  const expiresIn = Number(res.data.expires_in) || 600;
  const ttlMs = Math.min(
    Math.max(expiresIn - TOKEN_REFRESH_SKEW_S, 30) * 1000,
    TOKEN_TTL_CEILING_MS,
  );
  const entry = { token: res.data.access_token, expiresAt: Date.now() + ttlMs };
  tokenCache.set(creds.clientId, entry);
  return entry.token;
}

/** Cached token for this clientId, refreshing at T-60s (or forced after a 401). */
async function getToken(creds, forceRefresh = false) {
  assertClientCreds(creds);
  const cached = tokenCache.get(creds.clientId);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.token;
  return fetchToken(creds);
}

// ─── HTTP plumbing ────────────────────────────────────────────────────────────

function baseUrl(mode, creds) {
  // Only the LIVE host is overridable (docs conflict, see top of file). Sandbox
  // is fixed so a test payment can't accidentally target production.
  if (mode === 'live') return (creds && creds.baseUrl) || LIVE_BASE_DEFAULT;
  return SANDBOX_BASE;
}

/** Turn a Flutterwave error body into a targeted resolution. */
function fwResolution(res) {
  if (res.status === 401) {
    return 'Flutterwave rejected the access token. The Client ID/Secret may be wrong, or the token expired mid-request — retry (we auto re-auth once).';
  }
  const data = res.data || {};
  const err = data.error || data;
  if (err && (err.code || err.type)) {
    return `Flutterwave rejected the request (${err.code || err.type}). Check the currency/method combo, the customer email, and that the amount is valid.`;
  }
  return 'Check the request against the v4 orchestration schema (amount as a number, customer.email, a valid payment_method). Full payload is in details.';
}

/** Central status/error branching for every Flutterwave HTTP response. */
function ensureOk(res, label) {
  if (res.status >= 500) {
    throw AppError.upstream(new Error(`Flutterwave returned ${res.status} on ${label}`));
  }
  if (res.status >= 400) {
    const data = res.data || {};
    const msg =
      (data.error && data.error.message) ||
      data.message ||
      `Flutterwave rejected ${label} (HTTP ${res.status})`;
    throw new AppError({
      status: res.status === 401 ? 401 : 400,
      code: 'FLUTTERWAVE_REJECTED',
      message: msg,
      resolution: fwResolution(res),
      details: data,
    });
  }
  return res.data;
}

/**
 * Authenticated JSON call with automatic single 401 re-auth. `extraHeaders`
 * carries per-call things like X-Idempotency-Key and X-Scenario-Key.
 */
async function callApi(creds, mode, { method, path, data, extraHeaders = {}, label }) {
  const url = baseUrl(mode, creds) + path;
  const doCall = (token) =>
    http.request({
      method,
      url,
      data,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
    });

  let token = await getToken(creds);
  let res = await withRetry(() => doCall(token), { label });
  if (res.status === 401) {
    // Token may have expired between refresh and use — re-auth once, then retry.
    token = await getToken(creds, true);
    res = await withRetry(() => doCall(token), { label: `${label}.reauth` });
  }
  return res;
}

// ─── payment_method builders ──────────────────────────────────────────────────

/** Mobile money rail — NO encryption. { network, country_code, phone_number }. */
function buildMobileMoneyMethod(input) {
  const mm = input.mobile_money || {};
  const network = mm.network || input.network;
  const phone = mm.phone_number || input.phone_number || input.phone;
  const country = mm.country_code || input.country_code;
  if (!network || !phone) {
    throw new AppError({
      status: 400,
      code: 'MOBILE_MONEY_FIELDS_REQUIRED',
      message: 'Mobile-money charges need a network and phone number.',
      resolution:
        'Pass mobile_money: { network: "MTN"|"airtel"|…, country_code: "233", phone_number: "…" } (or top-level network/phone/country_code).',
    });
  }
  return {
    type: 'mobile_money',
    mobile_money: { network, country_code: country, phone_number: phone },
  };
}

/** Card rail — AES-256-GCM field encryption. Requires raw card fields in input.card. */
function buildCardMethod(input, creds) {
  const card = input.card || {};
  const number = card.card_number || card.number;
  const expMonth = card.expiry_month || card.expiryMonth;
  const expYear = card.expiry_year || card.expiryYear;
  const cvv = card.cvv;
  if (!number || !expMonth || !expYear || !cvv) {
    throw new AppError({
      status: 400,
      code: 'CARD_FIELDS_REQUIRED',
      message:
        'A direct card charge needs the raw card fields (card_number, expiry_month, expiry_year, cvv) so they can be AES-256-GCM-encrypted.',
      resolution:
        'Collect the card details on a PCI-compliant surface and pass input.card = { card_number, expiry_month, expiry_year, cvv }. To avoid handling raw PAN, use Flutterwave\'s hosted checkout instead of a direct card charge.',
    });
  }
  const key = decodeEncryptionKey(creds.encryptionKey);
  const nonce = generateNonce();
  const iv = Buffer.from(nonce, 'utf8'); // 12 bytes
  return {
    type: 'card',
    card: {
      nonce,
      encrypted_card_number: aesGcmEncrypt(number, key, iv),
      encrypted_expiry_month: aesGcmEncrypt(expMonth, key, iv),
      encrypted_expiry_year: aesGcmEncrypt(expYear, key, iv),
      encrypted_cvv: aesGcmEncrypt(cvv, key, iv),
    },
  };
}

/** Dispatch to the right rail builder from input.method. */
function buildPaymentMethod(input, creds) {
  const method = String(input.method || 'card').toLowerCase();
  if (MOBILE_RAILS.has(method)) return buildMobileMoneyMethod(input);
  if (method === 'card') return buildCardMethod(input, creds);
  // bank_transfer / ussd: pass through any supplied rail object; these need no
  // client-side encryption and the customer completes them via the next_action.
  return { type: method, [method]: input[method] || {} };
}

/** Human hint derived from the charge's next_action. */
function instructionsFromNextAction(na) {
  if (!na || !na.type) {
    return 'Charge created. Confirm the outcome via pollStatus (GET /charges/{id}) or the webhook.';
  }
  switch (na.type) {
    case 'redirect_url':
      return 'Redirect the customer to checkoutUrl to authorize (3DS / hosted). Do NOT treat the redirect back as proof of payment — confirm via pollStatus or the verified webhook.';
    case 'requires_otp':
      return 'An OTP is required. Collect it from the customer and submit it to complete the charge.';
    case 'requires_pin':
      return 'A card PIN is required to authorize this charge.';
    case 'requires_additional_fields':
      return 'Additional fields (e.g. AVS billing address) are required to authorize this charge.';
    case 'payment_instruction': {
      const pi = na.payment_instruction || {};
      return pi.note || pi.instruction || 'Follow the returned payment instruction (USSD / bank transfer / mobile prompt), then poll GET /charges/{id}.';
    }
    default:
      return `Next action: ${na.type}. Confirm the outcome via pollStatus (GET /charges/{id}).`;
  }
}

// ─── provider ───────────────────────────────────────────────────────────────

/**
 * v4 requires customer.phone as an OBJECT { country_code, number } — not a
 * string. Strips non-digits and the leading zero (docs use "9012345678").
 * Returns null when no phone is available.
 */
function buildCustomerPhone(input) {
  const mm = input.mobile_money || {};
  const raw = input.phone || mm.phone_number || input.phone_number;
  if (!raw) return null;
  const cc = input.country_code || mm.country_code || input.dial_code;
  const number = String(raw).replace(/[^\d]/g, '').replace(/^0+/, '');
  if (!number) return null;
  return cc ? { country_code: String(cc), number } : { number };
}

/** @type {import('../contract').PaymentProvider} */
module.exports = {
  id: 'flutterwave',
  displayName: meta.displayName,
  capabilities: meta.capabilities,
  credentialSchema: meta.credentialSchema,

  /**
   * Start a charge via the Orchestrator Flow (one-shot).
   * @param {Object} input - { reference, amount, currency, method?, email?, phone?, name?, return_url?,
   *                            card?, mobile_money?, network?, country_code?, scenario? }
   * @param {Object} ctx   - { mode: 'test'|'live', creds: { clientId, clientSecret, encryptionKey?, secretHash?, baseUrl? }, project }
   * @returns {Promise<import('../contract').InitiateResult>}
   */
  async initiate(input, ctx) {
    const { mode = 'test', creds, project = {} } = ctx || {};
    assertClientCreds(creds);

    const currency = String(input.currency || '').toUpperCase();
    if (!currency) throw AppError.badRequest('currency is required', { field: 'currency' });
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      throw new AppError({
        status: 400,
        code: 'CURRENCY_NOT_SUPPORTED',
        message: `Flutterwave does not settle ${currency} in ManishaPay's configured set.`,
        resolution: `Use one of: ${[...SUPPORTED_CURRENCIES].join(', ')}. Zimbabwe (ZWL/local) is NOT a supported Flutterwave settlement country — route ZW payments to PayNow.`,
        details: { currency },
      });
    }

    const email = input.email || project.email;
    if (!email) {
      throw new AppError({
        status: 400,
        code: 'EMAIL_REQUIRED',
        message: 'Flutterwave requires a customer email to create a charge.',
        resolution: 'Pass `email` on the payment request (customer.email is mandatory).',
      });
    }

    const method = String(input.method || 'card').toLowerCase();
    const redirectUrl = input.return_url || project.return_url;
    // Card 3DS / hosted authorization lands the browser on redirect_url. Mobile
    // money / bank push flows don't strictly need it.
    if (method === 'card' && !redirectUrl) {
      throw new AppError({
        status: 400,
        code: 'RETURN_URL_REQUIRED',
        message: 'A redirect_url is required for card charges (3DS returns the customer to it).',
        resolution: 'Set a project return URL or pass `return_url`. (We still confirm server-side — the redirect is never trusted as proof.)',
      });
    }

    // v4 requires an ALPHANUMERIC reference (no _ / - / spaces). Sanitize the
    // merchant reference for the gateway; ManishaPay still tracks by the charge
    // id (data.id) returned below, so stripping punctuation here is safe.
    const reference = String(input.reference || `mp${crypto.randomBytes(8).toString('hex')}`)
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 100) || `mp${crypto.randomBytes(8).toString('hex')}`;
    const paymentMethod = buildPaymentMethod(input, creds);

    const payload = {
      amount: toGatewayAmount(input.amount), // v4 wants a JSON number
      currency,
      reference,
      payment_method: paymentMethod,
      customer: {
        email,
        name: customerName(input),
        ...(buildCustomerPhone(input) ? { phone: buildCustomerPhone(input) } : {}),
      },
      ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
    };

    const extraHeaders = { 'X-Idempotency-Key': uuidv4() }; // mitigation 3
    // Sandbox-only: let callers drive test outcomes with an X-Scenario-Key.
    if (mode === 'test' && input.scenario) extraHeaders['X-Scenario-Key'] = input.scenario;

    const res = await callApi(creds, mode, {
      method: 'post',
      path: '/orchestration/direct-charges',
      data: payload,
      extraHeaders,
      label: 'flutterwave.initiate',
    });
    const body = ensureOk(res, 'direct-charge create');
    const data = (body && body.data) || body || {};

    const na = data.next_action;
    let checkoutUrl;
    if (na && na.type === 'redirect_url' && na.redirect_url) checkoutUrl = na.redirect_url.url;

    const rawStatus = data.status || 'pending';
    return {
      providerRef: data.id, // chg_… — what we store + poll on later
      checkoutUrl,
      pollUrl: data.id ? `${baseUrl(mode, creds)}/charges/${data.id}` : undefined,
      rawStatus,
      status: normalizeStatus(rawStatus),
      mode,
      instructions: instructionsFromNextAction(na),
      raw: body,
    };
  },

  /**
   * Reconcile a charge. `ref` is the v4 charge id (chg_…).
   * `requires_requery` is surfaced as `pending` with a note (caller should wait
   * ~20s and re-poll — never re-charge).
   * @param {string} ref
   * @param {Object} creds - { clientId, clientSecret, baseUrl?, mode? }
   * @param {'test'|'live'} [mode] - defaults to creds.mode, then 'test'
   */
  async pollStatus(ref, creds, mode) {
    assertClientCreds(creds);
    if (!ref) throw AppError.badRequest('providerRef (charge id) is required to poll status');
    // Callers pass the stored `pollUrl` (a full URL) or a bare charge id — accept both.
    if (/^https?:\/\//i.test(ref)) ref = ref.split('?')[0].split('/').pop();
    const m = mode || (creds && creds.mode) || 'test';

    const res = await callApi(creds, m, {
      method: 'get',
      path: `/charges/${encodeURIComponent(ref)}`,
      label: 'flutterwave.poll',
    });
    const body = ensureOk(res, 'status poll');
    const data = (body && body.data) || body || {};
    const rawStatus = data.status;

    let status = normalizeStatus(rawStatus);
    let note;
    if (String(rawStatus || '').toLowerCase() === 'requires_requery') {
      status = 'pending';
      note = 'Flutterwave returned requires_requery — do NOT re-charge; wait ~20s and poll GET /charges/{id} again.';
    }

    return {
      ok: true,
      providerRef: data.id != null ? String(data.id) : String(ref),
      reference: data.reference,
      rawStatus,
      status,
      amount: data.amount,
      currency: data.currency,
      note,
      raw: body,
    };
  },

  /**
   * @param {string} raw @returns {import('../contract').CanonicalStatus}
   */
  normalizeStatus,

  /**
   * Verify an inbound v4 webhook over the RAW request bytes. The
   * `flutterwave-signature` header is base64(HMAC-SHA256(rawBody, secretHash)).
   * Never throws on a bad signature — returns { valid:false }.
   *
   * @param {string|Buffer} rawBody
   * @param {Object} headers - expects 'flutterwave-signature'
   * @param {Object} creds   - { secretHash }
   * @returns {{ valid: boolean, event?: string, status?: string, providerRef?: string, reference?: string, raw?: Object }}
   */
  verifyWebhook(rawBody, headers = {}, creds = {}) {
    try {
      const secretHash = creds.secretHash;
      if (!secretHash) return { valid: false };

      // Header names are case-insensitive; accept common casings.
      const signature =
        headers['flutterwave-signature'] ||
        headers['Flutterwave-Signature'] ||
        headers['FLUTTERWAVE-SIGNATURE'];
      if (!signature) return { valid: false };

      const expected = computeWebhookSignature(rawBody, secretHash);
      if (!timingSafeEqualStr(signature, expected)) return { valid: false };

      let payload = rawBody;
      if (Buffer.isBuffer(rawBody)) payload = rawBody.toString('utf8');
      if (typeof payload === 'string') payload = JSON.parse(payload);

      const event = payload && payload.event;
      const data = (payload && payload.data) || {};
      // Prefer the event token for refund/dispute events, else the charge status.
      const rawStatus =
        event && STATUS_MAP[String(event).toLowerCase()] ? event : data.status || event;

      return {
        valid: true,
        event,
        status: normalizeStatus(rawStatus),
        providerRef: data.id != null ? String(data.id) : undefined,
        reference: data.reference,
        raw: payload,
      };
    } catch (_err) {
      // Any parse/format failure is a rejected webhook, never a thrown 500.
      return { valid: false };
    }
  },

  /**
   * Refund a charge (full or partial).
   * ⚠️ The v4 refund body schema is UNCONFIRMED — we send { charge_id, amount? }.
   * Verify the field names against the live sandbox / an official SDK.
   * @param {Object} input - { providerRef?|charge_id?, amount?, currency? }
   * @param {Object} ctx   - { mode, creds }
   */
  async refund(input, ctx) {
    const { mode = 'test', creds } = ctx || {};
    assertClientCreds(creds);

    const chargeId = input.charge_id || input.chargeId || input.providerRef;
    if (!chargeId) {
      throw AppError.badRequest('A charge id (chg_…) is required to refund.', {
        resolution: 'Pass the providerRef / charge_id you received from initiate or the webhook.',
      });
    }

    const bodyReq = { charge_id: chargeId }; // ⚠️ schema UNCONFIRMED
    if (input.amount != null) bodyReq.amount = toGatewayAmount(input.amount);

    const res = await callApi(creds, mode, {
      method: 'post',
      path: '/refunds',
      data: bodyReq,
      extraHeaders: { 'X-Idempotency-Key': uuidv4() },
      label: 'flutterwave.refund',
    });
    const body = ensureOk(res, 'refund');
    const data = (body && body.data) || body || {};

    const rs = String(data.status || '').toLowerCase();
    let status = 'pending';
    if (rs === 'succeeded' || rs === 'completed' || rs === 'refunded') status = 'refunded';
    else if (rs === 'failed' || rs === 'error') status = 'failed';

    return {
      ok: status !== 'failed',
      providerRef: data.id != null ? String(data.id) : undefined,
      rawStatus: data.status,
      status,
      amount: data.amount,
      currency: data.currency,
      raw: body,
    };
  },

  // Exposed for unit tests (no network) and internal reuse.
  toGatewayAmount,
  aesGcmEncrypt,
  aesGcmDecrypt,
  decodeEncryptionKey,
  generateNonce,
  computeWebhookSignature,
  timingSafeEqualStr,
};
