import { Link } from 'react-router-dom';
import {
  ArrowRight, ShieldCheck, Code2, Rocket, CheckCircle2, Terminal,
  Zap, Lock, Globe, Webhook, BarChart3, Github, Mail, ExternalLink,
  Layers, Wallet, Server, Sparkles, FlaskConical, MessageSquare, ScrollText, Receipt,
} from 'lucide-react';
import TechBackdrop from '../components/landing/TechBackdrop';
import FiscalReceiptCard from '../components/FiscalReceiptCard';
import FadeInOnScroll from '../components/FadeInOnScroll';
import ThemeToggle from '../components/ThemeToggle';
import WhatsAppFloating from '../components/WhatsAppFloating';
import BackToTop from '../components/BackToTop';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard } from 'lucide-react';

const scrollToTop = () => {
  if (typeof window !== 'undefined') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

const features = [
  {
    icon: Layers,
    title: 'One API, many gateways',
    body: 'Integrate once, then accept payments across PayNow, Stripe, Paystack, Flutterwave, PayPal, M-Pesa and PayFast — the same request shape and webhook contract for every gateway.',
  },
  {
    icon: Rocket,
    title: 'Zero-setup sandbox',
    body: 'Your test API key works the moment you sign up — no gateway account required. Click any outcome on the simulator to fire a real signed webhook to your URL.',
  },
  {
    icon: ShieldCheck,
    title: 'PayNow pain, solved',
    body: 'Hash math, decimal formats, mobile OTP, broken webhooks — every PayNow integration headache handled server-side, validated against PayNow\'s own worked examples.',
  },
  {
    icon: Lock,
    title: 'Secure by default',
    body: 'Encrypted credentials at rest, HMAC-signed webhooks with timestamp replay protection, and idempotency keys so retries never double-charge.',
  },
  {
    icon: Code2,
    title: 'Checkout & payment links',
    body: 'A 3-line drop-in widget, hosted checkout, and shareable payment links. Production-grade PHP and Node SDKs on npm + Packagist.',
  },
  {
    icon: BarChart3,
    title: 'Built-in observability',
    body: 'Per-project transaction log, webhook delivery status, structured logs with request IDs. Ship payments, then sleep.',
  },
];

const codeSample =
`curl -X POST https://manishapay.netlify.app/api/v1/pay \\
  -H "Authorization: Bearer mp_test_xxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"reference":"order-123","amount":"5.00"}'

# → { "tracker":     "mp_a1b2c3d4...",
#     "browser_url": "https://manishapay.netlify.app/simulator/mp_a1b2...",
#     "mode":        "simulated" }`;

const stats = [
  { v: '1 API',   l: 'For many gateways' },
  { v: '<10 min', l: 'Time to first webhook' },
  { v: '50/mo',   l: 'Free transactions, forever' },
  { v: '$0',      l: 'Of your money we ever hold' },
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

const forumIssues = [
  {
    title: 'Hash mismatch on amount format',
    forumQuote: '"Invalid Hash. Hash should start with: 0395E9"',
    problem: 'PayNow expects amounts as exactly two decimals. Send "5" or "5.5" with your own hash and PayNow\'s server-side recomputation will never match yours.',
    fix: 'Server-side amount normalisation before hash compute. You send "5", we send "5.00". No mismatch.',
  },
  {
    title: 'Mobile OTP never fires',
    forumQuote: '"…customer enters their PIN and transaction is not going through…"',
    problem: 'Zimbabweans type "0771234567"; PayNow\'s mobile-money endpoints (Ecocash, OneMoney) need "+263…" to fire the OTP gateway.',
    fix: 'Phone normaliser maps every common local form (077…, 263…, +263…) to the canonical format before forwarding.',
  },
  {
    title: 'Method "" is not recognized',
    forumQuote: '"Initiate Payment Error: The method \'\' is not recognized" (WooCommerce, Sept 2025)',
    problem: 'Plugins occasionally pass an empty or stale method string, breaking checkout mid-flow.',
    fix: 'Method validated on the API edge against PayNow\'s real channel codes. Empty values fall back to web redirect instead of failing.',
  },
  {
    title: 'Status not reflecting in your DB',
    forumQuote: '"Status not reflecting in database when using mobile transactions sandbox" (Nov 2025)',
    problem: 'Customer pays but your DB stays "pending" — webhook lost, hash verification failing silently, or your endpoint timed out.',
    fix: 'HMAC-SHA256 signed webhooks with timestamp, exponential-backoff retry, and a full delivery log per project. Manual replay on demand.',
  },
  {
    title: 'Test-mode auth email mismatch',
    forumQuote: '"…authemail must match the merchants registered email address" (recurring on WooCommerce)',
    problem: 'Plugins forward the customer\'s email as authemail; PayNow rejects in test mode unless it\'s the merchant\'s registered address.',
    fix: 'Auto-swaps to the project-registered email in test mode. Customer email is still recorded, just not forwarded as authemail.',
  },
  {
    title: 'ReturnUrl format errors',
    forumQuote: '"Initiate Payment Error: The ReturnUrl must start with http:// or https://" (Apr 2025)',
    problem: 'Trailing whitespace, missing scheme, or relative paths fail PayNow\'s validation at runtime — meaning your customer is the one who sees the error.',
    fix: 'URL format validation in the dashboard at save time. Misconfiguration fails fast, never at checkout.',
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
  const { isAuthenticated, isAdmin } = useAuth();
  return (
    <div id="top" className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Page-wide animated tech backdrop — sits behind every section */}
      <TechBackdrop />

      <div className="relative z-10">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="ManishaPay" className="h-9 w-9 rounded-lg"/>
            <span className="text-lg font-semibold tracking-tight">ManishaPay</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm md:gap-3">
            <button
              type="button"
              onClick={scrollToTop}
              className="hidden md:inline rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Home
            </button>
            <a href="#features" className="hidden md:inline rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white">Features</a>
            <a href="#pricing" className="hidden md:inline rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white">Pricing</a>
            <a href="#partners" className="hidden md:inline rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white">Partners</a>
            <Link to="/ai" className="hidden md:inline-flex items-center gap-1 rounded px-3 py-1.5 text-brand-300 hover:bg-slate-800 hover:text-brand-200"><Sparkles size={13}/> ManishaAI</Link>
            <Link to="/docs" className="hidden md:inline rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white">Docs</Link>
            <ThemeToggle className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white" />
            {isAuthenticated ? (
              <>
                {isAdmin && (
                  <Link to="/admin" className="hidden md:inline rounded px-3 py-1.5 text-sky-300 hover:bg-slate-800 hover:text-white">Admin</Link>
                )}
                <Link
                  to="/app"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gradient px-4 py-2 font-medium text-white shadow-glow transition hover:opacity-95"
                >
                  <LayoutDashboard size={14}/> Dashboard
                </Link>
              </>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gradient px-4 py-2 font-medium text-white shadow-glow transition hover:opacity-95"
              >
                Log in
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-5xl bg-brand/10 blur-3xl"/>
        <div className="relative z-10 mx-auto max-w-4xl px-6 pt-16 pb-20 text-center">
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-brand-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-300"/>
            One payments API · many gateways · PayNow live in production
          </p>
          <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            One payments API for<br/>
            <span className="bg-gradient-to-r from-brand-300 via-brand to-brand-700 bg-clip-text text-transparent">
              Africa and beyond.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
            Integrate once, accept payments across many gateways. One request shape and one
            signed-webhook contract for <span className="font-medium text-slate-300">PayNow, Stripe,
            Paystack, Flutterwave, PayPal, M-Pesa</span> and more.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500">
            <span className="font-medium text-slate-300">PayNow Zimbabwe is live in production</span> — and every one of its notorious integration headaches (hash, decimals, mobile OTP, broken webhooks) is already solved at the middleware layer.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to={isAuthenticated ? '/app/connect' : '/register'}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-7 py-3.5 font-semibold text-white shadow-glow transition hover:opacity-95"
            >
              <Rocket size={18}/> Connect Your App
            </Link>
            <Link
              to="/get-started"
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-7 py-3.5 text-slate-200 hover:bg-slate-800"
            >
              New here? Start guide
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-sm text-slate-400">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-brand"/>50 free transactions/month</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-brand"/>No gateway account needed to test</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-brand"/>Money flows direct to your wallet</span>
          </div>
        </div>

        {/* Stats strip */}
        <div className="relative z-10 mx-auto max-w-5xl px-6 pb-16">
          <div className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-800/25 bg-slate-900/20 p-6 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.l} className="text-center">
                <div className="text-2xl font-bold tracking-tight text-brand-300 md:text-3xl">{s.v}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-slate-500">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ManishaAI spotlight ─────────────────────────────── */}
      <FadeInOnScroll>
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <Link to="/ai" className="group relative block overflow-hidden rounded-2xl border border-brand-500/30 bg-gradient-to-r from-brand-500/10 via-slate-900/60 to-slate-900/60 p-6 transition hover:border-brand-400/60 md:p-8">
            <div className="flex flex-col items-start gap-5 md:flex-row md:items-center">
              <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl border border-brand-500/40 bg-brand-500/15">
                <Sparkles className="text-brand-300" size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-white md:text-xl">Meet ManishaAI — your payments integration expert</h3>
                  <span className="rounded-full bg-brand-500/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-300">New</span>
                </div>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-400">
                  Instant answers on all 11 gateways — grounded in real documentation and 70+ documented
                  pain points, with sources cited. No signup required.
                </p>
              </div>
              <span className="inline-flex flex-none items-center gap-2 rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition group-hover:opacity-95">
                Ask ManishaAI <ArrowRight size={15} />
              </span>
            </div>
          </Link>
        </section>
      </FadeInOnScroll>

      {/* ── Features ────────────────────────────────────────── */}
      <FadeInOnScroll>
        <section id="features" className="mx-auto max-w-6xl px-6 pb-24">
          <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-brand-300">
            What you get
          </h2>
          <p className="mb-10 text-center text-3xl font-semibold tracking-tight md:text-4xl">
            One integration. Every gateway you&apos;ll need.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, body }, i) => (
              <FadeInOnScroll
                key={title}
                delay={i * 70}
                className="group rounded-xl border border-slate-800/25 bg-slate-900/20 p-6 transition hover:border-brand/40 hover:bg-slate-900/70"
              >
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-brand-gradient text-white shadow-glow">
                  <Icon size={20}/>
                </div>
                <h3 className="mb-1.5 font-semibold text-slate-100">{title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{body}</p>
              </FadeInOnScroll>
            ))}
          </div>
        </section>
      </FadeInOnScroll>

      {/* ── The gateway lineup ─────────────────────────────────
          Two-tier layout: left = PayNow (live in production, our
          Zimbabwe strength), right = the full gateway lineup with
          honest status labels (Production / Live / Coming soon). ── */}
      <FadeInOnScroll>
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">

            {/* PRIMARY — PayNow, live in production */}
            <div className="relative overflow-hidden rounded-2xl border border-brand/30 bg-gradient-to-br from-slate-900/60 via-slate-900/40 to-brand/10 p-8 md:p-10 shadow-glow">
              <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand/15 blur-3xl"/>
              <div className="relative">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-200">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-300"/>
                  Live in production · Zimbabwe
                </div>
                <h3 className="text-2xl font-bold tracking-tight text-slate-100 md:text-3xl">
                  PayNow Zimbabwe — every integration issue, solved.
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
                  PayNow is our deepest, production-ready gateway. Hash mismatches, decimal-format crashes, mobile OTP failures, plugin churn, broken webhooks — every recurring thread on{' '}
                  <a href="https://forums.paynow.co.zw/" target="_blank" rel="noopener noreferrer" className="text-brand-300 hover:underline">forums.paynow.co.zw</a>{' '}
                  is mapped to a Direct fix, Plugin fallback, or honest "PayNow-only" notice — and the same API works for every other gateway.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link to="/forum-coverage" className="inline-flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand/10 px-4 py-2 text-xs font-semibold text-brand-200 hover:bg-brand/20">
                    <MessageSquare size={13}/> See the coverage map
                  </Link>
                  <Link to="/register" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gradient px-4 py-2 text-xs font-semibold text-white shadow-glow hover:opacity-95">
                    Try in the Sandbox <ArrowRight size={12}/>
                  </Link>
                </div>
              </div>
            </div>

            {/* SECONDARY — the full gateway lineup */}
            <div className="rounded-2xl border border-slate-800/40 bg-slate-900/30 p-7">
              <div className="mb-3 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <Globe size={11}/> One integration · many gateways
              </div>
              <h4 className="text-lg font-semibold text-slate-100">
                The gateway lineup.
              </h4>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Same SDK, dashboard, and signed-webhook contract for all of them. Adopt it once — switching or adding a gateway needs no rewrite.
              </p>

              <ul className="mt-5 space-y-2">
                {[
                  { name: 'PayNow (Zimbabwe)', status: 'Production',  statusCls: 'border-brand/40 bg-brand/10 text-brand-200' },
                  { name: 'Stripe',            status: 'Live',        statusCls: 'border-slate-700 bg-slate-900 text-slate-300' },
                  { name: 'Paystack',          status: 'Live',        statusCls: 'border-slate-700 bg-slate-900 text-slate-300' },
                  { name: 'Flutterwave',       status: 'Live',        statusCls: 'border-slate-700 bg-slate-900 text-slate-300' },
                  { name: 'PayPal',            status: 'Live',        statusCls: 'border-slate-700 bg-slate-900 text-slate-300' },
                  { name: 'M-Pesa (Daraja)',   status: 'Live',        statusCls: 'border-slate-700 bg-slate-900 text-slate-300' },
                  { name: 'PayFast',           status: 'Live',        statusCls: 'border-slate-700 bg-slate-900 text-slate-300' },
                  { name: 'Yoco',              status: 'Coming soon', statusCls: 'border-slate-800 bg-slate-900/60 text-slate-500' },
                  { name: 'Pesepay',           status: 'Coming soon', statusCls: 'border-slate-800 bg-slate-900/60 text-slate-500' },
                  { name: 'Ozow',              status: 'Coming soon', statusCls: 'border-slate-800 bg-slate-900/60 text-slate-500' },
                  { name: 'DPO Pay',           status: 'Coming soon', statusCls: 'border-slate-800 bg-slate-900/60 text-slate-500' },
                ].map(({ name, status, statusCls }) => (
                  <li key={name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-200">{name}</span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusCls}`}>
                      {status}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-5 text-[11px] italic text-slate-500">
                Want a specific gateway prioritised? <a href="mailto:nobytechy@gmail.com?subject=ManishaPay%20gateway%20request" className="text-brand-300 hover:underline">Email Noby</a>.
              </p>
            </div>
          </div>
        </section>
      </FadeInOnScroll>

      {/* ── Forum issues, fixed (preview — full list at /forum-coverage) ── */}
      <FadeInOnScroll>
        <section id="forum" className="relative mx-auto max-w-6xl px-6 pb-24">
          <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-brand-300">
            From the PayNow forums
          </h2>
          <p className="mb-3 text-center text-3xl font-semibold tracking-tight md:text-4xl">
            Real threads. Real errors. Solved at the middleware layer.
          </p>
          <p className="mx-auto mb-10 max-w-2xl text-center text-slate-400">
            Recurring issues from{' '}
            <a href="https://forums.paynow.co.zw/" target="_blank" rel="noopener noreferrer" className="text-brand-300 hover:underline">
              forums.paynow.co.zw
            </a>
            , solved at the integration layer. Three highlights below; the full categorised map lives on{' '}
            <Link to="/forum-coverage" className="text-brand-300 hover:underline">/forum-coverage</Link>.
          </p>

          <div className="grid gap-4 md:grid-cols-3">
            {forumIssues.slice(0, 3).map(({ title, forumQuote, problem, fix }, i) => (
              <FadeInOnScroll
                key={title}
                delay={i * 80}
                className="flex flex-col rounded-xl border border-slate-800/25 bg-slate-900/20 p-5 transition hover:border-brand/40 hover:bg-slate-900/70"
              >
                <div className="mb-2 flex items-center gap-2 text-brand-300">
                  <MessageSquare size={14}/>
                  <span className="text-xs font-semibold uppercase tracking-wider">Forum thread</span>
                </div>
                <h3 className="font-semibold text-slate-100">{title}</h3>
                <p className="mt-1 text-xs italic text-slate-500">{forumQuote}</p>

                <div className="mt-4 space-y-3 text-sm leading-relaxed">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-300">Without ManishaPay</p>
                    <p className="mt-0.5 text-slate-400">{problem}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-300">With ManishaPay</p>
                    <p className="mt-0.5 text-slate-300">{fix}</p>
                  </div>
                </div>
              </FadeInOnScroll>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/forum-coverage"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-6 py-3 text-sm font-semibold text-slate-100 hover:border-brand/40 hover:bg-slate-900"
            >
              See the full forum coverage map <ArrowRight size={14}/>
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-6 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
            >
              <FlaskConical size={16}/> Try in the Sandbox
            </Link>
          </div>
        </section>
      </FadeInOnScroll>

      {/* ── For developers / for partners split ──────────────── */}
      <FadeInOnScroll>
      <section id="partners" className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* For developers */}
          <div className="rounded-2xl border border-slate-800/25 bg-slate-900/20 p-8">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-300">For developers</p>
            <h3 className="mb-4 text-2xl font-semibold tracking-tight">Ship payments today, not next sprint.</h3>
            <ul className="mb-6 space-y-2.5 text-sm text-slate-300">
              {[
                'One API for many gateways — write your checkout once',
                'Working code in 4 languages (curl, Node, PHP, drop-in JS)',
                'Server-side hash, decimal & phone normalising, idempotency keys',
                'Zero-setup sandbox — no gateway account to fire real webhooks',
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
          <div className="rounded-2xl border border-slate-800/25 bg-gradient-to-br from-slate-900/20 to-brand/5 p-8">
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
            <a href="mailto:nobytechy@gmail.com?subject=ManishaPay%20partnership"
               className="inline-flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/10 px-5 py-2.5 font-semibold text-brand-200 transition hover:bg-brand/20">
              <Mail size={16}/> Talk to us
            </a>
          </div>
        </div>
      </section>
      </FadeInOnScroll>

      {/* ── Pricing ─────────────────────────────────────────── */}
      <FadeInOnScroll>
      <section id="pricing" className="mx-auto max-w-5xl px-6 pb-24">
        <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-brand-300">
          Pricing
        </h2>
        <p className="mb-10 text-center text-3xl font-semibold tracking-tight">
          Free until you&apos;re actually selling.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800/25 bg-slate-900/20 p-6">
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
          <div className="relative rounded-2xl border border-brand/40 bg-gradient-to-br from-slate-900/40 to-brand/5 p-6 shadow-glow">
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
              <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 text-brand"/>Simple monthly invoice</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-800/25 bg-slate-900/20 p-6">
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
          Money flows directly customer → gateway → your wallet. We never custody funds; we only charge for the developer tools.
        </p>
      </section>
      </FadeInOnScroll>

      {/* ── Sibling app: zimFDMS (fiscalisation) ─────────────── */}
      <FadeInOnScroll>
      <section id="fiscalisation" className="mx-auto max-w-6xl px-6 py-16">
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/60 to-brandblue/5 p-8 md:p-10">
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brandblue/40 bg-brandblue/10 px-3 py-1 text-xs font-semibold text-brandblue-300">
                <Layers size={13} /> The complete Zimbabwe stack
              </span>
              <h2 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">
                Get paid, then stay ZIMRA-compliant
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
                ManishaPay collects the payment. Its sibling <b className="text-slate-200">zimFDMS</b> shows how the
                sale gets fiscalised — a ZIMRA fiscal tax invoice with QR &amp; signature. Two bridges, one mission:
                make ZIMRA-mandated infrastructure trivial to integrate.{' '}
                <span className="text-slate-500">(zimFDMS is in interactive sandbox preview.)</span>
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <div className="inline-flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-3 py-1.5 text-sm text-slate-200">
                  <Wallet size={15} className="text-brand" /> ManishaPay · Payments
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-1.5 text-sm text-slate-300">
                  <Receipt size={15} /> zimFDMS · Fiscalisation
                </div>
              </div>
              <a
                href="https://zimrafdms.netlify.app"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-slate-950 transition-colors hover:bg-brand-dark hover:text-white"
              >
                Explore zimFDMS <ArrowRight size={14} />
              </a>
            </div>
            <div className="flex justify-center">
              <FiscalReceiptCard />
            </div>
          </div>
        </div>
      </section>
      </FadeInOnScroll>

      {/* Security details moved to /docs (cleaner landing surface);
           Final CTA removed — Pricing card already terminates the page strongly. */}

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 bg-slate-950">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="ManishaPay" className="h-9 w-9 rounded-lg"/>
              <span className="text-lg font-semibold tracking-tight">ManishaPay</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-slate-400">
              One payments API for many gateways — PayNow, Stripe, Paystack, Flutterwave and more.
              Built for developers, priced like one too.
            </p>
            <div className="mt-4 flex items-center gap-3 text-slate-400">
              <a href="https://github.com/nobytechy/manishapay-sdks" target="_blank" rel="noopener noreferrer" aria-label="ManishaPay SDKs on GitHub" className="rounded p-1.5 hover:bg-slate-800 hover:text-white">
                <Github size={18}/>
              </a>
            </div>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Product</p>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><a href="#features" className="hover:text-slate-100">Features</a></li>
              <li><a href="#pricing" className="hover:text-slate-100">Pricing</a></li>
              <li><Link to="/forum-coverage" className="hover:text-slate-100">Forum coverage</Link></li>
              <li><Link to="/ai" className="hover:text-slate-100">ManishaAI assistant</Link></li>
              <li><Link to="/docs" className="hover:text-slate-100">Docs</Link></li>
              <li><Link to="/get-started" className="hover:text-slate-100">Get started</Link></li>
              <li><a href="https://zimrafdms.netlify.app" target="_blank" rel="noopener noreferrer" className="hover:text-slate-100">Fiscalisation · zimFDMS <ExternalLink size={11} className="ml-0.5 inline"/></a></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Company</p>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><a href="https://nobie.netlify.app" target="_blank" rel="noopener noreferrer" className="hover:text-slate-100">About Noby <ExternalLink size={11} className="ml-0.5 inline"/></a></li>
              <li><a href="#partners" className="hover:text-slate-100">Partners</a></li>
              <li><a href="https://github.com/nobytechy/manishapay-sdks" target="_blank" rel="noopener noreferrer" className="hover:text-slate-100">SDKs on GitHub <ExternalLink size={11} className="ml-0.5 inline"/></a></li>
              <li><a href="mailto:nobytechy@gmail.com" className="hover:text-slate-100">Contact</a></li>
              {isAuthenticated && <li><Link to="/app" className="hover:text-slate-100">Dashboard</Link></li>}
              {isAuthenticated
                ? (isAdmin && <li><Link to="/admin" className="hover:text-slate-100">Admin console</Link></li>)
                : <li><Link to="/admin/login" className="hover:text-slate-100">Admin login</Link></li>}
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-800 px-6 py-5 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} ManishaPay — built by{' '}
          <a href="https://nobie.netlify.app" target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-brand-300">
            Noby Tebulo
          </a>{' '}
          for the PayNow Zimbabwe community
        </div>
      </footer>
      </div>

      {/* Floating CTAs — BackToTop sits above WhatsApp */}
      <BackToTop bottom={96} />
      <WhatsAppFloating />
    </div>
  );
}
