import { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

/* Per-merchant observability — payment success rate, volume, webhook health. */
export default function Health() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    (async () => {
      const cnt = (b) => b.then((r) => r.count || 0);
      const T = () => supabase.from('manishapay_transactions').select('*', { count: 'exact', head: true }).eq('developer_id', user.id);
      const [total, paid, failed, pending, refunded] = await Promise.all([
        cnt(T()),
        cnt(T().eq('status_normalized', 'paid')),
        cnt(T().eq('status_normalized', 'failed')),
        cnt(T().eq('status_normalized', 'pending')),
        cnt(T().eq('status_normalized', 'refunded')),
      ]);
      let whDelivered = 0, whFailed = 0;
      try {
        [whDelivered, whFailed] = await Promise.all([
          cnt(supabase.from('manishapay_webhook_deliveries').select('*', { count: 'exact', head: true }).eq('status', 'delivered')),
          cnt(supabase.from('manishapay_webhook_deliveries').select('*', { count: 'exact', head: true }).eq('status', 'failed')),
        ]);
      } catch { /* deliveries may be RLS-restricted */ }
      if (cancel) return;
      const settled = paid + failed;
      setStats({
        total, paid, failed, pending, refunded,
        successRate: settled > 0 ? Math.round((paid / settled) * 100) : null,
        whDelivered, whFailed,
        whRate: (whDelivered + whFailed) > 0 ? Math.round((whDelivered / (whDelivered + whFailed)) * 100) : null,
      });
    })();
    return () => { cancel = true; };
  }, [user]);

  const tiles = stats ? [
    ['Success rate', stats.successRate == null ? '—' : `${stats.successRate}%`, 'text-brand-400'],
    ['Total payments', stats.total, 'text-slate-100'],
    ['Paid', stats.paid, 'text-brand-400'],
    ['Pending', stats.pending, 'text-amber-400'],
    ['Failed', stats.failed, 'text-rose-400'],
    ['Refunded', stats.refunded, 'text-slate-300'],
  ] : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Health</h1>
        <p className="text-sm text-slate-400">Your payment success rate, volume and webhook delivery health.</p>
      </header>

      {!stats ? (
        <Card><p className="text-sm text-slate-400">Loading…</p></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map(([label, value, color]) => (
              <Card key={label} className="px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
              </Card>
            ))}
          </div>

          <Card title="Webhook delivery health">
            <div className="flex flex-wrap gap-8">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Delivery rate</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-brand-400">{stats.whRate == null ? '—' : `${stats.whRate}%`}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Delivered</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-100">{stats.whDelivered}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Failed</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-rose-400">{stats.whFailed}</p>
              </div>
            </div>
            {stats.whFailed > 0 && (
              <p className="mt-3 text-xs text-amber-400">Some webhook deliveries failed — check your endpoint is reachable and returns 2xx. Failed deliveries retry automatically.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
