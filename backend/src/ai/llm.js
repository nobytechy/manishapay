/**
 * llm.js — minimal LLM provider abstraction for ManishaAI.
 *
 * Configuration (all optional; endpoint degrades gracefully when absent):
 *   AI_API_KEY     — provider API key (required to enable the assistant)
 *   AI_PROVIDER    — 'anthropic' (default) | 'openai'
 *   AI_BASE_URL    — override for OpenAI-compatible providers, e.g.
 *                    Gemini: https://generativelanguage.googleapis.com/v1beta/openai
 *                    Groq:   https://api.groq.com/openai/v1
 *   AI_MODEL       — provider model id (sane defaults below)
 *   AI_MAX_TOKENS  — output cap (default 700)
 *
 * Free-tier recipe (Google AI Studio):
 *   AI_PROVIDER=openai
 *   AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
 *   AI_MODEL=gemini-2.5-flash
 *   AI_API_KEY=<key from aistudio.google.com>
 *
 * `generate({ system, messages })` → { text }
 * Tests can inject a fake with `_setGenerateForTests(fn)`.
 */
'use strict';

const PROVIDER = process.env.AI_PROVIDER || 'anthropic';
const BASE_URL = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MODEL = process.env.AI_MODEL ||
  (PROVIDER === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-haiku-latest');
const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || 700);

const isConfigured = () => Boolean(process.env.AI_API_KEY);

async function anthropicGenerate({ system, messages }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.AI_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system, messages }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`anthropic ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return { text: (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n') };
}

async function openaiGenerate({ system, messages }) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: MAX_TOKENS,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`openai ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content || '' };
}

let generateImpl = PROVIDER === 'openai' ? openaiGenerate : anthropicGenerate;

const generate = (args) => generateImpl(args);
const _setGenerateForTests = (fn) => { generateImpl = fn; };

module.exports = { generate, isConfigured, _setGenerateForTests, MODEL, PROVIDER };
