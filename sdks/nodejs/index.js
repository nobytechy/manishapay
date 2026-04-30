/**
 * ManishaPay — official Node.js SDK.
 *
 * Usage:
 *   const ManishaPay = require('manishapay');
 *   const mp = new ManishaPay('mp_test_xxxxxxxxxxxx');
 *   const r = await mp.pay({ reference: 'order-1', amount: '5.00' });
 *   console.log(r.browser_url);
 *
 * Webhook verification:
 *   const sig = req.headers['x-manishapay-signature'];
 *   const ok = ManishaPay.verifyWebhook(req.rawBody, sig, webhookSecret);
 *   if (!ok) return res.status(401).send('bad sig');
 */
'use strict';

const crypto = require('crypto');

const DEFAULT_BASE = 'https://pay.aizim.co.zw/api';

class ManishaPayError extends Error {
  constructor({ message, code, status, requestId, details }) {
    super(message);
    this.name = 'ManishaPayError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

class ManishaPay {
  /**
   * @param {string} apiKey - mp_test_xxx or mp_live_xxx
   * @param {object} [options]
   * @param {string} [options.baseUrl] - default: https://pay.aizim.co.zw/api
   * @param {number} [options.timeout] - milliseconds, default 15000
   * @param {object} [options.fetch] - custom fetch implementation (for tests)
   */
  constructor(apiKey, options = {}) {
    if (!apiKey || !/^mp_(test|live)_/.test(apiKey)) {
      throw new Error('ManishaPay: apiKey must start with mp_test_ or mp_live_');
    }
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
    this.timeout = options.timeout || 15000;
    this._fetch = options.fetch || globalThis.fetch;
    if (!this._fetch) {
      throw new Error('ManishaPay: global fetch unavailable; pass options.fetch (Node ≥18 has fetch built-in).');
    }
  }

  async _request(path, { method = 'GET', body } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeout);
    let res;
    try {
      res = await this._fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Request-Id': `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    let json;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (!res.ok) {
      const e = (json && json.error) || {};
      throw new ManishaPayError({
        message: e.message || `HTTP ${res.status}`,
        code: e.code || 'NETWORK',
        status: res.status,
        requestId: json?.requestId,
        details: e.details,
      });
    }
    return json?.data ?? json;
  }

  /**
   * Initiate a payment.
   * @param {object} input - { reference, amount, description?, email?, phone?, method?, return_url?, result_url? }
   * @returns {Promise<{ tracker, browser_url, poll_url, status, mode, instructions? }>}
   */
  pay(input) {
    return this._request('/v1/pay', { method: 'POST', body: input });
  }

  /**
   * Look up a transaction by your merchant reference.
   * @param {string} reference
   * @returns {Promise<object>}
   */
  status(reference) {
    return this._request(`/v1/pay/${encodeURIComponent(reference)}/status`);
  }

  /**
   * Verify a webhook signature header against the raw request body.
   * Use the project's webhook secret (configured per endpoint in the dashboard).
   *
   * @param {string|Buffer} rawBody - request body as bytes/string
   * @param {string} signatureHeader - value of X-ManishaPay-Signature
   * @param {string} secret - the webhook secret
   * @param {object} [opts]
   * @param {number} [opts.toleranceSeconds=300] - max age of timestamp
   * @returns {boolean}
   */
  static verifyWebhook(rawBody, signatureHeader, secret, opts = {}) {
    const toleranceSeconds = opts.toleranceSeconds ?? 300;
    if (!signatureHeader || !secret) return false;
    // Format: t=<unix>,v1=<hexsig>
    const parts = String(signatureHeader).split(',').reduce((acc, kv) => {
      const i = kv.indexOf('=');
      if (i > 0) acc[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
      return acc;
    }, {});
    const ts = Number(parts.t);
    const sig = parts.v1;
    if (!Number.isFinite(ts) || !sig) return false;
    if (Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false;

    const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${ts}.${body}`)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }
}

module.exports = ManishaPay;
module.exports.ManishaPay = ManishaPay;
module.exports.ManishaPayError = ManishaPayError;
