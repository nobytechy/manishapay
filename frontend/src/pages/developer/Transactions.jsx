import { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatDate, statusVariant } from '../../lib/utils';
import { Search } from 'lucide-react';

export default function Transactions() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      let query = supabase
        .from('manishapay_transactions')
        .select('tracker, merchant_reference, paynow_reference, merchant_amount, status, status_normalized, mode, method, created_at')
        .eq('developer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (status) query = query.eq('status', status);
      if (q) query = query.ilike('merchant_reference', `%${q}%`);
      const { data } = await query;
      if (!cancel) { setItems(data || []); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [user, q, status]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <p className="text-sm text-slate-400">Live and test transactions from the last 100 events.</p>
      </header>

      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
            <Input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search by reference" className="pl-9"/>
          </div>
          <select className="input max-w-[180px]" value={status} onChange={(e)=>setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="Sent">Sent</option>
            <option value="Paid">Paid</option>
            <option value="Awaiting Delivery">Awaiting Delivery</option>
            <option value="Cancelled">Cancelled</option>
            <option value="Refunded">Refunded</option>
          </select>
        </div>

        {loading ? <p className="text-sm text-slate-400">Loading…</p> :
          items.length === 0 ? <p className="text-sm text-slate-400">No transactions match.</p> :
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="text-left py-2">Reference</th><th className="text-left">PayNow ref</th><th className="text-left">Amount</th><th className="text-left">Mode</th><th className="text-left">Status</th><th className="text-left">When</th></tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.tracker} className="border-t border-slate-800">
                  <td className="py-2 font-mono text-xs text-slate-300">{t.merchant_reference}</td>
                  <td className="font-mono text-xs text-slate-400">{t.paynow_reference || '—'}</td>
                  <td className="text-slate-300">${t.merchant_amount}</td>
                  <td><span className={t.mode === 'live' ? 'badge-success' : t.mode === 'simulated' ? 'badge-warn' : 'badge-warn'}>{t.mode}</span></td>
                  <td><span className={`badge-${statusVariant(t.status)}`}>{t.status}</span></td>
                  <td className="text-slate-400">{formatDate(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>}
      </Card>
    </div>
  );
}
