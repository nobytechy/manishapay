import { useState } from 'react';
import toast from 'react-hot-toast';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { api } from '../../lib/api';
import { copyToClipboard } from '../../lib/utils';
import { ClipboardCopy, ShieldCheck, ShieldAlert } from 'lucide-react';

/**
 * Pastes the developer's payload as JSON, recomputes the SHA-512 hash,
 * compares it against what they got back from PayNow, and shows a diff.
 *
 * Solves: HashMismatchException — issue #1.
 */
export default function HashFixer() {
  const [raw, setRaw] = useState('{\n  "id": "12345",\n  "reference": "INV-001",\n  "amount": "2.00"\n}');
  const [received, setReceived] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const fields = JSON.parse(raw);
      const r = await api.hashTool({ fields, received_hash: received || undefined });
      setResult(r.data);
    } catch (err) {
      toast.error(err.message || 'Invalid JSON');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Hash debugger" description="Recompute the SHA-512 PayNow expects and compare it against what you got back.">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-slate-300">Fields (JSON, in PayNow's natural order)</label>
          <textarea
            rows={6}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
          />
        </div>
        <Input label="Received hash (optional)" value={received} onChange={(e) => setReceived(e.target.value)} placeholder="Paste the hash PayNow sent" />
        <Button onClick={run} loading={busy}>Compute</Button>
      </div>

      {result && (
        <div className="mt-6 space-y-3 rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div className="flex items-center gap-2">
            {result.ok === false ? (
              <span className="badge-danger inline-flex items-center gap-1"><ShieldAlert size={12}/> Mismatch</span>
            ) : result.ok ? (
              <span className="badge-success inline-flex items-center gap-1"><ShieldCheck size={12}/> Matches</span>
            ) : (
              <span className="badge-warn">No comparison hash provided</span>
            )}
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span>Expected (computed)</span>
              <button
                type="button"
                onClick={() => { copyToClipboard(result.expected); toast.success('Copied'); }}
                className="inline-flex items-center gap-1 text-brand hover:underline"
              >
                <ClipboardCopy size={12}/> Copy
              </button>
            </div>
            <code className="block break-all rounded bg-slate-900 p-2 font-mono text-[10px] text-emerald-300">{result.expected}</code>
          </div>
          {result.received && (
            <div>
              <div className="mb-1 text-xs text-slate-500">Received</div>
              <code className="block break-all rounded bg-slate-900 p-2 font-mono text-[10px] text-rose-300">{result.received}</code>
            </div>
          )}
          <div>
            <div className="mb-1 text-xs text-slate-500">Concatenation preview</div>
            <code className="block break-all rounded bg-slate-900 p-2 font-mono text-[10px] text-slate-400">{result.concatenation_preview}</code>
          </div>
        </div>
      )}
    </Card>
  );
}
