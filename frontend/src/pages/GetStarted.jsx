import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Copy, CheckCircle2, Terminal, Zap, ShieldCheck,
  Webhook, Wallet, FileCode2, AlertCircle, ArrowLeft, ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * /get-started — full developer onboarding walkthrough.
 * Public page, no auth required. Designed to read top-to-bottom in
 * about 5 minutes; integrate in another 10.
 */

const tabs = ['curl', 'node', 'php', 'javascript'];

const samples = {
  curl: `curl -X POST https://pay.aizim.co.zw/api/v1/pay \\
  -H "Authorization: Bearer mp_test_xxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "reference": "order-1234",
    "amount": "5.00",
    "description": "Pro plan — annual",
    "email": "buyer@example.com"
  }'

# Response:
# { "data": {
#     "tracker": "mp_a1b2c3d4e5f6g7h8",
#     "browser_url": "https://pay.aizim.co.zw/simulator/mp_a1b2c3d4e5f6g7h8",
#     "poll_url":    "https://pay.aizim.co.zw/simulator/mp_a1b2c3d4e5f6g7h8/poll",
#     "status":      "Sent",
#     "mode":        "simulated"
#   } }`,
  node: `// npm install manishapay
const ManishaPay = require('manishapay');

const mp = new ManishaPay(process.env.MANISHAPAY_API_KEY);

const r = await mp.pay({
  reference:   'order-1234',
  amount:      '5.00',
  description: 'Pro plan — annual',
  email:       'buyer@example.com',
});

// Redirect customer:
res.redirect(r.browser_url);

// Or for mobile money / Express checkout:
const r2 = await mp.pay({
  reference: 'order-1234',
  amount:    '5.00',
  method:    'ecocash',         // ecocash | onemoney | innbucks | omari | zimswitch | vmc
  phone:     '0772123456',      // any format — we normalise
});`,
  php: `<?php
// composer require manishapay/manishapay
require 'vendor/autoload.php';

$mp = new ManishaPay\\ManishaPay(getenv('MANISHAPAY_API_KEY'));

$r = $mp->pay([
    'reference'   => 'order-1234',
    'amount'      => '5.00',
    'description' => 'Pro plan — annual',
    'email'       => 'buyer@example.com',
]);

// Redirect customer:
header('Location: ' . $r['browser_url']);
exit;`,
  javascript: `<!-- Drop-in widget — works on ANY site, no build step -->
<script src="https://pay.aizim.co.zw/checkout.js"></script>

<button id="pay">Pay $5.00</button>

<script>
  document.getElementById('pay').addEventListener('click', () => {
    ManishaPay.checkout({
      publicKey: 'mp_test_xxxxxxxxxxxx',  // your test key
      reference: 'order-1234',
      amount:    '5.00',
      description: 'Pro plan — annual',
      onSuccess: (data) => alert('Paid! Tracker: ' + data.tracker),
      onCancel:  ()     => console.log('Customer cancelled'),
      onClose:   ()     => console.log('Closed without paying'),
    });
  });
</script>`,
};

const webhookSamples = {
  node: `const express = require('express');
const ManishaPay = require('manishapay');

const app = express();
const SECRET = process.env.MANISHAPAY_WEBHOOK_SECRET;

// Use express.raw — we need the original bytes for signature verification.
app.post('/webhooks/manishapay',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const sig = req.header('X-ManishaPay-Signature');
    if (!ManishaPay.verifyWebhook(req.body, sig, SECRET)) {
      return res.status(401).send('bad signature');
    }
    const evt = JSON.parse(req.body.toString('utf8'));
    // evt.data.reference — your order id
    // evt.data.status_normalized — 'paid' | 'pending' | 'failed' | 'disputed' | 'refunded'
    res.send('ok');
  });`,
  php: `<?php
require 'vendor/autoload.php';

$rawBody = file_get_contents('php://input');
$sig     = $_SERVER['HTTP_X_MANISHAPAY_SIGNATURE'] ?? null;
$secret  = getenv('MANISHAPAY_WEBHOOK_SECRET');

if (!ManishaPay\\ManishaPay::verifyWebhook($rawBody, $sig, $secret)) {
    http_response_code(401);
    exit('bad signature');
}

$evt = json_decode($rawBody, true);
// $evt['data']['reference']         — your order id
// $evt['data']['status_normalized'] — 'paid' | 'pending' | 'failed' | …
http_response_code(200);
echo 'ok';`,
};

