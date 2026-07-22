import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Smartphone, CreditCard, Landmark, Wallet, Ticket, Hash, CircleDollarSign } from 'lucide-react';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { api } from '../lib/api';

/*
 * Public hosted checkout for a payment link. No login, no code. The payer opens
 * /pay/<slug>, picks a payment method (EcoCash, Card, …), and ManishaPay routes
 * to whichever connected gateway serves that method — the "one checkout, any
 * method" flow. Links with no method chooser fall back to a single Pay button.
 */

const ICON = { mobile: Smartphone, card: CreditCard, bank: Landmark, wallet: Wallet, voucher: Ticket, ussd: Hash, other: CircleDollarSign };
function MethodIcon({ kind, size = 18 }) {
  const I = ICON[kind] || CircleDollarSign;
  return <I size={size} />;
}

export default function PayLink() {
  const { slug } = useParams();
  const [link, setLink] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selected, setSelected] = useState(null); // method string
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    api.getLink(slug)
      .then((r) => {
        if (cancel) return;
        setLink(r.data);
        // Auto-select when there's exactly one way to pay.
        if (r.data?.methods?.length === 1) setSelected(r.data.methods[0].method);
      })
      .catch(() => { if (!cancel) setErr('This payment link is not available.'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [slug]);

  const methods = link?.methods || [];
  const chosen = useMemo(() => methods.find((m) => m.method === selected) || null, [methods, selected]);
  // Ask for a phone when the chosen method needs one, or on a legacy link with
  // no chooser (mobile money is the common case there).
  const needsPhone = chosen ? chosen.needsPhone : methods.length === 0;

  const pay = async () => {
    if (methods.length > 0 && !chosen) { setErr('Please choose how you want to pay.'); return; }
    setBusy(true);
    setErr('');
    try {
      const r = await api.payLink(slug, {
        email: email || undefined,
        phone: phone || undefined,
        method: chosen?.method || undefined,
      });
      if (r?.data?.browser_url) {
        window.location.href = r.data.browser_url;
      } else if (r?.data?.status) {
        // Push-based methods (e.g. EcoCash / M-Pesa STK) may have no redirect —
        // the prompt is already on the customer's phone.
        setErr('');
        setBusy(false);
        setLink((l) => ({ ...l, _pushed: true }));
      } else {
        setErr('Could not start the payment. Please try again.');
        setBusy(false);
      }
    } catch (e) {
      setErr(e.message || 'Payment could not be started.');
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <img src="/logo.png" alt="ManishaPay" className="h-9 w-9 rounded-lg" />
          <span className="text-sm font-semibold text-slate-300">ManishaPay</span>
        </div>

        <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-card">
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : err && !link ? (
            <p className="text-sm text-rose-400">{err}</p>
          ) : link?._pushed ? (
            <div className="text-center">
              <p className="text-lg font-semibold text-emerald-400">Check your phone</p>
              <p className="mt-2 text-sm text-slate-400">We've sent a payment prompt to {phone || 'your phone'}. Approve it to complete the payment.</p>
            </div>
          ) : (
            <>
              <div className="text-center">
                <p className="text-sm text-slate-400">{link.title}</p>
                <p className="mt-1 text-4xl font-bold tracking-tight text-slate-100">
                  {link.currency} {Number(link.amount).toFixed(2)}
                </p>
                {link.description && <p className="mt-2 text-sm text-slate-400">{link.description}</p>}
              </div>

              {methods.length > 1 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-300">How would you like to pay?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {methods.map((m) => {
                      const active = m.method === selected;
                      return (
                        <button
                          key={m.method}
                          type="button"
                          onClick={() => setSelected(m.method)}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                            active
                              ? 'border-brand bg-brand/15 text-slate-100'
                              : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <span className={active ? 'text-brand' : 'text-slate-400'}><MethodIcon kind={m.kind} /></span>
                          <span className="truncate">{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Input label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                {needsPhone && (
                  <Input label={`Mobile number${chosen ? ` (for ${chosen.label})` : ''}`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0771234567" />
                )}
              </div>

              {err && <p className="text-sm text-rose-400">{err}</p>}

              <Button onClick={pay} loading={busy} className="w-full justify-center">
                Pay {link.currency} {Number(link.amount).toFixed(2)}{chosen ? ` with ${chosen.label}` : ''}
              </Button>
              <p className="text-center text-[11px] text-slate-500">Secured by ManishaPay</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
