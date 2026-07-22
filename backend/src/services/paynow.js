/**
 * PayNow REST client.
 *
 * No longer reads PayNow credentials from env — instead, every call takes
 * a `creds` parameter loaded from `manishapay_paynow_credentials` per
 * project + mode. This is what makes ManishaPay middleware (each merchant
 * uses their own PayNow integration) rather than an aggregator (one
 * server-wide PayNow account).
 *
 * Three execution modes:
 *
 *   simulated  — no PayNow call. Returns a deterministic fake redirect
 *                URL pointing at our own simulator page. Used when a
 *                test API key is presented but no PayNow test creds are
 *                configured. Lets devs onboard in 30 seconds without
 *                creating a PayNow account.
 *
 *   test       — real PayNow call using merchant's TEST integration
 *                (credentials whose PayNow integration is in test status).
 *                No real money moves; PayNow uses special test phone
 *                numbers (0771111111 etc.) to simulate outcomes.
 *
 *   live       — real PayNow call using merchant's LIVE integration.
 *                Real money moves directly from customer to merchant's
 *                PayNow wallet. ManishaPay never touches the funds.
 *
 * Also handles the documented forum-issue fixes inline:
 *   • Decimal normalization (the C# '2.00' bug)
 *   • Phone normalization (Express checkout silently skips OTP without it)
 *   • Hash compute + verify
 *   • Retry with exponential backoff
 */
'use strict';

const axios = require('axios');
const env = require('../config/env');
const hash = require('./hash');
const { withRetry } = require('./retry');
const { logger } = require('./logger');
const AppError = require('../errors/AppError');

const http = axios.create({
  baseURL: env.PAYNOW_API_BASE,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  validateStatus: () => true,
});

/**
 * Generates a globally-unique tracker ID we send to PayNow as the
 * `reference` field. When the callback comes in, this lets us route to
 * the right project even if two merchants happened to use the same
 * merchant_reference value.
 */
function generateTracker() {
  // 16 lowercase hex chars after the prefix — collision-resistant for
  // many years at human-realistic transaction rates, fits PayNow's 32-char
  // merchanttrace limit comfortably.
  const random = require('crypto').randomBytes(8).toString('hex');
  return `mp_${random}`;
}

/**
 * Coerces an amount in any plausible representation to PayNow's expected
 * `0.00` invariant string. Fixes the `System.FormatException` reported in
 * the C# SDK forum thread.
 */
function normalizeAmount(input) {
  if (input == null) throw AppError.badRequest('amount is required');
  const cleaned = String(input).replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) {
    throw AppError.badRequest(`amount '${input}' is not a positive number`, { received: input });
  }
  return n.toFixed(2);
}

/**
 * Normalizes a phone number to MSISDN form expected by Ecocash/Express
 * (`263XXXXXXXXX`). Without this, Express payouts silently skip the
 * phone prompt — that's the issue from forum post #7.
 */
function normalizePhone(input) {
  if (!input) return null;
  const digits = String(input).replace(/[^\d]/g, '');
  if (digits.startsWith('263')) return digits;
  if (digits.startsWith('0') && digits.length === 10) return '263' + digits.slice(1);
  if (digits.startsWith('7') && digits.length === 9) return '263' + digits;
  return digits; // Let PayNow reject if shape is wrong, with its own error message.
}

/**
 * Builds the form-encoded body for an initiate request.
 *
 * @param {object} input - { reference, amount, description, email, phone, method, return_url, result_url }
 * @param {object} creds - { integrationId, integrationKey }
 * @param {string} tracker - the global tracker id we send as PayNow's `reference`
 * @param {object} project - { return_url, result_url }
 * @returns {{ body: string, fields: Record<string,string> }}
 */
function buildInitiateBody(input, creds, tracker, project) {
  const fields = {
    id: creds.integrationId,
    reference: tracker,
    amount: normalizeAmount(input.amount),
    additionalinfo: input.description || '',
    returnurl: input.return_url || project.return_url || env.PAYNOW_RETURN_URL,
    resulturl: input.result_url || project.result_url || env.PAYNOW_RESULT_URL,
    authemail: input.email || '',
    status: 'Message',
  };
  // Express checkout? PayNow needs the method + phone in the same payload.
  if (input.method) {
    fields.method = input.method;
    fields.phone = normalizePhone(input.phone) || '';
  }
  fields.hash = hash.compute(fields, creds.integrationKey);
  return { body: hash.toQueryString(fields), fields };
}

/**
 * PayNow's Express Checkout (any `method` is set → /remotetransaction) has
 * stricter required fields than the web-redirect flow:
 *   • authemail is required on EVERY remote call ("The authemail field is
 *     required for remote transactions").
 *   • a customer phone is required for the mobile-money channels
 *     (ecocash / onemoney) — that's the number PayNow pushes the OTP to.
 * We assert these up front so the caller gets a clear ManishaPay error with a
 * fix, instead of PayNow's terse rejection deep in the flow.
 */
