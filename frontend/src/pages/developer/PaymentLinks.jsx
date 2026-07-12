import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link2, Copy, Plus, ExternalLink } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

/*
 * No-code payment links. A merchant creates a link (title + amount), gets a
 * shareable URL (/pay/<slug>), and anyone can pay it — zero code, no website.
 */
export default function PaymentLinks() {
  const { user } = useAuth();
  const [links, setLinks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [creating, setCreating] = useState(false);

  const origin = window.location.origin;

  const refresh = async () => {
    setLoading(true);
    const [{ data: l }, p] = await Promise.all([
      supabase.from('manishapay_payment_links').select('*').eq('developer_id', user.id).order('created_at', { ascending: false }),
      api.listProjects(),
    ]);
    setLinks(l || []);
    setProjects(p.data || []);
    if (!projectId && p.data?.length) setProjectId(p.data[0].id);
    setLoading(false);
  };
  useEffect(() => { if (user) refresh(); /* eslint-disable-next-line */ }, [user]);

  const create = async () => {
    if (!projectId) return toast.error('Create a project first');
    if (!title.trim() || !amount) return toast.error('Title and amount are required');
    setCreating(true);
    try {
      await api.createLink({ project_id: projectId, title: title.trim(), amount, currency });
      setTitle(''); setAmount('');
      toast.success('Payment link created');
      refresh();
    } catch (e) {
      toast.error(e.message || 'Could not create link');
    } finally {
      setCreating(false);
    }
  };

  const copy = (slug) => {
    navigator.clipboard?.writeText(`${origin}/pay/${slug}`).then(() => toast.success('Link copied'));
  };

  const toggle = async (link) => {
    const { error } = await supabase.from('manishapay_payment_links').update({ active: !link.active }).eq('id', link.id);
    if (error) toast.error(error.message); else refresh();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand"><Link2 size={18} /></div>
        <div>
          <h1 className="text-2xl font-semibold">Payment Links</h1>
          <p className="text-sm text-slate-400">Get paid with no code and no website — just share a link.</p>
        </div>
      </header>

      <Card title="Create a payment link">
        <div className="grid gap-3 md:grid-cols-4">
          <Input label="What's it for?" placeholder="e.g. Consulting session" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input label="Amount" placeholder="10.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Currency</label>
            <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD</option>
              <option value="ZWL">ZWL</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Project</label>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              {!projects.length && <option value="">No projects yet</option>}
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={create} loading={creating}><Plus size={14} /> Create link</Button>
        </div>
      </Card>

      <Card title="Your links">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-slate-400">No payment links yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{l.title}</span>
                    <span className="text-sm text-slate-400">{l.currency} {l.amount}</span>
                    {!l.active && <span className="badge-warn">disabled</span>}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-xs text-slate-500">{origin}/pay/{l.slug}</div>
                </div>
                <button onClick={() => copy(l.slug)} className="inline-flex items-center gap-1 text-xs text-brand hover:underline"><Copy size={13} /> Copy</button>
                <a href={`/pay/${l.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"><ExternalLink size={13} /> Open</a>
                <button onClick={() => toggle(l)} className="text-xs text-slate-400 hover:text-slate-200">{l.active ? 'Disable' : 'Enable'}</button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
