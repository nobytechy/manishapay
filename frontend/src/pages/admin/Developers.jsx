import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Card from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { logAdminAction } from '../../lib/audit';
import { useAuth } from '../../context/AuthContext';

const STATUS_FILTERS = ['all', 'pending', 'active', 'suspended', 'deleted'];
const PLANS = ['free', 'pro', 'enterprise'];
const BILLING = ['good', 'warning', 'read_only', 'disabled'];

function statusBadge(status) {
  if (status === 'active') return 'badge-success';
  if (status === 'suspended' || status === 'deleted') return 'badge-danger';
  return 'badge-warn';
}

export default function AdminDevelopers() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('manishapay_developers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  // Single choke-point for every privileged write, so busy-state, error
  // handling, audit logging and refresh stay consistent across all controls.
  const patch = async (dev, changes, successMsg, action) => {
    setBusyId(dev.id);
    const { error } = await supabase.from('manishapay_developers').update(changes).eq('id', dev.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(successMsg);
    logAdminAction({ id: user?.id, email: user?.email }, action, { id: dev.id, email: dev.email }, changes);
    refresh();
  };

  const setStatus = (dev, status) => {
    if (dev.id === user?.id && (status === 'suspended' || status === 'deleted')) {
      toast.error("You can't suspend or delete your own account.");
      return;
    }
    const verb = { suspended: 'Blacklist / suspend', deleted: 'Delete', active: 'Activate' }[status] || status;
    if ((status === 'suspended' || status === 'deleted') &&
        !window.confirm(`${verb} ${dev.email}?`)) return;
    patch(dev, { status }, `${dev.email} → ${status}`, `developer.status.${status}`);
  };

  const setPlan = (dev, plan) => patch(dev, { plan }, `${dev.email} moved to ${plan} plan`, `developer.plan.${plan}`);
  const setBilling = (dev, billing_status) =>
    patch(dev, { billing_status }, `${dev.email} billing → ${billing_status}`, `developer.billing.${billing_status}`);

  const toggleRole = (dev) => {
    if (dev.id === user?.id) { toast.error("You can't change your own role."); return; }
    const next = dev.role === 'admin' ? 'developer' : 'admin';
    const msg = next === 'admin'
      ? `Grant ADMIN (full super-admin access) to ${dev.email}?`
      : `Revoke admin from ${dev.email}?`;
    if (!window.confirm(msg)) return;
    patch(dev, { role: next }, `${dev.email} is now ${next}`, `developer.role.${next}`);
  };

  const stats = useMemo(() => ({
    total: items.length,
    active: items.filter((d) => d.status === 'active').length,
    pending: items.filter((d) => d.status === 'pending').length,
    suspended: items.filter((d) => d.status === 'suspended' || d.status === 'deleted').length,
    admins: items.filter((d) => d.role === 'admin').length,
  }), [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((d) => {
      if (filter !== 'all' && d.status !== filter) return false;
      if (!q) return true;
      return (d.email || '').toLowerCase().includes(q) || (d.full_name || '').toLowerCase().includes(q);
    });
  }, [items, query, filter]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Developers</h1>
        <p className="text-sm text-slate-400">
          Monitor accounts and manage status, plan, billing and admin access.
        </p>
      </header>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ['Total', stats.total, 'text-slate-100'],
          ['Active', stats.active, 'text-brand-400'],
          ['Pending', stats.pending, 'text-amber-400'],
          ['Suspended', stats.suspended, 'text-rose-400'],
          ['Admins', stats.admins, 'text-sky-400'],
        ].map(([label, value, color]) => (
          <Card key={label} className="px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search email or name…"
          className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-brand-500 focus:outline-none"
        />
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                filter === f
                  ? 'bg-brand-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button onClick={refresh} className="ml-auto text-xs text-slate-400 hover:text-slate-200">
          ↻ Refresh
        </button>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-slate-400">No developers match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-2 text-left">Developer</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Plan</th>
                  <th className="text-left">Billing</th>
                  <th className="text-left">Role</th>
                  <th className="text-left">Joined</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => {
                  const isSelf = d.id === user?.id;
                  const busy = busyId === d.id;
                  return (
                    <tr key={d.id} className={`border-t border-slate-800 ${busy ? 'opacity-50' : ''}`}>
                      <td className="py-2">
                        <div className="text-slate-200">
                          {d.email} {isSelf && <span className="text-xs text-sky-400">(you)</span>}
                        </div>
                        <div className="text-xs text-slate-500">{d.full_name || '—'}</div>
                      </td>
                      <td><span className={statusBadge(d.status)}>{d.status}</span></td>
                      <td>
                        <select
                          value={d.plan}
                          disabled={busy}
                          onChange={(e) => setPlan(d, e.target.value)}
                          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs capitalize text-slate-200"
                        >
                          {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          value={d.billing_status}
                          disabled={busy}
                          onChange={(e) => setBilling(d, e.target.value)}
                          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                        >
                          {BILLING.map((b) => <option key={b} value={b}>{b.replace('_', ' ')}</option>)}
                        </select>
                      </td>
                      <td>
                        {d.role === 'admin'
                          ? <span className="badge-success">admin</span>
                          : <span className="text-slate-400">developer</span>}
                      </td>
                      <td className="text-slate-400">{formatDate(d.created_at)}</td>
                      <td className="space-x-2 whitespace-nowrap text-right">
                        {d.status !== 'active' && (
                          <button onClick={() => setStatus(d, 'active')} disabled={busy}
                            className="text-xs text-brand-400 hover:underline">Activate</button>
                        )}
                        {d.status !== 'suspended' && !isSelf && (
                          <button onClick={() => setStatus(d, 'suspended')} disabled={busy}
                            className="text-xs text-amber-400 hover:underline">Blacklist</button>
                        )}
                        {!isSelf && (
                          <button onClick={() => toggleRole(d)} disabled={busy}
                            className="text-xs text-sky-400 hover:underline">
                            {d.role === 'admin' ? 'Revoke admin' : 'Make admin'}
                          </button>
                        )}
                        {!isSelf && (
                          <button onClick={() => setStatus(d, 'deleted')} disabled={busy}
                            className="text-xs text-rose-400 hover:underline">Delete</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
