/**
 * PayFastProvider — PayFast (South Africa) PaymentProvider.
 *
 * PayFast is a redirect gateway: you render a hidden HTML form of signed fields
 * that POSTs to /eng/process, PayFast hosts the payment page, and the outcome is
 * delivered server-to-server via an ITN (Instant Transaction Notification) POST
 * to your notify_url. There is no per-transaction poll API — the ITN is the
 * source of truth, and it is notoriously easy to validate wrongly.
 *
 * THE TWO THINGS THAT MUST BE EXACTLY RIGHT (both live here, nowhere else):
 *
 *  1) The MD5 signature. PayFast signs `key=value&key=value…` where every value
 *     is **PHP urlencode()**d — NOT JavaScript encodeURIComponent(). They differ
 *     on `! ' ( ) * ~` and on spaces (`+` vs `%20`), and PHP emits UPPERCASE hex.
 *     One canonical `phpUrlEncode()` is used for BOTH signing (checkout) and ITN
 *     verification so the two can never drift. Fields are filtered on
 *     blank-ness (''/null) — NOT truthiness — so a legitimate `'0'` (e.g.
 *     subscription `cycles=0` = indefinite) survives into the signature.
 *     Checkout uses a hardcoded DOCUMENTED field order; ITN uses the order the
 *     fields were RECEIVED in.
 *
 *  2) The 4 mandatory ITN checks (all non-bypassable):
 *       (a) signature — recompute over the received fields (received order) and
 *           compare to the posted `signature`.
 *       (b) source — the request IP must resolve from one of PayFast's hosts
 *           (DNS-resolved allowlist, never hardcoded IPs).
 *       (c) postback — POST the untouched payload back to /eng/query/validate;
 *           PayFast must answer `VALID`.
 *       (d) data — merchant_id matches ours AND amount_gross is within R0.01 of
 *           the amount we expected.
 *     A redirect return is NEVER proof of payment; only a fully-validated ITN is.
 *
 * @see docs/PROVIDER-ARCHITECTURE.md
 * @see providers research note: payfast.md
 */
'use strict';

const axios = require('axios');
const crypto = require('crypto'); // Node built-in — MD5 only (NO crypto-js)
const dns = require('dns').promises;
const { withRetry } = require('../../services/retry');
const AppError = require('../../errors/AppError');
const { get } = require('../catalog');

const meta = get('payfast');

// ── Endpoints (host by mode) ─────────────────────────────────────────────────
const HOSTS = Object.freeze({ test: 'sandbox.payfast.co.za', live: 'www.payfast.co.za' });
const PROCESS_PATH = '/eng/process';
const VALIDATE_PATH = '/eng/query/validate';
const HTTP_TIMEOUT = 30000;

/** PayFast's own hosts an ITN can legitimately originate from (resolved via DNS). */
const VALID_ITN_HOSTS = Object.freeze([
  'www.payfast.co.za',
  'sandbox.payfast.co.za',
  'w1w.payfast.co.za',
  'w2w.payfast.co.za',
]);

/**
 * The DOCUMENTED checkout field order PayFast signs against. This is NOT
 * alphabetical and NOT "the order you happen to add them" — it is fixed by
 * PayFast's attribute-description page. Only the fields actually present (and
 * non-blank) are included; the order of those that are present is preserved.
 */
const CHECKOUT_ORDER = Object.freeze([
  // Merchant details
  'merchant_id', 'merchant_key', 'return_url', 'cancel_url', 'notify_url',
  // Buyer details
  'name_first', 'name_last', 'email_address', 'cell_number',
  // Transaction details
  'm_payment_id', 'amount', 'item_name', 'item_description',
  'custom_int1', 'custom_int2', 'custom_int3', 'custom_int4', 'custom_int5',
  'custom_str1', 'custom_str2', 'custom_str3', 'custom_str4', 'custom_str5',
  // Transaction options
  'email_confirmation', 'confirmation_address',
  // Payment method
  'payment_method',
  // Recurring billing
  'subscription_type', 'billing_date', 'recurring_amount', 'frequency', 'cycles',
  'subscription_notify_email', 'subscription_notify_webhook', 'subscription_notify_buyer',
]);

