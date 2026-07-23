import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal, { ConfirmModal } from '../../components/ui/Modal';
import { api } from '../../lib/api';
import { Check, Lock, Plug, Trash2 } from 'lucide-react';

/**
 * Payment Gateways — connect the gateways you want, once. One ManishaPay API
 * then covers every rail behind them. The whole page is data-driven from
 * /v1/providers, so a new gateway appears here automatically. Each gateway's
 * connect form is rendered from its own credentialSchema.
 */
export default function Gateways() {
  const [providers, setProviders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [creds, setCreds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState('');
  const [mode, setMode] = useState('test');
  const [connecting, setConnecting] = useState(null); // provider object being connected
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [pv, pr, cr] = await Promise.all([
        api.listProviders().catch(() => ({ data: [] })),
        api.listProjects().catch(() => ({ data: [] })),
        api.listGatewayCredentials().catch(() => ({ data: [] })),
      ]);
      setProviders(pv.data || []);
      setProjects(pr.data || []);
      setCreds(cr.data || []);
      if (!projectId && pr.data?.length) setProjectId(pr.data[0].id);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const connectedFor = (providerId) =>
    creds.find((c) => c.provider === providerId && c.project_id === projectId && c.mode === mode && c.status === 'active');

  const openConnect = (p) => {
    setConnecting(p);
    setForm(Object.fromEntries((p.credentialSchema || []).map((f) => [f.key, ''])));
  };

  const save = async () => {
    if (!projectId) return toast.error('Create a project first');
    const missing = (connecting.credentialSchema || []).filter((f) => f.required && !form[f.key]?.trim());
    if (missing.length) return toast.error(`Required: ${missing.map((f) => f.label).join(', ')}`);
    setSaving(true);
    try {
      const config = Object.fromEntries(
        Object.entries(form).filter(([, v]) => String(v).trim() !== '').map(([k, v]) => [k, String(v).trim()]),
      );
      await api.saveGatewayCredential({ project_id: projectId, provider: connecting.id, mode, config });
      toast.success(`${connecting.displayName} connected (${mode})`);
      setConnecting(null);
      await refresh();
    } catch { /* toast fired */ } finally { setSaving(false); }
  };

  const disconnect = async (id) => {
    try { await api.revokeGatewayCredential(id); toast.success('Disconnected'); await refresh(); }
    finally { setConfirmId(null); }
  };

  const live = useMemo(() => providers.filter((p) => p.status === 'live'), [providers]);
  const soon = useMemo(() => providers.filter((p) => p.status !== 'live'), [providers]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Payment Gateways</h1>
        <p className="text-sm text-slate-400">
          Connect the gateways you want — once each. Then ManishaPay's single API takes payments across all of them.
          You only ever enter each gateway's keys here; your code never changes.
        </p>
      </header>

      {/* Project + mode context */}
      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Project</label>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              {!projects.length && <option value="">No projects yet — create one first</option>}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Mode</label>
            <div className="flex gap-2">
              {['test', 'live'].map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize transition ${
                    mode === m ? 'border-brand bg-brand/10 text-brand' : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Shared-sandbox note — only in test mode. */}
      {mode === 'test' && (
        <div className="flex items-start gap-2 rounded-lg border border-brand/20 bg-brand/5 p-3 text-xs text-slate-300">
          <Check size={14} className="mt-0.5 shrink-0 text-brand" />
          <span>
            <span className="font-semibold text-slate-100">Test mode — no setup needed.</span> Gateways marked
            {' '}<span className="font-semibold text-brand">Test-ready</span> run on ManishaPay's shared sandbox, so you can test
            payments and payment links right away. Prefer your own test account? <span className="font-semibold">Use my own keys</span> on any
            gateway — optional in test, required to go <span className="font-semibold">live</span>.
          </span>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading gateways…</p>
      ) : providers.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400">Couldn't load the gateway catalog.{' '}
            <button onClick={refresh} className="text-brand underline">Retry</button>.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((p) => {
              const conn = connectedFor(p.id);
              return (
                <GatewayCard key={p.id} p={p} connected={conn} mode={mode}
                  onConnect={() => openConnect(p)}
                  onDisconnect={conn ? () => setConfirmId(conn.id) : null}
                  isPaynow={p.id === 'paynow'} />
              );
            })}
          </div>

          {soon.length > 0 && (
            <div>
              <h2 className="mb-3 mt-2 text-sm font-semibold uppercase tracking-wider text-slate-500">Coming soon</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {soon.map((p) => <GatewayCard key={p.id} p={p} comingSoon />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Connect form — a focused modal so it's instantly visible regardless of
          how many gateways are listed (no scrolling to a form at the bottom). */}
      <Modal
        open={!!connecting}
        onClose={() => setConnecting(null)}
        title={connecting ? `Connect ${connecting.displayName}` : ''}
        description={connecting ? `${mode} mode · enter this gateway's keys` : ''}
        actions={connecting && connecting.id !== 'paynow' ? (
          <>
            <Button variant="ghost" onClick={() => setConnecting(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}><Plug size={14} /> {connectedFor(connecting.id) ? 'Update' : 'Connect'}</Button>
          </>
        ) : null}
      >
        {connecting && (connecting.id === 'paynow' ? (
          <p className="text-sm text-slate-400">
            PayNow is managed on the <Link to="/app/credentials" className="text-brand underline">Credentials</Link> page.
          </p>
        ) : (
          <div className="space-y-3">
            {(connecting.credentialSchema || []).map((f) => (
              <div key={f.key}>
                <Input
                  label={f.label + (f.required ? '' : ' (optional)')}
                  type={f.type === 'password' ? 'password' : 'text'}
                  value={form[f.key] || ''}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                />
                {f.help && <p className="mt-1 text-xs text-slate-500">{f.help}</p>}
              </div>
            ))}
            <p className="text-xs text-slate-500">Keys are encrypted server-side and never shown back to the dashboard.</p>
          </div>
        ))}
      </Modal>

      <ConfirmModal
        open={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={() => disconnect(confirmId)}
        title="Disconnect this gateway?"
        message="Payments through this gateway will stop until you reconnect it. This cannot be undone."
        confirmLabel="Disconnect"
      />
    </div>
  );
}

function GatewayCard({ p, connected, comingSoon, mode, onConnect, onDisconnect, isPaynow }) {
  // Test-ready when the server has shared sandbox creds for this gateway (or it's
  // PayNow, which always has the built-in simulator). Only relevant in test mode.
  const testReady = mode === 'test' && (p.sandboxAvailable || isPaynow);
  return (
    <div className={`rounded-xl border p-4 ${comingSoon ? 'border-slate-800 bg-slate-900/30 opacity-70' : 'border-slate-800 bg-slate-900/40'}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand/15 text-sm font-bold text-brand">
            {p.displayName.slice(0, 2)}
          </div>
          <div>
            <div className="font-semibold text-slate-100">{p.displayName}</div>
            <div className="text-xs text-slate-500">{p.region}</div>
          </div>
        </div>
        {comingSoon
          ? <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">Coming soon</span>
          : connected
            ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400"><Check size={10} /> Connected</span>
            : testReady
              ? <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold text-brand"><Check size={10} /> Test-ready</span>
              : <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">Connect for test</span>}
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {(p.capabilities?.methods || []).slice(0, 6).map((m) => (
          <span key={m} className="rounded bg-slate-800/70 px-1.5 py-0.5 text-[10px] text-slate-400">{m}</span>
        ))}
      </div>

      {!comingSoon && (
        <div className="mt-4 flex items-center justify-between">
          {connected
            ? <span className="font-mono text-xs text-slate-500"><Lock size={11} className="mr-1 inline" />{connected.hint || 'configured'}</span>
            : testReady
              ? <span className="text-xs text-brand">Shared sandbox — no keys needed to test</span>
              : <span className="text-xs text-slate-500">{isPaynow ? 'Managed on Credentials' : 'Not connected'}</span>}
          <div className="flex gap-2">
            {onDisconnect && (
              <button onClick={onDisconnect} className="text-rose-400 hover:text-rose-300" title="Disconnect"><Trash2 size={14} /></button>
            )}
            {isPaynow
              ? <Link to="/app/credentials" className="text-xs font-semibold text-brand underline">Manage</Link>
              : <Button variant="ghost" onClick={onConnect}>{connected ? 'Update keys' : (testReady ? 'Use my own keys' : 'Connect')}</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
