import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { ConfirmModal } from '../../components/ui/Modal';
import { api, ensureProject, setActiveKey, getActiveKey, syncActiveKey } from '../../lib/api';
import { KeyRound, Plus, Trash2, ClipboardCopy, CheckCircle2 } from 'lucide-react';
import { copyToClipboard, formatDate } from '../../lib/utils';

/**
 * API key management.
 *
 * The backend mints + bcrypts keys; we only ever see plaintext once on
 * creation. The "active" key (the one the dashboard tools use) is held
 * in localStorage so it never round-trips a request.
 */
export default function ApiKeys() {
  const [keys, setKeys] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState('test');
  const [projectId, setProjectId] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [revealed, setRevealed] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [activePrefix, setActivePrefix] = useState(getActiveKey().slice(0, 12));

  const refresh = async () => {
    setLoading(true);
    try {
      const [k, p] = await Promise.all([api.listKeys(), api.listProjects()]);
      setKeys(k.data || []);
      setProjects(p.data || []);
      if (!projectId && p.data?.length) setProjectId(p.data[0].id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const create = async () => {
    // No project? Make one rather than sending the merchant away to do it.
    let pid = projectId;
    if (!pid) {
      pid = await ensureProject(projects).catch(() => null);
      if (!pid) return toast.error('Could not set up a project for this account.');
      setProjectId(pid);
    }
    setCreating(true);
    try {
      const r = await api.createKey({
        project_id: pid,
        mode,
        label,
        scopes: readOnly ? ['read'] : ['pay', 'read'],
        expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined,
      });
      setRevealed(r.data.key);
      // A new key becomes the active/in-use key (server-side too), so the
      // dashboard tools use it immediately — on this and any other device.
      setActiveKey(r.data.key);
      setActivePrefix(r.data.key.slice(0, 12));
      setLabel('');
      setReadOnly(false);
      setExpiresAt('');
      toast.success('Key created & set as active — copy it now, you won\'t see it again');
      await refresh();
    } catch {
      /* toast already fired */
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id) => {
    try {
      await api.revokeKey(id);
      toast.success('Key revoked');
      await refresh();
    } catch {
      /* rawFetch already surfaced the reason (e.g. KEY_NOT_FOUND on the wrong account) */
    } finally {
      setConfirmId(null);
    }
  };

  // Mark a key active server-side (persists across devices). TEST keys are pulled
  // back automatically; LIVE keys can't be revealed, so we ask for the plaintext.
  const useThis = async (k) => {
    try {
      await api.activateKey(k.id);
      const a = await syncActiveKey(); // fetches + caches the value for test keys
      if (a?.key) {
        setActivePrefix(a.key.slice(0, 12));
        toast.success('Active key set — works on all your devices');
      } else if (k.mode === 'live') {
        const v = prompt('Live keys are never stored. Paste the plaintext key to use it here:');
        if (v && /^mp_live_/.test(v.trim())) {
          setActiveKey(v.trim()); setActivePrefix(v.trim().slice(0, 12));
          toast.success('Active key set (this device)');
        }
      } else {
        toast.success('Marked active');
      }
      await refresh();
    } catch { /* toast already fired */ }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">API Keys</h1>
        <p className="text-sm text-slate-400">
          Your <span className="text-brand">in-use</span> key is remembered on your account, so the dashboard tools work on any device.
          Live keys are shown once — store them like a password.
        </p>
      </header>

      <Card title="Create new key">
        <div className="grid gap-3 md:grid-cols-4">
          <Input label="Label" placeholder="e.g. Production checkout" value={label} onChange={(e)=>setLabel(e.target.value)}/>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Mode</label>
            <select value={mode} onChange={(e)=>setMode(e.target.value)} className="input">
              <option value="test">test</option>
              <option value="live">live</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Project</label>
            <select value={projectId} onChange={(e)=>setProjectId(e.target.value)} className="input">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              {!projects.length && <option value="">Setting one up…</option>}
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={create} loading={creating} className="w-full"><Plus size={14}/> Create key</Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-5 text-sm text-slate-300">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={readOnly} onChange={(e)=>setReadOnly(e.target.checked)} className="h-4 w-4 accent-emerald-500"/>
            Read-only key <span className="text-slate-500">(status / lookups only — no payments)</span>
          </label>
          <label className="flex items-center gap-2">
            Expires
            <input type="date" value={expiresAt} onChange={(e)=>setExpiresAt(e.target.value)} className="input max-w-[170px] py-1"/>
          </label>
        </div>
        {revealed && (
          <div className="mt-4 rounded-lg border border-brand-500/40 bg-brand-500/10 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-400">Copy this — you won't see it again</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-slate-950 p-2 font-mono text-xs text-brand-300">{revealed}</code>
              <button onClick={()=>{copyToClipboard(revealed); toast.success('Copied');}} className="rounded-md p-2 hover:bg-brand-500/20" title="Copy">
                <ClipboardCopy size={14}/>
              </button>
              <button onClick={()=>{setActiveKey(revealed); setActivePrefix(revealed.slice(0,12)); toast.success('Set as active key');}} className="rounded-md bg-brand-500/20 px-3 py-2 text-xs font-medium text-brand-300 hover:bg-brand-500/30">
                Use as active
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card title="Existing keys">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-slate-400">No keys yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="text-left py-2">Label</th><th className="text-left">Prefix</th><th className="text-left">Mode</th><th className="text-left">Status</th><th className="text-left">Last used</th><th></th></tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t border-slate-800">
                  <td className="py-2"><KeyRound size={12} className="mr-2 inline text-brand"/>{k.label || '(no label)'}</td>
                  <td className="font-mono text-xs text-slate-300">{k.prefix}…</td>
                  <td><span className={k.mode === 'live' ? 'badge-success' : 'badge-warn'}>{k.mode}</span></td>
                  <td><span className={k.status === 'active' ? 'badge-success' : 'badge-danger'}>{k.status}</span></td>
                  <td className="text-slate-400">{formatDate(k.last_used_at)}</td>
                  <td className="text-right">
                    {(k.is_active || activePrefix === k.prefix)
                      ? <span className="mr-2 inline-flex items-center gap-1 text-xs font-medium text-brand-400"><CheckCircle2 size={13} /> In use</span>
                      : k.status === 'active' && <button onClick={()=>useThis(k)} className="mr-2 text-xs text-brand hover:underline">Use this</button>}
                    {k.status === 'active' && (
                      <button onClick={()=>setConfirmId(k.id)} className="text-rose-400 hover:text-rose-300" title="Revoke"><Trash2 size={14}/></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <ConfirmModal
        open={!!confirmId}
        onClose={()=>setConfirmId(null)}
        onConfirm={()=>revoke(confirmId)}
        title="Revoke this key?"
        message="Apps using this key will start receiving 401 immediately. This cannot be undone."
        confirmLabel="Revoke"
      />
    </div>
  );
}
