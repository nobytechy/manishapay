/**
 * ManishaAI tests — retrieval relevance, cost controls, and the /v1/ai route.
 * The LLM is faked via llm._setGenerateForTests(); no network calls.
 */
'use strict';

process.env.NODE_ENV = 'test';

const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { search } = require('../src/ai/retrieve');
const limits = require('../src/ai/limits');
const llm = require('../src/ai/llm');
const { buildApp } = require('../src/app');

/* ── retrieval ───────────────────────────────────────────────────── */

test('retrieve: paynow hash question surfaces paynow chunks first', () => {
  const hits = search('I am getting a hash mismatch error with PayNow', 5);
  assert.ok(hits.length >= 2, 'expected hits');
  assert.strictEqual(hits[0].meta.gateway, 'paynow');
  assert.ok(hits.some((h) => /hash/i.test(h.text)));
});

test('retrieve: mpesa question prefers mpesa chunks', () => {
  const hits = search('does M-Pesa support Kenya and which currencies', 5);
  assert.ok(hits.length > 0);
  assert.strictEqual(hits[0].meta.gateway, 'mpesa');
});

test('retrieve: payment links question finds platform facts', () => {
  const hits = search('how do I create a payment link and share it on whatsapp', 6);
  assert.ok(hits.some((h) => h.meta.topic === 'payment-links'));
});

test('retrieve: ecocash question boosts paynow (routing knowledge)', () => {
  const hits = search('how can my customers pay with ecocash', 6);
  assert.ok(hits.some((h) => h.meta.gateway === 'paynow' || h.meta.topic === 'routing'));
});

/* ── limits ──────────────────────────────────────────────────────── */

test('limits: per-visitor daily quota decrements and blocks', () => {
  const sid = 'testsid-' + Date.now();
  let last;
  for (let i = 0; i < limits.DAILY_LIMIT; i++) last = limits.consume(sid, '10.0.0.1');
  assert.strictEqual(last.remaining, 0);
  const blocked = limits.consume(sid, '10.0.0.1');
  assert.strictEqual(blocked.allowed, false);
});

test('limits: ip shares quota across sessions (anti cookie-clearing)', () => {
  const ip = '10.9.9.' + (Date.now() % 250);
  for (let i = 0; i < limits.DAILY_LIMIT; i++) limits.consume('sid-a-' + i, ip);
  const blocked = limits.consume('sid-fresh', ip);
  assert.strictEqual(blocked.allowed, false);
});

test('limits: cache round-trips on normalised question', () => {
  limits.cacheSet('How do I  Verify a WEBHOOK?', { answer: 'x', sources: [] });
  const hit = limits.cacheGet('how do i verify a webhook');
  assert.ok(hit && hit.answer === 'x');
});

test('limits: scope guard rejects clearly off-topic text', () => {
  assert.strictEqual(limits.looksOnTopic('write me a poem about the ocean and dolphins'), false);
  assert.strictEqual(limits.looksOnTopic('how do I integrate paynow in laravel'), true);
});

/* ── route ───────────────────────────────────────────────────────── */

test('route: 503 when AI is not configured', async () => {
  delete process.env.AI_API_KEY;
  const app = buildApp();
  const res = await request(app).post('/v1/ai/chat').send({ message: 'stripe webhook help' });
  assert.strictEqual(res.status, 503);
});

test('route: grounded answer with sources via fake LLM', async () => {
  process.env.AI_API_KEY = 'test-key';
  llm._setGenerateForTests(async ({ system, messages }) => {
    assert.ok(system.includes('ManishaAI'));
    assert.ok(messages.at(-1).content.includes('CONTEXT'));
    return { text: 'Grounded answer about PayNow hashing.' };
  });
  const app = buildApp();
  const res = await request(app).post('/v1/ai/chat').send({ message: 'paynow hash mismatch fix?' });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.answer.includes('Grounded'));
  assert.ok(Array.isArray(res.body.sources) && res.body.sources.length > 0);
  assert.ok(typeof res.body.remaining === 'number');
  delete process.env.AI_API_KEY;
});

test('route: off-topic gets friendly redirect without spending quota', async () => {
  process.env.AI_API_KEY = 'test-key';
  llm._setGenerateForTests(async () => { throw new Error('should not be called'); });
  const app = buildApp();
  const res = await request(app).post('/v1/ai/chat').send({ message: 'tell me a bedtime story about dragons' });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.answer.includes('ManishaAI'));
  delete process.env.AI_API_KEY;
});

test('route: identical question served from cache on second ask', async () => {
  process.env.AI_API_KEY = 'test-key';
  let calls = 0;
  llm._setGenerateForTests(async () => { calls += 1; return { text: 'cached-me' }; });
  const app = buildApp();
  const q = { message: 'which currencies does paystack support ' + Date.now() + ' stripe' };
  await request(app).post('/v1/ai/chat').send(q);
  const second = await request(app).post('/v1/ai/chat').send(q);
  assert.strictEqual(second.body.cached, true);
  assert.strictEqual(calls, 1);
  delete process.env.AI_API_KEY;
});

test('route: status endpoint reports remaining + configured', async () => {
  const app = buildApp();
  const res = await request(app).get('/v1/ai/status');
  assert.strictEqual(res.status, 200);
  assert.ok('configured' in res.body && 'remaining' in res.body);
});

/* ── follow-up intelligence ──────────────────────────────────────── */

test('route: follow-up inherits conversation context for retrieval and guard', async () => {
  process.env.AI_API_KEY = 'test-key';
  let seenContext = '';
  llm._setGenerateForTests(async ({ messages }) => {
    seenContext = messages.at(-1).content;
    return { text: 'For Zimbabwe specifically, PayNow is the primary rail.' };
  });
  const app = buildApp();
  const res = await request(app).post('/v1/ai/chat').send({
    message: 'how about in Zimbabwe?',
    history: [
      { role: 'user', content: 'which payment gateway should I use in Africa?' },
      { role: 'assistant', content: 'It depends on the country — Paystack for Nigeria, M-Pesa for Kenya…' },
    ],
  });
  assert.strictEqual(res.status, 200);
  // Guard must NOT deflect (no payment keyword in the bare follow-up).
  assert.ok(!res.body.answer.includes('Ask me anything in that world'));
  // Retrieval context should include Zimbabwe-relevant chunks (paynow et al).
  assert.ok(/paynow|zimbabwe/i.test(seenContext), 'retrieval should surface Zimbabwe context');
  delete process.env.AI_API_KEY;
});

test('route: follow-ups bypass the global answer cache', async () => {
  process.env.AI_API_KEY = 'test-key';
  let calls = 0;
  llm._setGenerateForTests(async () => { calls += 1; return { text: 'answer ' + calls }; });
  const app = buildApp();
  const followUp = {
    message: 'and which currencies does it support?',
    history: [{ role: 'user', content: 'tell me about paystack' }],
  };
  await request(app).post('/v1/ai/chat').send(followUp);
  const second = await request(app).post('/v1/ai/chat').send(followUp);
  assert.strictEqual(calls, 2, 'follow-ups must not be served from cache');
  assert.notStrictEqual(second.body.cached, true);
  delete process.env.AI_API_KEY;
});

/* ── vernacular (Shona/Ndebele) support ──────────────────────────── */

test('guard: Shona payment question passes the scope screen', () => {
  assert.strictEqual(limits.looksOnTopic('Ndingagamuchira sei mari neEcoCash pawebsite yangu?'), true);
  assert.strictEqual(limits.looksOnTopic('Ngingayamukela njani imali nge-card?'), true);
});
