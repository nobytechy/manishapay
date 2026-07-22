/**
 * DpoProvider — DPO Pay (3G Direct Pay / "API3G") PaymentProvider.
 *
 * DPO speaks an XML-only API: every call POSTs a hand-built <API3G> document
 * (Content-Type text/xml) carrying a single CompanyToken — there is no OAuth,
 * no request signing, and no signed webhook. This adapter HIDES the XML
 * entirely behind ManishaPay's neutral JSON contract: the merchant only ever
 * sees InitiateResult / canonical statuses, never a tag.
 *
 * Flow (see research note providers research/dpo.md):
 *   createToken  → <Result>000</Result> + <TransToken>  (token CREATED, not paid)
 *   redirect     → <host>/payv3.php?ID=<TransToken>       (hosted payment page)
 *   verifyToken  → <Result> is the source of truth        (poll server-side)
 *
 * Mitigations baked in here:
 *   • XML hidden behind JSON — buildXml()/parseXml() are the only tag-aware code.
 *   • verifyToken Result 001 (authorised, not captured) maps to `pending`, NOT paid.
 *   • Status is fetched by polling verifyToken server-side — the browser
 *     RedirectURL is never trusted as proof of payment (DPO has no signed webhook).
 *   • API version is pinned to V6 internally (V6/V7 drift preempted).
 *
 * @see docs/PROVIDER-ARCHITECTURE.md
 */
'use strict';

const axios = require('axios');
const { withRetry } = require('../../services/retry');
const AppError = require('../../errors/AppError');
const { get } = require('../catalog');

const meta = get('dpo');

// ── Pinned endpoints (V6 — do not follow V7 drift without re-testing) ─────────
const HOSTS = Object.freeze({
  test: 'secure1.sandbox.directpay.online',
  live: 'secure.3gdirectpay.com',
});
const API_PATH = '/API/v6/';

/** DPO public demo sandbox token (research note) — lets a merchant build before KYC. */
const SANDBOX_COMPANY_TOKEN = '9F416C11-127B-4DE2-AC7F-D5710E4C5E0A';
/** Default sandbox ServiceType when the merchant hasn't provisioned their own. */
const SANDBOX_SERVICE_TYPE = '3854';

/**
 * verifyToken <Result> code → canonical status. Codes come straight from the
 * research note; anything unknown falls through to `pending` (safe: it re-polls,
 * never silently `paid`).
 */
const STATUS_MAP = Object.freeze({
  '000': 'paid',      // transaction paid & captured
  '001': 'pending',   // authorised, NOT captured yet — must not read as paid
  '002': 'paid',      // over/under paid — paid, flagged for review
  '007': 'pending',   // pending / awaiting result
  '900': 'pending',   // pending — not processed yet
  '006': 'disputed',  // fraud hold
  '901': 'failed',    // declined
  '902': 'failed',    // data mismatch
  '903': 'failed',    // token expired
  '904': 'failed',    // cancelled by customer
  '801': 'failed',
  '802': 'failed',
  '950': 'failed',
});

// ── Tiny XML helpers (no dependency) ─────────────────────────────────────────

/** Escape a value for safe inclusion in an XML text node / element. */
function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build an <API3G> XML document from a nested plain object. Arrays repeat the
 * key; nested objects nest elements; scalars are escaped text nodes. Keeps all
 * tag knowledge in one place so the rest of the module is pure JSON.
 * @param {Object} obj
 * @returns {string}
 */
function buildXml(obj) {
  const render = (node) =>
    Object.entries(node)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([key, v]) => {
        if (Array.isArray(v)) return v.map((item) => `<${key}>${render(item)}</${key}>`).join('');
        if (typeof v === 'object') return `<${key}>${render(v)}</${key}>`;
        return `<${key}>${escapeXml(v)}</${key}>`;
      })
      .join('');
  return `<?xml version="1.0" encoding="utf-8"?><API3G>${render(obj)}</API3G>`;
}

/**
 * Extract the text of the FIRST occurrence of <tag>…</tag>, XML-unescaped.
 * Minimal by design — DPO responses are flat and predictable.
 * @param {string} xml
 * @param {string} tag
 * @returns {string|undefined}
 */
function parseTag(xml, tag) {
  if (typeof xml !== 'string') return undefined;
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return undefined;
  return m[1]
    .trim()
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Parse the fields we care about out of any DPO response. */
function parseResponse(xml) {
  return {
    result: parseTag(xml, 'Result'),
    resultExplanation: parseTag(xml, 'ResultExplanation'),
    transToken: parseTag(xml, 'TransToken'),
    transRef: parseTag(xml, 'TransRef'),
  };
}

// ── Amount / misc formatting ─────────────────────────────────────────────────

/** DPO wants a decimal amount as a plain 2dp string (e.g. "10.00"). */
function toGatewayAmount(amount) {
  const n = typeof amount === 'string' ? Number(amount.replace(',', '.')) : Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw AppError.badRequest(`Invalid amount '${amount}' — must be a positive number.`);
  }
  return n.toFixed(2);
}

