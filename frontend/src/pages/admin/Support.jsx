import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Card from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const FILTERS = ['all', ...STATUSES];

function statusPill(s) {
  if (s === 'resolved' || s === 'closed') return 'badge-success';
  if (s === 'in_progress') return 'badge-warn';
  return 'badge-danger';
}

export default function AdminSupport() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('all');
  const [drafts, setDrafts] = useState({}); // ticketId -> reply text
  const [busyId, setBusyId] = useState(null);

  const refresh = async () => {
    const { data, error } = await supabase
      .from('manishapay_support_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) setNote('Support table not found — run the support migration on the project.');
    setTickets(data || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const update = async (id, changes, msg) => {
    setBusyId(id);
    const { error } = await supabase.from('manishapay_support_tickets').update(changes).eq('id', id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(msg);
    refresh();
  };

  const reply = (t) => {
    const text = (drafts[t.id] || '').trim();
    if (!text) { toast.error('Write a reply first'); return; }
    update(t.id, { admin_response: text, status: t.status === 'open' ? 'in_progress' : t.status }, 'Reply saved');
  };

  const visible = useMemo(
    () => tickets.filter((t) => filter === 'all' || t.status === filter),
    [tickets, filter],
  );

  const openCount = tickets.filter((t) => t.status === 'open').length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Support / Queries</h1>
        <p className="text-sm text-slate-400">
          Developer issues and questions. {openCount > 0 && <span className="text-rose-400">{openCount} open.</span>}
        </p>
      </header>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
              filter === f ? 'bg-brand text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : note ? (
          <p className="text-sm text-amber-400">{note}</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-slate-400">No queries.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {visible.map((t) => (
              <li key={t.id} className={`space-y-3 py-4 ${busyId === t.id ? 'opacity-50' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={statusPill(t.status)}>{t.status.replace('_', ' ')}</span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">{t.category}</span>
                  <span className="text-sm font-medium text-slate-200">{t.subject}</span>
                  <span className="ml-auto text-xs text-slate-500">{t.developer_email} · {formatDate(t.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-400">{t.message}</p>

                <textarea
                  className="input min-h-[70px] text-sm"
                  placeholder="Write a reply to the developer…"
                  value={drafts[t.id] ?? t.admin_response ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => reply(t)} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-brand-400">Send reply</button>
                  {STATUSES.filter((s) => s !== t.status).map((s) => (
                    <button
                      key={s}
                      onClick={() => update(t.id, { status: s }, `Marked ${s.replace('_', ' ')}`)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs capitalize text-slate-300 hover:bg-slate-800"
                    >
                      {s.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