/**
 * Raw PayFast `payment_status` → one of the 5 canonical statuses. `refunded` and
 * `disputed` are NOT native ITN statuses (they're derived elsewhere); unknown →
 * `pending` (safe: never silently `paid`).
 */
const STATUS_MAP = Object.freeze({
  COMPLETE: 'paid',
  PENDING: 'pending', // EFT still clearing
  FAILED: 'failed',
  CANCELLED: 'failed',
});

// ─── canonical encoding + signing ────────────────────────────────────────────

/**
 * A value counts for signing if it is NOT blank. Deliberately checks ''/null/
 * undefined — NOT truthiness — so `'0'` (a valid PayFast value, e.g. cycles=0)
 * is kept. Whitespace-only is treated as blank (PayFast trims).
 * @param {*} v
 * @returns {boolean}
 */
function nonBlank(v) {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

/**
 * PHP urlencode(), reproduced exactly. encodeURIComponent() leaves `! ' ( ) * ~`
 * unescaped and encodes spaces as %20; PHP escapes those punctuation marks and
 * encodes spaces as `+`. PHP also emits UPPERCASE hex — encodeURIComponent
 * already does. This ONE function is used for both signing and ITN verify so
 * they cannot diverge.
 * @param {string|number} str
 * @returns {string}
 */
function phpUrlEncode(str) {
  return encodeURIComponent(String(str))
    .replace(/%20/g, '+')
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/~/g, '%7E');
}

/**
 * Build the exact string PayFast MD5-hashes: `key=phpUrlEncode(trim(value))`
 * joined by `&`, in `order`, blanks skipped, with `&passphrase=…` appended last
 * when a passphrase is configured.
 * @param {Object} fields
 * @param {string[]} order  - the key order to emit (checkout: documented; ITN: received)
 * @param {string=} passphrase
 * @returns {string}
 */
function buildSignatureString(fields, order, passphrase) {
  const parts = [];
  for (const key of order) {
    const value = fields[key];
    if (nonBlank(value)) parts.push(`${key}=${phpUrlEncode(String(value).trim())}`);
  }
  let str = parts.join('&');
  if (nonBlank(passphrase)) str += `&passphrase=${phpUrlEncode(String(passphrase).trim())}`;
  return str;
}

/** MD5 → lowercase hex (PayFast requirement). */
function md5(input) {
  return crypto.createHash('md5').update(input, 'utf8').digest('hex');
}

/**
 * Compute a PayFast signature.
 * @param {Object} fields
 * @param {string[]} order
 * @param {string=} passphrase
 * @returns {string} lowercase md5 hex
 */
function computeSignature(fields, order, passphrase) {
  return md5(buildSignatureString(fields, order, passphrase));
}

/**
 * Signature-debug helper — returns the EXACT param string that was hashed plus
 * its signature. This is the single most useful artefact when a merchant's
 * signature won't match: eyeball the string, spot the stray field/encoding.
 * @param {Object} fields
 * @param {{ order?: string[], passphrase?: string }} [opts]
 * @returns {{ paramString: string, signature: string, order: string[] }}
 */
function signatureDebug(fields, opts = {}) {
  const order = opts.order || CHECKOUT_ORDER;
  const paramString = buildSignatureString(fields, order, opts.passphrase);
  return { paramString, signature: md5(paramString), order };
}

// ─── amounts ─────────────────────────────────────────────────────────────────

/** PayFast wants a decimal 2dp string, e.g. "100.00". Never trust the caller. */
function toGatewayAmount(amount) {
  const n = typeof amount === 'number' ? amount : Number(String(amount).replace(',', '.').trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw AppError.badRequest(`Invalid amount '${amount}' — must be a positive number.`, { amount });
  }
  return n.toFixed(2);
}

// ─── ITN parsing / decoding ──────────────────────────────────────────────────

/**
 * Parse a urlencoded ITN body into ordered [key, decodedValue] pairs, PRESERVING
 * the received order (which is what PayFast signs against on the ITN side). `+`
 * is decoded to space the way PHP's $_POST does.
 * @param {string} raw
 * @returns {Array<[string, string]>}
 */
