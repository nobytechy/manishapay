import { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';
import { Users, KeyRound, Receipt, AlertCircle } from 'lucide-react';

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
        <Icon size={16} className="text-brand" />
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({ devs: 0, keys: 0, txns: 0, errors: 0 });

  useEffect(() => {
    (async () => {
      const [d, k, t, l] = await Promise.all([
        supabase.from('manishapay_developers').select('id', { count: 'exact', head: true }),
        supabase.from('manishapay_api_keys').select('id', { count: 'exact', head: true }),
        supabase.from('manishapay_transactions').select('id', { count: 'exact', head: true }),
        supabase.from('manishapay_logs').select('id', { count: 'exact', head: true }).eq('level', 'error'),
      ]);
      setStats({
        devs: d.count ?? 0,
        keys: k.count ?? 0,
        txns: t.count ?? 0,
        errors: l.count ?? 0,
      });
    })();
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Admin overview</h1>
        <p className="text-sm text-slate-400">System-wide health and activity.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Users} label="Developers" value={stats.devs} />
        <Stat icon={KeyRound} label="API keys" value={stats.keys} />
        <Stat icon={Receipt} label="Transactions" value={stats.txns} />
        <Stat icon={AlertCircle} label="Error logs" value={stats.errors} />
      </div>

      <Card title="Health checks">
        <ul className="space-y-2 text-sm">
          <li>Gateway: <a href="/health" className="text-brand hover:underline">/health</a></li>
          <li>Deep: <a href="/health/deep" className="text-brand hover:underline">/health/deep</a></li>
          <li>Status page: <a href="https://status.manishapay.dev" className="text-brand hover:underline">status.manishapay.dev</a></li>
        </ul>
      </Card>
    </div>
  );
}