/** DPO ServiceDate format: "YYYY/MM/DD HH:MM". */
function serviceDate(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function hostFor(mode) {
  return HOSTS[mode] || HOSTS.live;
}

function apiUrl(mode) {
  return `https://${hostFor(mode)}${API_PATH}`;
}

/**
 * Resolve credentials. `companyToken` is required in live; in test mode we fall
 * back to DPO's public demo token so a merchant can build before KYC clears
 * (research pain point #2). `serviceType` defaults to the sandbox ServiceType.
 */
function resolveCreds(creds, mode) {
  const companyToken = creds && creds.companyToken;
  if (!companyToken) {
    if (mode === 'test') {
      return { companyToken: SANDBOX_COMPANY_TOKEN, serviceType: SANDBOX_SERVICE_TYPE };
    }
    throw new AppError({
      status: 400,
      code: 'CREDENTIALS_REQUIRED',
      message: 'DPO Pay requires a Company Token.',
      resolution:
        'Add your DPO Company Token (GUID) in Connect → DPO Pay. In TEST mode you can omit it to use DPO’s public sandbox token.',
    });
  }
  return {
    companyToken,
    serviceType: (creds && creds.serviceType) || SANDBOX_SERVICE_TYPE,
  };
}

/** POST a hand-built XML body to the DPO API and return the raw XML string. */
async function postXml(mode, xml, label) {
  try {
    const res = await withRetry(
      () =>
        axios.post(apiUrl(mode), xml, {
          headers: { 'Content-Type': 'text/xml', Accept: 'text/xml' },
          timeout: 20000,
          responseType: 'text',
          transformResponse: [(d) => d], // keep raw XML, never JSON-parse
        }),
      { label },
    );
    return typeof res.data === 'string' ? res.data : String(res.data);
  } catch (err) {
    throw AppError.upstream(err);
  }
}

/** @type {import('../contract').PaymentProvider} */
module.exports = {
  id: 'dpo',
  displayName: meta.displayName,
  capabilities: meta.capabilities,
  credentialSchema: meta.credentialSchema,

  // Exposed for unit tests / callers that need the invariants.
  toGatewayAmount,
  buildXml,
  parseResponse,

  /**
   * createToken → hosted payv3 checkout URL.
   * @param {Object} input - { reference, amount, currency, description?, return_url?, result_url? }
   * @param {Object} ctx   - { mode, creds, project }
   * @returns {Promise<import('../contract').InitiateResult>}
   */
  async initiate(input, ctx) {
    const mode = ctx.mode === 'live' ? 'live' : 'test';
    const { companyToken, serviceType } = resolveCreds(ctx.creds, mode);

    const redirectUrl = input.return_url || (ctx.project && ctx.project.return_url);
    const backUrl = input.result_url || (ctx.project && ctx.project.result_url) || redirectUrl;

    const xml = buildXml({
      CompanyToken: companyToken,
      Request: 'createToken',
      Transaction: {
        PaymentAmount: toGatewayAmount(input.amount),
        PaymentCurrency: input.currency || 'USD',
        CompanyRef: input.reference,
        RedirectURL: redirectUrl,
        BackURL: backUrl,
        CompanyRefUnique: '1',
        PTL: '96', // payment-time-limit (hours)
      },
      Services: {
        Service: {
          ServiceType: serviceType,
          ServiceDescription: input.description || input.reference || 'Payment',
          ServiceDate: serviceDate(),
        },
      },
    });

    const raw = await postXml(mode, xml, 'dpo.initiate');
    const parsed = parseResponse(raw);

    // createToken success is Result 000 (token created — NOT paid). Anything
    // else is a hard rejection: surface DPO's explanation with a resolution.
    if (parsed.result !== '000' || !parsed.transToken) {
      throw new AppError({
        status: 502,
        code: 'DPO_CREATE_TOKEN_FAILED',
        message: `DPO createToken failed (Result ${parsed.result || 'unknown'}${parsed.resultExplanation ? `: ${parsed.resultExplanation}` : ''}).`,
        resolution:
          'Check the Company Token, ServiceType and PaymentCurrency are all provisioned for this account in the DPO portal.',
        details: { result: parsed.result, explanation: parsed.resultExplanation },
      });
    }

    const checkoutUrl = `https://${hostFor(mode)}/payv3.php?ID=${encodeURIComponent(parsed.transToken)}`;

    return {
      providerRef: parsed.transToken, // TransToken doubles as the poll ref
      checkoutUrl,
      pollUrl: undefined, // DPO polls via verifyToken (no per-txn URL) — pass the ref to pollStatus
      rawStatus: parsed.result, // "000" = token created
      status: 'pending', // token created, payment not yet made
      mode,
      instructions: 'Redirect the customer to the DPO checkout URL to complete payment.',
      raw: { ...parsed, transRef: parsed.transRef },
    };
  },

  /**
   * verifyToken — the source of truth for payment status. `ref` is the
   * TransToken returned by initiate. Mode is read from creds.mode/environment
   * (the orchestrator re-passes it) and defaults to sandbox.
   * @param {string} ref
   * @param {Object} creds
   */
  async pollStatus(ref, creds) {
    const mode = (creds && (creds.mode || creds.environment)) === 'live' ? 'live' : 'test';
    const { companyToken } = resolveCreds(creds, mode);

    const xml = buildXml({
      CompanyToken: companyToken,
      Request: 'verifyToken',
      TransactionToken: ref,
    });

    const raw = await postXml(mode, xml, 'dpo.pollStatus');
    const parsed = parseResponse(raw);

    return {
      providerRef: ref,
      rawStatus: parsed.result,
      status: this.normalizeStatus(parsed.result),
      raw: parsed,
    };
  },

  /**
   * Map a DPO <Result> code → canonical status. Unknown → pending (re-polled),
   * never silently paid.
   * @param {string} raw
   * @returns {import('../contract').CanonicalStatus}
   */
  normalizeStatus(raw) {
    if (raw == null) return 'pending';
    return STATUS_MAP[String(raw).trim()] || 'pending';
  },
};
