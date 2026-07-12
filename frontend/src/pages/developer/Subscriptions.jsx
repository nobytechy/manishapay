import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Repeat, Plus } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../lib/utils';

export default function Subscriptions() {
  const { user } = useAuth();
  const [subs, setSubs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState({ projectId: '', title: '', amount: '', currency: 'USD', interval: 'monthly', email: '', phone: '' });
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const [{ data: s }, p] = await Promise.all([
      supabase.from('manishapay_subscriptions').select('*').eq('developer_id', user.id).order('created_at', { ascending: false }),
      api.listProjects(),
    ]);
    setSubs(s || []);
    setProjects(p.data || []);
    setForm((f) => ({ ...f, projectId: f.projectId || p.data?.[0]?.id || '' }));
    setLoading(false);
  };
  useEffect(() => { if (user) refresh(); /* eslint-disable-next-line */ }, [user]);

  const create = async () => {
    if (!form.projectId || !form.title.trim() || !form.amount) return toast.error('Project, title and amount are required');
    setCreating(true);
    try {
      await api.createSubscription({
        project_id: form.projectId, title: form.title.trim(), amount: form.amount, currency: form.currency,
        billing_interval: form.interval, customer_email: form.email || undefined, customer_phone: form.phone || undefined,
      });
      setForm((f) => ({ ...f, title: '', amount: '', email: '', phone: '' }));
      toast.success('Subscription created');
      refresh();
    } catch (e) { toast.error(e.message); } finally { setCreating(false); }
  };

  const setStatus = async (sub, status) => {
    const { error } = await supabase.from('manishapay_subscriptions').update({ status }).eq('id', sub.id);
    if (error) toast.error(error.message); else refresh();
  };

  const charge = async (sub) => {
    setBusyId(sub.id);
    try {
      const r = await api.chargeSubscription(sub.id);
      if (r?.data?.browser_url) { window.open(r.data.browser_url, '_blank'); toast.success('Charge started'); }
      refresh();
    } catch (e) { toast.error(e.message); } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand"><Repeat size={18} /></div>
        <div>
          <h1 className="text-2xl font-semibold">Subscriptions</h1>
          <p className="text-sm text-slate-400">Recurring billing. Charge now, or track when each is next due.</p>
        </div>
      </header>

      <Card title="Create a subscription">
        <div className="grid gap-3 md:grid-cols-3">
          <Input label="Title" placeholder="Pro plan" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input label="Amount" placeholder="9.99" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Interval</label>
            <select className="input" value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })}>
              <option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
            </select>
          </div>
          <Input label="Customer email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Customer mobile" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Project</label>
            <select className="input" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end"><Button onClick={create} loading={creating}><Plus size={14} /> Create</Button></div>
      </Card>

      <Card title="Your subscriptions">
        {loading ? <p className="text-sm text-slate-400">Loading…</p> : subs.length === 0 ? <p className="text-sm text-slate-400">No subscriptions yet.</p> : (
          <ul className="divide-y divide-slate-800">
            {subs.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{s.title}</span>
                    <span className="text-sm text-slate-400">{s.currency} {s.amount} / {s.billing_interval}</span>
                    <span className={s.status === 'active' ? 'badge-success' : 'badge-warn'}>{s.status}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{s.customer_email || 'no customer email'} · next: {s.next_charge_at ? formatDate(s.next_charge_at) : '—'}</div>
                </div>
                {s.status === 'active' && <button onClick={() => charge(s)} disabled={busyId === s.id} className="text-xs text-brand hover:underline disabled:opacity-50">{busyId === s.id ? 'Charging…' : 'Charge now'}</button>}
                {s.status === 'active' ? <button onClick={() => setStatus(s, 'paused')} className="text-xs text-amber-400 hover:underline">Pause</button> : s.status === 'paused' ? <button onClick={() => setStatus(s, 'active')} className="text-xs text-brand-400 hover:underline">Resume</button> : null}
                {s.status !== 'cancelled' && <button onClick={() => setStatus(s, 'cancelled')} className="text-xs text-rose-400 hover:underline">Cancel</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
