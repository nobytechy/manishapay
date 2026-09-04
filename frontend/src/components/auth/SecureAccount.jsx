import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowRight, Check, ShieldAlert, X } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import GoogleButton from './GoogleButton';
import { useAuth } from '../../context/AuthContext';

/**
 * "Secure your account" — the way out of an anonymous session.
 *
 * The important thing to understand here is that nothing is being migrated.
 * Linking an email or a provider attaches an identity to the auth.users row
 * that already exists, so the developer id never changes and every project,
 * payment method, key and transaction stays exactly where it is. The copy says
 * so plainly, because a merchant who fears losing their setup won't click.
 *
 * Exposed as a provider so any page can call `useSecureAccount().prompt()` —
 * the live-mode gate in the payment-method wizard uses it.
 */

const Ctx = createContext({ prompt: () => {}, isAnonymous: false });
export const useSecureAccount = () => useContext(Ctx);

export function SecureAccountProvider({ children }) {
  const { isAnonymous } = useAuth();
  const [open, setOpen] = useState(false);
  const prompt = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ prompt, isAnonymous }), [prompt, isAnonymous]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {open && <SecureAccountWizard onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  );
}

/** Slim, permanent reminder. Never auto-dismisses — the risk doesn't go away. */
export function SecureAccountBanner() {
  const { isAnonymous } = useAuth();
  const { prompt } = useSecureAccount();
  if (!isAnonymous) return null;

  return (
    <div className="flex items-center gap-3 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-sm sm:px-6">
      <ShieldAlert size={16} className="shrink-0 text-amber-400" />
      <p className="min-w-0 flex-1 text-amber-100">
        <span className="font-medium">This account isn't secured.</span>{' '}
        <span className="text-amber-200/80">
          It only exists on this phone — clearing your browser would end it.
        </span>
      </p>
      <button
        type="button"
        onClick={prompt}
        className="shrink-0 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-300"
      >
        Secure it
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Same shape as the payment-method wizard: one question per screen, with
   Back / Next / Cancel and nothing else.
   ──────────────────────────────────────────────────────────────────────────── */

function SecureAccountWizard({ onClose }) {
  const { linkEmail, confirmLinkedEmail, linkProvider } = useAuth();
  const [step, setStep] = useState(0); // 0 how · 1 email · 2 code · 3 done
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const sendEmail = async () => {
    setBusy(true);
    try {
      await linkEmail(email);
      setStep(2);
      toast.success('Check your email for the code');
    } catch (err) {
      toast.error(err.message || 'Could not send the email');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await confirmLinkedEmail(email, code);
      setStep(3);
    } catch (err) {
      toast.error(err.message || 'That code did not work');
    } finally {
      setBusy(false);
    }
  };

  const withGoogle = async () => {
    setBusy(true);
    try {
      await linkProvider('google');
    } catch (err) {
      toast.error(err.message || 'Could not connect Google');
      setBusy(false);
    }
  };

  const canNext = step === 1 ? email.trim().length > 3 : step === 2 ? code.trim().length >= 6 : true;
  const next = () => (step === 1 ? sendEmail() : step === 2 ? confirm() : setStep((s) => s + 1));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex-1 overflow-y-auto px-5 py-8">
        <div className="mx-auto w-full max-w-md">
          {step === 0 && (
            <>
              <h2 className="text-xl font-semibold text-slate-100">
                How would you like to secure this account?
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Everything you've set up stays exactly as it is — your payment methods,
                links and test payments all stay on this account. You're only adding a
                way to get back in.
              </p>
              <div className="mt-5 space-y-2">
                <GoogleButton onClick={withGoogle} busy={busy} label="Continue with Google" />
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
                >
                  Use my email address
                </button>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                Google is instant. Email takes a minute and needs a code from your inbox.
              </p>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="text-xl font-semibold text-slate-100">What's your email address?</h2>
              <p className="mt-2 text-sm text-slate-400">We'll send a 6-digit code to confirm it.</p>
              <div className="mt-4">
                <Input
                  autoFocus
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-xl font-semibold text-slate-100">Enter the code we sent</h2>
              <p className="mt-2 text-sm text-slate-400">
                Sent to {email}. Check your spam folder if it's not there.
              </p>
              <div className="mt-4">
                <Input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="text-center text-lg tracking-[0.4em]"
                />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-100">
                <Check size={20} className="text-brand" /> Your account is secured
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                You can sign in from any phone now, and nothing you set up has changed.
                Real payments are unlocked.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="border-t border-slate-800 bg-slate-950 px-5 py-4">
        <div className="mx-auto flex w-full max-w-md items-center gap-2">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || step === 3}>
            <ArrowLeft size={15} /> Back
          </Button>
          {step === 3 ? (
            <Button className="flex-1" onClick={onClose}>Done</Button>
          ) : step === 0 ? (
            <span className="flex-1" />
          ) : (
            <Button className="flex-1" onClick={next} disabled={!canNext} loading={busy}>
              Next <ArrowRight size={15} />
            </Button>
          )}
          {step !== 3 && (
            <Button variant="ghost" onClick={onClose}>
              <X size={15} /> Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
