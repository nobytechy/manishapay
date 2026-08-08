/**
 * retrieve.js — lexical (BM25) retrieval over corpus.json.
 *
 * Deliberately not vector search: the corpus is ~140 chunks, lexical scoring
 * is deterministic, free, and needs no external embedding API or migrations.
 * The public surface (`search(query, k)`) is stable so a pgvector upgrade
 * later is a drop-in swap.
 */
'use strict';

const corpus = require('./corpus.json');

const tokenize = (s) =>
  s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter((t) => t.length > 1);

/* Pre-index once at module load. */
const docs = corpus.map((c) => {
  const tokens = tokenize(c.text + ' ' + Object.values(c.meta || {}).join(' '));
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return { ...c, tokens, tf, len: tokens.length };
});
const N = docs.length;
const avgLen = docs.reduce((a, d) => a + d.len, 0) / N;
const df = new Map();
for (const d of docs) for (const t of new Set(d.tokens)) df.set(t, (df.get(t) || 0) + 1);

const K1 = 1.4, B = 0.75;
const idf = (t) => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));

/** Gateway ids for a soft boost when named explicitly in the query. */
const GATEWAYS = ['paynow', 'stripe', 'paypal', 'mpesa', 'm-pesa', 'paystack', 'flutterwave',
  'payfast', 'pesepay', 'dpo', 'ozow', 'yoco', 'ecocash', 'onemoney', 'innbucks', 'omari', 'zimswitch'];

function search(query, k = 6) {
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];
  const named = GATEWAYS.filter((g) => query.toLowerCase().includes(g));

  const scored = docs.map((d) => {
    let score = 0;
    for (const t of new Set(qTokens)) {
      const f = d.tf.get(t) || 0;
      if (!f) continue;
      score += idf(t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / avgLen)));
    }
    // Soft boost when the chunk's gateway is explicitly named in the query.
    if (named.length && d.meta.gateway) {
      const gw = d.meta.gateway.replace('-', '');
      if (named.some((x) => x.replace('-', '') === gw || (gw === 'paynow' && ['ecocash','onemoney','innbucks','omari','zimswitch'].includes(x)))) score *= 1.5;
    }
    return { chunk: d, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => ({ id: s.chunk.id, text: s.chunk.text, meta: s.chunk.meta, score: +s.score.toFixed(3) }));
}

module.exports = { search };
