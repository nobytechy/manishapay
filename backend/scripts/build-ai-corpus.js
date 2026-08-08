/**
 * build-ai-corpus.js — regenerates src/ai/corpus.json from source material.
 *
 * Sources (in priority order):
 *   1. ../manishapay-dataset (sibling clone)   — gateway records + pain points
 *   2. ../../FORUM-COVERAGE.md                 — PayNow forum issue map
 *   3. inline PLATFORM_FACTS below             — ManishaPay product knowledge
 *
 * Output: an array of chunks:
 *   { id, text, meta: { source, gateway?, topic?, url? } }
 *
 * Run:  node scripts/build-ai-corpus.js [path-to-dataset-repo]
 * The generated corpus.json IS committed — the AI works without the dataset
 * repo present; this script only needs re-running when knowledge changes.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DATASET_DIR = process.argv[2] || path.join(__dirname, '..', '..', '..', 'manishapay-dataset');
const OUT = path.join(__dirname, '..', 'src', 'ai', 'corpus.json');

const chunks = [];
let n = 0;
const add = (text, meta) => chunks.push({ id: `c${++n}`, text: text.trim(), meta });

/* ── 1. Gateway dataset ─────────────────────────────────────────── */
const gwDir = path.join(DATASET_DIR, 'gateways');
if (fs.existsSync(gwDir)) {
  for (const f of fs.readdirSync(gwDir).filter((x) => x.endsWith('.json'))) {
    const g = JSON.parse(fs.readFileSync(path.join(gwDir, f), 'utf8'));
    const name = g.name || g.id;

    add(
      `${name} (${g.id}) overview. Category: ${g.category}. Regions: ${(g.regions || []).join(', ')}. ` +
      `Countries: ${(g.countries || []).join(', ')}. Currencies: ${(g.currencies || []).join(', ')}. ` +
      `Payment methods supported: ${(g.methods || []).join(', ')}. Docs: ${g.docs_url || g.homepage || 'n/a'}.`,
      { source: 'dataset', gateway: g.id, topic: 'overview', url: g.docs_url || g.homepage }
    );

    if (g.auth) {
      add(
        `${name} authentication: model ${g.auth.model}. Credential types: ${(g.auth.key_types || []).join(', ')}. ` +
        `Sandbox access is ${g.auth.sandbox_instant ? 'instant' : 'NOT instant (requires approval)'}; ` +
        `KYC ${g.auth.kyc_required_for_live ? 'is' : 'is not'} required before going live.`,
        { source: 'dataset', gateway: g.id, topic: 'auth' }
      );
    }
    if (g.initiate) {
      add(
        `${name} payment initiation: flow type "${g.initiate.flow}". Endpoint: ${g.initiate.endpoint}. ` +
        (g.initiate.required_params ? `Required parameters: ${g.initiate.required_params.join(', ')}. ` : '') +
        (g.initiate.notes ? `Notes: ${g.initiate.notes}` : ''),
        { source: 'dataset', gateway: g.id, topic: 'initiate' }
      );
    }
    if (g.status) {
      add(
        `${name} payment status: ${typeof g.status === 'string' ? g.status : JSON.stringify(g.status)}`,
        { source: 'dataset', gateway: g.id, topic: 'status' }
      );
    }
    if (g.webhooks) {
      add(
        `${name} webhooks/callbacks: ${typeof g.webhooks === 'string' ? g.webhooks : JSON.stringify(g.webhooks)}`,
        { source: 'dataset', gateway: g.id, topic: 'webhooks' }
      );
    }
    for (const p of g.pain_points || []) {
      add(
        `${name} known pain point: ${p.title || p.problem}. Cause: ${p.cause || 'n/a'}. ` +
        `Fix/mitigation: ${p.mitigation || p.fix || 'n/a'}.` + (p.source ? ` Source: ${p.source}` : ''),
        { source: 'dataset', gateway: g.id, topic: 'pain-point', url: p.source }
      );
    }
  }
}

