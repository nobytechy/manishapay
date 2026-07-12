import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/* Public status page — live health of the ManishaPay API, database and PayNow. */
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export default function Status() {
  const [health, setHealth] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | down

  useEffect(() => {
    let cancel = false;
    fetch(`${API_BASE}/health/deep`)
      .then((r) => r.json())
      .then((d) => { if (!cancel) { setHealth(d); setState('ok'); } })
      .catch(() => { if (!cancel) setState('down'); });
    return () => { cancel = true; };
  }, []);

  const checks = health?.checks || health || {};
  const rows = [
    ['API', state === 'ok'],
    ['Database (Supabase)', pick(checks, ['supabase', 'database', 'db'])],
    ['Schema', pick(checks, ['schema'])],
    ['PayNow reachability', pick(checks, ['paynow'])],
  ];

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-16">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <img src="/logo.png" alt="ManishaPay" className="h-9 w-9 rounded-lg" />
          <span className="text-sm font-semibold text-slate-300">ManishaPay Status</span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-card">
          <div className="mb-5 flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${state === 'ok' ? 'bg-brand' : state === 'down' ? 'bg-rose-500' : 'bg-amber-500'}`} />
            <h1 className="text-lg font-semibold text-slate-100">
              {state === 'ok' ? 'All systems operational' : state === 'down' ? 'We are investigating an issue' : 'Checking…'}
            </h1>
          </div>
          <ul className="divide-y divide-slate-800">
            {rows.map(([label, up]) => (
              <li key={label} className="flex items-center justify-between py-3 text-sm">
                <span className="text-slate-300">{label}</span>
                <span className={up ? 'text-brand-400' : up === false ? 'text-rose-400' : 'text-slate-500'}>
                  {up ? 'Operational' : up === false ? 'Degraded' : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <Link to="/" className="mt-6 block text-center text-xs text-slate-500 hover:text-slate-300">← Back to ManishaPay</Link>
      </div>
    </div>
  );
}

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v === undefined || v === null) continue;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return /ok|up|healthy|connected|reachable|pass/i.test(v);
    if (typeof v === 'object') return pick(v, ['ok', 'status', 'healthy', 'connected']);
  }
  return null;
}