function assertRemoteFields(input) {
  if (!input.method) return; // web-redirect flow — email/phone optional
  if (!input.email) {
    throw new AppError({
      status: 400,
      code: 'REMOTE_EMAIL_REQUIRED',
      message: `PayNow Express Checkout (${input.method}) requires an email — it is sent to PayNow as authemail.`,
      resolution:
        'Add an email to the request. On a TEST integration PayNow requires it to match your PayNow-registered merchant email; on a live integration it can be the customer\'s email.',
    });
  }
  const mobileMoney = input.method === 'ecocash' || input.method === 'onemoney';
  if (mobileMoney && !normalizePhone(input.phone)) {
    throw new AppError({
      status: 400,
      code: 'REMOTE_PHONE_REQUIRED',
      message: `${input.method} payments need the customer's mobile number so PayNow can push the OTP prompt.`,
      resolution: 'Add the customer phone (e.g. 0771234567). ManishaPay normalises it to 263… before forwarding.',
    });
  }
}

/**
 * Maps a PayNow error message to a targeted, actionable resolution — turns the
 * forum's recurring "PayNow rejected and I don't know why" into a clear next
 * step. Covers the common forum threads (merchant-in-testing, hash, bad
 * integration id, currency, amount).
 */
function paynowResolution(errMsg) {
  const m = String(errMsg || '').toLowerCase();
  if (m.includes('authemail')) {
    return 'This is a remote / Express Checkout transaction (a payment method was set), which requires an email — sent to PayNow as authemail. Add an email to the request; on a TEST integration it must match your PayNow-registered merchant email.';
  }
  if (m.includes('testing') || m.includes('test mode')) {
    return 'This PayNow integration is still in TEST status, so it cannot take real payments. Use a ManishaPay test key (mp_test_) against the sandbox, or in PayNow open Receive Payments → your integration → Go Live, then add a live (mp_live_) credential.';
  }
  if (m.includes('hash')) {
    return 'Hash mismatch on PayNow\'s side. POST the same fields to /v1/tools/hash for an expected-vs-actual diff — almost always a field-order or integration-key issue.';
  }
  if (m.includes('integration') && (m.includes('not') || m.includes('invalid') || m.includes('find') || m.includes('exist'))) {
    return 'PayNow could not match this Integration ID. Re-check the Integration ID + Key (PayNow → Receive Payments → your integration) in your ManishaPay credentials.';
  }
  if (m.includes('currency')) {
    return 'Currency mismatch — this PayNow integration is fixed to one currency (e.g. ZWL or USD). Send amounts in that currency, or use an integration that matches.';
  }
  if (m.includes('amount')) {
    return 'PayNow rejected the amount. It must be a positive 0.00 value within the integration\'s currency/limits.';
  }
  return 'Re-check the reference and amount. If the message mentions hash, run /v1/tools/hash for a diff.';
}

/**
 * Initiates a payment.
 *
 * @param {object} input - merchant's request body
 * @param {object} ctx - {
 *   mode: 'test'|'live',
 *   creds: { integrationId, integrationKey } | null,
 *   project: { id, return_url, result_url } | null
 * }
 * @returns {Promise<{
 *   tracker: string,
 *   browser_url: string,
 *   poll_url: string,
 *   status: string,
 *   instructions?: string,
 *   mode: 'simulated'|'test'|'live',
 * }>}
 */
