import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { FolderKanban, Plus, Trash2 } from 'lucide-react';
import { ConfirmModal } from '../../components/ui/Modal';

// Bound every Supabase call: a stalled request surfaces in 12s with a retry
// path instead of freezing the page.
function bounded(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out — please retry.`)), 12000),
    ),
  ]);
}

export default function Projects() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [returnUrl, setReturnUrl] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const refresh = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await bounded(
        supabase.from('manishapay_projects').select('*').eq('developer_id', user.id).order('created_at', { ascending: false }),
        'Loading projects',
      );
      if (error) throw error;
      setItems(data || []);
    } catch (e) {
      setLoadError(e.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) refresh(); /* eslint-disable-next-line */ }, [user]);

  const create = async () => {
    if (!name) return toast.error('Name is required');
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await bounded(
        supabase.from('manishapay_projects').insert({
          developer_id: user.id,
          name,
          return_url: returnUrl || null,
          result_url: resultUrl || null,
        }),
        'Creating the project',
      );
      if (error) throw error;
      setName(''); setReturnUrl(''); setResultUrl('');
      toast.success('Project created');
      refresh();
    } catch (e) {
      toast.error(e.message || 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    const { error } = await supabase.from('manishapay_projects').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Project deleted'); refresh(); }
    setConfirmId(null);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="text-sm text-slate-400">Each project gets its own keys, webhooks, and transaction history.</p>
      </header>

      <Card title="New project">
        <div className="grid gap-3 md:grid-cols-4">
          <Input label="Name" value={name} onChange={(e)=>setName(e.target.value)}/>
          <Input label="Return URL" value={returnUrl} onChange={(e)=>setReturnUrl(e.target.value)} placeholder="https://your.app/return"/>
          <Input label="Result URL" value={resultUrl} onChange={(e)=>setResultUrl(e.target.value)} placeholder="https://api.your.app/webhook"/>
          <div className="flex items-end"><Button className="w-full" onClick={create} disabled={busy}><Plus size={14}/> {busy ? 'Creating…' : 'Create'}</Button></div>
        </div>
      </Card>

      <Card title="Your projects">
        {loading ? <p className="text-sm text-slate-400">Loading…</p> :
         loadError ? (
           <p className="text-sm text-rose-400">
             {loadError}{' '}
             <button onClick={refresh} className="underline underline-offset-4">Retry</button>
           </p>
         ) :
         items.length === 0 ? <p className="text-sm text-slate-400">No projects yet.</p> :
        <ul className="divide-y divide-slate-800">
          {items.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10 text-brand"><FolderKanban size={14}/></div>
                <div>
                  <p className="font-medium text-slate-100">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.return_url || 'no return url'}</p>
                </div>
              </div>
              <button onClick={()=>setConfirmId(p.id)} className="text-rose-400 hover:text-rose-300"><Trash2 size={14}/></button>
            </li>
          ))}
        </ul>}
      </Card>

      <ConfirmModal open={!!confirmId} onClose={()=>setConfirmId(null)} onConfirm={()=>remove(confirmId)} title="Delete project?" message="All keys, transactions, and webhooks belonging to this project will be deleted." confirmLabel="Delete"/>
    </div>
  );
}
