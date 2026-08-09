/**
 * WebhookDebugger — verify a ManishaPay webhook signature entirely in the
 * browser via Web Crypto. Nothing is sent anywhere: paste payload, secret and
 * the signature header ("t=<unix>,v1=<hex>"), and we recompute
 * HMAC-SHA256("timestamp.body") locally and diff it against the provided v1.
 */
import { useState } from 'react';
import { ShieldCheck, ShieldAlert, Lock, X } from 'lucide-react';

async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function WebhookDebugger({ onClose }) {
  const [payload, setPayload] = useState('');
  const [secret, setSecret] = useState('');
  const [header, setHeader] = useState('');
  const [result, setResult] = useState(null);

  async function verify() {
    setResult(null);
    const m = header.match(/t=(\d+)\s*,\s*v1=([a-f0-9]+)/i);
    if (!m) return setResult({ ok: false, reason: 'Header must look like: t=1712345678,v1=<hex signature>' });
    if (!secret) return setResult({ ok: false, reason: 'Paste your webhook secret.' });
    const [, ts, provided] = m;
    const expected = await hmacSha256Hex(secret, `${ts}.${payload}`);
    const ageSec = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
    if (expected !== provided.toLowerCase()) {
      return setResult({
        ok: false,
        reason: 'Signature mismatch — the computed HMAC differs from v1.',
        detail: `Computed: ${expected.slice(0, 24)}…\nProvided: ${provided.slice(0, 24)}…\n\nUsual causes: wrong secret, body was re-serialised (whitespace/key order changed) instead of using the RAW request bytes, or the header was truncated.`,
      });
    }
    setResult({
      ok: true,
      reason: 'Signature is valid ✓',
      detail: `Timestamp age: ${ageSec}s ${ageSec > 300 ? '— ⚠ older than a typical 300s replay tolerance; your server may still reject it.' : '(within a typical 300s tolerance).'}`,
    });
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <ShieldCheck size={15} className="text-brand-300" /> Webhook signature debugger
        </h3>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={15} /></button>
      </div>
      <p className="mb-3 flex items-center gap-1.5 text-[11px] text-slate-500">
        <Lock size={11} /> Runs entirely in your browser — your secret and payload never leave this page.
      </p>
      <div className="space-y-2">
        <textarea value={payload} onChange={(e) => setPayload(e.target.value)} rows={3}
          placeholder='Raw webhook body, exactly as received — e.g. {"event":"payment.updated","id":"..."}'
          className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 font-mono text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-brand-500/50" />
        <input value={header} onChange={(e) => setHeader(e.target.value)}
          placeholder="Signature header — t=1712345678,v1=ab12cd…"
          className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 font-mono text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-brand-500/50" />
        <input value={secret} onChange={(e) => setSecret(e.target.value)} type="password"
          placeholder="Your webhook secret (whsec_…)"
          className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 font-mono text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-brand-500/50" />
        <button onClick={verify}
          className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-brand-400">
          Verify signature
        </button>
      </div>
      {result && (
        <div className={`mt-3 rounded-lg border p-3 text-xs ${result.ok
          ? 'border-brand-500/40 bg-brand-500/10 text-brand-200'
          : 'border-rose-500/40 bg-rose-500/10 text-rose-200'}`}>
          <div className="flex items-center gap-1.5 font-semibold">
            {result.ok ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />} {result.reason}
          </div>
          {result.detail && <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] opacity-90">{result.detail}</pre>}
        </div>
      )}
    </div>
  );
}
