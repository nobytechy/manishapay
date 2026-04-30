/**
 * PayNow hash helper.
 *
 * PayNow's signature is SHA-512 of the concatenated values of every field
 * (in their natural order, NOT alphabetical), followed by the integration
 * key, all uppercased. The most common reason developers see
 * `HashMismatchException` is that some HTTP layer somewhere has trimmed,
 * re-encoded, or re-ordered a field. We expose `compute` and `verify` so
 * the gateway and the dashboard tool can both use the same logic.
 */
'use strict';

const crypto = require('crypto');

/**
 * @param {Record<string,string|number>} fields  Field map in order.
 *   The `hash` key (if present) is excluded.
 * @param {string} integrationKey
 * @returns {string} Uppercase hex SHA-512.
 */
function compute(fields, integrationKey) {
  const concatenated =
    Object.entries(fields)
      .filter(([k]) => k.toLowerCase() !== 'hash')
      .map(([, v]) => (v === undefined || v === null ? '' : String(v)))
      .join('') + integrationKey;
  return crypto.createHash('sha512').update(concatenated, 'utf8').digest('hex').toUpperCase();
}

/**
 * @returns {{ ok: boolean, expected: string, actual: string }}
 */
function verify(fields, integrationKey) {
  const actual = String(fields.hash || fields.Hash || '').toUpperCase();
  const without = { ...fields };
  delete without.hash;
  delete without.Hash;
  const expected = compute(without, integrationKey);
  return { ok: expected === actual, expected, actual };
}

/**
 * PayNow returns query-string-style payloads (`a=1&b=2`). This parser
 * preserves order, which is what `compute` needs to match the merchant
 * portal's reference implementation.
 */
function parseQueryString(body) {
  const out = {};
  if (!body) return out;
  for (const part of body.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = decodeURIComponent(eq < 0 ? part : part.slice(0, eq));
    const v = decodeURIComponent(eq < 0 ? '' : part.slice(eq + 1).replace(/\+/g, ' '));
    out[k] = v;
  }
  return out;
}

function toQueryString(fields) {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`)
    .join('&');
}

module.exports = { compute, verify, parseQueryString, toQueryString };