async function initiate(input, ctx) {
  const tracker = generateTracker();
  const project = ctx.project || {};

  // Forum issue #5: PayNow TEST mode rejects any authemail that isn't the
  // integration's registered merchant email. We now store that email per
  // credential (collected at connect time), and the shared sandbox integration
  // supplies its own — both exposed as creds.merchantEmail. So in test mode we
  // swap it in automatically for every merchant: the caller's email is still
  // recorded, but never causes a test-mode rejection.
  if (ctx.mode === 'test' && ctx.creds && ctx.creds.merchantEmail) {
    input = { ...input, email: ctx.creds.merchantEmail };
  }

  // Enforce Express Checkout's required fields before we branch into any mode,
  // so the sandbox (simulated) teaches the same rule the real PayNow enforces.
  assertRemoteFields(input);

  // ─── Simulated path: no PayNow call at all ────────────────────────────
  // Fires when:
  //   - mode='test' and ctx.creds is null (merchant hasn't configured creds)
  // We return a fake redirect URL pointing at our own simulator page (the
  // simulator is mounted by the dashboard at /simulator/:tracker).
  if (!ctx.creds) {
    if (ctx.mode !== 'test') {
      throw new AppError({
        status: 400,
        code: 'CREDENTIALS_REQUIRED',
        message: 'Live mode requires PayNow credentials configured for this project',
        resolution:
          'Open your ManishaPay dashboard → Project → PayNow credentials → Add live credentials.',
      });
    }
    logger.info({ tracker, ref: input.reference }, 'simulated: no PayNow call');
    const base = env.PAYNOW_RETURN_URL.replace(/\/+$/, '').replace(/\/return.*$/, '');
    const simBase = env.SIMULATOR_BASE_URL || base;
    // Where the simulator returns the "customer" after an outcome — mirrors how
    // real PayNow redirects to the merchant's return_url. Passed as a query
    // param so the (stateless) simulator page knows where to go back to.
    const returnUrl = input.return_url || project.return_url || env.PAYNOW_RETURN_URL;
    return {
      tracker,
      browser_url: `${simBase}/simulator/${tracker}?return_url=${encodeURIComponent(returnUrl)}`,
      poll_url: `${simBase}/simulator/${tracker}/poll`,
      status: 'Sent',
      instructions: 'Simulated checkout — no real PayNow call. Click any outcome on the simulator page to fire a webhook.',
      mode: 'simulated',
    };
  }

  // ─── Real PayNow path (test or live) ─────────────────────────────────
  const url = input.method ? '/remotetransaction' : '/initiatetransaction';
  const { body } = buildInitiateBody(input, ctx.creds, tracker, project);

  const res = await withRetry(() => http.post(url, body), { label: 'paynow.initiate' });

  if (res.status >= 500) throw AppError.upstream(new Error(`PayNow returned ${res.status}`));
  const fields = hash.parseQueryString(res.data);

  if (fields.status && fields.status.toLowerCase() === 'error') {
    throw new AppError({
      status: 400,
      code: 'PAYNOW_REJECTED',
      message: fields.error || 'PayNow rejected the request',
      resolution: paynowResolution(fields.error),
      details: fields,
    });
  }

  // Verify the response hash so we don't trust a tampered redirect URL.
  const verification = hash.verify(fields, ctx.creds.integrationKey);
  if (!verification.ok) throw AppError.hashMismatch(verification.expected, verification.actual);

  return {
    tracker,
    browser_url: fields.browserurl || fields.browserUrl,
    poll_url: fields.pollurl || fields.pollUrl,
    instructions: fields.instructions,
    status: fields.status || 'Sent',
    mode: ctx.mode,
  };
}

/**
 * Polls PayNow for the latest status of a transaction. Verifies the
 * response hash with the merchant's integration key.
 */
async function pollStatus(pollUrl, creds) {
  if (!pollUrl) throw AppError.badRequest('poll_url is required');
  if (!/^https?:\/\//.test(pollUrl)) {
    throw AppError.badRequest('poll_url must be an http(s) URL');
  }
  // Simulated transactions have a poll_url under our own domain.
  if (pollUrl.includes('/simulator/')) {
    return { ok: true, status: 'Sent', amount: '0.00', reference: 'simulated', simulated: true };
  }
  // SSRF guard: a real PayNow poll_url is supplied by PayNow's response and must
  // point at PayNow — never an internal or arbitrary host — before we POST to it.
  let pollHost;
  try { pollHost = new URL(pollUrl).host; } catch { throw AppError.badRequest('poll_url is not a valid URL'); }
  if (!/(^|\.)paynow\.co\.zw$/i.test(pollHost)) {
    throw AppError.badRequest(`poll_url host not allowed: ${pollHost}`);
  }
  if (!creds) throw AppError.badRequest('creds required to verify poll response');

  const res = await withRetry(() => axios.post(pollUrl, '', { timeout: 10_000 }), {
    label: 'paynow.poll',
  });
  const fields = hash.parseQueryString(res.data);
  const verification = hash.verify(fields, creds.integrationKey);
  if (!verification.ok) throw AppError.hashMismatch(verification.expected, verification.actual);
  return {
    ok: true,
    status: fields.status,
    amount: fields.amount,
    reference: fields.reference,
    paynow_reference: fields.paynowreference,
  };
}

/**
 * Maps PayNow's 8 raw statuses into our 5-value enum.
 */
function normalizeStatus(paynowStatus) {
  const s = String(paynowStatus || '').toLowerCase();
  if (s === 'paid' || s === 'awaiting delivery' || s === 'delivered') return 'paid';
  if (s === 'created' || s === 'sent') return 'pending';
  if (s === 'cancelled') return 'failed';
  if (s === 'disputed') return 'disputed';
  if (s === 'refunded') return 'refunded';
  return 'pending';
}

module.exports = {
  initiate,
  pollStatus,
  generateTracker,
  normalizeAmount,
  normalizePhone,
  normalizeStatus,
};
