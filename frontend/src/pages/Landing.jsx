import { Link } from 'react-router-dom';
import {
  ArrowRight, ShieldCheck, Workflow, Code2, Rocket, CheckCircle2, Terminal,
  Zap, Lock, Globe, Webhook, BarChart3, Smartphone, Github, Mail, ExternalLink,
  Layers, Wallet, Server, Sparkles,
} from 'lucide-react';

const features = [
  {
    icon: Rocket,
    title: 'Onboard in 30 seconds',
    body: 'Your test API key works the moment you sign up — no PayNow account required. Click any outcome on the simulator to fire a real signed webhook to your URL.',
  },
  {
    icon: ShieldCheck,
    title: 'Hash math, solved',
    body: 'SHA-512 done server-side, validated against PayNow\'s own worked example. Forget HashMismatchException ever existed.',
  },
  {
    icon: Workflow,
    title: 'Webhooks that retry',
    body: 'Failed deliveries replay with exponential backoff. Manual replay, signed payloads, full delivery log per project.',
  },
  {
    icon: Code2,
    title: 'Drop-in checkout',
    body: 'A 3-line JS snippet renders a checkout button on any site. PHP and Node SDKs, both production-grade.',
  },
  {
    icon: Smartphone,
    title: 'Mobile money first',
    body: 'EcoCash, OneMoney, Zimswitch, and card via Visa/Mastercard. Phone format auto-normalised so OTPs always fire.',
  },
  {
    icon: BarChart3,
    title: 'Built-in observability',
    body: 'Per-project transaction log, webhook delivery status, structured logs with request IDs. Ship payments, then sleep.',
  },
];

const codeSample =
`curl -X POST https://pay.aizim.co.zw/api/v1/pay \\
  -H "Authorization: Bearer mp_test_xxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"reference":"order-123","amount":"5.00"}'

# → { "tracker":     "mp_a1b2c3d4...",
#     "browser_url": "https://pay.aizim.co.zw/simulator/mp_a1b2...",
#     "mode":        "simulated" }`;

const stats = [
  { v: '<10 min', l: 'Time to first webhook' },
  { v: 'SHA-512', l: 'Verified against PayNow docs' },
  { v: '50/mo', l: 'Free transactions, forever' },
  { v: '$0',     l: 'We hold of your money' },
];

const securityPoints = [
  { icon: Lock, title: 'Encrypted credentials at rest',
    body: 'Your PayNow Integration Key is sealed with libsodium envelope encryption — a per-row data key, wrapped by a master key kept out of the database.' },
  { icon: Wallet, title: 'We never custody funds',
    body: 'Money flows directly from your customer to your PayNow wallet. ManishaPay only sits on the API path; we\'re a developer-tools company, not a regulated payment processor.' },
  { icon: Webhook, title: 'Signed webhooks',
    body: 'Every delivery to your endpoint includes an HMAC-SHA256 signature with a timestamp. Our SDKs verify in one line; replay attacks rejected via timestamp tolerance.' },
  { icon: Server, title: 'Hosted on stable infra',
    body: 'Static dashboard on Apache/cPanel, Node API on Passenger, Postgres on Supabase. Boring, observable, debuggable.' },
];

const faqs = [
  {
    q: 'Do I need a PayNow account to start?',
    a: 'No. The first 50 transactions per month run in simulated mode — a fully internal flow that fires real signed webhooks without ever calling PayNow. When you\'re ready for live money, paste your Integration ID + Key in the dashboard.',
  },
  {
    q: 'Where does the money go?',
    a: 'Directly into your own PayNow wallet, settled by PayNow. ManishaPay never custodies funds. We charge per transaction monthly via invoice.',
  },
  {
    q: 'How are credentials stored?',
    a: 'libsodium envelope encryption. A 32-byte data key per credential, encrypted with a master key. The master key is kept in environment variables, never in the database. Even if the database leaks, credentials stay encrypted.',
  },
  {
    q: 'What happens if PayNow goes down?',
    a: 'Real-mode payments will fail until they\'re back up — we can\'t fix upstream outages. Simulated mode keeps working (no PayNow dependency). Our status page shows both our health and PayNow\'s.',
  },
  {
    q: 'Can I use ManishaPay for recurring payments?',
    a: 'Yes — PayNow returns a token on the first transaction (when tokenisation is enabled on your integration). Pass the token instead of phone for subsequent charges. Documented in the dashboard.',
  },
  {
    q: 'Is there a partner / revenue-share programme?',
    a: 'For agencies and SaaS embedding payments for Zim merchants — yes. Reach out via the contact below to discuss white-label dashboards and revenue share.',
  },
];

