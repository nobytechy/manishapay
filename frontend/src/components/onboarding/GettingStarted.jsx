import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, FolderKanban, KeyRound, FlaskConical, Plug, Sparkles, X, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const DISMISS_KEY = 'mp_getting_started_dismissed_v1';

/*
 * First-run "Getting Started" checklist on the dashboard. Tracks REAL progress
 * (does the developer have a project / test key / a sandbox payment / a connected
 * gateway) with live completion, CTAs to the right page, and a launcher for the
 * welcome tour. Auto-hides once the core steps are done, or when dismissed.
 */
export default function GettingStarted({ onStartTour }) {
  const { user } = useAuth();
  const [counts, setCounts] = useState(null);
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISS_KEY));

  useEffect(() => {
    if (!user || dismissed) return;
    let active = true;
    (async () => {
      // Note: manishapay_gateway_credentials has service-role-only RLS, so a
      // client query always returns 0 — use the client-readable PayNow creds as
      // the "connected a gateway" signal (the common first case).
      const [proj, keys, txns, gwPaynow] = await Promise.all([
        supabase.from('manishapay_projects').select('id', { count: 'exact', head: true }).eq('developer_id', user.id),
        supabase.from('manishapay_api_keys').select('id', { count: 'exact', head: true }).eq('developer_id', user.id),
        supabase.from('manishapay_transactions').select('id', { count: 'exact', head: true }).eq('developer_id', user.id),
        supabase.from('manishapay_paynow_credentials').select('id', { count: 'exact', head: true }).eq('developer_id', user.id),
      ]);
      if (!active) return;
      setCounts({
        projects: proj.count ?? 0,
        keys: keys.count ?? 0,
        txns: txns.count ?? 0,
        gateways: gwPaynow.count ?? 0,
      });
    })();
    return () => { active = false; };
  }, [user, dismissed]);

  if (dismissed || !counts) return null;

  const steps = [
    { key: 'project', icon: FolderKanban, done: counts.projects > 0,
      title: 'Create your first project', desc: 'A project groups your keys, gateways and transactions.',
      to: '/app/projects', cta: 'New project' },
    { key: 'key', icon: KeyRound, done: counts.keys > 0,
      title: 'Generate a test API key', desc: 'Use an mp_test_… key to authenticate your API calls.',
      to: '/app/keys', cta: 'Create key' },
    { key: 'sandbox', icon: FlaskConical, done: counts.txns > 0,
      title: 'Run a test payment in the Sandbox', desc: 'Send a payment and watch the full lifecycle — no gateway account needed.',
      to: '/app/sandbox', cta: 'Open Sandbox' },
    { key: 'gateway', icon: Plug, done: counts.gateways > 0, optional: true,
      title: 'Connect a payment gateway', desc: 'Add PayNow, Stripe, Paystack and more to take real payments.',
      to: '/app/gateways', cta: 'Connect' },
  ];

  const coreDone = steps.filter((s) => !s.optional).every((s) => s.done);
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
            <p className="text-xs text-slate-400">A few quick steps and you'll be taking test payments in minutes.</p>
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
              {!s.done && (
                <Link to={s.to} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95">
                  {s.cta} <ArrowRight size={12} />
                </Link>
              )}
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
