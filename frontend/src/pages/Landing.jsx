import { Link } from 'react-router-dom';
import {
  Zap, ShieldCheck, Workflow, Code2, Rocket, ArrowRight, CheckCircle2, Terminal,
} from 'lucide-react';

const features = [
  {
    icon: Rocket,
    title: 'Onboard in 30 seconds',
    body: 'Your test API key works the moment you sign up — no PayNow account required. Click any outcome on the simulator page to fire a real signed webhook to your URL.',
  },
  {
    icon: ShieldCheck,
    title: 'Hash math, solved',
    body: 'SHA-512 done server-side, validated against PayNow\'s own worked example. Forget HashMismatchException ever existed.',
  },
  {
    icon: Workflow,
    title: 'Webhooks that retry',
    body: 'Failed deliveries land in a queue and replay with exponential backoff. Manual replay, signed payloads, full delivery log.',
  },
  {
    icon: Code2,
    title: 'Drop-in checkout',
    body: 'A 3-line JS snippet renders a checkout button on any site. PHP and Node SDKs, both production-grade.',
  },
];

const codeSample =
`curl -X POST https://pay.aizim.co.zw/api/v1/pay \\
  -H "Authorization: Bearer mp_test_xxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"reference":"order-123","amount":"5.00"}'

# → { "tracker": "mp_a1b2c3d4...",
#     "browser_url": "https://pay.aizim.co.zw/simulator/mp_a1b2...",
#     "mode": "simulated" }`;

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="ManishaPay" className="h-9 w-9 rounded-lg" />
          <span className="text-lg font-semibold tracking-tight">ManishaPay</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <a href="#features" className="hidden text-slate-300 hover:text-white md:inline">Features</a>
          <a href="#quickstart" className="hidden text-slate-300 hover:text-white md:inline">Docs</a>
          <Link to="/login" className="text-slate-300 hover:text-white">Log in</Link>
          <Link
            to="/register"
            className="rounded-lg bg-brand-gradient px-4 py-2 font-medium text-white shadow-glow transition hover:opacity-95"
          >
            Get started
          </Link>
        </nav>
      </header>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-5xl bg-brand/10 blur-3xl"
        />
        <div className="mx-auto max-w-4xl px-6 pt-16 pb-20 text-center">
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-brand-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-300" />
            PayNow Zimbabwe — middleware, done right
          </p>
          <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight md:text-5xl lg:text-6xl">
            PayNow integrations,<br />
            <span className="bg-gradient-to-r from-brand-300 via-brand to-brand-700 bg-clip-text text-transparent">
              without the headaches.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            Hash mismatches. Decimal-format crashes. Phone prompts that never fire. Webhooks
            you can&apos;t see. ManishaPay solves all of them at the middleware layer so your
            payment code stays five lines long.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-6 py-3 font-semibold text-white shadow-glow transition hover:opacity-95"
            >
              Start free <ArrowRight size={18} />
            </Link>
            <a
              href="#quickstart"
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-6 py-3 text-slate-200 hover:bg-slate-800"
            >
              See the 30-second demo
            </a>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-sm text-slate-400">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-brand"/>50 free transactions/month</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-brand"/>No PayNow account needed to test</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-brand"/>Money never touches us</span>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl px-6 pb-24">
        <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-brand-300">
          What you get
        </h2>
        <p className="mb-10 text-center text-2xl font-semibold tracking-tight">
          Real solutions to real PayNow forum threads.
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-xl border border-slate-800 bg-slate-900/60 p-6 transition hover:border-brand/50 hover:bg-slate-900"
            >
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-brand-gradient text-white shadow-glow">
                <Icon size={20} />
              </div>
              <h3 className="mb-1.5 font-semibold text-slate-100">{title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Quickstart ────────────────────────────────────────── */}
      <section id="quickstart" className="mx-auto max-w-5xl px-6 pb-24">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 md:p-12">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-300">
            Quickstart
          </h2>
          <p className="mb-8 text-2xl font-semibold tracking-tight">
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
            </ol>
            <div className="rounded-lg border border-slate-700 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-300">
              <div className="mb-3 flex items-center gap-2 text-slate-500">
                <Terminal size={14} /> bash
              </div>
              <pre className="overflow-x-auto whitespace-pre">{codeSample}</pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 pb-24 text-center">
        <h2 className="mb-3 text-3xl font-bold tracking-tight">Ready to ship payments?</h2>
        <p className="mb-7 text-slate-400">
          Free for the first 50 transactions per month. After that, $0.05 per successful
          transaction. Money flows directly to your PayNow wallet — we&apos;re developer
          tools, not a payment processor.
        </p>
        <Link
          to="/register"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-6 py-3 font-semibold text-white shadow-glow transition hover:opacity-95"
        >
          Create your account <ArrowRight size={18} />
        </Link>
      </section>

      <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} ManishaPay — built by{' '}
        <a href="https://noby.aizim.co.zw" target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-brand-300">
          Noby Tebulo
        </a>{' '}
        for the PayNow Zimbabwe community ·{' '}
        <a href="https://aizim.co.zw" className="hover:text-slate-300">aizim.co.zw</a>
      </footer>
    </div>
  );
}
