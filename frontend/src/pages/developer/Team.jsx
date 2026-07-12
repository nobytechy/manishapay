import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Users, Plus } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../lib/utils';

export default function Team() {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('manishapay_team_members')
      .select('*')
      .eq('owner_id', user.id)
      .neq('status', 'removed')
      .order('created_at', { ascending: false });
    setMembers(data || []);
    setLoading(false);
  };
  useEffect(() => { if (user) refresh(); /* eslint-disable-next-line */ }, [user]);

  const invite = async () => {
    if (!email.trim()) return toast.error('Enter an email');
    setBusy(true);
    const { error } = await supabase
      .from('manishapay_team_members')
      .insert({ owner_id: user.id, member_email: email.trim().toLowerCase(), role });
    setBusy(false);
    if (error) toast.error(error.message);
    else { setEmail(''); toast.success('Teammate invited'); refresh(); }
  };

  const remove = async (m) => {
    if (!window.confirm(`Remove ${m.member_email}?`)) return;
    const { error } = await supabase.from('manishapay_team_members').update({ status: 'removed' }).eq('id', m.id);
    if (error) toast.error(error.message); else refresh();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand"><Users size={18} /></div>
        <div>
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-sm text-slate-400">Invite teammates to your account.</p>
        </div>
      </header>

      <Card title="Invite a teammate">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1"><Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" /></div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="member">Member</option><option value="admin">Admin</option>
            </select>
          </div>
          <Button onClick={invite} loading={busy}><Plus size={14} /> Invite</Button>
        </div>
      </Card>

      <Card title="Team members">
        {loading ? <p className="text-sm text-slate-400">Loading…</p> : members.length === 0 ? <p className="text-sm text-slate-400">No teammates yet.</p> : (
          <ul className="divide-y divide-slate-800">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <div className="flex-1">
                  <div className="text-sm text-slate-200">{m.member_email}</div>
                  <div className="text-xs text-slate-500">Invited {formatDate(m.created_at)}</div>
                </div>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase text-slate-300">{m.role}</span>
                <span className={m.status === 'active' ? 'badge-success' : 'badge-warn'}>{m.status}</span>
                <button onClick={() => remove(m)} className="text-xs text-rose-400 hover:underline">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
