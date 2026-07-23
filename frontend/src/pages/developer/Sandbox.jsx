/**
 * /app/sandbox — in-dashboard end-to-end test harness.
 *
 * Lets a developer:
 *   1. Send a fake `/v1/pay` request using their currently-active API key
 *   2. Trigger any of the three simulator outcomes (paid / cancelled / timeout)
 *      directly from this page — no new tab needed
 *   3. See live status updates and a session history of recent tests
 *   4. Copy tracker / browser_url to clipboard for any external SDK testing
 *   5. Reproduce common PayNow forum errors with one-click presets to verify
 *      ManishaPay's middleware fixes them transparently
 *
 * Replaces the curl-based smoke test described in HANDOFF.md.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Play, ExternalLink, CheckCircle2, XCircle, Clock, Copy, KeyRound, RefreshCw,
  FlaskConical, Lightbulb, AlertCircle, Plug,
  ListChecks, Coins, Smartphone, ShieldCheck, Send, Database, QrCode, Sparkles,
} from 'lucide-react';
import { api, getActiveKey } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE || '';

// ── Forum-driven scenarios ───────────────────────────────────────
// Each one mirrors a real recurring thread on https://forums.paynow.co.zw —
// load the preset, send a payment, and observe how ManishaPay handles the
// pain point that catches direct PayNow integrators.
const SCENARIOS = [
  {
    id: 'hash-mismatch',
    title: 'Decimal-format hash mismatch',
    forumQuote: '"Invalid Hash. Hash should start with: 0395E9"',
    explanation:
      'PayNow expects amounts formatted as exactly two decimal places. Send "5" or "5.5" with your own hash and PayNow\'s server-side recomputation will not match — you get the dreaded "Invalid Hash" error.',
    fix:
      'ManishaPay normalises the amount to two decimals before computing the hash. This preset fills the form with "5"; ManishaPay sends "5.00" to PayNow. No mismatch.',
    preset: { amount: '5', phone: '', method: '' },
  },
  {
    id: 'phone-format',
    title: 'Mobile OTP never fires (phone format)',
    forumQuote: '"…OTP from PayNow is not coming…"',
    explanation:
      'Zimbabwean customers usually type "0771234567", but PayNow\'s mobile-money endpoints (Ecocash, OneMoney) need the international format "+263771234567" before they\'ll fire the OTP prompt.',
    fix:
      'ManishaPay\'s phone normaliser maps every common local form (077…, 263…, +263…) into the canonical "+263…" before forwarding. This preset fills "0771111111"; the actual API request sends "+263771111111".',
    preset: { amount: '1.00', phone: '0771111111', method: 'ecocash' },
  },
  {
    id: 'method-validation',
    title: 'Method "" is not recognized',
    forumQuote: '"Initiate Payment Error: The method \'\' is not recognized" (WooCommerce, Sept 2025)',
    explanation:
      'PayNow accepts a fixed set of channel codes (ecocash, onemoney, innbucks, omari, zimswitch, vmc). Sending anything else — including the empty string a WooCommerce plugin can produce — yields this error mid-checkout.',
    fix:
      'ManishaPay validates the method on the API edge and only forwards known values. An empty method falls back to the standard web-redirect flow (PayNow\'s express checkout) instead of failing.',
    preset: { amount: '1.00', phone: '', method: '' },
  },
  {
    id: 'status-not-reflecting',
    title: 'Status not reflecting after payment',
    forumQuote: '"Status not reflecting in database when using mobile transactions" (Nov 2025)',
    explanation:
      'Customers complete payment but your database stays "pending" — usually because the webhook from PayNow never reaches your server, or your hash verification on the callback fails.',
    fix:
      'ManishaPay signs every webhook with HMAC-SHA256 and a timestamp, retries failed deliveries with exponential backoff, and exposes the full delivery log on the Webhooks page. After you click "Mark Paid" below, check Webhooks → Deliveries to see the signed POST.',
    preset: { amount: '2.50', phone: '', method: '' },
  },
  {
    id: 'test-email-mismatch',
    title: 'Auth email must match merchant email (test mode)',
    forumQuote: '"…The integration ID is in test mode, so if authemail is specified then it must match the merchants registered email address" (Sept 2025)',
    explanation:
      'PayNow\'s test mode rejects any "authemail" value that isn\'t the registered merchant email. A WooCommerce plugin that auto-passes the customer\'s email triggers this every time on a test integration.',
    fix:
      'ManishaPay swaps in the project-registered email automatically when a test-mode key is in use, so customer-supplied emails are recorded but not forwarded as authemail. You can pass any email here without breaking the test flow.',
    preset: { amount: '3.00', email: 'random-customer@example.com', phone: '', method: '' },
  },
  {
    id: 'return-url',
    title: 'ReturnUrl must start with http://',
    forumQuote: '"Initiate Payment Error: The ReturnUrl must start with http:// or https://" (Apr 2025)',
    explanation:
      'A trailing whitespace, missing scheme, or relative path in the ReturnUrl causes PayNow to reject the request before the customer ever sees a checkout page.',
    fix:
      'ManishaPay\'s project settings validate URL format on save, and the per-call return_url is sanity-checked before forwarding. Misconfiguration fails fast, in the dashboard, not at customer checkout.',
    preset: { amount: '1.00', phone: '', method: '' },
  },
];

// Friendly labels for the common channel codes (used in the requirements hint
// and the Method selector). Any code not listed here is prettified generically.
const METHOD_LABELS = {
  ecocash: 'EcoCash',
  onemoney: 'OneMoney',
  innbucks: 'InnBucks',
  omari: 'O’mari',
  zimswitch: 'ZimSwitch',
  vmc: 'Visa / Mastercard',
  card: 'Card',
};
// Turn any provider method code into a human label ("mobile_money" → "Mobile Money").
const prettyMethod = (m) =>
  METHOD_LABELS[m] || String(m).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Display-only mirrors of the backend normalisers, so the animated flow can
// show the exact "before → after" transformation ManishaPay performs.
const to2dp = (v) => {
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n.toFixed(2) : String(v);
};
const toMsisdn = (v) => {
  const d = String(v || '').replace(/[^\d]/g, '');
  if (d.startsWith('263')) return d;
  if (d.startsWith('0') && d.length === 10) return '263' + d.slice(1);
  if (d.startsWith('7') && d.length === 9) return '263' + d;
  return d || '—';
};

// Icon per pipeline step.
const STEP_ICONS = {
  validate: ListChecks, amount: Coins, phone: Smartphone, hash: ShieldCheck,
  route: Send, verify: ShieldCheck, persist: Database, ticket: QrCode, ready: Sparkles,
};

// Builds the "behind the scenes" pipeline for a given request. Mirrors what the
// backend actually does in services/paynow.js + routes/pay.js, adapting to the
// chosen method (web-redirect vs Express Checkout) so devs see the real path.
function buildFlow({ amount, phone, method, providerName = 'PayNow', isPaynow = true }) {
  const steps = [
    { key: 'validate', label: 'Validate request', detail: 'Reference, amount, provider, method & required fields' },
    { key: 'amount', label: 'Normalise amount', detail: `"${amount}" → ${to2dp(amount)} (two-decimal invariant)` },
  ];
  if (method === 'ecocash' || method === 'onemoney' || phone) {
    steps.push({ key: 'phone', label: 'Normalise phone', detail: phone ? `${phone} → ${toMsisdn(phone)}` : 'to 263… MSISDN' });
  }
  steps.push({ key: 'hash', label: 'Sign request', detail: 'HMAC-SHA256 over ordered fields' });
  steps.push({
    key: 'route',
    label: `Call ${providerName}`,
    detail: isPaynow
      ? 'PayNow /initiatetransaction (or the built-in simulator when no test creds are set)'
      : `Route to the ${providerName} adapter using the connected sandbox credentials`,
  });
  steps.push({ key: 'verify', label: 'Verify response hash', detail: 'Reject any tampered redirect URL' });
  steps.push({ key: 'persist', label: 'Persist transaction', detail: 'Row keyed on the global tracker' });
  steps.push({ key: 'ticket', label: 'Build QR ticket', detail: 'Scannable checkout link' });
  steps.push({ key: 'ready', label: 'Ready', detail: 'Checkout URL returned — awaiting outcome' });
  return steps.map((s) => ({ ...s, status: 'pending' }));
}

function FlowRow({ step, isLast }) {
  const Icon = STEP_ICONS[step.key] || ListChecks;
  const ring = {
    pending: 'border-slate-700 text-slate-600 bg-slate-900',
    active: 'border-brand text-brand bg-brand/10 shadow-glow animate-pulse',
    done: 'border-brand-500/50 text-brand-300 bg-brand-500/10',
    error: 'border-rose-500/60 text-rose-300 bg-rose-500/10',
  }[step.status];
  const textCls = {
    pending: 'text-slate-500', active: 'text-slate-100', done: 'text-slate-200', error: 'text-rose-200',
  }[step.status];
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`grid h-8 w-8 place-items-center rounded-full border transition-all duration-300 ${ring}`}>
          {step.status === 'active'
            ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/40 border-t-brand" />
            : step.status === 'done' ? <CheckCircle2 size={16} />
            : step.status === 'error' ? <XCircle size={16} />
            : <Icon size={15} />}
        </div>
        {!isLast && <div className={`w-px flex-1 transition-colors duration-300 ${step.status === 'done' ? 'bg-brand-500/40' : 'bg-slate-800'}`} />}
      </div>
      <div className={`pb-4 transition-all duration-300 ${step.status === 'pending' ? 'opacity-50' : 'opacity-100'}`}>
        <p className={`text-sm font-medium ${textCls}`}>{step.label}</p>
        <p className="text-xs text-slate-500">{step.detail}</p>
      </div>
    </div>
  );
}

function autoReference() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `sandbox-${stamp}`;
}

function StatusPill({ status }) {
  const map = {
    pending:   { cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30',     icon: Clock,        label: 'Pending' },
    paid:      { cls: 'bg-brand-500/10 text-brand-300 border-brand-500/30', icon: CheckCircle2, label: 'Paid' },
    cancelled: { cls: 'bg-rose-500/10 text-rose-300 border-rose-500/30',         icon: XCircle,      label: 'Cancelled' },
    timeout:   { cls: 'bg-slate-500/10 text-slate-300 border-slate-500/30',      icon: Clock,        label: 'Timeout (no webhook)' },
  };
  const cfg = map[status?.toLowerCase()] || map.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
      <Icon size={12} />
      {cfg.label}
    </span>
  );
}

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1 flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200">
        <span className="flex-1 truncate">{value || '—'}</span>
        <button
          onClick={onCopy}
          className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          aria-label="Copy"
          type="button"
        >
          {copied ? <CheckCircle2 size={14} className="text-brand-400" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function Sandbox() {
  const { user } = useAuth();
  const [reference, setReference] = useState(autoReference());
  const [amount, setAmount] = useState('1.00');
  const [currency, setCurrency] = useState('USD');
  // Pre-fill the authemail with the signed-in developer's email — the sensible
  // default (and, on a TEST integration, the value PayNow expects to match).
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState('');
  const [provider, setProvider] = useState('paynow');
  const [providers, setProviders] = useState([]); // live gateways from the catalog
  const [scenarioId, setScenarioId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [outcomeBusy, setOutcomeBusy] = useState(null);
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [flow, setFlow] = useState([]); // animated "behind the scenes" pipeline

  const activeKey = getActiveKey();
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) || null;

  // Load the multi-gateway catalog once, keep only the LIVE providers.
  useEffect(() => {
    let alive = true;
    api.listProviders()
      .then((r) => { if (alive) setProviders((r?.data || []).filter((p) => p.status === 'live')); })
      .catch(() => { /* api.js already toasts; sandbox still works with PayNow default */ });
    return () => { alive = false; };
  }, []);

  const isPaynow = provider === 'paynow';
  const selectedProvider = providers.find((p) => p.id === provider) || null;
  const providerName = selectedProvider?.displayName || (isPaynow ? 'PayNow' : provider);
  const providerMethods = selectedProvider?.capabilities?.methods || [];

  // Switch gateway — reset the method (each gateway exposes its own set).
  const changeProvider = (id) => {
    setProvider(id);
    setMethod('');
    setCurrency('USD'); // reset to a value valid for the new gateway's option list
  };

  // PayNow Express Checkout rules (PayNow-only): any `method` → email (authemail)
  // is required; mobile-money channels also require the customer phone (OTP push).
  const requiresEmail = isPaynow && !!method;
  const requiresPhone = isPaynow && (method === 'ecocash' || method === 'onemoney');

  const loadScenario = (s) => {
    setScenarioId(s.id);
    setProvider('paynow'); // every forum scenario reproduces a PayNow-specific issue
    setAmount(s.preset.amount ?? amount);
    setPhone(s.preset.phone ?? '');
    setMethod(s.preset.method ?? '');
    if ('email' in s.preset) setEmail(s.preset.email);
    setReference(autoReference());
    toast.success(`Loaded scenario: ${s.title}`, { duration: 2200 });
  };

  const clearScenario = () => {
    setScenarioId(null);
    setAmount('1.00');
    setEmail(user?.email || '');
    setPhone('');
    setMethod('');
    setReference(autoReference());
  };

  // Drives the animated pipeline. Local steps (validate → sign) tick through on
  // a timer; the network step ('route') stays "active" until the real API call
  // resolves — so it truthfully reflects the wait and surfaces failures there.
  const runFlow = async (steps, apiPromise) => {
    const routeIdx = steps.findIndex((s) => s.key === 'route');
    for (let i = 0; i < routeIdx; i++) {
      setFlow((f) => f.map((s, idx) => (idx === i ? { ...s, status: 'active' } : s)));
      await sleep(340);
      setFlow((f) => f.map((s, idx) => (idx === i ? { ...s, status: 'done' } : s)));
    }
    setFlow((f) => f.map((s, idx) => (idx === routeIdx ? { ...s, status: 'active' } : s)));
    let res;
    try {
      res = await apiPromise;
    } catch (err) {
      setFlow((f) => f.map((s, idx) => (idx === routeIdx
        ? { ...s, status: 'error', detail: err?.message || 'PayNow rejected the request' } : s)));
      throw err;
    }
    const mode = res?.data?.mode || res?.mode;
    setFlow((f) => f.map((s, idx) => (idx === routeIdx
      ? { ...s, status: 'done', detail: mode ? `Routed via ${mode} mode` : s.detail } : s)));
    for (let i = routeIdx + 1; i < steps.length; i++) {
      setFlow((f) => f.map((s, idx) => (idx === i ? { ...s, status: 'active' } : s)));
      await sleep(300);
      setFlow((f) => f.map((s, idx) => (idx === i ? { ...s, status: 'done' } : s)));
    }
    return res;
  };

  const sendPayment = async (e) => {
    e?.preventDefault();
    if (!activeKey) {
      toast.error('No active API key. Set one on the API Keys page first.');
      return;
    }
    if (!reference.trim() || !amount.trim()) {
      toast.error('Reference and amount are required.');
      return;
    }
    // Express Checkout guardrails — match PayNow's remote-transaction rules so
    // the request doesn't bounce back with "authemail field is required".
    if (requiresEmail && !email.trim()) {
      toast.error(`${prettyMethod(method)} is a PayNow Express Checkout method — an email (authemail) is required.`);
      return;
    }
    if (requiresPhone && !phone.trim()) {
      toast.error(`${prettyMethod(method)} needs the customer phone so PayNow can push the OTP prompt.`);
      return;
    }
    setCreating(true);
    try {
      const body = { reference: reference.trim(), amount: amount.trim(), provider };
      if (currency.trim()) body.currency = currency.trim();
      if (email.trim())  body.email  = email.trim();
      if (phone.trim())  body.phone  = phone.trim();
      if (method.trim()) body.method = method.trim();
      // So the web-redirect simulator returns the "customer" back to the sandbox
      // (instead of the public landing page) after paid/cancelled.
      body.return_url = `${window.location.origin}/app/sandbox`;
      // Kick off the real call, then animate the pipeline against it.
      const steps = buildFlow({ amount: amount.trim(), phone: phone.trim(), method: method.trim(), providerName, isPaynow });
      setFlow(steps);
      const res = await runFlow(steps, api.pay(body));
      const payload = res?.data || res || {};
      const checkoutUrl = payload.browser_url || payload.checkout_url || payload.redirect_url;
      // PayNow's simulator always returns a tracker; other gateways may key on the
      // reference and hand back a checkout URL instead — accept either.
      if (isPaynow && !payload.tracker) {
        throw new Error('API did not return a tracker — check Render logs.');
      }
      if (!isPaynow && !payload.tracker && !checkoutUrl) {
        throw new Error(`${providerName} did not return a tracker or checkout URL — check the connected credentials.`);
      }
      const entry = {
        provider,
        providerName,
        tracker: payload.tracker,
        reference: payload.reference || reference.trim(),
        amount: payload.amount || amount.trim(),
        browser_url: checkoutUrl,
        mode: payload.mode,
        credential_source: payload.credential_source, // own | platform-sandbox | simulated
        status: (payload.status_normalized || payload.status || 'pending').toLowerCase(),
        scenarioId,
        createdAt: new Date().toISOString(),
      };
      setCurrent(entry);
      setHistory((h) => [entry, ...h].slice(0, 8));
      toast.success(`Created via ${providerName}${payload.mode ? ` — mode: ${payload.mode}` : ''}`);
      setReference(autoReference());
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('sandbox /v1/pay error', err);
    } finally {
      setCreating(false);
    }
  };

  const triggerOutcome = async (outcome) => {
    if (!current) return;
    setOutcomeBusy(outcome);
    try {
      const r = await fetch(`${API_BASE}/simulator/${current.tracker}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const newStatus = outcome === 'paid' ? 'paid' : outcome === 'cancelled' ? 'cancelled' : 'timeout';
      setCurrent((c) => c ? { ...c, status: newStatus } : c);
      setHistory((h) => h.map((entry) =>
        entry.tracker === current.tracker ? { ...entry, status: newStatus } : entry,
      ));
      const wd = j.webhooks_dispatched ?? 0;
      const tail = outcome === 'timeout'
        ? ' — no webhook fired (timeout simulates expiry)'
        : wd > 0 ? ` — fired ${wd} webhook(s)` : ' — no webhook endpoints configured';
      toast.success(`✓ ${outcome.charAt(0).toUpperCase() + outcome.slice(1)}${tail}`);
    } catch (err) {
      toast.error(err.message || 'Outcome trigger failed');
    } finally {
      setOutcomeBusy(null);
    }
  };

  const refreshStatus = async () => {
    if (!current) return;
    try {
      const r = await api.status(current.reference);
      const payload = r?.data || r || {};
      const newStatus = (payload.status_normalized || payload.status || 'pending').toLowerCase();
      setCurrent((c) => c ? { ...c, status: newStatus } : c);
      setHistory((h) => h.map((entry) =>
        entry.tracker === current.tracker ? { ...entry, status: newStatus } : entry,
      ));
      // Toast the returned status so checking the endpoint gives the same
      // dual (toast + pill) feedback as sending a payment.
      const label = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
      const raw = payload.status && payload.status.toLowerCase() !== newStatus ? ` (${payload.status})` : '';
      if (newStatus === 'paid') toast.success(`Status: ${label}${raw} ✓`);
      else if (newStatus === 'cancelled' || newStatus === 'failed') toast.error(`Status: ${label}${raw}`);
      else toast(`Status: ${label}${raw}`, { icon: '⏳' });
    } catch {
      /* api.js already toasts */
    }
  };

  if (!activeKey) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-2 flex items-center gap-2 text-brand-300">
          <FlaskConical size={18}/>
          <span className="text-xs font-semibold uppercase tracking-wider">Sandbox</span>
        </div>
        <h1 className="text-2xl font-semibold text-slate-100">Test the entire payment lifecycle, end-to-end</h1>
        <p className="mt-2 text-sm text-slate-400">
          Send a fake payment, trigger any outcome, watch the webhook fire, and see the dashboard reflect the status — all without leaving this page or writing a line of curl.
        </p>
        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-300">
              <KeyRound size={20} />
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-100">No active API key</p>
              <p className="mt-1 text-sm text-slate-400">
                The Sandbox needs an active test key to call <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">/v1/pay</code>. Create one and click <em>"Use as active"</em>.
              </p>
              <Link
                to="/app/keys"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-glow hover:opacity-95"
              >
                Go to API Keys <ExternalLink size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* ── Header / brief ─────────────────────────────────── */}
      <header>
        <div className="mb-2 flex items-center gap-2 text-brand-300">
          <FlaskConical size={18}/>
          <span className="text-xs font-semibold uppercase tracking-wider">Sandbox</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold text-slate-100">Test the entire payment lifecycle, end-to-end</h1>
            <p className="mt-2 text-sm text-slate-400">
              Send a fake payment, trigger any outcome (paid / cancelled / timeout), watch a signed webhook fire, and see the dashboard reflect the status — all without leaving this page or writing a line of curl.
            </p>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/50 px-3 py-1.5 text-xs text-slate-400">
            <span className="text-slate-500">Active key</span>{' '}
            <code className="font-mono text-slate-200">{activeKey.slice(0, 12)}…{activeKey.slice(-4)}</code>
          </div>
        </div>

        {/* "What this is for" callout */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
            <div className="mb-1 font-medium text-slate-200">Validate your integration</div>
            Run end-to-end tests against your project key without touching real PayNow.
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
            <div className="mb-1 font-medium text-slate-200">Trigger every outcome</div>
            Click Paid / Cancelled / Timeout — verify your webhook handler responds correctly.
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
            <div className="mb-1 font-medium text-slate-200">Reproduce forum issues</div>
            Load presets that mirror real PayNow forum threads and see how ManishaPay handles them.
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
            <div className="mb-1 font-medium text-slate-200">Onboard teammates</div>
            Show new devs the full lifecycle in 60 seconds — no PayNow account required.
          </div>
        </div>
      </header>

      {/* Shared-sandbox reassurance — the whole point: test with zero setup. */}
      <div className="flex items-start gap-2.5 rounded-xl border border-brand/20 bg-brand/5 p-4 text-sm text-slate-300">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand" />
        <span>
          <span className="font-semibold text-slate-100">No gateway account needed to test.</span> In test mode, PayNow runs on the
          built-in simulator and every other gateway runs on <span className="font-semibold text-brand">ManishaPay's shared sandbox</span> —
          so you can try any gateway here with zero keys or setup. Connect your own keys only when you're ready to go live.
        </span>
      </div>

      {/* ── Forum scenario presets ─────────────────────────── */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-brand-300">
              <Lightbulb size={14}/> PayNow forum scenarios
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Click a card to load a preset that reproduces a real recurring issue from{' '}
              <a href="https://forums.paynow.co.zw/" target="_blank" rel="noopener noreferrer" className="text-brand-300 hover:underline">forums.paynow.co.zw</a>{' '}
              — see how ManishaPay handles it.
            </p>
          </div>
          {scenarioId && (
            <button
              type="button"
              onClick={clearScenario}
              className="text-xs text-slate-400 hover:text-slate-100"
            >
              Reset to defaults
            </button>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SCENARIOS.map((s) => {
            const active = s.id === scenarioId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => loadScenario(s)}
                className={`rounded-lg border p-3 text-left transition ${
                  active
                    ? 'border-brand/60 bg-brand/10 ring-1 ring-brand/50'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <p className="text-sm font-medium text-slate-100">{s.title}</p>
                <p className="mt-1 line-clamp-2 text-[11px] italic text-slate-500">{s.forumQuote}</p>
              </button>
            );
          })}
        </div>

        {scenario && (
          <div className="mt-5 rounded-lg border border-brand/30 bg-brand/5 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-brand-300"/>
              <div className="space-y-2 text-sm">
                <p className="font-medium text-slate-100">{scenario.title}</p>
                <p className="text-xs italic text-slate-400">From the forums: {scenario.forumQuote}</p>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-rose-300">Without ManishaPay</p>
                  <p className="text-sm text-slate-300">{scenario.explanation}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-300">With ManishaPay</p>
                  <p className="text-sm text-slate-300">{scenario.fix}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Form + current transaction ─────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={sendPayment} className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-brand-300">1 · New test payment</h2>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Reference</label>
              <div className="flex gap-2">
                <input
                  className="input flex-1 font-mono text-sm"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setReference(autoReference())}
                  title="Generate a fresh reference"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-400 hover:border-brand/50 hover:text-brand"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Gateway (provider)</label>
                <select className="input" value={provider} onChange={(e) => changeProvider(e.target.value)}>
                  {providers.length === 0 && <option value="paynow">PayNow</option>}
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}{p.region ? ` · ${p.region}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Amount</label>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                  <select
                    className="input w-24"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    title="Currency sent to the gateway"
                  >
                    {(isPaynow ? ['USD', 'ZWL'] : ['USD', 'EUR', 'GBP', 'ZAR', 'KES', 'NGN', 'GHS'])
                      .map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Method <span className="text-slate-600">(optional — any/default)</span>
              </label>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="">{isPaynow ? 'Web redirect (any/default)' : 'Any / provider default'}</option>
                {(providerMethods.length ? providerMethods : ['ecocash', 'onemoney', 'innbucks', 'omari', 'zimswitch', 'card'])
                  .map((m) => <option key={m} value={m}>{prettyMethod(m)}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Phone {requiresPhone
                    ? <span className="text-rose-400">(required)</span>
                    : <span className="text-slate-600">(optional)</span>}
                </label>
                <input
                  className="input"
                  placeholder="0771234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Email {requiresEmail
                    ? <span className="text-rose-400">(required)</span>
                    : <span className="text-slate-600">(optional)</span>}
                </label>
                <input
                  className="input"
                  type="email"
                  placeholder="customer@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Express Checkout requirements — PayNow only, the moment a method is picked. */}
            {isPaynow && method && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-200/90">
                <span className="font-semibold text-amber-200">{prettyMethod(method)}</span> uses PayNow{' '}
                <span className="font-semibold">Express Checkout</span> (a <code className="rounded bg-slate-800 px-1">/remotetransaction</code> call). PayNow requires an{' '}
                <span className="font-semibold">email</span> (sent as <code className="rounded bg-slate-800 px-1">authemail</code>)
                {requiresPhone && <> and the customer’s <span className="font-semibold">phone</span> — the number it pushes the OTP prompt to</>}.
                {' '}On a <span className="font-semibold">test</span> integration the email must match your PayNow-registered merchant email.
                {' '}Leave <span className="font-semibold">Method</span> on “Web redirect” to use PayNow’s hosted page instead (email/phone optional).
              </div>
            )}

            {/* Non-PayNow gateways: where the credentials come from. */}
            {!isPaynow && (
              <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 p-3 text-xs leading-relaxed text-slate-300">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-100">
                  <Plug size={12} /> {providerName}
                </span>{' '}
                runs against the credentials you connected on the{' '}
                <Link to="/app/gateways" className="text-brand-300 hover:underline">Payment Gateways</Link>{' '}
                page (or the platform sandbox keys while in test mode). After initiating you’ll get a
                checkout link and a normalized status you can poll — the PayNow paid/cancelled/timeout
                triggers apply to PayNow only.
              </div>
            )}

            <button
              type="submit"
              disabled={creating}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Sending…
                </>
              ) : (
                <>
                  <Play size={14} />
                  Send test payment
                </>
              )}
            </button>
          </div>
        </form>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-300">2 · Current transaction</h2>
            {current && (
              <button
                type="button"
                onClick={refreshStatus}
                className="text-xs text-slate-400 hover:text-slate-100"
              >
                <RefreshCw size={12} className="mr-1 inline" /> Refresh
              </button>
            )}
          </div>

          {!current ? (
            <p className="text-sm text-slate-500">
              Send a test payment to see its tracker, checkout URL, and outcome / polling controls here.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <StatusPill status={current.status} />
                <span className="text-xs uppercase tracking-wider text-slate-500">
                  <span className="text-brand-300">{current.providerName || current.provider || 'PayNow'}</span>
                  {current.mode && <> · Mode: <span className="font-mono text-slate-300">{current.mode}</span></>}
                </span>
              </div>
              {(current.credential_source === 'platform-sandbox' || current.credential_source === 'simulated') && (
                <div className="flex items-center gap-1.5 rounded-md border border-brand/20 bg-brand/5 px-2.5 py-1.5 text-[11px] text-slate-300">
                  <ShieldCheck size={12} className="text-brand" />
                  {current.credential_source === 'simulated'
                    ? 'Ran on the built-in PayNow simulator — no account or keys needed.'
                    : "Ran on ManishaPay's shared sandbox — no gateway account or keys needed."}
                </div>
              )}

              {current.tracker && <CopyField label="Tracker" value={current.tracker} />}
              <CopyField label="Reference" value={current.reference} />
              <CopyField label="Checkout URL" value={current.browser_url} />

              {(current.provider || 'paynow') === 'paynow' ? (
                <>
                  {/* PayNow simulator — trigger any lifecycle outcome without a real payment. */}
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <button
                      type="button"
                      disabled={!!outcomeBusy || current.status !== 'pending'}
                      onClick={() => triggerOutcome('paid')}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-500/15 px-3 py-2 text-xs font-medium text-brand-300 ring-1 ring-brand-500/30 transition hover:bg-brand-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {outcomeBusy === 'paid'
                        ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-300/40 border-t-brand-300" />
                        : <CheckCircle2 size={13} />}
                      Mark Paid
                    </button>
                    <button
                      type="button"
                      disabled={!!outcomeBusy || current.status !== 'pending'}
                      onClick={() => triggerOutcome('cancelled')}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-300 ring-1 ring-rose-500/30 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {outcomeBusy === 'cancelled'
                        ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-rose-300/40 border-t-rose-300" />
                        : <XCircle size={13} />}
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!!outcomeBusy || current.status !== 'pending'}
                      onClick={() => triggerOutcome('timeout')}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-500/15 px-3 py-2 text-xs font-medium text-slate-300 ring-1 ring-slate-500/30 transition hover:bg-slate-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {outcomeBusy === 'timeout'
                        ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300/40 border-t-slate-300" />
                        : <Clock size={13} />}
                      Timeout
                    </button>
                  </div>

                  <p className="pt-1 text-[11px] text-slate-500">
                    Or open the simulator HTML page directly:{' '}
                    <a
                      href={current.browser_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-300 hover:underline"
                    >
                      open in new tab <ExternalLink size={10} className="inline" />
                    </a>
                  </p>
                </>
              ) : (
                <>
                  {/* Other gateways — no simulator; complete on the hosted page, then poll. */}
                  {current.browser_url ? (
                    <a
                      href={current.browser_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
                    >
                      <ExternalLink size={14} /> Open {current.providerName || 'gateway'} checkout
                    </a>
                  ) : (
                    <p className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-500">
                      No checkout URL returned — poll status below to follow this payment.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={refreshStatus}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-brand/50 hover:text-brand"
                  >
                    <RefreshCw size={14} /> Poll status
                  </button>
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <QrCode size={12} className="shrink-0" />
                    {current.providerName || 'This gateway'} has no simulator — complete the checkout, then poll
                    the normalized status (paid / pending / cancelled / failed) via{' '}
                    <code className="rounded bg-slate-800 px-1">/v1/pay/&#123;reference&#125;/status</code>.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Behind the scenes: animated pipeline ─────────────── */}
      {flow.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="mb-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-brand-300">
              <Sparkles size={14} /> Behind the scenes
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              What ManishaPay does with your request, step by step — the same pipeline runs on every real{' '}
              <code className="rounded bg-slate-800 px-1">/v1/pay</code> call. The network step waits on the real response, so failures surface exactly where they happen.
            </p>
          </div>
          <div className="max-w-lg">
            {flow.map((s, i) => (
              <FlowRow key={s.key} step={s} isLast={i === flow.length - 1} />
            ))}
          </div>
        </section>
      )}

      {/* ── Session history ──────────────────────────────────── */}
      {history.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-brand-300">3 · Recent in this session</h2>
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Reference</th>
                  <th className="px-4 py-2 text-left font-medium">Gateway</th>
                  <th className="px-4 py-2 text-left font-medium">Amount</th>
                  <th className="px-4 py-2 text-left font-medium">Mode</th>
                  <th className="px-4 py-2 text-left font-medium">Tracker</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {history.map((h) => (
                  <tr key={h.tracker || h.reference} className="hover:bg-slate-900/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-200">{h.reference}</td>
                    <td className="px-4 py-2.5 text-slate-300">{h.providerName || h.provider || 'PayNow'}</td>
                    <td className="px-4 py-2.5 text-slate-300">${h.amount}</td>
                    <td className="px-4 py-2.5 text-slate-400">{h.mode || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{h.tracker ? `${h.tracker.slice(0, 14)}…` : '—'}</td>
                    <td className="px-4 py-2.5"><StatusPill status={h.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            History is in-memory only — it clears when you reload. Persistent records of every transaction are on the{' '}
            <Link to="/app/transactions" className="text-brand-300 hover:underline">Transactions</Link> page.
          </p>
        </div>
      )}
    </div>
  );
}
