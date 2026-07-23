import { CheckCircle2, Sparkles, ArrowRight } from 'lucide-react';
import Confetti from './Confetti';

/*
 * Activation celebration — shown once, on the developer's first dashboard visit
 * after verifying + signing in. Animated (confetti + pop-in), then hands off to
 * the welcome tour. Keeps the tone warm and beginner-friendly.
 */
export default function Congrats({ open, onTour, onSkip }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
      {/* self-contained animations so we don't touch the tailwind config */}
      <style>{`
        @keyframes mp-pop { 0% { transform: scale(.82); opacity: 0 } 60% { transform: scale(1.03) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes mp-check { 0% { transform: scale(0) rotate(-25deg); opacity: 0 } 100% { transform: scale(1) rotate(0); opacity: 1 } }
      `}</style>
      <Confetti />
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl"
        style={{ animation: 'mp-pop .45s cubic-bezier(.2,.9,.3,1.2) both' }}>
        <div className="h-1.5 -mx-8 -mt-8 mb-6 rounded-t-2xl" style={{ background: 'linear-gradient(90deg,#22a65a,#2166c4)' }} />
        <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-brand/15 text-brand"
          style={{ animation: 'mp-check .5s .15s ease-out both' }}>
          <CheckCircle2 size={38} />
        </span>
        <h2 className="text-xl font-bold text-slate-100">You're all set! 🎉</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Your ManishaPay account is verified and ready. Let's get you sending your <span className="text-slate-200">first test payment</span> —
          it takes about 2 minutes and you don't need any gateway account to start.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button onClick={onTour}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-95">
            <Sparkles size={15} /> Take the quick tour <ArrowRight size={15} />
          </button>
          <button onClick={onSkip} className="text-sm text-slate-400 hover:text-slate-200">I'll explore on my own</button>
        </div>
      </div>
    </div>
  );
}
