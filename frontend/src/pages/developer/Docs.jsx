import Card from '../../components/ui/Card';
import { Code2, Terminal, BookOpen, ExternalLink } from 'lucide-react';

const sdks = [
  { name: 'Node.js', file: 'examples/nodejs/example.js' },
  { name: 'PHP', file: 'examples/php/example.php' },
  { name: 'Python', file: 'examples/python/example.py' },
  { name: 'C#', file: 'examples/csharp/Example.cs' },
  { name: 'Java', file: 'examples/java/Example.java' },
  { name: 'Go', file: 'examples/go/example.go' },
];

export default function Docs() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Documentation</h1>
        <p className="text-sm text-slate-400">Quick reference. The full docs live in <code className="text-brand">/docs</code>.</p>
      </header>

      <Card title="POST /v1/pay" description="Initiate a payment.">
        <pre className="overflow-x-auto rounded bg-slate-950 p-4 font-mono text-xs text-slate-200">
{`curl -X POST $API/v1/pay \\
  -H "Authorization: Bearer mp_test_xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "reference": "INV-001",
    "amount": "10.00",
    "email": "buyer@test.com",
    "description": "Pro plan",
    "method": "ecocash",
    "phone": "0772123456"
  }'`}
        </pre>
        <p className="mt-3 text-xs text-slate-400">
          Returns a redirect URL the buyer should be sent to. For Express payments
          (<code>method</code> set), no redirect is needed — the customer is prompted on their phone.
        </p>
      </Card>

      <Card title="GET /v1/pay/{reference}/status">
        <pre className="overflow-x-auto rounded bg-slate-950 p-4 font-mono text-xs text-slate-200">
{`curl $API/v1/pay/INV-001/status \\
  -H "Authorization: Bearer mp_test_xxxx"`}
        </pre>
      </Card>

      <Card title="SDK examples" description="Drop-in scripts in /examples.">
        <ul className="grid gap-2 md:grid-cols-2">
          {sdks.map((s) => (
            <li key={s.name} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm">
              <span className="flex items-center gap-2"><Code2 size={14} className="text-brand"/>{s.name}</span>
              <code className="text-xs text-slate-400">{s.file}</code>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Common errors" description="Match against the `code` field in any error response.">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="text-left py-2">Code</th><th className="text-left">Meaning</th><th className="text-left">Fix</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            <tr><td className="py-2"><code>HASH_MISMATCH</code></td><td>Computed signature differs.</td><td>POST <code>/v1/tools/hash</code> with the same fields.</td></tr>
            <tr><td className="py-2"><code>UPSTREAM_FAILURE</code></td><td>PayNow timed out 3×.</td><td>Retry with exponential backoff or enable mock mode.</td></tr>
            <tr><td className="py-2"><code>RATE_LIMITED</code></td><td>Burst exceeded the per-key cap.</td><td>Back off; bump plan for higher limits.</td></tr>
            <tr><td className="py-2"><code>UNAUTHORIZED</code></td><td>Bearer key wrong/expired.</td><td>Generate a new key on the API Keys page.</td></tr>
          </tbody>
        </table>
      </Card>

      <Card title="More resources">
        <ul className="space-y-2 text-sm">
          <li><a className="inline-flex items-center gap-2 text-brand hover:underline" href="/docs/API.md"><BookOpen size={14}/> Full API reference <ExternalLink size={12}/></a></li>
          <li><a className="inline-flex items-center gap-2 text-brand hover:underline" href="/docs/ERRORS.md"><Terminal size={14}/> Error catalogue <ExternalLink size={12}/></a></li>
          <li><a className="inline-flex items-center gap-2 text-brand hover:underline" href="/docs/INTEGRATION.md"><Code2 size={14}/> Integration walkthrough <ExternalLink size={12}/></a></li>
        </ul>
      </Card>
    </div>
  );
}
