import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { ClipboardCopy } from 'lucide-react';
import { copyToClipboard } from '../../lib/utils';

/**
 * Visual button generator — solves issue #10 ("button generator for quick implementation").
 * Spits out an HTML snippet, a WordPress shortcode, and a React JSX block, all
 * ready to paste.
 */
export default function ButtonGenerator() {
  const [label, setLabel] = useState('Pay $10');
  const [amount, setAmount] = useState('10.00');
  const [description, setDescription] = useState('Pro plan upgrade');
  const [color, setColor] = useState('#10b981');

  const html = useMemo(
    () => `<button
  type="button"
  data-manishapay
  data-amount="${amount}"
  data-description="${description}"
  style="background:${color};color:#0b1220;padding:10px 16px;border:0;border-radius:8px;font-weight:600;cursor:pointer;"
>${label}</button>
<script src="https://cdn.manishapay.dev/v1/button.js" defer></script>`,
    [label, amount, description, color]
  );

  const shortcode = `[paynow_bridge_button amount="${amount}" description="${description}" label="${label}"]`;

  const jsx = `import { ManishaPayButton } from '@manishapay/react';

<ManishaPayButton
  amount="${amount}"
  description="${description}"
  label="${label}"
/>`;

  const Block = ({ title, code }) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{title}</span>
        <button
          type="button"
          onClick={() => { copyToClipboard(code); toast.success('Copied'); }}
          className="inline-flex items-center gap-1 text-brand hover:underline"
        >
          <ClipboardCopy size={12} /> Copy
        </button>
      </div>
      <pre className="overflow-x-auto rounded bg-slate-950 p-3 font-mono text-[11px] text-slate-200">{code}</pre>
    </div>
  );

  return (
    <Card title="Button generator" description="Configure once, paste anywhere — HTML, WordPress, or React.">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Input label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Input label="Background colour" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-6 grid place-items-center">
          <button
            type="button"
            style={{ background: color, color: '#0b1220', padding: '10px 16px', borderRadius: 8, fontWeight: 600 }}
          >
            {label}
          </button>
        </div>
      </div>
      <div className="mt-6 space-y-4">
        <Block title="HTML embed" code={html} />
        <Block title="WordPress shortcode" code={shortcode} />
        <Block title="React component" code={jsx} />
      </div>
    </Card>
  );
}
