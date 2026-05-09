/**
 * /docs — high-level docs hub with sidebar navigation.
 *
 * Pulls the Quickstart and FAQ that used to live on the landing page out of
 * the marketing surface and into proper docs. Deep walkthrough for new
 * developers stays at /get-started; this hub links into it.
 */
import { Link } from 'react-router-dom';
import {
  ArrowRight, Terminal, Zap, ExternalLink, BookOpen, MessageSquare, FlaskConical,
  ShieldCheck, CheckCircle2,
} from 'lucide-react';
import SidebarDoc from '../components/SidebarDoc';

// ── Quickstart (moved from landing) ──────────────────────────────

const quickstartSteps = [
  { n: 1, t: 'Sign up',                 d: 'Get an mp_test_… key the moment you confirm your email.' },
  { n: 2, t: 'POST /v1/pay',            d: 'Send a reference and amount. Get a redirect URL back.' },
  { n: 3, t: 'Open the simulator',       d: 'Click any outcome to fire a signed webhook to your URL.' },
  { n: 4, t: 'Add your PayNow keys',     d: 'When ready, paste your Integration ID + Key in the dashboard. Same code now hits real PayNow.' },
];

const codeSample =
`curl -X POST https://manishapay-api.onrender.com/v1/pay \\
  -H "Authorization: Bearer mp_test_xxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"reference":"order-123","amount":"5.00"}'

# → { "data": {
#       "tracker":     "mp_a1b2c3d4...",
#       "browser_url": "https://manishapay-api.onrender.com/simulator/mp_a1b2c3d4...",
#       "mode":        "simulated"
#     } }`;

const quickstart = (
  <div className="space-y-8">
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-slate-100">Quickstart</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        From signup to first webhook in roughly 10 minutes. Every step has a corresponding sandbox action so you can verify the integration without writing production code.
      </p>
    </div>

    <ol className="space-y-5">
      {quickstartSteps.map(({ n, t, d }) => (
        <li key={n} className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white">
            {n}
          </span>
          <div>
            <p className="font-medium text-slate-100">{t}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-slate-400">{d}</p>
          </div>
        </li>
      ))}
    </ol>

    <div className="rounded-xl border border-slate-800/60 bg-slate-950 p-5 font-mono text-xs leading-relaxed text-slate-300">
      <div className="mb-3 flex items-center gap-2 text-slate-500">
        <Terminal size={14}/> bash
      </div>
      <pre className="overflow-x-auto whitespace-pre">{codeSample}</pre>
    </div>

    <div className="flex flex-wrap gap-3">
      <Link
        to="/register"
        className="inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-glow hover:opacity-95"
      >
        Sign up free <ArrowRight size={14}/>
      </Link>
      <Link
        to="/get-started"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-5 py-2.5 text-sm text-slate-200 hover:bg-slate-900"
      >
        Read the deep walkthrough <ExternalLink size={14}/>
      </Link>
    </div>
  </div>
);

// ── FAQ (moved from landing) ─────────────────────────────────────

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
    a: 'Real-mode payments fail until they\'re back up — we can\'t fix upstream outages. Simulated mode keeps working (no PayNow dependency). Our status page shows both our health and PayNow\'s.',
  },
  {
    q: 'Can I use ManishaPay for recurring payments?',
    a: 'Yes — PayNow returns a token on the first transaction (when tokenisation is enabled on your integration). Pass the token instead of phone for subsequent charges. Documented in the dashboard.',
  },
  {
    q: 'Is there a partner / revenue-share programme?',
    a: 'For agencies and SaaS platforms embedding payments for Zimbabwean merchants — yes. Reach out to discuss white-label dashboards and revenue share.',
  },
  {
    q: 'Where do I see real-world forum issues you\'ve solved?',
    a: 'Open the Forum coverage section in the sidebar. Every recurring thread on forums.paynow.co.zw is mapped to a Direct fix, Plugin fallback, Account-level (PayNow), or Out-of-domain category.',
  },
];

const faq = (
  <div className="space-y-8">
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-slate-100">Frequently asked questions</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        The questions developers ask before they sign up — and after their first transaction.
      </p>
    </div>

    <div className="space-y-3">
      {faqs.map((f) => (
        <details
          key={f.q}
          className="group rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 [&_summary::-webkit-details-marker]:hidden"
        >
          <summary className="flex cursor-pointer items-center justify-between gap-3 font-medium text-slate-100">
            <span>{f.q}</span>
            <span className="grid h-6 w-6 place-items-center rounded-full border border-slate-700 text-slate-400 transition group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
        </details>
      ))}
    </div>
  </div>
);

// ── Welcome / table of contents ──────────────────────────────────

