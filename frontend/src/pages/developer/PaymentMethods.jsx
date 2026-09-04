import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowRight, Check, Plus, Search, Trash2, X } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { ConfirmModal } from '../../components/ui/Modal';
import { api } from '../../lib/api';

/**
 * Payment Methods — the ONE place a merchant connects any gateway.
 *
 * Replaces three screens that all did overlapping versions of this job
 * (Gateways, PayNow Credentials, and step 2 of Connect Your App). PayNow is no
 * longer special: it is rendered from its credentialSchema like the other ten,
 * and the backend reads it from the same generic table.
 *
 * Resting state is a list of what's connected plus a single button. Everything
 * else lives inside a wizard: one question per screen, Back / Next / Cancel.
 */

const MODES = [
  { id: 'test', label: 'Testing', sub: 'Practice payments. No real money moves.' },
  { id: 'live', label: 'Real money', sub: 'Customers pay you for real.' },
];

export default function PaymentMethods() {
  const [providers, setProviders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [confirm, setConfirm] = useState(null); // { id, legacy, name }

  const refresh = async () => {
    setLoading(true);
    try {
      const [pv, pr, gw, legacy] = await Promise.all([
        api.listProviders().catch(() => ({ data: [] })),
        api.listProjects().catch(() => ({ data: [] })),
        api.listGatewayCredentials().catch(() => ({ data: [] })),
        api.listCredentials().catch(() => ({ data: [] })),
      ]);
      setProviders(pv.data || []);
      setProjects(pr.data || []);

      // Merge the generic table with credentials saved under the old PayNow-only
      // table, so merchants who connected before this change still see them.
      const generic = (gw.data || [])
        .filter((c) => c.status === 'active')
        .map((c) => ({ ...c, legacy: false }));
      const paynowLegacy = (legacy.data || [])
        .filter((c) => c.status === 'active')
        .map((c) => ({
          id: c.id,
          project_id: c.project_id,
          provider: 'paynow',
          mode: c.mode,
          hint: c.integration_id_last4 ? `••••${c.integration_id_last4}` : null,
          legacy: true,
        }))
        // A generic PayNow row for the same project+mode supersedes the legacy one.
        .filter((l) => !generic.some((g) => g.provider === 'paynow' && g.project_id === l.project_id && g.mode === l.mode));

      setConnections([...generic, ...paynowLegacy]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const nameOf = (id) => providers.find((p) => p.id === id)?.displayName || id;
  const projectName = (id) => projects.find((p) => p.id === id)?.name || '—';

  const remove = async ({ id, legacy }) => {
    try {
      await (legacy ? api.revokeCredential(id) : api.revokeGatewayCredential(id));
      toast.success('Removed');
      await refresh();
    } finally {
      setConfirm(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Payment methods</h1>
        <p className="text-sm text-slate-400">The ways your customers can pay you.</p>
      </header>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : connections.length === 0 ? (
        <div className="grid place-items-center py-16">
          <Button size="lg" onClick={() => setWizardOpen(true)}>
            <Plus size={18} /> Add a payment method
          </Button>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {connections.map((c) => (
              <li
                key={`${c.legacy ? 'l' : 'g'}-${c.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-100">{nameOf(c.provider)}</span>
                    <span className={c.mode === 'live' ? 'badge-success' : 'badge-warn'}>
                      {c.mode === 'live' ? 'Real money' : 'Testing'}
                    </span>
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {projectName(c.project_id)}
                    {c.hint ? ` · ${c.hint}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => setConfirm({ id: c.id, legacy: c.legacy, name: nameOf(c.provider) })}
                  className="shrink-0 p-2 text-slate-500 hover:text-rose-400"
                  aria-label={`Remove ${nameOf(c.provider)}`}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>

          <div className="grid place-items-center">
            <Button size="lg" onClick={() => setWizardOpen(true)}>
              <Plus size={18} /> Add a payment method
            </Button>
          </div>
        </>
      )}

      {wizardOpen && (
        <ConnectWizard
          providers={providers}
          projects={projects}
          onCancel={() => setWizardOpen(false)}
          onDone={async () => { setWizardOpen(false); await refresh(); }}
        />
      )}

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => remove(confirm)}
        title={confirm ? `Remove ${confirm.name}?` : ''}
        message="Customers will not be able to pay through it until you add it again."
        confirmLabel="Remove"
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   The wizard. One question per screen. Back / Next / Cancel — nothing else.
   ──────────────────────────────────────────────────────────────────────────── */

function ConnectWizard({ providers, projects, onCancel, onDone }) {
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState(null);
  const [mode, setMode] = useState(null);
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [ownKeys, setOwnKeys] = useState(false);
  const [values, setValues] = useState({});
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const live = useMemo(() => providers.filter((p) => p.status === 'live'), [providers]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return live;
    return live.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        (p.region || '').toLowerCase().includes(q) ||
        (p.countries || []).some((c) => c.toLowerCase().includes(q)) ||
        (p.capabilities?.methods || []).some((m) => m.replace(/_/g, ' ').includes(q)),
    );
  }, [live, query]);

  // Testing on a gateway with a shared sandbox needs no keys at all — so those
  // screens are not built, rather than built and skipped.
  const sandboxPath = mode === 'test' && provider?.sandboxAvailable && !ownKeys;
  const fields = sandboxPath ? [] : provider?.credentialSchema || [];

  const steps = useMemo(() => {
    const s = ['method', 'mode'];
    if (projects.length > 1) s.push('project');
    if (sandboxPath) s.push('sandbox');
    else fields.forEach((f) => s.push(`field:${f.key}`));
    s.push('review');
    return s;
  }, [projects.length, sandboxPath, fields]);

  const current = steps[Math.min(step, steps.length - 1)];
  const back = () => setStep((s) => Math.max(0, s - 1));
  const next = () => setStep((s) => Math.min(steps.length - 1, s + 1));

  const choose = (setter) => (v) => { setter(v); next(); };

  const fieldFor = (key) => fields.find((f) => f.key === key);
  const canNext = (() => {
    if (current === 'method') return !!provider;
    if (current === 'mode') return !!mode;
    if (current === 'project') return !!projectId;
    if (current?.startsWith('field:')) {
      const f = fieldFor(current.slice(6));
      return !f?.required || !!values[f.key]?.trim();
    }
    return true;
  })();

  const save = async () => {
    setSaving(true);
    try {
      const config = Object.fromEntries(
        Object.entries(values)
          .filter(([, v]) => String(v).trim() !== '')
          .map(([k, v]) => [k, String(v).trim()]),
      );
      await api.saveGatewayCredential({ project_id: projectId, provider: provider.id, mode, config });
      toast.success(`${provider.displayName} added`);
      await onDone();
    } catch {
      /* toast already fired */
    } finally {
      setSaving(false);
    }
  };

  const finish = () => (sandboxPath ? onDone() : save());

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex-1 overflow-y-auto px-5 py-8">
        <div className="mx-auto w-full max-w-md">
          {current === 'method' && (
            <Step question="Which payment method do you want to add?">
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search — EcoCash, card, Stripe, Zimbabwe…"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
              <ul className="mt-3 space-y-2">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => choose(setProvider)(p)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                        provider?.id === p.id
                          ? 'border-brand bg-brand/10'
                          : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                      }`}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/15 text-xs font-bold text-brand">
                        {p.displayName.slice(0, 2)}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium text-slate-100">{p.displayName}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {(p.capabilities?.methods || []).slice(0, 4).map((m) => m.replace(/_/g, ' ')).join(' · ')}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {results.length === 0 && (
                  <li className="py-6 text-center text-sm text-slate-500">Nothing matches that.</li>
                )}
              </ul>
            </Step>
          )}

          {current === 'mode' && (
            <Step question={`What will you use ${provider.displayName} for?`}>
              <ChoiceList
                options={MODES}
                selected={mode}
                onSelect={(id) => { setOwnKeys(false); choose(setMode)(id); }}
              />
            </Step>
          )}

          {current === 'project' && (
            <Step question="Which project is this for?">
              <ChoiceList
                options={projects.map((p) => ({ id: p.id, label: p.name }))}
                selected={projectId}
                onSelect={choose(setProjectId)}
              />
            </Step>
          )}

          {current === 'sandbox' && (
            <Step question="Ready to test.">
              <div className="rounded-xl border border-brand/25 bg-brand/5 p-4">
                <p className="flex items-start gap-2 text-sm text-slate-300">
                  <Check size={16} className="mt-0.5 shrink-0 text-brand" />
                  <span>
                    {provider.displayName} testing runs on our shared practice account, so there is
                    nothing to enter. Take a test payment right away.
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOwnKeys(true)}
                className="mt-3 text-sm text-slate-400 underline hover:text-slate-200"
              >
                Use my own {provider.displayName} keys instead
              </button>
            </Step>
          )}

          {current?.startsWith('field:') && (() => {
            const f = fieldFor(current.slice(6));
            return (
              <Step question={`What is your ${provider.displayName} ${f.label}?`} help={f.help}>
                <Input
                  autoFocus
                  type={f.type === 'password' ? 'password' : 'text'}
                  value={values[f.key] || ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.required ? '' : 'Leave blank to skip'}
                />
              </Step>
            );
          })()}

          {current === 'review' && (
            <Step question="Add this payment method?">
              <dl className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/40 px-4">
                <Row label="Method" value={provider.displayName} />
                <Row label="Used for" value={MODES.find((m) => m.id === mode)?.label} />
                {projects.length > 1 && <Row label="Project" value={projects.find((p) => p.id === projectId)?.name} />}
                {fields
                  .filter((f) => values[f.key]?.trim())
                  .map((f) => (
                    <Row
                      key={f.key}
                      label={f.label}
                      value={f.type === 'password' ? `••••${values[f.key].trim().slice(-4)}` : values[f.key].trim()}
                    />
                  ))}
              </dl>
              {!sandboxPath && (
                <p className="mt-3 text-xs text-slate-500">
                  Your keys are encrypted before they are stored and are never shown again.
                </p>
              )}
            </Step>
          )}
        </div>
      </div>

      {/* Back · Next · Cancel — the only three controls, on every screen. */}
      <div className="border-t border-slate-800 bg-slate-950 px-5 py-4">
        <div className="mx-auto flex w-full max-w-md items-center gap-2">
          <Button variant="ghost" onClick={back} disabled={step === 0}>
            <ArrowLeft size={15} /> Back
          </Button>
          {current === 'review' ? (
            <Button className="flex-1" onClick={finish} loading={saving}>
              <Check size={15} /> Add it
            </Button>
          ) : (
            <Button className="flex-1" onClick={next} disabled={!canNext}>
              Next <ArrowRight size={15} />
            </Button>
          )}
          <Button variant="ghost" onClick={onCancel}>
            <X size={15} /> Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step({ question, help, children }) {
  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-slate-100">{question}</h2>
      {help && <p className="mb-4 text-sm text-slate-400">{help}</p>}
      <div className={help ? '' : 'mt-4'}>{children}</div>
    </div>
  );
}

function ChoiceList({ options, selected, onSelect }) {
  return (
    <ul className="space-y-2">
      {options.map((o) => (
        <li key={o.id}>
          <button
            type="button"
            onClick={() => onSelect(o.id)}
            className={`w-full rounded-xl border p-4 text-left transition ${
              selected === o.id ? 'border-brand bg-brand/10' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
            }`}
          >
            <span className="block font-medium text-slate-100">{o.label}</span>
            {o.sub && <span className="mt-0.5 block text-xs text-slate-500">{o.sub}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="truncate text-sm font-medium text-slate-100">{value}</dd>
    </div>
  );
}
