/**
 * limits.js — cost controls for ManishaAI.
 *
 *   • Per-visitor daily question limit (session cookie + IP, whichever is higher)
 *   • Global daily ceiling — the kill switch that bounds worst-case LLM spend
 *   • In-memory LRU answer cache keyed on the normalised question
 *   • Scope guard: quick lexical screen before we ever pay for a model call
 *
 * All state is in-memory by design: limits reset on deploy/restart, which is
 * acceptable for a free public endpoint (fail-open, never fail-closed on infra).
 */
'use strict';

const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 12);
const GLOBAL_DAILY_LIMIT = Number(process.env.AI_GLOBAL_DAILY_LIMIT || 800);
const CACHE_MAX = 500;

/* ── per-visitor + global counters, reset by UTC date ────────────── */
let day = new Date().toISOString().slice(0, 10);
let counters = new Map(); // key → count
let globalCount = 0;

function rollover() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; counters = new Map(); globalCount = 0; }
}

/** Returns { allowed, remaining, globalExhausted }. Increments on allow. */
function consume(sessionId, ip) {
  rollover();
  if (globalCount >= GLOBAL_DAILY_LIMIT) return { allowed: false, remaining: 0, globalExhausted: true };
  const kS = `s:${sessionId}`, kI = `i:${ip}`;
  const used = Math.max(counters.get(kS) || 0, counters.get(kI) || 0);
  if (used >= DAILY_LIMIT) return { allowed: false, remaining: 0, globalExhausted: false };
  counters.set(kS, (counters.get(kS) || 0) + 1);
  counters.set(kI, (counters.get(kI) || 0) + 1);
  globalCount += 1;
  return { allowed: true, remaining: DAILY_LIMIT - used - 1, globalExhausted: false };
}

function remaining(sessionId, ip) {
  rollover();
  const used = Math.max(counters.get(`s:${sessionId}`) || 0, counters.get(`i:${ip}`) || 0);
  return Math.max(0, DAILY_LIMIT - used);
}

/* ── answer cache ────────────────────────────────────────────────── */
const cache = new Map(); // normalised question → { answer, sources }
const normalise = (q) => q.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function cacheGet(q) { return cache.get(normalise(q)) || null; }
function cacheSet(q, value) {
  const key = normalise(q);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value); // FIFO eviction
  cache.set(key, value);
}

/* ── scope guard ─────────────────────────────────────────────────── */
const ON_TOPIC = [
  'pay', 'gateway', 'stripe', 'paynow', 'paypal', 'pesa', 'paystack', 'flutterwave', 'payfast',
  'pesepay', 'dpo', 'ozow', 'yoco', 'ecocash', 'onemoney', 'innbucks', 'omari', 'zimswitch',
  'webhook', 'checkout', 'api', 'integrat', 'transaction', 'refund', 'settle', 'currency', 'usd',
  'zwl', 'zar', 'card', 'visa', 'mastercard', 'mobile money', 'link', 'sandbox', 'test', 'key',
  'sdk', 'widget', 'merchant', 'manishapay', 'manisha', 'invoice', 'subscription', 'hash', 'sign',
  'fee', 'pricing', 'kyc', 'error', 'status', 'callback', 'redirect', 'laravel', 'php', 'node',
  'react', 'python', 'flutter', 'wordpress', 'woocommerce', 'whmcs', 'hello', 'hi ', 'help',
];

/** Cheap lexical screen; the system prompt is the real guard. */
function looksOnTopic(q) {
  const s = ` ${q.toLowerCase()} `;
  return ON_TOPIC.some((t) => s.includes(t));
}

module.exports = { consume, remaining, cacheGet, cacheSet, looksOnTopic, DAILY_LIMIT };
