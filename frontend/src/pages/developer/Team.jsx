import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Users, Plus } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/utils';

const ROLES = ['admin', 'member', 'viewer'];
const ROLE_INFO = {
  admin: 'Full access — projects, keys, credentials, payments & refunds, team & billing.',
  member: 'Build — view everything, take payments, manage projects & keys. No team or billing.',
  viewer: 'Read-only — can view data, cannot make changes.',
};

export default function Team() {
  const [members, setMembers] = useState([]);
  const [yourRole, setYourRole] = useState('owner');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const canManage = yourRole === 'owner' || yourRole === 'admin';

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api.listTeam();
      setMembers(r.data || []);
      setYourRole(r.meta?.your_role || 'owner');
    } catch (e) {
      toast.error(e.message || 'Could not load team');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const invite = async () => {
    if (!email.trim()) return toast.error('Enter an email');
    setBusy(true);
    try {
      await api.inviteTeam({ member_email: email.trim().toLowerCase(), role });
      setEmail('');
      toast.success('Teammate invited');
      refresh();
    } catch (e) {
      toast.error(e.message || 'Invite failed');
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (m, newRole) => {
    try {
      await api.setTeamRole(m.id, newRole);
      toast.success(`${m.member_email} is now ${newRole}`);
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async (m) => {
    if (!window.confirm(`Remove ${m.member_email}?`)) return;
    try {
      await api.removeTeam(m.id);
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand"><Users size={18} /></div>
        <div>
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-sm text-slate-400">Invite teammates and control what each can do. Your role: <span className="text-slate-200">{yourRole}</span>.</p>
        </div>
      </header>

      <Card title="Roles">
        <ul className="space-y-1.5 text-sm">
          {ROLES.map((r) => (
            <li key={r}><span className="font-semibold capitalize text-slate-200">{r}</span> <span className="text-slate-400">— {ROLE_INFO[r]}</span></li>
          ))}
        </ul>
      </Card>

      {canManage && (
        <Card title="Invite a teammate">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1"><Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" /></div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Role</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
              </select>
            </div>
            <Button onClick={invite} loading={busy}><Plus size={14} /> Invite</Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">They accept automatically the first time they sign in with this email.</p>
        </Card>
      )}

      <Card title="Team members">
        {loading ? <p className="text-sm text-slate-400">Loading…</p> : members.length === 0 ? <p className="text-sm text-slate-400">No teammates yet.</p> : (
          <ul className="divide-y divide-slate-800">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-200">{m.member_email}</div>
                  <div className="text-xs text-slate-500">Invited {formatDate(m.created_at)}</div>
                </div>
                <span className={m.status === 'active' ? 'badge-success' : 'badge-warn'}>{m.status}</span>
                {canManage ? (
                  <select value={m.role} onChange={(e) => changeRole(m, e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs capitalize text-slate-200">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                ) : (
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase text-slate-300">{m.role}</span>
                )}
                {canManage && <button onClick={() => remove(m)} className="text-xs text-rose-400 hover:underline">Remove</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
