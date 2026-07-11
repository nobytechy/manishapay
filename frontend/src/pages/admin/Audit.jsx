import { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';

export default function AdminAudit() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data, error } = await supabase
        .from('manishapay_admin_audit')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);
      if (cancel) return;
      if (error) {
        setNote('Audit trail not enabled yet — run supabase/admin_audit.sql on the project to switch it on.');
      }
      setItems(data || []);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Audit trail</h1>
        <p className="text-sm text-slate-400">Every privileged admin action, most recent first.</p>
      </header>
      <Card>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : note ? (
          <p className="text-sm text-amber-400">{note}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-400">No admin actions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-2 text-left">When</th>
                  <th className="text-left">Admin</th>
                  <th className="text-left">Action</th>
                  <th className="text-left">Target</th>
                  <th className="text-left">Detail</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="border-t border-slate-800">
                    <td className="py-2 text-slate-400">{formatDate(a.created_at)}</td>
                    <td className="text-slate-300">{a.actor_email || '—'}</td>
                    <td><span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-sky-300">{a.action}</span></td>
                    <td className="text-slate-300">{a.target_email || '—'}</td>
                    <td className="font-mono text-xs text-slate-500">{a.detail ? JSON.stringify(a.detail) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
