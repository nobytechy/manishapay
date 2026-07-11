import { useState } from 'react';
import toast from 'react-hot-toast';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';

/**
 * Solves issue #5 — webhook configuration. Posts a fake "payment.updated"
 * event to the developer's URL so they can see what their endpoint receives,
 * including the signature header. Pure frontend (CORS will be exposed by
 * the gateway when run from localhost).
 */
export default function WebhookTester() {
  const [url, setUrl] = useState('https://your-app.example.com/webhooks/manishapay');
  const [reference, setReference] = useState('TEST-001');
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState(null);

  const fire = async () => {
    setBusy(true);
    setResponse(null);
    const payload = {
      event: 'payment.updated',
      data: {
        reference,
        amount: '10.00',
        status: 'Paid',
        mode: 'test',
      },
      timestamp: new Date().toISOString(),
    };
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-ManishaPay-Test': 'true' },
        body: JSON.stringify(payload),
      });
      setResponse({ status: r.status, ok: r.ok, body: await r.text() });
      r.ok ? toast.success('Webhook delivered') : toast.error(`HTTP ${r.status}`);
    } catch (err) {
      setResponse({ status: 0, ok: false, body: err.message });
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Webhook tester" description="Fire a sample event at your endpoint and inspect the response.">
      <div className="space-y-3">
        <Input label="Endpoint URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Input label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        <Button onClick={fire} loading={busy}>Send test event</Button>
      </div>
      {response && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-3">
          <div className="text-xs text-slate-400">Status: <span className={response.ok ? 'text-brand-400' : 'text-rose-400'}>{response.status}</span></div>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-slate-300">{response.body}</pre>
        </div>
      )}
    </Card>
  );
}