function parseUrlEncodedOrdered(raw) {
  const pairs = [];
  for (const chunk of String(raw).split('&')) {
    if (!chunk) continue;
    const eq = chunk.indexOf('=');
    const rawKey = eq === -1 ? chunk : chunk.slice(0, eq);
    const rawVal = eq === -1 ? '' : chunk.slice(eq + 1);
    const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    const value = decodeURIComponent(rawVal.replace(/\+/g, ' '));
    pairs.push([key, value]);
  }
  return pairs;
}

/**
 * Normalize an ITN body (string bytes OR an already-parsed object) into ordered
 * pairs. When given an object we cannot recover PayFast's exact wire order, so
 * we fall back to the object's own key order — pass the RAW string whenever you
 * can, so the signature check uses the true received order.
 * @param {string|Buffer|Object} rawBody
 * @returns {Array<[string, string]>}
 */
function toOrderedPairs(rawBody) {
  if (Buffer.isBuffer(rawBody)) return parseUrlEncodedOrdered(rawBody.toString('utf8'));
  if (typeof rawBody === 'string') return parseUrlEncodedOrdered(rawBody);
  if (rawBody && typeof rawBody === 'object') {
    return Object.keys(rawBody).map((k) => [k, rawBody[k] == null ? '' : String(rawBody[k])]);
  }
  return [];
}

/** Re-serialise ordered pairs back to a urlencoded body for the postback. */
function serializeForPostback(pairs) {
  return pairs.map(([k, v]) => `${phpUrlEncode(k)}=${phpUrlEncode(v)}`).join('&');
}

// ─── ITN check helpers ───────────────────────────────────────────────────────

/**
 * Check (b): the request's source IP must be one PayFast actually sends from.
 * We DNS-resolve the allowlisted hosts at request time (PayFast rotates IPs, so
 * a hardcoded list rots) and test membership. No IP / no resolve → false.
 * @param {string} sourceIp
 * @returns {Promise<boolean>}
 */
async function isValidSourceIp(sourceIp) {
  if (!sourceIp) return false;
  const ip = String(sourceIp).trim();
  const resolved = await Promise.all(
    VALID_ITN_HOSTS.map((host) => dns.resolve4(host).catch(() => [])),
  );
  const allowed = new Set(resolved.flat());
  return allowed.has(ip);
}

/**
 * Check (c): echo the untouched payload back to PayFast's validate endpoint;
 * they answer `VALID` (or `INVALID`). Any non-VALID / network failure → false.
 * @param {string} mode
 * @param {string} body - the urlencoded ITN body
 * @returns {Promise<boolean>}
 */
async function postbackValidate(mode, body) {
  const host = HOSTS[mode === 'live' ? 'live' : 'test'];
  try {
    const res = await withRetry(
      () =>
        axios.post(`https://${host}${VALIDATE_PATH}`, body, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: HTTP_TIMEOUT,
          responseType: 'text',
          transformResponse: [(d) => d],
        }),
      { label: 'payfast.postback' },
    );
    return String(res.data || '').trim().split(/\r?\n/)[0].trim().toUpperCase() === 'VALID';
  } catch (_err) {
    return false;
  }
}

// ─── credentials / urls ──────────────────────────────────────────────────────

function resolveCreds(creds) {
  const merchantId = creds && creds.merchantId;
  const merchantKey = creds && creds.merchantKey;
  if (!merchantId || !merchantKey) {
    throw new AppError({
      status: 400,
      code: 'CREDENTIALS_REQUIRED',
      message: 'PayFast requires a Merchant ID and Merchant Key.',
      resolution:
        'Add your PayFast Merchant ID and Merchant Key (and, if enabled on your account, the Security passphrase) in Connect → PayFast. Sandbox creds are generated instantly from sandbox.payfast.co.za; live creds require KYC.',
    });
  }
  return {
    merchantId: String(merchantId),
    merchantKey: String(merchantKey),
    passphrase: nonBlank(creds.passphrase) ? String(creds.passphrase) : undefined,
  };
}

// ─── provider ────────────────────────────────────────────────────────────────