const partnerPoints = [
  { icon: Layers, title: 'White-label option',
    body: 'For agencies and platforms — host the dashboard under your own domain, your branding, your support. ManishaPay handles the PayNow plumbing underneath.' },
  { icon: Sparkles, title: 'Revenue share',
    body: 'If you bring in active merchants, you keep a share of the per-transaction fee. Contract on first 10 onboarded.' },
  { icon: Globe, title: 'Co-built integrations',
    body: 'WooCommerce plugin, Shopify app, Bubble plugin — if you ship to a Zim audience, we\'ll co-build the connector.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="ManishaPay" className="h-9 w-9 rounded-lg"/>
            <span className="text-lg font-semibold tracking-tight">ManishaPay</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm md:gap-3">
            <a href="#features" className="hidden md:inline rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white">Features</a>
            <a href="#pricing" className="hidden md:inline rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white">Pricing</a>
            <a href="#security" className="hidden md:inline rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white">Security</a>
            <a href="#partners" className="hidden md:inline rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white">Partners</a>
            <Link to="/get-started" className="hidden md:inline rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white">Docs</Link>
            <Link to="/login" className="rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white">Log in</Link>
            <Link
              to="/register"
              className="rounded-lg bg-brand-gradient px-4 py-2 font-medium text-white shadow-glow transition hover:opacity-95"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-5xl bg-brand/10 blur-3xl"/>
        <div className="mx-auto max-w-4xl px-6 pt-16 pb-20 text-center">
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-brand-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-300"/>
            PayNow Zimbabwe — middleware, done right
          </p>
          <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            PayNow integrations,<br/>
            <span className="bg-gradient-to-r from-brand-300 via-brand to-brand-700 bg-clip-text text-transparent">
              without the headaches.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
            Hash mismatches. Decimal-format crashes. Phone prompts that never fire. Webhooks
            you can&apos;t see. ManishaPay solves all of them at the middleware layer so your
            payment code stays five lines long.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-7 py-3.5 font-semibold text-white shadow-glow transition hover:opacity-95"
            >
              Sign up free <ArrowRight size={18}/>
            </Link>
            <Link
              to="/get-started"
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-7 py-3.5 text-slate-200 hover:bg-slate-800"
            >
              Read the 10-min guide
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-sm text-slate-400">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-brand"/>50 free transactions/month</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-brand"/>No PayNow account needed to test</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-brand"/>Money flows direct to your wallet</span>
          </div>
        </div>

        {/* Stats strip */}
        <div className="mx-auto max-w-5xl px-6 pb-16">
          <div className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.l} className="text-center">
                <div className="text-2xl font-bold tracking-tight text-brand-300 md:text-3xl">{s.v}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-slate-500">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl px-6 pb-24">
        <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-brand-300">
          What you get
        </h2>
        <p className="mb-10 text-center text-3xl font-semibold tracking-tight">
          Real solutions to real PayNow forum threads.
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-xl border border-slate-800 bg-slate-900/60 p-6 transition hover:border-brand/50 hover:bg-slate-900"
            >
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-brand-gradient text-white shadow-glow">
                <Icon size={20}/>
              </div>
              <h3 className="mb-1.5 font-semibold text-slate-100">{title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Quickstart ──────────────────────────────────────── */}
      <section id="quickstart" className="mx-auto max-w-5xl px-6 pb-24">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 md:p-12">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-300">
            Quickstart
          </h2>
          <p className="mb-8 text-2xl font-semibold tracking-tight md:text-3xl">
            One curl, one webhook, you&apos;re shipping.
          </p>
          <div className="grid gap-8 md:grid-cols-2">
            <ol className="space-y-5 text-sm">
              {[
                { n: 1, t: 'Sign up', d: 'Get an mp_test_… key the moment you confirm your email.' },
                { n: 2, t: 'POST /v1/pay', d: 'Send a reference and amount. Get a redirect URL back.' },
                { n: 3, t: 'Open the simulator', d: 'Click any outcome to fire a signed webhook to your URL.' },
                { n: 4, t: 'Add your PayNow keys', d: 'When ready, paste your Integration ID + Key in the dashboard. Same code now hits real PayNow.' },
              ].map(({ n, t, d }) => (
                <li key={n} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white">{n}</span>
                  <div>
                    <div className="font-medium text-slate-100">{t}</div>
                    <div className="mt-0.5 text-slate-400">{d}</div>
                  </div>
                </li>
              ))}
              <li className="pt-2">
                <Link to="/get-started" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-300 hover:underline">
                  Read the full guide <ArrowRight size={14}/>
                </Link>
              </li>
            </ol>
            <div className="rounded-lg border border-slate-700 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-300">
              <div className="mb-3 flex items-center gap-2 text-slate-500">
                <Terminal size={14}/> bash
              </div>
              <pre className="overflow-x-auto whitespace-pre">{codeSample}</pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── For developers / for partners split ──────────────── */}
      <section id="partners" className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* For developers */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-300">For developers</p>
            <h3 className="mb-4 text-2xl font-semibold tracking-tight">Ship payments today, not next sprint.</h3>
            <ul className="mb-6 space-y-2.5 text-sm text-slate-300">
              {[
                'Working code in 4 languages (curl, Node, PHP, drop-in JS)',
                'Server-side hash compute — never see HashMismatch again',
                'Phone normaliser, decimal normaliser, idempotency keys',
                'Test mode without a PayNow account (simulator fires real webhooks)',
                'Open-source SDKs on npm + Packagist',
              ].map((p) => (
                <li key={p} className="flex gap-2.5"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand"/>{p}</li>
              ))}
            </ul>
            <Link to="/get-started" className="inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-5 py-2.5 font-semibold text-white shadow-glow transition hover:opacity-95">
              Get started <ArrowRight size={16}/>
            </Link>
          </div>

          {/* For partners */}
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/60 to-brand/5 p-8">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-300">For partners</p>
            <h3 className="mb-4 text-2xl font-semibold tracking-tight">Embed Zim payments in your platform.</h3>
            <div className="mb-6 space-y-4">
              {partnerPoints.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                    <Icon size={16}/>
                  </div>
                  <div>
                    <p className="font-medium text-slate-100">{title}</p>
                    <p className="mt-0.5 text-sm text-slate-400">{body}</p>
                  </div>
                </div>
              ))}
            </div>
            <a href="mailto:centuriongrill@gmail.com?subject=ManishaPay%20partnership"
               className="inline-flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/10 px-5 py-2.5 font-semibold text-brand-200 transition hover:bg-brand/20">
              <Mail size={16}/> Talk to us
            </a>
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────── */}
      <section id="pricing" className="mx-auto max-w-5xl px-6 pb-24">
        <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-brand-300">
          Pricing
        </h2>
        <p className="mb-10 text-center text-3xl font-semibold tracking-tight">
          Free until you&apos;re actually selling.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">Developer</p>
            <p className="mt-3 text-4xl font-bold tracking-tight">$0</p>
            <p className="mb-5 text-sm text-slate-500">forever</p>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 text-brand"/>50 successful transactions / mo</li>
              <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 text-brand"/>Test &amp; live keys</li>
              <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 text-brand"/>Simulator + drop-in widget</li>
              <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 text-brand"/>Webhooks + signed deliveries</li>
              <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 text-brand"/>All SDKs</li>
            </ul>
          </div>
          <div className="relative rounded-2xl border-2 border-brand/50 bg-gradient-to-br from-slate-900 to-brand/5 p-6 shadow-glow">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-gradient px-3 py-1 text-xs font-semibold text-white">
              Most popular
            </span>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-300">Pay-as-you-grow</p>
            <p className="mt-3 text-4xl font-bold tracking-tight">$0.05</p>
            <p className="mb-5 text-sm text-slate-500">per successful transaction beyond 50</p>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 text-brand"/>Everything in Developer</li>
              <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 text-brand"/>Unlimited transactions</li>
              <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 text-brand"/>Email support</li>
              <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 text-brand"/>Tokenised recurring payments</li>
              <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 text-brand"/>Monthly invoice via PayNow</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">Partner</p>
            <p className="mt-3 text-4xl font-bold tracking-tight">Custom</p>
            <p className="mb-5 text-sm text-slate-500">white-label + revenue share</p>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 text-brand"/>White-label dashboard</li>
              <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 text-brand"/>Revenue share on referred merchants</li>
              <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 text-brand"/>Co-built connectors</li>
              <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 text-brand"/>Priority support &amp; SLA</li>
            </ul>
          </div>
        </div>
        <p className="mt-8 text-center text-sm text-slate-500">
          Money flows directly customer → PayNow → your wallet. We never custody funds; we only charge for the developer tools.
        </p>
      </section>

      {/* ── Security ────────────────────────────────────────── */}
      <section id="security" className="mx-auto max-w-6xl px-6 pb-24">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 md:p-12">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-300">Security</p>
          <h2 className="mb-3 text-3xl font-semibold tracking-tight">Built like your money depends on it. Because it does.</h2>
          <p className="mb-8 max-w-2xl text-slate-400">
            We hold encrypted credentials, not money. Even so, we built the credential vault as if every byte
            could leak — because that&apos;s the threat model that produces resilient systems.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            {securityPoints.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-gradient text-white shadow-glow">
                  <Icon size={18}/>
                </div>
                <div>
                  <p className="font-semibold text-slate-100">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 pb-24">
        <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-brand-300">FAQ</h2>
        <p className="mb-10 text-center text-3xl font-semibold tracking-tight">Common questions</p>
        <div className="space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="group rounded-xl border border-slate-800 bg-slate-900/60 p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between gap-3 font-medium text-slate-100">
                <span>{f.q}</span>
                <span className="grid h-6 w-6 place-items-center rounded-full border border-slate-700 text-slate-400 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-3xl border border-brand/30 bg-gradient-to-br from-slate-900 via-slate-900 to-brand/10 p-10 text-center md:p-14">
          <Zap size={36} className="mx-auto mb-5 text-brand"/>
          <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">Ready to ship payments?</h2>
          <p className="mx-auto mb-8 max-w-xl text-slate-400">
            Free for the first 50 transactions a month. Money flows direct to your PayNow wallet —
            we&apos;re developer tools, not a payment processor. Sign up takes 30 seconds.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-7 py-3.5 font-semibold text-white shadow-glow transition hover:opacity-95"
            >
              Create your account <ArrowRight size={18}/>
            </Link>
            <Link
              to="/get-started"
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-7 py-3.5 text-slate-200 hover:bg-slate-800"
            >
              Read the developer guide
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 bg-slate-950">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              <img src="/logo.svg" alt="ManishaPay" className="h-9 w-9 rounded-lg"/>
              <span className="text-lg font-semibold tracking-tight">ManishaPay</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-slate-400">
              PayNow Zimbabwe middleware that fixes the integration headaches. Built for developers,
              priced like one too.
            </p>
            <div className="mt-4 flex items-center gap-3 text-slate-400">
              <a href="https://github.com/nobytechy/manishapay" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="rounded p-1.5 hover:bg-slate-800 hover:text-white">
                <Github size={18}/>
              </a>
              <a href="mailto:centuriongrill@gmail.com" aria-label="Email" className="rounded p-1.5 hover:bg-slate-800 hover:text-white">
                <Mail size={18}/>
              </a>
            </div>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Product</p>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><a href="#features" className="hover:text-slate-100">Features</a></li>
              <li><a href="#pricing" className="hover:text-slate-100">Pricing</a></li>
              <li><a href="#security" className="hover:text-slate-100">Security</a></li>
              <li><Link to="/get-started" className="hover:text-slate-100">Get started</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Company</p>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><a href="https://noby.aizim.co.zw" target="_blank" rel="noopener noreferrer" className="hover:text-slate-100">About Noby <ExternalLink size={11} className="ml-0.5 inline"/></a></li>
              <li><a href="https://aizim.co.zw" target="_blank" rel="noopener noreferrer" className="hover:text-slate-100">aizim.co.zw <ExternalLink size={11} className="ml-0.5 inline"/></a></li>
              <li><a href="#partners" className="hover:text-slate-100">Partners</a></li>
              <li><a href="mailto:centuriongrill@gmail.com" className="hover:text-slate-100">Contact</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-800 px-6 py-5 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} ManishaPay — built by{' '}
          <a href="https://noby.aizim.co.zw" target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-brand-300">
            Noby Tebulo
          </a>{' '}
          for the PayNow Zimbabwe community
        </div>
      </footer>
    </div>
  );
}
