import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { ConfirmModal } from '../../components/ui/Modal';
import { api } from '../../lib/api';
import { Lock, ShieldCheck, Plus, Trash2, ExternalLink } from 'lucide-react';
import { formatDate } from '../../lib/utils';

/**
 * PayNow credentials per project per mode.
 *
 * Credentials are encrypted server-side (libsodium envelope encryption)
 * before leaving the dashboard. Plaintext never touches our database in
 * the clear, and the dashboard never reads them back — only the last 4
 * digits of the integration ID are displayed.
 */
export default function Credentials() {
  const [projects, setProjects] = useState([]);
  const [creds, setCreds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  // form state
  const [projectId, setProjectId] = useState('');
  const [mode, setMode] = useState('test');
  const [integrationId, setIntegrationId] = useState('');
  const [integrationKey, setIntegrationKey] = useState('');
  const [merchantEmail, setMerchantEmail] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([api.listProjects(), api.listCredentials()]);
      setProjects(p.data || []);
      setCreds(c.data || []);
      if (!projectId && p.data?.length) setProjectId(p.data[0].id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    if (!projectId) return toast.error('Select a project');
    if (!integrationId || !integrationKey) return toast.error('Both Integration ID and Key are required');
    setSaving(true);
    try {
      await api.saveCredential({
        project_id: projectId,
        mode,
        integration_id: integrationId.trim(),
        integration_key: integrationKey.trim(),
        merchant_email: merchantEmail.trim() || undefined,
      });
      toast.success('Credentials saved (encrypted) — switching to real PayNow mode');
      setIntegrationId('');
      setIntegrationKey('');
      setMerchantEmail('');
      await refresh();
    } catch {
      /* toast already fired */
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id) => {
    try {
      await api.revokeCredential(id);
      toast.success('Credential revoked');
      await refresh();
    } finally {
      setConfirmId(null);
    }
  };

  const projectName = (id) => projects.find((p) => p.id === id)?.name || '—';
  const activeFor = (pid, m) => creds.find((c) => c.project_id === pid && c.mode === m && c.status === 'active');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">PayNow Credentials</h1>
        <p className="text-sm text-slate-400">
          Add your PayNow Integration ID + Key to switch a project from simulated mode to real PayNow.
          Credentials are encrypted with libsodium and never displayed back to the dashboard.
        </p>
      </header>

      <Card title="Add or rotate credentials">
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          <div>
            Get your Integration ID + Key from{' '}
            <a href="https://www.paynow.co.zw/Home/Receive" target="_blank" rel="noopener noreferrer" className="underline">
              PayNow → Receive Payments → Manage Shopping Carts
            </a>{' '}
            <ExternalLink size={11} className="inline -mt-0.5" />.
            Saving a new credential automatically revokes the previous one for this (project, mode) pair.
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Project</label>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              {!projects.length && <option value="">No projects yet — create one first</option>}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Mode</label>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="test">test (PayNow integration in test status)</option>
              <option value="live">live (PayNow integration set to live)</option>
            </select>
          </div>
          <Input
            label="Integration ID"
            placeholder="e.g. 11627"
            value={integrationId}
            onChange={(e) => setIntegrationId(e.target.value)}
          />
          <Input
            label="Integration Key"
            type="password"
            placeholder="e.g. 838c7e4e-d9d5-4fc8-…"
            value={integrationKey}
            onChange={(e) => setIntegrationKey(e.target.value)}
          />
          <div className="md:col-span-2">
            <Input
              label="PayNow-registered email"
              type="email"
              placeholder="the email on your PayNow account"
              value={merchantEmail}
              onChange={(e) => setMerchantEmail(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              Sent to PayNow as <code className="text-slate-400">authemail</code>. Required for mobile
              (EcoCash / OneMoney) payments, and on a <b>test</b> integration it must match your
              PayNow-registered email — we supply it automatically so customer emails are accepted.
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={save} loading={saving}><Plus size={14} /> Save credential</Button>
        </div>
      </Card>

      <Card title="Active credentials">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : creds.filter((c) => c.status === 'active').length === 0 ? (
          <p className="text-sm text-slate-400">
            No active credentials yet. Test API keys will run in <span className="font-mono text-amber-400">simulated</span> mode until you add credentials.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left py-2">Project</th>
                <th className="text-left">Mode</th>
                <th className="text-left">Integration ID</th>
                <th className="text-left">Last used</th>
                <th className="text-left">Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {creds.filter((c) => c.status === 'active').map((c) => (
                <tr key={c.id} className="border-t border-slate-800">
                  <td className="py-2 text-slate-200">{projectName(c.project_id)}</td>
                  <td><span className={c.mode === 'live' ? 'badge-success' : 'badge-warn'}>{c.mode}</span></td>
                  <td className="font-mono text-xs text-slate-400"><Lock size={11} className="mr-1 inline text-slate-500" />****{c.integration_id_last4}</td>
                  <td className="text-slate-400">{formatDate(c.last_used_at)}</td>
                  <td className="text-slate-400">{formatDate(c.created_at)}</td>
                  <td className="text-right">
                    <button onClick={() => setConfirmId(c.id)} className="text-rose-400 hover:text-rose-300"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Coverage status">
        <p className="mb-3 text-sm text-slate-400">
          One row per project — shows whether each (project, mode) pair has credentials configured.
        </p>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="text-left py-2">Project</th><th className="text-left">Test</th><th className="text-left">Live</th></tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const t = activeFor(p.id, 'test');
              const l = activeFor(p.id, 'live');
              return (
                <tr key={p.id} className="border-t border-slate-800">
                  <td className="py-2 text-slate-200">{p.name}</td>
                  <td>{t
                    ? <span className="badge-success">****{t.integration_id_last4}</span>
                    : <span className="text-amber-400 text-xs">simulated</span>}</td>
                  <td>{l
                    ? <span className="badge-success">****{l.integration_id_last4}</span>
                    : <span className="text-rose-400 text-xs">missing — live calls will 400</span>}</td>
                </tr>
              );
            })}
            {!projects.length && (
              <tr><td colSpan="3" className="py-3 text-sm text-slate-400">No projects yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <ConfirmModal
        open={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={() => revoke(confirmId)}
        title="Revoke this credential?"
        message="API calls in this mode will fall back to simulated (test) or fail with CREDENTIALS_REQUIRED (live). Cannot be undone."
        confirmLabel="Revoke"
      />
    </div>
  );
}