function CodeBlock({ value, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy');
    }
  };
  return (
    <div className="relative">
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900/80 px-4 py-2 text-xs text-slate-400">
        <span className="inline-flex items-center gap-2"><Terminal size={12}/> {label}</span>
        <button onClick={copy} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-800">
          {copied ? <CheckCircle2 size={12} className="text-brand-300"/> : <Copy size={12}/>}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-slate-300">
        <code>{value}</code>
      </pre>
    </div>
  );
}

function CodeTabs({ samples, defaultTab = tabs[0] }) {
  const [tab, setTab] = useState(defaultTab);
  const ks = Object.keys(samples);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
      <div className="flex border-b border-slate-700 bg-slate-900/40">
        {ks.map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-xs font-medium uppercase tracking-wide ${
              tab === k
                ? 'border-b-2 border-brand text-brand-200'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >{k}</button>
        ))}
      </div>
      <CodeBlock value={samples[tab]} label={tab}/>
    </div>
  );
}

const steps = [
  {
    n: 1, icon: Zap, title: 'Sign up',
    body: 'Create your account in 30 seconds. We auto-create your first project and a `mp_test_xxx` API key — no PayNow account required to start.',
  },
  {
    n: 2, icon: FileCode2, title: 'Make your first call',
    body: 'POST a reference and an amount to /v1/pay. You get back a tracker, a redirect URL, and a poll URL. Same shape whether you\'re in simulated, test, or live mode.',
  },
  {
    n: 3, icon: Webhook, title: 'Listen for webhooks',
    body: 'Configure your webhook URL in the dashboard. We sign every delivery with HMAC-SHA256 and retry up to 10 times on failure. Verify with one line in our SDKs.',
  },
  {
    n: 4, icon: Wallet, title: 'Add your PayNow keys',
    body: 'When you\'re ready for real money, paste your Integration ID + Key into the dashboard. The same code now hits real PayNow with your live integration. Funds settle direct to your wallet — we never touch them.',
  },
];

const testPhones = [
  { num: '0771111111', outcome: 'Success', detail: 'Simulates a "Paid" outcome within seconds' },
  { num: '0772222222', outcome: 'Insufficient balance', detail: 'Returns "Cancelled"' },
  { num: '0773333333', outcome: 'Delayed success', detail: 'Goes through after a longer delay' },
  { num: '0774444444', outcome: 'Customer cancellation', detail: 'Customer-initiated decline' },
];

const errors = [
  { code: 'CREDENTIALS_REQUIRED', when: 'mp_live_* key without live PayNow creds saved', fix: 'Add credentials in Dashboard → PayNow Credentials, mode=live' },
  { code: 'PAYNOW_REJECTED', when: 'PayNow rejects your initiate (hash, amount, integration disabled)', fix: 'Run /v1/tools/hash for a diff. Check that your integration is set live in PayNow.' },
  { code: 'HASH_MISMATCH', when: 'PayNow callback hash doesn\'t match expected', fix: 'Either your Integration Key was rotated in PayNow, or the request was tampered with. Re-add credentials.' },
  { code: 'BILLING_DISABLED', when: 'Account disabled for unpaid invoices', fix: 'Settle outstanding invoices in Dashboard → Billing.' },
  { code: 'ROUTE_NOT_FOUND', when: 'Wrong endpoint URL', fix: 'Base URL is https://pay.aizim.co.zw/api — note the /api prefix.' },
];

