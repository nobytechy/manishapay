import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Link2, Plug, ShieldCheck, Rocket, Sparkles, X, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useSecureAccount } from '../auth/SecureAccount';

const DISMISS_KEY = 'mp_getting_started_dismissed_v1';

/*
 * First-run "Getting Started" checklist on the dashboard. Tracks REAL progress
 * (does the developer have a project / test key / a sandbox payment / a connected
 * gateway) with live completion, CTAs to the right page, and a launcher for the
 * welcome tour. Auto-hides once the core steps are done, or when dismissed.
 */
export default function GettingStarted({ onStartTour }) {
  const { user, isAnonymous } = useAuth();
  const { prompt: promptSecure } = useSecureAccount();
  const [counts, setCounts] = useState(null);
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISS_KEY));

  useEffect(() => {
    if (!user || dismissed) return;
    let active = true;
    (async () => {
      // PayNow creds are keyed by project_id (NOT developer_id) — fetch the
      // developer's project ids first, then scope the gateway check to them.
      // (manishapay_gateway_credentials is service-role RLS, so PayNow creds are
      // the client-readable "connected a gateway" signal.)
      const { data: projRows, error: projErr } = await supabase
        .from('manishapay_projects').select('id').eq('developer_id', user.id);
      if (projErr) return; // fail quiet — the checklist is best-effort
      const projectIds = (projRows || []).map((p) => p.id);

      const [txns, gw, legacy] = await Promise.all([
        supabase.from('manishapay_transactions').select('id', { count: 'exact', head: true }).eq('developer_id', user.id),
        // Via the API: manishapay_gateway_credentials is service-role only, so
        // querying it from the client saw legacy PayNow rows and nothing else —
        // a merchant who connected Stripe never got the tick.
        api.listGatewayCredentials().catch(() => ({ data: [] })),
        api.listCredentials().catch(() => ({ data: [] })),
      ]);
      if (!active) return;
      const active_ = (r) => (r.data || []).filter((c) => c.status === 'active');
      const connected = [...active_(gw), ...active_(legacy)];
      setCounts({
        projects: projectIds.length,
        txns: txns.count ?? 0,
        gateways: connected.length,
        live: connected.filter((c) => c.mode === 'live').length,
      });
    })();
    return () => { active = false; };
  }, [user, dismissed]);

  if (dismissed || !counts) return null;

  // The order a merchant actually travels: pick how you get paid, prove it
  // works, then turn on real money. Projects and API keys used to sit at the
  // top of this list; they're plumbing, and the wizards create them anyway.
  const steps = [
    { key: 'gateway', icon: Plug, done: counts.gateways > 0,
      title: 'Add a payment method', desc: 'PayNow, Stripe, Paystack, M-Pesa — pick the ones your customers use.',
      to: '/app/methods', cta: 'Add' },
    { key: 'test', icon: Link2, done: counts.txns > 0,
      title: 'Take a test payment', desc: 'Make a payment link, open it, and pay it yourself. No real money moves, no API key needed.',
      to: '/app/links', cta: 'Try it' },
    ...(isAnonymous ? [{
      key: 'secure', icon: ShieldCheck, done: false,
      title: 'Secure your account', desc: 'Add an email so you can sign in from any phone. Nothing you set up changes.',
      action: promptSecure, cta: 'Secure' }] : []),
    { key: 'live', icon: Rocket, done: counts.live > 0,
      title: 'Go live', desc: 'Add your own keys in real-money mode and start getting paid.',
      to: '/app/methods', cta: 'Go live' },
  ];

  const coreDone = steps.every((s) => s.done);
  if (coreDone) return null; // fully activated — get out of the way

  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  const dismiss = () => { localStorage.setItem(DISMISS_KEY, '1'); setDismissed(true); };

  return (
    <div className="rounded-xl border border-brand/30 bg-gradient-to-br from-brand/10 to-slate-900/40 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand/15 text-brand"><Sparkles size={18} /></span>
          <div>
            <h2 className="text-base font-semibold text-slate-100">Get started with ManishaPay</h2>
            <p className="text-xs text-slate-400">Three steps to taking real payments.</p>
          </div>
        </div>
        <button onClick={dismiss} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200" aria-label="Dismiss" title="Dismiss">
          <X size={16} />
        </button>
      </div>

      {/* Progress */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{doneCount} of {steps.length} done</span>
          <span>{pct}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Steps */}
      <ol className="mt-4 space-y-2">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <li key={s.key}
              className={`flex items-center gap-3 rounded-lg border p-3 transition ${
                s.done ? 'border-slate-800 bg-slate-900/40' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              }`}>
              <span className={s.done ? 'text-brand' : 'text-slate-600'}>
                {s.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
              </span>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${s.done ? 'bg-slate-800 text-slate-500' : 'bg-brand/10 text-brand'}`}>
                <Icon size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${s.done ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
                  {s.title}{s.optional && <span className="ml-1 text-[10px] uppercase tracking-wider text-slate-500">optional</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{s.desc}</p>
              </div>
              {!s.done && (s.action ? (
                <button type="button" onClick={s.action}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95">
                  {s.cta} <ArrowRight size={12} />
                </button>
              ) : (
                <Link to={s.to} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95">
                  {s.cta} <ArrowRight size={12} />
                </Link>
              ))}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
        <button type="button" onClick={onStartTour} className="inline-flex items-center gap-1.5 text-brand hover:underline">
          <Sparkles size={12} /> Take a quick tour
        </button>
        <button type="button" onClick={dismiss} className="text-slate-500 hover:text-slate-300">Dismiss</button>
      </div>
    </div>
  );
}