/* ── 2. FORUM-COVERAGE.md — one chunk per "### " issue section ──── */
const forumPath = path.join(__dirname, '..', '..', 'FORUM-COVERAGE.md');
if (fs.existsSync(forumPath)) {
  const md = fs.readFileSync(forumPath, 'utf8');
  const sections = md.split(/\n(?=## )/g);
  for (const s of sections) {
    const title = (s.match(/^##\s+(.+)/) || [])[1];
    if (!title) continue;
    add(`PayNow forum issue — ${title}\n${s.replace(/^##.+\n/, '').slice(0, 1200)}`, {
      source: 'forum-coverage', gateway: 'paynow', topic: 'forum-issue',
      url: 'https://manishapay.netlify.app/forum-coverage',
    });
  }
}

/* ── 3. Platform facts — hand-maintained ManishaPay knowledge ───── */
const SITE = 'https://manishapay.netlify.app';
const PLATFORM_FACTS = [
  ['what-is', `ManishaPay is a payment gateway aggregator: one REST API and no-code payment links in front of 11 gateways (PayNow, Stripe, PayPal, M-Pesa, Paystack, Flutterwave, PayFast, Pesepay, DPO, Ozow, Yoco). You integrate ManishaPay once; each payment method is routed to a gateway you have connected. Merchants connect their OWN gateway accounts (e.g. their PayNow Integration ID/Key or Stripe secret key) under Payment Gateways in the dashboard — funds settle directly to the merchant's own gateway account; ManishaPay never holds funds.`],
  ['routing', `Method-to-gateway routing: Stripe handles card, Apple Pay, Google Pay. PayNow handles EcoCash, OneMoney, InnBucks, O'mari, ZimSwitch and card for Zimbabwe. Pesepay handles EcoCash and card. Connecting Stripe does NOT enable EcoCash — EcoCash requires a Zimbabwean gateway such as PayNow or Pesepay. Customers see ONE checkout listing all methods from all connected gateways; ManishaPay routes each payment to the right gateway automatically.`],
  ['payment-links', `Payment links: create in the dashboard under Payment Links — set "what's it for", amount, currency, optional method restriction, then share the generated ${SITE}/pay/<id> URL on WhatsApp, Instagram, email or SMS. The payer does NOT need a ManishaPay account, an app, or signup: they open the link, choose a method, pay. Links can be disabled/enabled anytime.`],
  ['test-mode', `Test mode / sandbox: sign up and get a test API key (mp_test_...) instantly — no KYC, no waiting for gateway approval. The built-in payment simulator lets you complete a fake checkout and trigger Paid, Cancelled or Timeout outcomes so you can develop the full flow end to end before connecting any real gateway account. Switch to live keys (mp_live_...) when ready.`],
  ['api-quickstart', `API quickstart: authenticate with your API key in the Authorization header. Create a payment: POST /v1/pay with amount, currency, method, and your reference. You receive a redirect/checkout URL and a payment id. Poll GET /v1/pay/:id for status, or configure a webhook URL to receive signed status events (HMAC-SHA256 — verify with your webhook secret; a timestamp guards against replay). Full reference: ${SITE}/docs.`],
  ['webhooks', `ManishaPay webhooks: register your endpoint URL in the dashboard. Events are signed with HMAC-SHA256 over "timestamp.body" using your webhook secret; reject events older than your tolerance window to prevent replay. Deliveries are retried on failure. Always treat webhooks as the source of truth for payment status — never trust only the browser redirect.`],
  ['widget', `Drop-in checkout widget: a ~7KB script — <script src="${SITE}/checkout.js"></script> — that renders the ManishaPay checkout on YOUR page, so customers pay without leaving your site. Alternative: the hosted checkout page (zero code, just share/redirect to your payment link).`],
  ['sdks-plugins', `SDKs and plugins: official PHP SDK (composer require manishapay/manishapay), Node examples in the docs, a WordPress/WooCommerce plugin, and a WHMCS module. The open-source Noby Payments Knowledge Base dataset (github.com/nobytechy/manishapay-dataset) documents all 11 gateways and 70+ integration pain points.`],
  ['pricing-signup', `Getting started is free: sign up at ${SITE} (one tap with Google or GitHub, or email + verification code — check your spam folder if the code doesn't arrive within a minute and mark it "Not spam"). Test mode is unlimited and free.`],
  ['cross-border', `Cross-border payments: a payer abroad (e.g. South Africa) can pay a USD payment link with any Visa/Mastercard — their bank converts from their local currency (like ZAR) automatically at card-network rates. Price links in USD for Zimbabwe merchants. ManishaPay is an aggregator, not a remittance service: funds settle to the merchant's own gateway account.`],
];
for (const [topic, text] of PLATFORM_FACTS) {
  add(text, { source: 'manishapay', topic, url: SITE + (topic === 'api-quickstart' || topic === 'webhooks' ? '/docs' : '') });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(chunks, null, 1));
console.log(`corpus.json written: ${chunks.length} chunks, ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
