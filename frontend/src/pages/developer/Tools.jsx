import { useEffect, useState } from 'react';
import { Check, Minus, ShieldCheck } from 'lucide-react';
import Card from '../../components/ui/Card';
import HashFixer from '../../components/tools/HashFixer';
import DecimalNormalizer from '../../components/tools/DecimalNormalizer';
import PhoneFormatter from '../../components/tools/PhoneFormatter';
import ButtonGenerator from '../../components/tools/ButtonGenerator';
import { api } from '../../lib/api';

function Yes() { return <Check size={15} className="text-emerald-400" />; }
function No() { return <Minus size={15} className="text-slate-600" />; }

export default function Tools() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.listProviders()
      .then((r) => { if (active) setProviders(r?.data || []); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const rows = providers.filter((p) => p.status === 'live');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Problem solvers</h1>
        <p className="text-sm text-slate-400">
          ManishaPay normalizes every gateway's quirks for you — signatures, status codes, amount and phone formats.
          Below: what's handled automatically across all gateways, plus hands-on helpers for PayNow (the trickiest one).
        </p>
      </header>

      {/* Dynamic — what ManishaPay handles for EVERY connected gateway. */}
      <Card
        title="Handled automatically — every gateway"
        description="Generated live from the catalog. Whichever gateway you use, ManishaPay gives you one consistent, verified interface.">
        {loading ? (
          <p className="text-sm text-slate-400">Loading gateways…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-400">Couldn't load the gateway catalog.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-2 text-left">Gateway</th>
                  <th className="py-2 text-center">Methods</th>
                  <th className="py-2 text-center">Status normalized</th>
                  <th className="py-2 text-center">Webhook verified</th>
                  <th className="py-2 text-center">Refunds</th>
                  <th className="py-2 text-center">Recurring</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((p) => {
                  const c = p.capabilities || {};
                  return (
                    <tr key={p.id}>
                      <td className="py-2 font-medium text-slate-200">{p.displayName}</td>
                      <td className="py-2 text-center text-slate-300">{(c.methods || []).length}</td>
                      {/* ManishaPay always maps raw → paid|pending|failed|cancelled|refunded */}
                      <td className="py-2"><div className="flex justify-center"><Yes /></div></td>
                      <td className="py-2"><div className="flex justify-center">{c.webhook ? <Yes /> : <No />}</div></td>
                      <td className="py-2"><div className="flex justify-center">{c.refund ? <Yes /> : <No />}</div></td>
                      <td className="py-2"><div className="flex justify-center">{c.recurring ? <Yes /> : <No />}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck size={13} className="text-brand" /> Status is always normalized to one set of values, so your code checks the same field for every gateway.
            </p>
          </div>
        )}
      </Card>

      {/* Hands-on helpers — PayNow-specific (its hash/decimal/phone rules are the
          ones developers hit directly; other gateways are handled server-side). */}
      <div>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-slate-500">PayNow debugging helpers</h2>
        <p className="mb-3 text-xs text-slate-500">Reproduce and fix the PayNow-specific gotchas hands-on — the same logic runs inside the gateway.</p>
        <div className="grid gap-6 xl:grid-cols-2">
          <HashFixer />
          <DecimalNormalizer />
          <PhoneFormatter />
          <ButtonGenerator />
        </div>
      </div>
    </div>
  );
}