const welcome = (
  <div className="space-y-8">
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-slate-100">Documentation</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        Everything you need to integrate ManishaPay — from a 10-minute Quickstart to the deep walkthrough, FAQ, and the full forum-issue coverage map.
      </p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <Link to="#quickstart" className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 transition hover:border-brand/40 hover:bg-slate-900">
        <div className="mb-2 flex items-center gap-2"><Zap size={16} className="text-brand-300"/><span className="text-sm font-semibold text-slate-100">Quickstart</span></div>
        <p className="text-xs leading-relaxed text-slate-400">10-minute path from signup to your first webhook. curl + cards explaining each step.</p>
      </Link>
      <Link to="/get-started" className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 transition hover:border-brand/40 hover:bg-slate-900">
        <div className="mb-2 flex items-center gap-2"><BookOpen size={16} className="text-brand-300"/><span className="text-sm font-semibold text-slate-100">Deep walkthrough</span></div>
        <p className="text-xs leading-relaxed text-slate-400">Full developer guide — curl, Node, PHP, drop-in widget, webhooks, error handling.</p>
      </Link>
      <Link to="/forum-coverage" className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 transition hover:border-brand/40 hover:bg-slate-900">
        <div className="mb-2 flex items-center gap-2"><MessageSquare size={16} className="text-brand-300"/><span className="text-sm font-semibold text-slate-100">Forum coverage</span></div>
        <p className="text-xs leading-relaxed text-slate-400">Every recurring forums.paynow.co.zw thread, mapped to what ManishaPay does about it.</p>
      </Link>
      <Link to="/register" className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 transition hover:border-brand/40 hover:bg-slate-900">
        <div className="mb-2 flex items-center gap-2"><FlaskConical size={16} className="text-brand-300"/><span className="text-sm font-semibold text-slate-100">In-dashboard Sandbox</span></div>
        <p className="text-xs leading-relaxed text-slate-400">Send fake payments, trigger any outcome inline, watch webhooks fire — all without leaving the dashboard. Sign up to use it.</p>
      </Link>
    </div>

    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-sm leading-relaxed text-slate-300">
      <p className="flex items-center gap-2 font-medium text-emerald-300"><CheckCircle2 size={14}/> Free for the first 50 transactions / month, forever</p>
      <p className="mt-1 text-slate-400">Money flows directly into your PayNow wallet — we never custody funds. <Link to="/#pricing" className="text-brand-300 hover:underline">Pricing →</Link></p>
    </div>
  </div>
);

// ── Sidebar groups ───────────────────────────────────────────────

const groups = [
  {
    label: 'Start here',
    items: [
      { id: 'welcome',    label: 'Welcome',    content: welcome },
      { id: 'quickstart', label: 'Quickstart', content: quickstart },
      { id: 'faq',        label: 'FAQ',         content: faq },
    ],
  },
  {
    label: 'Reference',
    items: [
      { id: 'forum',     label: 'Forum coverage →', content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-100">Forum coverage</h2>
          <p className="text-sm leading-relaxed text-slate-400">
            We maintain a separate page covering every recurring issue from forums.paynow.co.zw. Open it directly:
          </p>
          <Link
            to="/forum-coverage"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-glow hover:opacity-95"
          >
            Open Forum coverage <ExternalLink size={14}/>
          </Link>
        </div>
      ) },
      { id: 'guide',     label: 'Deep walkthrough →', content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-100">Deep walkthrough</h2>
          <p className="text-sm leading-relaxed text-slate-400">
            The original /get-started guide is the longer-form developer walkthrough — curl, Node, PHP, and the drop-in widget with full error-handling notes.
          </p>
          <Link
            to="/get-started"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-glow hover:opacity-95"
          >
            Open Deep walkthrough <ExternalLink size={14}/>
          </Link>
        </div>
      ) },
    ],
  },
  {
    label: 'Concepts',
    items: [
      { id: 'security',  label: 'Security model', content: (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-brand-300">
            <ShieldCheck size={18}/>
            <span className="text-xs font-semibold uppercase tracking-wider">Security</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-100">Security model</h2>
          <p className="text-sm leading-relaxed text-slate-400">
            Detailed coverage on the marketing site at <Link to="/#security" className="text-brand-300 hover:underline">/#security</Link>. Quick summary:
          </p>
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="flex gap-2"><CheckCircle2 size={14} className="mt-1 shrink-0 text-emerald-300"/>Encrypted credentials at rest (libsodium envelope encryption)</li>
            <li className="flex gap-2"><CheckCircle2 size={14} className="mt-1 shrink-0 text-emerald-300"/>HMAC-SHA256 signed webhooks with timestamp</li>
            <li className="flex gap-2"><CheckCircle2 size={14} className="mt-1 shrink-0 text-emerald-300"/>We never custody funds — direct customer → PayNow → your wallet</li>
            <li className="flex gap-2"><CheckCircle2 size={14} className="mt-1 shrink-0 text-emerald-300"/>Per-developer API keys with revoke + rotate</li>
          </ul>
        </div>
      ) },
    ],
  },
];

// ── Page export ──────────────────────────────────────────────────

export default function DocsHome() {
  return (
    <SidebarDoc
      headerTitle="Documentation"
      headerSubtitle="Quickstart, FAQ, forum coverage, and the deep walkthrough — all in one sidebar."
      groups={groups}
      defaultActive="welcome"
      topRight={
        <Link
          to="/register"
          className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white shadow-glow hover:opacity-95"
        >
          Sign up free
        </Link>
      }
    />
  );
}
