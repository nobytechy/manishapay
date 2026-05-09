import { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import Skeleton from '../../components/ui/Skeleton';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Receipt, KeyRound, Webhook, Activity } from 'lucide-react';
import { formatDate, statusVariant } from '../../lib/utils';

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
  const { user } = useAuth();
  const [counts, setCounts] = useState({ keys: 0, txns: 0, hooks: 0, success: 0 });
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const [keys, txns, hooks, recentTxns] = await Promise.all([
        supabase.from('manishapay_api_keys').select('id', { count: 'exact', head: true }).eq('developer_id', user.id),
        supabase.from('manishapay_transactions').select('status', { count: 'exact' }).eq('developer_id', user.id),
        supabase.from('manishapay_webhook_endpoints').select('id', { count: 'exact', head: true }).eq('developer_id', user.id),
        supabase
          .from('manishapay_transactions')
          .select('id, merchant_reference, merchant_amount, status, created_at')
          .eq('developer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(8),
      ]);
      if (!active) return;
      const total = txns.count ?? 0;
      const paid = (txns.data || []).filter((t) => t.status?.toLowerCase() === 'paid').length;
      setCounts({
        keys: keys.count ?? 0,
        txns: total,
        hooks: hooks.count ?? 0,
        success: total ? Math.round((paid / total) * 100) : 0,
      });
      setRecent(recentTxns.data || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-100">Overview</h1>
        <p className="text-sm text-slate-400">Snapshot of your ManishaPay activity.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={KeyRound} label="API keys" value={counts.keys} loading={loading} />
        <Stat icon={Receipt} label="Transactions" value={counts.txns} loading={loading} />
        <Stat icon={Webhook} label="Webhook endpoints" value={counts.hooks} loading={loading} />
        <Stat icon={Activity} label="Success rate" value={`${counts.success}%`} loading={loading} />
      </div>

      <Card title="Recent transactions">
        {loading ? (
          <div className="space-y-2">
            <Skeleton /><Skeleton /><Skeleton />
          </div>
        ) : recent.length === 0 ? (
          <p className="text-sm text-slate-400">No transactions yet — generate a key and call <code className="text-brand">/v1/pay</code> to see one here.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="text-left py-2">Reference</th><th className="text-left">Amount</th><th className="text-left">Status</th><th className="text-left">When</th></tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id} className="border-t border-slate-800">
                  <td className="py-2 font-mono text-xs text-slate-300">{t.merchant_reference}</td>
                  <td className="text-slate-300">${t.merchant_amount}</td>
                  <td><span className={`badge-${statusVariant(t.status)}`}>{t.status}</span></td>
                  <td className="text-slate-400">{formatDate(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
