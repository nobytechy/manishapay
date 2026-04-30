import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import WebhookTester from '../../components/tools/WebhookTester';
import { Trash2, Webhook as WebhookIcon } from 'lucide-react';
import { ConfirmModal } from '../../components/ui/Modal';
import { formatDate, statusVariant } from '../../lib/utils';

export default function Webhooks() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const [hooks, projs] = await Promise.all([
      supabase.from('manishapay_webhook_endpoints').select('*').eq('developer_id', user.id).order('created_at', { ascending: false }),
      supabase.from('manishapay_projects').select('id, name').eq('developer_id', user.id),
    ]);
    setItems(hooks.data || []);
    setProjects(projs.data || []);
    if (!project && projs.data?.length) setProject(projs.data[0].id);

    if (hooks.data?.length) {
      const ids = hooks.data.map((h) => h.id);
      const { data: dels } = await supabase
        .from('manishapay_webhook_deliveries')
        .select('id, endpoint_id, status, http_status, latency_ms, created_at')
        .in('endpoint_id', ids)
        .order('created_at', { ascending: false })
        .limit(20);
      setDeliveries(dels || []);
    }
    setLoading(false);
  };

  useEffect(() => { if (user) refresh(); /* eslint-disable-next-line */ }, [user]);

  const add = async () => {
    if (!project || !url) return toast.error('Project and URL required');
    const { error } = await supabase.from('manishapay_webhook_endpoints').insert({
      developer_id: user.id,
      project_id: project,
      url,
      secret: secret || crypto.randomUUID(),
    });
    if (error) return toast.error(error.message);
    setUrl(''); setSecret('');
    toast.success('Endpoint added');
    refresh();
  };

  const remove = async (id) => {
    await supabase.from('manishapay_webhook_endpoints').delete().eq('id', id);
    toast.success('Removed');
    setConfirmId(null);
    refresh();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Webhooks</h1>
        <p className="text-sm text-slate-400">PayNow → ManishaPay → your endpoint(s). Failures retry automatically.</p>
      </header>

      <Card title="Register endpoint">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Project</label>
            <select className="input" value={project} onChange={(e)=>setProject(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <Input label="URL" value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="https://api.your.app/webhooks/manishapay"/>
          <Input label="Secret (optional)" value={secret} onChange={(e)=>setSecret(e.target.value)} placeholder="auto-generated if blank"/>
          <div className="flex items-end"><Button className="w-full" onClick={add}>Add endpoint</Button></div>
        </div>
      </Card>

      <Card title="Active endpoints">
        {loading ? <p className="text-sm text-slate-400">Loading…</p> : items.length === 0 ?
          <p className="text-sm text-slate-400">No endpoints yet.</p> :
          <ul className="divide-y divide-slate-800">
            {items.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10 text-brand"><WebhookIcon size={14}/></div>
                  <div>
                    <p className="font-mono text-sm text-slate-100">{h.url}</p>
                    <p className="text-xs text-slate-500">Created {formatDate(h.created_at)}</p>
                  </div>
                </div>
                <button onClick={()=>setConfirmId(h.id)} className="text-rose-400 hover:text-rose-300"><Trash2 size={14}/></button>
              </li>
            ))}
          </ul>
        }
      </Card>

      <Card title="Recent deliveries">
        {deliveries.length === 0 ? (
          <p className="text-sm text-slate-400">No deliveries yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="text-left py-2">Status</th><th className="text-left">HTTP</th><th className="text-left">Latency</th><th className="text-left">When</th></tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className="border-t border-slate-800">
                  <td className="py-2"><span className={`badge-${statusVariant(d.status)}`}>{d.status}</span></td>
                  <td className="text-slate-300">{d.http_status ?? '—'}</td>
                  <td className="text-slate-300">{d.latency_ms ? `${d.latency_ms}ms` : '—'}</td>
                  <td className="text-slate-400">{formatDate(d.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <WebhookTester />

      <ConfirmModal open={!!confirmId} onClose={()=>setConfirmId(null)} onConfirm={()=>remove(confirmId)} title="Remove endpoint?" message="No future events will be delivered to this URL." confirmLabel="Remove"/>
    </div>
  );
}
