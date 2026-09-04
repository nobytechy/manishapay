import { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Share2 } from 'lucide-react';

/**
 * Share a receipt for a paid transaction.
 *
 * The thing a shop owner actually does after a customer pays is send them
 * something — almost always on WhatsApp. Until now the dashboard could show
 * that a payment landed but gave them nothing to forward, so they retyped it
 * by hand or sent a screenshot of a table.
 *
 * Uses the native share sheet where it exists (every Android browser worth
 * caring about), which lets them pick WhatsApp, SMS or anything else. Falls
 * back to copying the text, because a fixed wa.me link would force one app on
 * someone whose customer might be on SMS.
 */
export default function ShareReceipt({ txn, businessName, className = '' }) {
  const [done, setDone] = useState(false);

  const receipt = buildReceipt(txn, businessName);

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Payment receipt', text: receipt });
      } else {
        await navigator.clipboard.writeText(receipt);
        toast.success('Receipt copied — paste it to your customer');
      }
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch (err) {
      // AbortError just means they closed the share sheet; not a failure.
      if (err?.name !== 'AbortError') toast.error('Could not share the receipt');
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      className={`inline-flex items-center gap-1 text-xs text-brand hover:underline ${className}`}
    >
      {done ? <Check size={12} /> : <Share2 size={12} />}
      {done ? 'Shared' : 'Send receipt'}
    </button>
  );
}

/**
 * Plain text, not a link. A receipt that depends on a page staying up is worse
 * than one the customer can read in the message itself, and this has to survive
 * being forwarded, screenshotted and read on a cheap phone.
 */
export function buildReceipt(txn, businessName) {
  const amount = `${txn.currency || 'USD'} ${Number(txn.merchant_amount ?? 0).toFixed(2)}`;
  const when = txn.created_at
    ? new Date(txn.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';
  const lines = [
    businessName ? `${businessName} — payment received` : 'Payment received',
    '',
    `Amount:    ${amount}`,
    `Reference: ${txn.merchant_reference}`,
  ];
  if (txn.paynow_reference) lines.push(`Gateway:   ${txn.paynow_reference}`);
  if (when) lines.push(`Date:      ${when}`);
  // A test payment must never be forwarded as if money changed hands.
  if (txn.mode && txn.mode !== 'live') {
    lines.push('', `(${txn.mode} payment — no real money was transferred)`);
  }
  return lines.join('\n');
}