export default function GetStarted() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="ManishaPay" className="h-9 w-9 rounded-lg"/>
          <span className="text-lg font-semibold tracking-tight">ManishaPay</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link to="/" className="hidden md:inline text-slate-300 hover:text-white">
            <ArrowLeft size={14} className="mr-1 inline"/> Home
          </Link>
          <Link to="/login" className="text-slate-300 hover:text-white">Log in</Link>
          <Link
            to="/register"
            className="rounded-lg bg-brand-gradient px-4 py-2 font-medium text-white shadow-glow transition hover:opacity-95"
          >
            Sign up free
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-5xl bg-brand/10 blur-3xl"/>
        <div className="mx-auto max-w-4xl px-6 pt-12 pb-16 text-center">
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-brand-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-300"/>
            Developer guide
          </p>
          <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            Ship your first PayNow integration<br/>
            <span className="bg-gradient-to-r from-brand-300 via-brand to-brand-700 bg-clip-text text-transparent">
              in under 10 minutes.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-400">
            Sign up, copy a curl, watch a webhook fire in your terminal. No PayNow merchant account
            needed for the first transaction. When you&apos;re ready for real money, paste your keys
            and the same code hits production.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-6 py-3 font-semibold text-white shadow-glow transition hover:opacity-95"
            >
              Sign up — get an API key now <ArrowRight size={18}/>
            </Link>
            <a
              href="#step-2"
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-6 py-3 text-slate-200 hover:bg-slate-800"
            >
              Skip to the code
            </a>
          </div>
        </div>
      </section>

      {/* Step cards */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-brand-300">
          The 4-step walkthrough
        </h2>
        <p className="mb-8 text-center text-2xl font-semibold tracking-tight">From signup to live payments</p>
        <div className="grid gap-4 md:grid-cols-2">
          {steps.map(({ n, icon: Icon, title, body }) => (
            <div key={n} id={`step-${n}`} className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-gradient text-white shadow-glow">
                  <Icon size={18}/>
                </div>
                <div>
                  <p className="text-xs font-mono text-brand-300">Step {n}</p>
                  <h3 className="font-semibold text-slate-100">{title}</h3>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-slate-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Step 1 detailed: Sign up */}
      <section id="step-1-detail" className="mx-auto max-w-4xl px-6 pb-16">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded bg-brand/10 px-2 py-1 font-mono text-xs text-brand-300">Step 1</span>
            <h2 className="text-xl font-semibold">Create your account</h2>
          </div>
          <p className="mb-5 text-sm leading-relaxed text-slate-400">
            Click below — we&apos;ll auto-create your first project and a test API key.
            No credit card. No PayNow account. The free tier covers 50 successful transactions a month.
          </p>
          <div className="flex flex-col gap-4 rounded-xl border border-brand/30 bg-brand-gradient-soft/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-300">Free forever for development</p>
              <p className="mt-1 text-sm text-slate-300">
                Test keys + simulator + dashboard, no PayNow account needed.
              </p>
            </div>
            <Link
              to="/register"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand-gradient px-5 py-2.5 font-semibold text-white shadow-glow transition hover:opacity-95"
            >
              Sign up <ArrowRight size={16}/>
            </Link>
          </div>
        </div>
      </section>

      {/* Step 2: First call */}
      <section id="step-2" className="mx-auto max-w-4xl px-6 pb-16">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded bg-brand/10 px-2 py-1 font-mono text-xs text-brand-300">Step 2</span>
            <h2 className="text-xl font-semibold">Make your first call</h2>
          </div>
          <p className="mb-5 text-sm leading-relaxed text-slate-400">
            Pick your stack. The shape is identical across all of them — what changes is the syntax.
          </p>
          <CodeTabs samples={samples} defaultTab="curl"/>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <p className="font-mono text-xs text-brand-300">tracker</p>
              <p className="mt-1 text-slate-300">Globally-unique reference. Save this — it&apos;s how webhooks find your transaction.</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <p className="font-mono text-xs text-brand-300">browser_url</p>
              <p className="mt-1 text-slate-300">Redirect your customer here. In simulated mode it&apos;s our test page; in live, it&apos;s PayNow.</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <p className="font-mono text-xs text-brand-300">mode</p>
              <p className="mt-1 text-slate-300">Returns <code className="font-mono">simulated</code>, <code className="font-mono">test</code>, or <code className="font-mono">live</code> — based on the API key + saved credentials.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Step 3: Webhooks */}
      <section id="step-3" className="mx-auto max-w-4xl px-6 pb-16">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded bg-brand/10 px-2 py-1 font-mono text-xs text-brand-300">Step 3</span>
            <h2 className="text-xl font-semibold">Receive signed webhooks</h2>
          </div>
          <p className="mb-2 text-sm leading-relaxed text-slate-400">
            Configure your webhook URL in <span className="font-mono text-slate-200">Dashboard → Webhooks → Add endpoint</span>. We sign every delivery with HMAC-SHA256:
          </p>
          <div className="mb-5 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 font-mono text-xs text-slate-300">
            X-ManishaPay-Signature: t=<span className="text-brand-300">1714499847</span>,v1=<span className="text-brand-300">9f24be04f4a6…</span>
          </div>
          <CodeTabs samples={webhookSamples} defaultTab="node"/>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
            <AlertCircle size={14} className="mt-0.5 shrink-0"/>
            <div>
              We retry failed deliveries up to 10 times with exponential backoff. The full
              delivery log is visible in the dashboard with a &quot;Replay&quot; button. Always return 2xx
              fast — long delays trigger retries.
            </div>
          </div>
        </div>
      </section>

      {/* Test mode reference */}
      <section className="mx-auto max-w-4xl px-6 pb-16">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded bg-brand/10 px-2 py-1 font-mono text-xs text-brand-300">Reference</span>
            <h2 className="text-xl font-semibold">Test phone numbers</h2>
          </div>
          <p className="mb-4 text-sm text-slate-400">
            Once you&apos;ve added PayNow test credentials, use these numbers in your <code className="font-mono">phone</code> field
            to deterministically trigger outcomes. Provided by PayNow.
          </p>
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2 text-left">Number</th>
                  <th className="px-4 py-2 text-left">Outcome</th>
                  <th className="px-4 py-2 text-left">Detail</th>
                </tr>
              </thead>
              <tbody>
                {testPhones.map((p) => (
                  <tr key={p.num} className="border-b border-slate-800 last:border-0">
                    <td className="px-4 py-3 font-mono text-brand-300">{p.num}</td>
                    <td className="px-4 py-3 text-slate-200">{p.outcome}</td>
                    <td className="px-4 py-3 text-slate-400">{p.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            In simulated mode (no PayNow creds saved), use any number — the simulator page lets you click outcomes manually.
          </p>
        </div>
      </section>

      {/* Step 4: Going live */}
      <section id="step-4" className="mx-auto max-w-4xl px-6 pb-16">
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-brand/5 p-8">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded bg-brand/10 px-2 py-1 font-mono text-xs text-brand-300">Step 4</span>
            <h2 className="text-xl font-semibold">Going live</h2>
          </div>
          <ol className="space-y-3 text-sm text-slate-300">
            {[
              <>Sign up at <a href="https://www.paynow.co.zw/Customer/Register" target="_blank" rel="noopener noreferrer" className="text-brand-300 hover:underline">PayNow</a> if you haven&apos;t already.</>,
              <>Configure your bank account in PayNow → required for funds settlement.</>,
              <>Create an integration: <span className="font-mono text-slate-200">Receive Payments → Manage Shopping Carts → Create Advanced Integration</span>.</>,
              <>Email yourself the Integration Key. PayNow won&apos;t display it on screen.</>,
              <>Paste both into <span className="font-mono text-slate-200">Dashboard → PayNow Credentials → Add</span>, mode=test.</>,
              <>Verify a real test transaction works (use the test phone numbers above).</>,
              <>Click &quot;Request to be Set Live&quot; on PayNow when verified.</>,
              <>Add the same credentials again in mode=live, switch your API key prefix from <code className="font-mono">mp_test_</code> to <code className="font-mono">mp_live_</code>, and you&apos;re processing real money.</>,
            ].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Common errors */}
      <section className="mx-auto max-w-4xl px-6 pb-16">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded bg-brand/10 px-2 py-1 font-mono text-xs text-brand-300">Reference</span>
            <h2 className="text-xl font-semibold">Common errors</h2>
          </div>
          <div className="space-y-3">
            {errors.map((e) => (
              <div key={e.code} className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <code className="rounded bg-rose-500/10 px-2 py-0.5 font-mono text-xs text-rose-300">{e.code}</code>
                  <span className="text-xs text-slate-500">When: {e.when}</span>
                </div>
                <p className="text-sm text-slate-300"><strong className="text-brand-300">Fix:</strong> {e.fix}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-6 pb-20 text-center">
        <ShieldCheck size={32} className="mx-auto mb-4 text-brand"/>
        <h2 className="mb-3 text-3xl font-bold tracking-tight">Ready to integrate?</h2>
        <p className="mb-7 text-slate-400">
          Sign up takes 30 seconds. The first webhook fires within 5 minutes of your first API call.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-6 py-3 font-semibold text-white shadow-glow transition hover:opacity-95"
          >
            Create free account <ArrowRight size={18}/>
          </Link>
          <a
            href="https://github.com/nobytechy/manishapay"
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-6 py-3 text-slate-200 hover:bg-slate-800"
          >
            View source on GitHub <ExternalLink size={14}/>
          </a>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} ManishaPay — built by{' '}
        <a href="https://noby.aizim.co.zw" target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-brand-300">
          Noby Tebulo
        </a>{' '}
        for the PayNow Zimbabwe community
      </footer>
    </div>
  );
}
