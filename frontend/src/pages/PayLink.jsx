import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { api } from '../lib/api';

/*
 * Public hosted checkout for a payment link. No login, no code — a payer opens
 * /pay/<slug>, optionally adds email/phone, and is sent to PayNow to pay.
 */
export default function PayLink() {
  const { slug } = useParams();
  const [link, setLink] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    api.getLink(slug)
      .then((r) => { if (!cancel) setLink(r.data); })
      .catch(() => { if (!cancel) setErr('This payment link is not available.'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [slug]);

  const pay = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await api.payLink(slug, { email: email || undefined, phone: phone || undefined });
      if (r?.data?.browser_url) {
        window.location.href = r.data.browser_url;
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
          ) : (
            <>
              <div className="text-center">
                <p className="text-sm text-slate-400">{link.title}</p>
                <p className="mt-1 text-4xl font-bold tracking-tight text-slate-100">
                  {link.currency} {Number(link.amount).toFixed(2)}
                </p>
                {link.description && <p className="mt-2 text-sm text-slate-400">{link.description}</p>}
              </div>

              <div className="space-y-3">
                <Input label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                <Input label="Mobile (for EcoCash / OneMoney)" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0771234567" />
              </div>

              {err && <p className="text-sm text-rose-400">{err}</p>}

              <Button onClick={pay} loading={busy} className="w-full justify-center">
                Pay {link.currency} {Number(link.amount).toFixed(2)}
              </Button>
              <p className="text-center text-[11px] text-slate-500">Secured by ManishaPay · payments via PayNow</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
