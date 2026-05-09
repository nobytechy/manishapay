/**
 * /app/sandbox — in-dashboard end-to-end test harness for developers.
 *
 * Lets a developer:
 *   1. Send a fake `/v1/pay` request using their currently-active API key
 *   2. Trigger any of the three simulator outcomes (paid / cancelled / timeout)
 *      directly from this page — no new tab needed
 *   3. See live status updates and a session history of recent tests
 *   4. Copy tracker / browser_url to clipboard for any external SDK testing
 *
 * Replaces the curl-based smoke test described in HANDOFF.md.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Play, ExternalLink, CheckCircle2, XCircle, Clock, Copy, KeyRound, RefreshCw,
} from 'lucide-react';
import { api, getActiveKey } from '../../lib/api';

const API_BASE = import.meta.env.VITE_API_BASE || '';

function autoReference() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `sandbox-${stamp}`;
}

function StatusPill({ status }) {
  const map = {
    pending: { cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30', icon: Clock,        label: 'Pending' },
    paid:    { cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', icon: CheckCircle2, label: 'Paid' },
    cancelled:{ cls: 'bg-rose-500/10 text-rose-300 border-rose-500/30',   icon: XCircle,      label: 'Cancelled' },
    timeout: { cls: 'bg-slate-500/10 text-slate-300 border-slate-500/30', icon: Clock,        label: 'Timeout (no webhook)' },
  };
  const cfg = map[status?.toLowerCase()] || map.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
      <Icon size={12} />
      {cfg.label}
    </span>
  );
}

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1 flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200">
        <span className="flex-1 truncate">{value}</span>
        <button
          onClick={onCopy}
          className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          aria-label="Copy"
          type="button"
        >
          {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

export default function Sandbox() {
  const [reference, setReference] = useState(autoReference());
  const [amount, setAmount] = useState('1.00');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [outcomeBusy, setOutcomeBusy] = useState(null); // 'paid' | 'cancelled' | 'timeout' | null
  const [current, setCurrent] = useState(null); // last created txn
  const [history, setHistory] = useState([]);   // [{ tracker, reference, amount, status, browser_url, mode, createdAt }]

  const activeKey = getActiveKey();

  const sendPayment = async (e) => {
    e?.preventDefault();
    if (!activeKey) {
      toast.error('No active API key. Set one on the API Keys page first.');
      return;
    }
    if (!reference.trim() || !amount.trim()) {
      toast.error('Reference and amount are required.');
      return;
    }
    setCreating(true);
    try {
      const body = { reference: reference.trim(), amount: amount.trim() };
      if (email.trim())   body.email   = email.trim();
      if (phone.trim())   body.phone   = phone.trim();
      const res = await api.pay(body);
      const entry = {
        tracker: res.tracker,
        reference: res.reference || reference.trim(),
        amount: res.amount || amount.trim(),
        browser_url: res.browser_url,
        mode: res.mode,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      setCurrent(entry);
      setHistory((h) => [entry, ...h].slice(0, 8));
      toast.success(`Created — mode: ${res.mode}`);
      // Auto-rotate the reference for the next attempt
      setReference(autoReference());
    } catch (err) {
      // api.js already toasts the error
      // eslint-disable-next-line no-console
      console.error('sandbox /v1/pay error', err);
    } finally {
      setCreating(false);
    }
  };

  const triggerOutcome = async (outcome) => {
    if (!current) return;
    setOutcomeBusy(outcome);
    try {
      const r = await fetch(`${API_BASE}/simulator/${current.tracker}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);

      const newStatus = outcome === 'paid' ? 'paid'
                      : outcome === 'cancelled' ? 'cancelled'
                      : 'timeout';
      setCurrent((c) => c ? { ...c, status: newStatus } : c);
      setHistory((h) => h.map((entry) =>
        entry.tracker === current.tracker ? { ...entry, status: newStatus } : entry,
      ));

      const wd = j.webhooks_dispatched ?? 0;
      const tail = outcome === 'timeout'
        ? ' — no webhook fired (timeout simulates expiry)'
        : wd > 0 ? ` — fired ${wd} webhook(s)` : ' — no webhook endpoints configured';
      toast.success(`✓ ${outcome.charAt(0).toUpperCase() + outcome.slice(1)}${tail}`);
    } catch (err) {
      toast.error(err.message || 'Outcome trigger failed');
    } finally {
      setOutcomeBusy(null);
    }
  };

  const refreshStatus = async () => {
    if (!current) return;
    try {
      const r = await api.status(current.reference);
      const newStatus = (r?.status_normalized || r?.status || 'pending').toLowerCase();
      setCurrent((c) => c ? { ...c, status: newStatus } : c);
      setHistory((h) => h.map((entry) =>
        entry.tracker === current.tracker ? { ...entry, status: newStatus } : entry,
      ));
    } catch {
      /* api.js already toasts */
    }
  };

  if (!activeKey) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-slate-100">Sandbox</h1>
        <p className="mt-2 text-sm text-slate-400">
          Test the entire payment lifecycle without leaving the dashboard.
        </p>
        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-300">
              <KeyRound size={20} />
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-100">No active API key</p>
              <p className="mt-1 text-sm text-slate-400">
                The Sandbox needs an active test key to call <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">/v1/pay</code>. Create one and click <em>"Use as active"</em>.
              </p>
              <Link
                to="/app/keys"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-glow hover:opacity-95"
              >
                Go to API Keys <ExternalLink size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Sandbox</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-400">
            Send a test payment, trigger any outcome, and see status updates — the full lifecycle without curl or a new tab.
          </p>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/50 px-3 py-1.5 text-xs text-slate-400">
          <span className="text-slate-500">Active key</span>{' '}
          <code className="font-mono text-slate-200">{activeKey.slice(0, 12)}…{activeKey.slice(-4)}</code>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* ── Form ───────────────────────────────────────────── */}
        <form onSubmit={sendPayment} className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-brand-300">1 · New test payment</h2>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Reference</label>
              <div className="flex gap-2">
                <input
                  className="input flex-1 font-mono text-sm"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setReference(autoReference())}
                  title="Generate a fresh reference"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-400 hover:border-brand/50 hover:text-brand"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Amount (USD)</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Phone <span className="text-slate-600">(optional)</span></label>
                <input
                  className="input"
                  placeholder="+263 77 111 1111"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Email <span className="text-slate-600">(optional)</span></label>
              <input
                className="input"
                type="email"
                placeholder="customer@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={creating}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Sending…
                </>
              ) : (
                <>
                  <Play size={14} />
                  Send test payment
                </>
              )}
            </button>
          </div>
        </form>

        {/* ── Current transaction + outcome buttons ──────────── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-300">2 · Current transaction</h2>
            {current && (
              <button
                type="button"
                onClick={refreshStatus}
                className="text-xs text-slate-400 hover:text-slate-100"
              >
                <RefreshCw size={12} className="mr-1 inline" /> Refresh
              </button>
            )}
          </div>

          {!current ? (
            <p className="text-sm text-slate-500">
              Send a test payment to see its tracker, browser URL, and outcome buttons here.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <StatusPill status={current.status} />
                <span className="text-xs uppercase tracking-wider text-slate-500">
                  Mode: <span className="font-mono text-slate-300">{current.mode}</span>
                </span>
              </div>

              <CopyField label="Tracker" value={current.tracker} />
              <CopyField label="Reference" value={current.reference} />
              <CopyField label="Browser URL" value={current.browser_url} />

              <div className="grid grid-cols-3 gap-2 pt-2">
                <button
                  type="button"
                  disabled={!!outcomeBusy || current.status !== 'pending'}
                  onClick={() => triggerOutcome('paid')}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {outcomeBusy === 'paid'
                    ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-300/40 border-t-emerald-300" />
                    : <CheckCircle2 size={13} />}
                  Mark Paid
                </button>
                <button
                  type="button"
                  disabled={!!outcomeBusy || current.status !== 'pending'}
                  onClick={() => triggerOutcome('cancelled')}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-300 ring-1 ring-rose-500/30 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {outcomeBusy === 'cancelled'
                    ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-rose-300/40 border-t-rose-300" />
                    : <XCircle size={13} />}
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!!outcomeBusy || current.status !== 'pending'}
                  onClick={() => triggerOutcome('timeout')}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-500/15 px-3 py-2 text-xs font-medium text-slate-300 ring-1 ring-slate-500/30 transition hover:bg-slate-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {outcomeBusy === 'timeout'
                    ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300/40 border-t-slate-300" />
                    : <Clock size={13} />}
                  Timeout
                </button>
              </div>

              <p className="pt-1 text-[11px] text-slate-500">
                Or open the simulator HTML page directly:{' '}
                <a
                  href={current.browser_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-300 hover:underline"
                >
                  open in new tab <ExternalLink size={10} className="inline" />
                </a>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Session history ──────────────────────────────────── */}
      {history.length > 0 && (
        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-brand-300">3 · Recent in this session</h2>
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Reference</th>
                  <th className="px-4 py-2 text-left font-medium">Amount</th>
                  <th className="px-4 py-2 text-left font-medium">Mode</th>
                  <th className="px-4 py-2 text-left font-medium">Tracker</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {history.map((h) => (
                  <tr key={h.tracker} className="hover:bg-slate-900/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-200">{h.reference}</td>
                    <td className="px-4 py-2.5 text-slate-300">${h.amount}</td>
                    <td className="px-4 py-2.5 text-slate-400">{h.mode}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{h.tracker.slice(0, 14)}…</td>
                    <td className="px-4 py-2.5"><StatusPill status={h.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            History is in-memory only — it clears when you reload. Persistent records of every transaction are on the{' '}
            <Link to="/app/transactions" className="text-brand-300 hover:underline">Transactions</Link> page.
          </p>
        </div>
      )}
    </div>
  );
}
