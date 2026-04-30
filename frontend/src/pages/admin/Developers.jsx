import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Card from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';

export default function AdminDevelopers() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase.from('manishapay_developers').select('*').order('created_at', { ascending: false });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const setStatus = async (id, status) => {
    const { error } = await supabase.from('manishapay_developers').update({ status }).eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success(`Marked as ${status}`); refresh(); }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Developers</h1>
        <p className="text-sm text-slate-400">Approve, suspend, or remove developer accounts.</p>
      </header>
      <Card>
        {loading ? <p className="text-sm text-slate-400">Loading…</p> : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="text-left py-2">Email</th><th className="text-left">Name</th><th className="text-left">Status</th><th className="text-left">Plan</th><th className="text-left">Joined</th><th className="text-right">Actions</th></tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="border-t border-slate-800">
                  <td className="py-2 text-slate-200">{d.email}</td>
                  <td className="text-slate-300">{d.full_name || '—'}</td>
                  <td><span className={d.status === 'active' ? 'badge-success' : d.status === 'suspended' ? 'badge-danger' : 'badge-warn'}>{d.status}</span></td>
                  <td className="text-slate-300">{d.plan}</td>
                  <td className="text-slate-400">{formatDate(d.created_at)}</td>
                  <td className="text-right space-x-2">
                    {d.status !== 'active' && <button onClick={() => setStatus(d.id, 'active')} className="text-xs text-emerald-400 hover:underline">Activate</button>}
                    {d.status !== 'suspended' && <button onClick={() => setStatus(d.id, 'suspended')} className="text-xs text-amber-400 hover:underline">Suspend</button>}
                    <button onClick={() => setStatus(d.id, 'deleted')} className="text-xs text-rose-400 hover:underline">Delete</button>
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
