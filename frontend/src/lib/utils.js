import clsx from 'clsx';

export function cn(...args) {
  return clsx(...args);
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatMoney(amount, currency = 'USD') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return n.toLocaleString(undefined, { style: 'currency', currency, minimumFractionDigits: 2 });
}

export function copyToClipboard(text) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  // Fallback for older browsers
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } finally { ta.remove(); }
  return Promise.resolve();
}

export function statusVariant(status) {
  const s = String(status || '').toLowerCase();
  if (['paid', 'delivered', 'active', 'ok', 'success'].includes(s)) return 'success';
  if (['pending', 'sent', 'awaiting delivery', 'created'].includes(s)) return 'warn';
  if (['failed', 'cancelled', 'error', 'revoked', 'suspended'].includes(s)) return 'danger';
  return 'warn';
}