/** @type {import('../contract').PaymentProvider} */
module.exports = {
  id: 'payfast',
  displayName: meta.displayName,
  capabilities: meta.capabilities,
  credentialSchema: meta.credentialSchema,

  // Exposed for unit tests (no network) and internal reuse.
  phpUrlEncode,
  buildSignatureString,
  computeSignature,
  signatureDebug,
  toGatewayAmount,
  nonBlank,
  parseUrlEncodedOrdered,
  CHECKOUT_ORDER,
  STATUS_MAP,

  /**
   * Build the signed redirect form. PayFast has no create-transaction API call —
   * "initiating" is purely local: assemble the fields in documented order, sign
   * them, and hand the caller a checkoutUrl + the signed `raw.fields` to render
   * as a self-POSTing form (or 302 to a pre-built querystring).
   *
   * @param {Object} input - { reference, amount, currency, email?, phone?, description?, name_first?, name_last?, return_url?, result_url? }
   * @param {Object} ctx   - { mode: 'test'|'live', creds: { merchantId, merchantKey, passphrase? }, project }
   * @returns {Promise<import('../contract').InitiateResult>}
   */
  async initiate(input, ctx) {
    const mode = ctx && ctx.mode === 'live' ? 'live' : 'test';
    const { merchantId, merchantKey, passphrase } = resolveCreds(ctx && ctx.creds);
    const project = (ctx && ctx.project) || {};

    // PayFast settles ZAR only. Guard early with a helpful error rather than a
    // raw gateway rejection on the hosted page.
    const currency = String(input.currency || 'ZAR').toUpperCase();
    if (currency !== 'ZAR') {
      throw new AppError({
        status: 400,
        code: 'CURRENCY_NOT_SUPPORTED',
        message: `PayFast only settles ZAR (got ${currency}).`,
        resolution: 'Charge in ZAR, or route non-ZAR payments to another gateway (e.g. Stripe for global cards).',
        details: { currency },
      });
    }

    const itemName = input.item_name || input.description || input.reference || 'Payment';

    // Build in documented order. Blank fields are simply omitted (and thus don't
    // enter the signature). item_name is REQUIRED by PayFast.
    const fields = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: input.return_url || project.return_url,
      cancel_url: input.cancel_url || project.cancel_url || input.return_url || project.return_url,
      notify_url: input.result_url || project.result_url,
      name_first: input.name_first,
      name_last: input.name_last,
      email_address: input.email,
      cell_number: input.phone,
      m_payment_id: input.reference,
      amount: toGatewayAmount(input.amount),
      item_name: itemName,
      item_description: input.description,
    };

    // Sign over exactly the fields present, in documented order, then attach.
    const signature = computeSignature(fields, CHECKOUT_ORDER, passphrase);
    const signedFields = {};
    for (const key of CHECKOUT_ORDER) {
      if (nonBlank(fields[key])) signedFields[key] = String(fields[key]).trim();
    }
    signedFields.signature = signature;

    const checkoutUrl = `https://${HOSTS[mode]}${PROCESS_PATH}`;
    const rawStatus = 'PENDING'; // nothing is paid until a validated ITN says so

    return {
      providerRef: input.reference, // PayFast has no txn id yet; pf_payment_id arrives on the ITN
      checkoutUrl,
      pollUrl: undefined, // PayFast has no poll API — the ITN is the source of truth
      rawStatus,
      status: this.normalizeStatus(rawStatus),
      mode,
      instructions:
        'Render raw.fields as a hidden form that POSTs to checkoutUrl (method="post"), or redirect the customer there. Do NOT treat the browser return as payment — wait for a fully-validated ITN.',
      raw: {
        action: checkoutUrl,
        method: 'POST',
        fields: signedFields, // the caller renders/redirects these
        signatureString: buildSignatureString(fields, CHECKOUT_ORDER, passphrase),
      },
    };
  },

  /**
   * PayFast exposes no simple per-transaction status poll — payment outcome is
   * delivered by ITN (verifyWebhook). Fail loudly rather than silently return a
   * misleading status.
   */
  async pollStatus() {
    throw new AppError({
      status: 400,
      code: 'POLL_NOT_SUPPORTED',
      message: 'PayFast does not support status polling.',
      resolution:
        'PayFast reports the outcome via ITN (server-to-server POST to your notify_url). Handle it with verifyWebhook() — a validated ITN is the only proof of payment.',
    });
  },

  /**
   * Map PayFast `payment_status` → canonical. Unknown → pending (never silently paid).
   * @param {string} raw
   * @returns {import('../contract').CanonicalStatus}
   */
  normalizeStatus(raw) {
    if (raw == null) return 'pending';
    return STATUS_MAP[String(raw).trim().toUpperCase()] || 'pending';
  },

  /**
   * Verify a PayFast ITN. Runs all FOUR mandatory checks; the ITN is only
   * `valid` when every applicable check passes. NEVER throws on a bad ITN —
   * returns `{ valid: false, checks }` so the caller can 200 the ITN (PayFast
   * requires a 200) while refusing to fulfil the order.
   *
   * @param {string|Buffer|Object} rawBody - the RAW ITN body (pass the string, not a re-serialised object)
   * @param {Object} headers - request headers (used to find the source IP)
   * @param {Object} creds - { merchantId, merchantKey, passphrase?, mode? }
   * @param {Object} [opts] - { sourceIp?, mode?, expectedAmount? }  extra context the route can supply
   * @returns {Promise<{ valid: boolean, event?: string, status?: string, providerRef?: string, amount?: string, merchantId?: string, checks: Object, raw?: Object }>}
   */
  async verifyWebhook(rawBody, headers = {}, creds = {}, opts = {}) {
    const checks = { signature: false, source: false, postback: false, data: false };
    try {
      const pairs = toOrderedPairs(rawBody);
      if (!pairs.length) return { valid: false, checks };

      // Ordered fields, and a lookup map, excluding the posted signature itself.
      const fields = {};
      const orderedKeys = [];
      let providedSignature = '';
      for (const [k, v] of pairs) {
        if (k === 'signature') {
          providedSignature = v;
          continue;
        }
        fields[k] = v;
        orderedKeys.push(k);
      }

      const passphrase = nonBlank(creds.passphrase) ? String(creds.passphrase) : undefined;
      const mode = (opts.mode || creds.mode) === 'live' ? 'live' : 'test';

      // (a) signature — recompute over RECEIVED order, compare to posted signature.
      const expectedSig = computeSignature(fields, orderedKeys, passphrase);
      checks.signature =
        !!providedSignature &&
        expectedSig.length === providedSignature.length &&
        crypto.timingSafeEqual(
          Buffer.from(expectedSig),
          Buffer.from(String(providedSignature).toLowerCase()),
        );

      // (b) source — DNS-resolved host allowlist.
      const sourceIp =
        opts.sourceIp ||
        (headers['x-forwarded-for'] ? String(headers['x-forwarded-for']).split(',')[0].trim() : '') ||
        headers['x-real-ip'] ||
        headers['X-Real-IP'] ||
        '';
      checks.source = await isValidSourceIp(sourceIp);

      // (c) postback — echo the untouched body; PayFast must answer VALID.
      const bodyString =
        typeof rawBody === 'string'
          ? rawBody
          : Buffer.isBuffer(rawBody)
            ? rawBody.toString('utf8')
            : serializeForPostback(pairs.map(([k, v]) => [k, v])); // reconstruct (incl. signature)
      checks.postback = await postbackValidate(mode, bodyString);

      // (d) data — merchant_id matches ours AND amount within R0.01 of expected.
      const merchantIdOk =
        !creds.merchantId || String(fields.merchant_id) === String(creds.merchantId);
      const expectedAmount = opts.expectedAmount;
      const amountOk =
        expectedAmount == null
          ? true // caller didn't supply an expected amount — can't check, don't block
          : Math.abs(Number(fields.amount_gross) - Number(toGatewayAmount(expectedAmount))) <= 0.01;
      checks.data = merchantIdOk && amountOk;

      const valid = checks.signature && checks.source && checks.postback && checks.data;

      return {
        valid,
        event: fields.payment_status,
        status: this.normalizeStatus(fields.payment_status),
        providerRef: fields.pf_payment_id,
        amount: fields.amount_gross,
        merchantId: fields.merchant_id,
        checks,
        raw: fields,
      };
    } catch (_err) {
      return { valid: false, checks };
    }
  },
};
