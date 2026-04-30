import { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';
import { formatDate, statusVariant } from '../../lib/utils';

export default function AdminWebhooks() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('manishapay_webhook_deliveries')
        .select('id, endpoint_id, status, http_status, latency_ms, attempt, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      setItems(data || []);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Webhook monitor</h1>
        <p className="text-sm text-slate-400">Last 100 deliveries across all developers.</p>
      </header>
      <Card>
        {items.length === 0 ? <p className="text-sm text-slate-400">No deliveries.</p> :
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="text-left py-2">Status</th><th className="text-left">HTTP</th><th className="text-left">Attempt</th><th className="text-left">Latency</th><th className="text-left">When</th></tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="border-t border-slate-800">
                  <td className="py-2"><span className={`badge-${statusVariant(d.status)}`}>{d.status}</span></td>
                  <td className="text-slate-300">{d.http_status ?? '—'}</td>
                  <td className="text-slate-300">{d.attempt}</td>
                  <td className="text-slate-300">{d.latency_ms ? `${d.latency_ms}ms` : '—'}</td>
                  <td className="text-slate-400">{formatDate(d.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>}
      </Card>
    </div>
  );
}
