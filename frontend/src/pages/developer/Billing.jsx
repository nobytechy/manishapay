import { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import { api } from '../../lib/api';

export default function Billing() {
  const [b, setB] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.getBilling().then((r) => setB(r.data)).catch((e) => setErr(e.message || 'Could not load billing'));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Billing &amp; usage</h1>
        <p className="text-sm text-slate-400">
          Free for your first {b?.free_tier ?? 50} successful transactions each month, then ${(b?.per_txn_fee ?? 0.05).toFixed?.(2) || b?.per_txn_fee} per transaction.
        </p>
      </header>

      {err ? (
        <Card><p className="text-sm text-rose-400">{err}</p></Card>
      ) : !b ? (
        <Card><p className="text-sm text-slate-400">Loading…</p></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['This month', b.billable_this_period, 'text-slate-100'],
              ['Free tier', b.free_tier, 'text-slate-300'],
              ['Chargeable', b.overage, 'text-amber-400'],
              ['Amount due', `$${b.amount_due.toFixed(2)}`, 'text-brand-400'],
            ].map(([label, value, color]) => (
              <Card key={label} className="px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
              </Card>
            ))}
          </div>

          <Card title="Invoices">
            {b.invoices.length === 0 ? (
              <p className="text-sm text-slate-400">No invoices yet. Your first invoice is raised once you pass the free tier.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate-500">
                  <tr><th className="py-2 text-left">Period</th><th className="text-left">Billable</th><th className="text-left">Amount</th><th className="text-left">Status</th></tr>
                </thead>
                <tbody>
                  {b.invoices.map((inv, i) => (
                    <tr key={i} className="border-t border-slate-800">
                      <td className="py-2 text-slate-300">{inv.period_start} → {inv.period_end}</td>
                      <td className="text-slate-300">{inv.billable_count}</td>
                      <td className="text-slate-300">{inv.currency} {inv.amount_due}</td>
                      <td><span className={inv.status === 'paid' ? 'badge-success' : inv.status === 'overdue' ? 'badge-danger' : 'badge-warn'}>{inv.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
