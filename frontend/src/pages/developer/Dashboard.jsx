import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Skeleton from '../../components/ui/Skeleton';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Receipt, KeyRound, Activity, Plug } from 'lucide-react';
import { formatDate, statusVariant } from '../../lib/utils';
import ShareReceipt from '../../components/ShareReceipt';
import GettingStarted from '../../components/onboarding/GettingStarted';
import WelcomeTour, { TOUR_SEEN_KEY } from '../../components/onboarding/WelcomeTour';
import Congrats from '../../components/onboarding/Congrats';
import FirstRun, { NextStep } from '../../components/home/FirstRun';

function Stat({ icon: Icon, label, value, loading }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
        <Icon size={16} className="text-brand" />
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-100">
        {loading ? <Skeleton className="h-7 w-16" /> : value}
      </p>
    </div>
  );
}

export default function DeveloperDashboard() {
  const { user, profile } = useAuth();
  const [counts, setCounts] = useState({ keys: 0, txns: 0, methods: 0, live: 0, success: 0 });
  const [reloadKey, setReloadKey] = useState(0);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  // First-run onboarding: celebrate activation, then the tour. 'congrats' -> 'tour' -> null.
  // Auto-runs once per device (TOUR_SEEN_KEY); the tour is replayable from the card.
  const [stage, setStage] = useState(() => (localStorage.getItem(TOUR_SEEN_KEY) ? null : 'congrats'));
  const finishOnboarding = () => { localStorage.setItem(TOUR_SEEN_KEY, '1'); setStage(null); };

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const [keys, txns, gw, recentTxns] = await Promise.all([
        supabase.from('manishapay_api_keys').select('id', { count: 'exact', head: true }).eq('developer_id', user.id),
        supabase.from('manishapay_transactions').select('status', { count: 'exact' }).eq('developer_id', user.id),
        // Through the API — gateway credentials are service-role only.
        api.listGatewayCredentials().catch(() => ({ data: [] })),
        supabase
          .from('manishapay_transactions')
          .select('id, merchant_reference, merchant_amount, currency, status, status_normalized, mode, paynow_reference, created_at')
          .eq('developer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(8),
      ]);
      if (!active) return;
      const total = txns.count ?? 0;
      const paid = (txns.data || []).filter((t) => t.status?.toLowerCase() === 'paid').length;
      const activeGw = (gw.data || []).filter((c) => c.status === 'active');
      setCounts({
        keys: keys.count ?? 0,
        txns: total,
        methods: activeGw.length,
        live: activeGw.filter((c) => c.mode === 'live').length,
        success: total ? Math.round((paid / total) * 100) : 0,
      });
      setRecent(recentTxns.data || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user, reloadKey]);

  // A brand-new account gets ONE thing on screen. Stats of zero, an empty
  // transactions table and a checklist are all noise until there is something
  // to show — and worse, they read as evidence that the product does nothing.
  const isFirstRun = !loading && counts.txns === 0 && counts.methods === 0;

  if (isFirstRun) {
    return (
      <>
        <header className="text-center">
          <h1 className="text-2xl font-semibold text-slate-100">Welcome to ManishaPay</h1>
          <p className="mt-1 text-sm text-slate-400">
            Before anything else, see what a payment looks like here.
          </p>
        </header>
        <FirstRun onPaid={() => setReloadKey((k) => k + 1)} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <Congrats open={stage === 'congrats'} onTour={() => setStage('tour')} onSkip={finishOnboarding} />
      <WelcomeTour open={stage === 'tour'} onClose={finishOnboarding} />

      <header>
        <h1 className="text-2xl font-semibold text-slate-100">Overview</h1>
        <p className="text-sm text-slate-400">Snapshot of your ManishaPay activity.</p>
      </header>

      {/* One next action, never a list of them. Disappears once they're live. */}
      <NextStep hasMethod={counts.methods > 0} hasLive={counts.live > 0} />

      <GettingStarted onStartTour={() => setStage('tour')} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Payments and success rate mean something to a shop owner. Key and
            webhook counts are developer plumbing — they moved to the grouped
            nav with the rest of it. */}
        <Stat icon={Receipt} label="Payments" value={counts.txns} loading={loading} />
        <Stat icon={Activity} label="Success rate" value={`${counts.success}%`} loading={loading} />
        <Stat icon={Plug} label="Payment methods" value={counts.methods} loading={loading} />
        <Stat icon={KeyRound} label="API keys" value={counts.keys} loading={loading} />
      </div>


      <Card title="Recent transactions">
        {loading ? (
          <div className="space-y-2">
            <Skeleton /><Skeleton /><Skeleton />
          </div>
        ) : recent.length === 0 ? (
          <p className="text-sm text-slate-400">
            No payments yet.{' '}
            <Link to="/app/links" className="text-brand hover:underline">Make a payment link</Link>{' '}
            and pay it yourself in test mode — it'll show up here.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="text-left py-2">Reference</th><th className="text-left">Amount</th><th className="text-left">Status</th><th className="text-left">When</th><th /></tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id} className="border-t border-slate-800">
                  <td className="py-2 font-mono text-xs text-slate-300">{t.merchant_reference}</td>
                  <td className="text-slate-300">${t.merchant_amount}</td>
                  <td><span className={`badge-${statusVariant(t.status)}`}>{t.status}</span></td>
                  <td className="text-slate-400">{formatDate(t.created_at)}</td>
                  <td className="text-right">
                    {t.status_normalized === 'paid' && (
                      <ShareReceipt txn={t} businessName={profile?.full_name || null} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
