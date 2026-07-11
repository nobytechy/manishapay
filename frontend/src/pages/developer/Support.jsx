import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { LifeBuoy } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

const CATEGORIES = [
  ['paynow', 'PayNow / integration'],
  ['billing', 'Billing'],
  ['bug', 'Bug / error'],
  ['account', 'Account'],
  ['other', 'Something else'],
];

function statusPill(s) {
  if (s === 'resolved' || s === 'closed') return 'badge-success';
  if (s === 'in_progress') return 'badge-warn';
  return 'badge-danger';
}

export default function Support() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('paynow');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async () => {
    const { data, error } = await supabase
      .from('manishapay_support_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) setNote('Support isn’t switched on yet — an admin needs to run the support migration.');
    setTickets(data || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) { toast.error('Add a subject and a message'); return; }
    setBusy(true);
    const { error } = await supabase.from('manishapay_support_tickets').insert({
      developer_id: user?.id,
      developer_email: user?.email,
      category,
      subject: subject.trim(),
      message: message.trim(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Sent to support — we’ll get back to you.');
    setSubject(''); setMessage(''); setCategory('paynow');
    refresh();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand"><LifeBuoy size={18} /></div>
        <div>
          <h1 className="text-2xl font-semibold">Support</h1>
          <p className="text-sm text-slate-400">Stuck on an integration or hit a bug? Send it straight to the team.</p>
        </div>
      </header>

      <Card title="Raise a query">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Topic</label>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <Input label="Subject" placeholder="Short summary" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Message</label>
            <textarea
              className="input min-h-[120px]"
              placeholder="What are you trying to do, and what happened? Include any error text."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={busy}>Send to support</Button>
          </div>
        </form>
      </Card>

      <Card title="Your queries">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : note ? (
          <p className="text-sm text-amber-400">{note}</p>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-slate-400">No queries yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {tickets.map((t) => (
              <li key={t.id} className="py-3">
                <div className="flex items-center gap-2">
                  <span className={statusPill(t.status)}>{t.status.replace('_', ' ')}</span>
                  <span className="text-sm font-medium text-slate-200">{t.subject}</span>
                  <span className="ml-auto text-xs text-slate-500">{formatDate(t.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-400">{t.message}</p>
                {t.admin_response && (
                  <div className="mt-2 rounded-lg border border-brand/25 bg-brand/5 p-3 text-sm text-slate-200">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand">Reply from support</span>
                    {t.admin_response}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
