import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Rocket, FlaskConical, KeyRound, Plug, Link2, BookOpen, X, ArrowRight, ArrowLeft,
} from 'lucide-react';

export const TOUR_SEEN_KEY = 'mp_welcome_tour_seen_v1';

/*
 * Lightweight first-login welcome tour — a set of slides introducing the major
 * areas of the dashboard, each with a CTA to that page. Self-contained (no library),
 * dismissible, and replayable from the Getting Started card. Marks itself seen in
 * localStorage so it only auto-opens once.
 */
const SLIDES = [
  {
    icon: Rocket, accent: 'text-brand', bg: 'bg-brand/15',
    title: 'Welcome to ManishaPay 👋',
    body: 'One API for many payment gateways — PayNow, Stripe, Paystack, M-Pesa and more. New here? To start testing you only need two things: a test API key and the Sandbox. This 30-second tour shows you exactly where to go — no experience required.',
  },
  {
    icon: FlaskConical, accent: 'text-brand', bg: 'bg-brand/15',
    title: 'Sandbox — test end to end',
    body: 'Send a test payment and watch the full lifecycle (paid / cancelled / timeout) fire signed webhooks — no gateway account required.',
    to: '/app/sandbox', cta: 'Go to Sandbox',
  },
  {
    icon: KeyRound, accent: 'text-amber-300', bg: 'bg-amber-500/15',
    title: 'API Keys',
    body: 'Generate a test key (mp_test_…) to authenticate your API calls. Every fresh key works in simulated mode out of the box.',
    to: '/app/keys', cta: 'Manage keys',
  },
  {
    icon: Plug, accent: 'text-sky-300', bg: 'bg-sky-500/15',
    title: 'Payment Gateways',
    body: 'Connect the gateways you want. One connection unlocks all its methods, and your code never changes — just pass a provider.',
    to: '/app/gateways', cta: 'Connect a gateway',
  },
  {
    icon: Link2, accent: 'text-fuchsia-300', bg: 'bg-fuchsia-500/15',
    title: 'Payment Links',
    body: 'No-code hosted checkout — create a link, share it, and let the customer pick their payment method. Perfect before you write any code.',
    to: '/app/links', cta: 'Create a link',
  },
  {
    icon: BookOpen, accent: 'text-emerald-300', bg: 'bg-emerald-500/15',
    title: 'Docs & SDKs',
    body: 'Integrate in minutes with the Node and PHP SDKs, or straight over the REST API. You\'re all set — happy building!',
    to: '/app/docs', cta: 'Read the docs',
  },
];

export default function WelcomeTour({ open, onClose }) {
  const [i, setI] = useState(0);
  if (!open) return null;

  const slide = SLIDES[i];
  const Icon = slide.icon;
  const last = i === SLIDES.length - 1;

  const finish = () => { localStorage.setItem(TOUR_SEEN_KEY, '1'); setI(0); onClose(); };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Accent bar */}
        <div className="h-1.5" style={{ background: 'linear-gradient(90deg,#22a65a,#2166c4)' }} />

        <div className="p-6">
          <div className="flex justify-end">
            <button onClick={finish} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200" aria-label="Close tour">
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-col items-center text-center">
            <span className={`mb-4 grid h-14 w-14 place-items-center rounded-2xl ${slide.bg} ${slide.accent}`}>
              <Icon size={26} />
            </span>
            <h2 className="text-lg font-semibold text-slate-100">{slide.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{slide.body}</p>
            {slide.to && (
              <Link to={slide.to} onClick={finish}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand/20">
                {slide.cta} <ArrowRight size={12} />
              </Link>
            )}
          </div>

          {/* Dots */}
          <div className="mt-6 flex items-center justify-center gap-1.5">
            {SLIDES.map((_, idx) => (
              <button key={idx} onClick={() => setI(idx)} aria-label={`Slide ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-5 bg-brand' : 'w-1.5 bg-slate-700 hover:bg-slate-600'}`} />
            ))}
          </div>

          {/* Nav */}
          <div className="mt-5 flex items-center justify-between">
            <button type="button" onClick={() => setI((v) => Math.max(0, v - 1))}
              disabled={i === 0}
              className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 disabled:opacity-0">
              <ArrowLeft size={14} /> Back
            </button>
            {last ? (
              <button type="button" onClick={finish}
                className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:opacity-95">
                Get started
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button type="button" onClick={finish} className="text-sm text-slate-500 hover:text-slate-300">Skip</button>
                <button type="button" onClick={() => setI((v) => Math.min(SLIDES.length - 1, v + 1))}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:opacity-95">
                  Next <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
