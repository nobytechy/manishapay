/**
 * /ai — ManishaAI: public payments-integration assistant.
 *
 * Anonymous, no signup: the backend enforces a small daily quota per visitor
 * (cookie + IP). When the quota runs out we show a soft signup wall.
 * Answers stream in one shot (no SSE in v1) with de-duplicated source chips.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles, Send, Loader2, ExternalLink, Bot, User, ShieldCheck, Zap, Lock,
  Home, BookOpen, MessagesSquare, Rocket,
} from 'lucide-react';

const BASE = import.meta.env.VITE_API_BASE || '';

const NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/docs', label: 'Docs', icon: BookOpen },
  { to: '/forum-coverage', label: 'Forum fixes', icon: MessagesSquare },
  { to: '/get-started', label: 'Get started', icon: Rocket },
];

function NavLinks({ className = '', chip = false }) {
  return (
    <nav className={className}>
      {NAV.map(({ to, label, icon: Icon }) => (
        <Link key={to} to={to}
          className={chip
            ? 'inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 hover:border-brand-500/50 hover:text-brand-300'
            : 'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-brand-300'}>
          <Icon size={chip ? 13 : 16} /> {label}
        </Link>
      ))}
    </nav>
  );
}

const STARTERS = [
  'How do I integrate PayNow in Laravel?',
  'Which gateway should I use for Kenya?',
  'How do I verify a ManishaPay webhook?',
  'Why is my EcoCash PIN prompt not arriving?',
  'Can I accept Visa without a website?',
  'Compare Stripe and Paystack for cards',
];

function Message({ role, content, sources }) {
  const isUser = role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-lg ${
        isUser ? 'bg-slate-700 text-slate-200' : 'bg-brand-500/15 text-brand-300 border border-brand-500/30'}`}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
        isUser ? 'bg-brand-600/20 border border-brand-500/25 text-slate-100'
               : 'bg-slate-900/80 border border-slate-800 text-slate-200'}`}>
        {content}
        {!isUser && sources?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-2">
            {sources.map((s, i) => s.url ? (
              <a key={i} href={s.url} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-brand-300 hover:border-brand-500/40">
                {s.label} <ExternalLink size={10} />
              </a>
            ) : (
              <span key={i} className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-[11px] font-medium text-slate-400">
                {s.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AiAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const [configured, setConfigured] = useState(true);
  const [limitReached, setLimitReached] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    fetch(`${BASE}/v1/ai/status`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { setRemaining(d.remaining); setConfigured(d.configured); })
      .catch(() => {});
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  async function ask(question) {
    const q = (question ?? input).trim();
    if (!q || busy || limitReached) return;
    setInput('');
    setBusy(true);
    const history = messages.slice(-6).map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: 'user', content: q }]);
    try {
      const res = await fetch(`${BASE}/v1/ai/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: q, history }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setLimitReached(true);
        setMessages((m) => [...m, { role: 'assistant', content: data.error, sources: [] }]);
      } else if (!res.ok) {
        setMessages((m) => [...m, { role: 'assistant', content: data.error || 'Something went wrong — try again.', sources: [] }]);
      } else {
        setMessages((m) => [...m, { role: 'assistant', content: data.answer, sources: data.sources }]);
        if (typeof data.remaining === 'number') setRemaining(data.remaining);
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Network hiccup — please try again.', sources: [] }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 lg:flex">
      {/* desktop sidebar */}
      <aside className="hidden lg:flex lg:w-56 lg:flex-none lg:flex-col lg:gap-1 lg:border-r lg:border-slate-800/70 lg:bg-slate-950/60 lg:px-3 lg:py-6 lg:sticky lg:top-0 lg:h-screen">
        <Link to="/" className="mb-5 flex items-center gap-2 px-3 font-semibold text-slate-100">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 font-bold text-slate-950">M</span>
          ManishaPay
        </Link>
        <NavLinks />
        <div className="mt-auto px-3">
          <Link to="/register" className="block rounded-xl bg-brand-500 px-4 py-2.5 text-center text-sm font-semibold text-slate-950 hover:bg-brand-400">
            Sign up free
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* mobile header: logo + quota, then inline nav chips */}
        <header className="mx-auto max-w-3xl px-4 pt-5 lg:pt-6">
          <div className="flex items-center justify-between lg:justify-end">
            <Link to="/" className="flex items-center gap-2 font-semibold text-slate-100 lg:hidden">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 font-bold text-slate-950">M</span>
              ManishaPay
            </Link>
            {remaining !== null && !limitReached && (
              <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-400">
                {remaining} free questions left today
              </span>
            )}
          </div>
          <NavLinks chip className="mt-3 flex flex-wrap gap-2 lg:hidden" />
        </header>

      <main className="mx-auto max-w-3xl px-4 pb-28">
        {messages.length === 0 && (
          <div className="mt-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 border border-brand-500/30">
              <Sparkles className="text-brand-300" size={26} />
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
              Ask me anything about <span className="text-brand-400">payment integrations</span>
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-slate-400">
              11 gateways — PayNow, Stripe, PayPal, M-Pesa, Paystack and more. Grounded in real
              docs and 70+ documented pain points. No signup needed.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => ask(s)}
                  className="rounded-full border border-slate-800 bg-slate-900/70 px-4 py-2 text-sm text-slate-300 transition hover:border-brand-500/50 hover:text-brand-300">
                  {s}
                </button>
              ))}
            </div>
            <div className="mx-auto mt-8 flex max-w-md items-center justify-center gap-5 text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><Zap size={12} /> Instant answers</span>
              <span className="flex items-center gap-1"><ShieldCheck size={12} /> Cites its sources</span>
              <span className="flex items-center gap-1"><Lock size={12} /> No signup</span>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-5">
          {messages.map((m, i) => <Message key={i} {...m} />)}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin" /> ManishaAI is thinking…
            </div>
          )}
          {limitReached && (
            <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-5 text-center">
              <p className="font-semibold text-slate-100">Enjoying ManishaAI?</p>
              <p className="mt-1 text-sm text-slate-300">Create a free account for more questions — plus test-mode API keys and payment links.</p>
              <Link to="/register" className="mt-3 inline-block rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-brand-400">
                Sign up free
              </Link>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </main>

      {/* composer */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-950/90 backdrop-blur lg:left-56">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()}
            disabled={busy || limitReached || !configured}
            placeholder={configured ? 'e.g. How do I verify a PayNow webhook in Node?' : 'ManishaAI is warming up — check back soon'}
            className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-brand-500/50"
          />
          <button onClick={() => ask()} disabled={busy || !input.trim() || limitReached || !configured}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-slate-950 transition hover:bg-brand-400 disabled:opacity-40">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        <p className="pb-2 text-center text-[10px] text-slate-600">
          ManishaAI can make mistakes — verify critical details in the <Link to="/docs" className="underline hover:text-slate-400">docs</Link>.
        </p>
      </div>
      </div>
    </div>
  );
}
