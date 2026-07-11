import { useState } from 'react';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { api } from '../../lib/api';

/**
 * Solves: System.FormatException with '2.00' decimals (issue #3).
 * Run any value through the same normalizer the gateway uses.
 */
export default function DecimalNormalizer() {
  const [val, setVal] = useState('2.00');
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.decimalTool({ amount: val });
      setOut(r.data);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Decimal normalizer" description="Converts '2.00', '2,50', or 2 into the invariant 0.00 format PayNow accepts.">
      <div className="flex gap-2">
        <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="2.00" />
        <Button onClick={run} loading={busy}>Normalize</Button>
      </div>
      {out && (
        <p className="mt-4 text-sm">
          <span className="text-slate-400">Input:</span> <code className="text-slate-300">{out.input}</code>
          <span className="mx-2 text-slate-500">→</span>
          <span className="text-slate-400">Normalized:</span> <code className="font-mono text-brand-300">{out.normalized}</code>
        </p>
      )}
    </Card>
  );
}
