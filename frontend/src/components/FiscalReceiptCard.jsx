import { CheckCircle2 } from 'lucide-react';

/**
 * A paper-styled ZIMRA fiscal receipt — a showcase of what an FDMS-fiscalised
 * tax invoice looks like. Ported from our sibling app zimFDMS so the two
 * products present one consistent story: ManishaPay collects the payment,
 * zimFDMS fiscalises the sale.
 *
 * Self-contained: no framer-motion, no custom Tailwind tokens — safe to drop
 * anywhere in the ManishaPay app. The QR is a pure-CSS faux grid (this is a
 * marketing/preview mark, not a scannable code).
 */

const DEFAULT_LINES = [
  { name: 'Mazoe Orange 2L',    qty: 2, price: 3.2 },
  { name: 'Beef pie',           qty: 1, price: 2.5 },
  { name: 'Bread loaf',         qty: 1, price: 1.8 },
  { name: 'Sadza meal (lunch)', qty: 1, price: 4.5 },
];

export default function FiscalReceiptCard({
  business = 'Sample Trader (Pvt) Ltd',
  branch = 'Harare CBD · Speke Avenue',
  tin = '1000000001',
  vat = '200000001',
  invoiceNo = 'INV-00134',
  fiscalDayNo = 142,
  receiptGlobalNo = 4521,
  receiptCounter = 17,
  date = '2026-05-22 16:42:18',
  lines = DEFAULT_LINES,
  currency = 'USD',
  taxName = 'VAT 15%',
  cashier = 'Tendai M.',
  qr = true,
  className = '',
}) {
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const taxableBase = subtotal / 1.15;
  const taxAmount = subtotal - taxableBase;
  const total = subtotal;

  return (
    <div
      className={`relative w-[300px] -rotate-1 rounded-xl border border-stone-300 bg-[#fdfcf8] px-5 py-5 text-stone-800 shadow-[0_30px_60px_-30px_rgba(15,23,42,0.6)] ${className}`}
      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
    >
      {/* "Fiscalised" stamp */}
      <div className="absolute -right-3 -top-3 rotate-6">
        <div className="flex items-center gap-1 rounded-full bg-brand px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
          <CheckCircle2 size={11} /> Fiscalised
        </div>
      </div>

      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-stone-900">{business}</p>
        <p className="mt-0.5 text-[10px] text-stone-500">{branch}</p>
        <p className="mt-1.5 text-[10px] text-stone-500">
          TIN: <span className="text-stone-700">{tin}</span> · VAT: <span className="text-stone-700">{vat}</span>
        </p>
      </div>

      <hr className="my-3 border-dashed border-stone-300" />

      <div className="space-y-0.5 text-[10px] text-stone-500">
        <div className="flex justify-between"><span>Receipt</span><span className="text-stone-700">{invoiceNo}</span></div>
        <div className="flex justify-between"><span>Fiscal day</span><span className="text-stone-700">#{fiscalDayNo}</span></div>
        <div className="flex justify-between"><span>Global No.</span><span className="text-stone-700">{receiptGlobalNo}</span></div>
        <div className="flex justify-between"><span>Counter</span><span className="text-stone-700">{receiptCounter}</span></div>
        <div className="flex justify-between"><span>Date</span><span className="text-stone-700">{date}</span></div>
        <div className="flex justify-between"><span>Cashier</span><span className="text-stone-700">{cashier}</span></div>
      </div>

      <hr className="my-3 border-dashed border-stone-300" />

      <ul className="space-y-1 text-[11px]">
        {lines.map((l) => (
          <li key={l.name}>
            <div className="text-stone-700">{l.name}</div>
            <div className="flex justify-between text-stone-500">
              <span>{l.qty} × {l.price.toFixed(2)}</span>
              <span className="font-semibold text-stone-900">{(l.qty * l.price).toFixed(2)}</span>
            </div>
          </li>
        ))}
      </ul>

      <hr className="my-3 border-dashed border-stone-300" />

      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between text-stone-500">
          <span>Net total</span><span className="font-mono">{taxableBase.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-stone-500">
          <span>{taxName}</span><span className="font-mono">{taxAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-base font-bold text-stone-900">
          <span>TOTAL {currency}</span><span className="font-mono">{total.toFixed(2)}</span>
        </div>
      </div>

      <hr className="my-3 border-dashed border-stone-300" />

      {qr && (
        <div className="flex items-center gap-3">
          <FakeQR />
          <div className="text-[9.5px] leading-tight text-stone-500">
            Scan to verify on
            <br />
            <span className="text-rose-700">invoice-verification.zimra.co.zw</span>
          </div>
        </div>
      )}
      <p className="mt-3 text-center text-[9px] text-stone-400">
        FDMS Signature
        <br />
        <span className="break-all font-mono text-[9px] text-stone-700">zDxE···QwX2···BcsY···RUAE···fY/1</span>
      </p>
    </div>
  );
}

// Tiny faux QR — 9×9 grid with corner finder patterns + deterministic noise.
// Looks convincingly QR-shaped without pulling in a qrcode library.
function FakeQR() {
  const n = 9;
  const cells = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const isCorner = (x < 3 && y < 3) || (x > n - 4 && y < 3) || (x < 3 && y > n - 4);
      const isCornerInner = (x === 1 && y === 1) || (x === n - 2 && y === 1) || (x === 1 && y === n - 2);
      const isCornerEdge =
        isCorner && (x === 0 || y === 0 || x === 2 || y === 2 || x === n - 1 || x === n - 3 || y === n - 1 || y === n - 3);
      const noise = ((x * 7 + y * 13 + (x + y) ** 2) % 5) > 1;
      const on = isCornerInner || isCornerEdge || (!isCorner && noise);
      cells.push(on);
    }
  }
  return (
    <div className="grid grid-cols-9 gap-px rounded-md bg-white p-1.5 ring-1 ring-stone-300" style={{ width: 70, height: 70 }}>
      {cells.map((on, i) => (
        <div key={i} className={on ? 'bg-stone-900' : 'bg-transparent'} />
      ))}
    </div>
  );
}
