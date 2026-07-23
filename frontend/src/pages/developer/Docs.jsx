import { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import { Code2, Terminal, BookOpen, ExternalLink, Plug } from 'lucide-react';
import { api } from '../../lib/api';

// Real, published SDKs + the always-available REST option.
const sdks = [
  { name: 'Node.js', pkg: 'npm i manishapay', href: 'https://www.npmjs.com/package/manishapay' },
  { name: 'PHP', pkg: 'composer require manishapay/manishapay', href: 'https://packagist.org/packages/manishapay/manishapay' },
  { name: 'Any language', pkg: 'REST — POST /v1/pay', href: null },
];

export default function Docs() {
  const [providers, setProviders] = useState([]);
  const [loadingP, setLoadingP] = useState(true);

  // Live gateway catalog — the matrix below is generated from this, so a new
  // gateway shows up in the docs automatically. Never hardcode the list.
  useEffect(() => {
    let active = true;
    api.listProviders()
      .then((r) => { if (active) setProviders(r?.data || []); })
      .catch(() => {})
      .finally(() => { if (active) setLoadingP(false); });
    return () => { active = false; };
  }, []);

  const live = providers.filter((p) => p.status === 'live');
  const soon = providers.filter((p) => p.status !== 'live');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Documentation</h1>
        <p className="text-sm text-slate-400">
          One API, many gateways. The same request works across every gateway — you just pick the <code className="text-brand">provider</code>.
        </p>
      </header>

      {/* Live gateways matrix — data-driven from /v1/providers */}
      <Card title="Supported gateways" description="Generated live from the catalog — pass any of these as the provider.">
        {loadingP ? (
          <p className="text-sm text-slate-400">Loading gateways…</p>
        ) : providers.length === 0 ? (
          <p className="text-sm text-slate-400">Couldn't load the gateway catalog.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-2 text-left">Gateway</th>
                  <th className="py-2 text-left"><code>provider</code></th>
                  <th className="py-2 text-left">Region</th>
                  <th className="py-2 text-left">Methods</th>
                  <th className="py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {[...live, ...soon].map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 font-medium text-slate-200">{p.displayName}</td>
                    <td className="py-2"><code className="text-brand">{p.id}</code></td>
                    <td className="py-2 text-slate-400">{p.region || '—'}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {(p.capabilities?.methods || []).map((m) => (
                          <span key={m} className="rounded bg-slate-800/70 px-1.5 py-0.5 text-[10px] text-slate-400">{m}</span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2">
                      {p.status === 'live'
                        ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">Live</span>
                        : <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">Coming soon</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="POST /v1/pay" description="Initiate a payment on any gateway.">
        <pre className="overflow-x-auto rounded bg-slate-950 p-4 font-mono text-xs text-slate-200">
{`curl -X POST $API/v1/pay \\
  -H "Authorization: Bearer mp_test_xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "paynow",          # optional — defaults to paynow
    "reference": "INV-001",
    "amount": "10.00",
    "currency": "USD",
    "email": "buyer@test.com",
    "description": "Pro plan",
    "method": "ecocash",           # a rail the chosen provider serves
    "phone": "+263772123456"
  }'`}
        </pre>
        <p className="mt-3 text-xs text-slate-400">
          Switch gateways by changing <code className="text-brand">provider</code> — the request and response shape stay the same.
          Set <code>provider: "stripe"</code>, <code>"paystack"</code>, <code>"mpesa"</code>, etc. Omit <code>method</code> to use the provider's
          default hosted flow. The response returns a <code>browser_url</code> and a normalized <code>status</code>.
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand/20 bg-brand/5 p-3 text-xs text-slate-300">
          <Plug size={14} className="text-brand" /> Connect a gateway once on the
          {' '}<a href="/app/gateways" className="text-brand underline">Payment Gateways</a> page — then route to it just by naming it here.
        </div>
      </Card>

      <Card title="GET /v1/pay/{reference}/status">
        <pre className="overflow-x-auto rounded bg-slate-950 p-4 font-mono text-xs text-slate-200">
{`curl $API/v1/pay/INV-001/status \\
  -H "Authorization: Bearer mp_test_xxxx"`}
        </pre>
        <p className="mt-2 text-xs text-slate-400">
          Returns a normalized status: <code>paid</code> · <code>pending</code> · <code>failed</code> · <code>cancelled</code> · <code>refunded</code> — the same across every gateway.
        </p>
      </Card>

      <Card title="SDKs" description="Official clients, or call the REST API from anything.">
        <ul className="grid gap-2 md:grid-cols-3">
          {sdks.map((s) => (
            <li key={s.name} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2 font-medium text-slate-200"><Code2 size={14} className="text-brand" />{s.name}</div>
              <code className="mt-1 block text-xs text-slate-400">{s.pkg}</code>
              {s.href && <a href={s.href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-brand hover:underline">View <ExternalLink size={10} /></a>}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Common errors" description="Match against the `code` field in any error response.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="text-left py-2">Code</th><th className="text-left">Meaning</th><th className="text-left">Fix</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <tr><td className="py-2"><code>CREDENTIALS_REQUIRED</code></td><td>The chosen gateway isn't connected for this mode.</td><td>Connect it on the Payment Gateways page.</td></tr>
              <tr><td className="py-2"><code>UPSTREAM_FAILURE</code></td><td>The gateway timed out or errored.</td><td>Retry with backoff; ManishaPay already retries 3×.</td></tr>
              <tr><td className="py-2"><code>RATE_LIMITED</code></td><td>Burst exceeded the per-key cap.</td><td>Back off; bump plan for higher limits.</td></tr>
              <tr><td className="py-2"><code>UNAUTHORIZED</code></td><td>Bearer key wrong/expired.</td><td>Generate a new key on the API Keys page.</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="More resources">
        <ul className="space-y-2 text-sm">
          <li><a className="inline-flex items-center gap-2 text-brand hover:underline" href="/openapi.json" target="_blank" rel="noopener noreferrer"><BookOpen size={14}/> OpenAPI spec <ExternalLink size={12}/></a></li>
          <li><a className="inline-flex items-center gap-2 text-brand hover:underline" href="https://github.com/nobytechy/manishapay/blob/main/docs/API.md" target="_blank" rel="noopener noreferrer"><Terminal size={14}/> Full API reference <ExternalLink size={12}/></a></li>
          <li><a className="inline-flex items-center gap-2 text-brand hover:underline" href="https://github.com/nobytechy/manishapay/blob/main/docs/INTEGRATION.md" target="_blank" rel="noopener noreferrer"><Code2 size={14}/> Integration walkthrough <ExternalLink size={12}/></a></li>
        </ul>
      </Card>
    </div>
  );
}
