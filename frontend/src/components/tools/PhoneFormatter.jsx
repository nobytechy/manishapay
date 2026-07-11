import { useState } from 'react';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { api } from '../../lib/api';
import { CheckCircle2, XCircle } from 'lucide-react';

/**
 * Solves: missing phone prompt for Express payouts (issue #7).
 */
export default function PhoneFormatter() {
  const [phone, setPhone] = useState('0772123456');
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.phoneTool({ phone });
      setOut(r.data);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Phone formatter" description="MSISDN canonicalisation so Ecocash/OneMoney prompt the customer.">
      <div className="flex gap-2">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+263 77 212 3456" />
        <Button onClick={run} loading={busy}>Format</Button>
      </div>
      {out && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          {out.valid ? (
            <CheckCircle2 size={16} className="text-brand-400" />
          ) : (
            <XCircle size={16} className="text-rose-400" />
          )}
          <code className="font-mono text-slate-300">{out.msisdn}</code>
          <span className="text-xs text-slate-500">({out.valid ? 'Valid' : 'Invalid'})</span>
        </div>
      )}
    </Card>
  );
}
