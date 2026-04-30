import { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';

export default function AdminLogs() {
  const [items, setItems] = useState([]);
  const [level, setLevel] = useState('');

  useEffect(() => {
    let cancel = false;
    (async () => {
      let q = supabase.from('manishapay_logs').select('*').order('created_at', { ascending: false }).limit(200);
      if (level) q = q.eq('level', level);
      const { data } = await q;
      if (!cancel) setItems(data || []);
    })();
    return () => { cancel = true; };
  }, [level]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Logs</h1>
      </header>
      <Card>
        <div className="mb-4 flex gap-2 text-xs">
          {['', 'error', 'warn', 'info', 'debug'].map((l) => (
            <button key={l || 'all'} onClick={() => setLevel(l)} className={`rounded-md px-3 py-1 ${level === l ? 'bg-brand text-slate-950' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
              {l || 'all'}
            </button>
          ))}
        </div>
        {items.length === 0 ? <p className="text-sm text-slate-400">No log entries.</p> : (
          <div className="space-y-1 font-mono text-xs">
            {items.map((l) => (
              <div key={l.id} className="flex gap-3 border-b border-slate-800 py-1">
                <span className="text-slate-500">{formatDate(l.created_at)}</span>
                <span className={l.level === 'error' ? 'text-rose-400' : l.level === 'warn' ? 'text-amber-400' : 'text-slate-400'}>{l.level}</span>
                <span className="text-slate-200">{l.message}</span>
                {l.request_id && <span className="text-slate-600">[{l.request_id}]</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
