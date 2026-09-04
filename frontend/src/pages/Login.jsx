import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import GoogleButton from '../components/auth/GoogleButton';
import GithubButton from '../components/auth/GithubButton';

export default function Login() {
  const { signIn, signInWithGoogle, signInWithGithub, signInAnonymously, isAuthenticated, loading, hasPin, pinEmail, unlockWithPin } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const justVerified = params.get('verified') === '1';

  // Show PIN unlock first if a PIN is set on this device (and we didn't just
  // come back from an email-verify link, which wants the normal path).
  const [mode, setMode] = useState(hasPin() && !justVerified ? 'pin' : 'password');

  useEffect(() => {
    if (loading) return;
    if (isAuthenticated) {
      if (justVerified) toast.success('Email verified — welcome to ManishaPay!', { id: 'verified' });
      nav('/app', { replace: true });
    } else if (justVerified) {
      toast.success('Email verified ✓ — please sign in to continue.', { id: 'verified' });
    }
  }, [isAuthenticated, loading, justVerified, nav]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [guestBusy, setGuestBusy] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [githubBusy, setGithubBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signIn(email, password);
      toast.success('Welcome back');
      nav('/app');
    } catch (err) {
      toast.error(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (e) => {
    e.preventDefault();
    const clean = pin.replace(/\D/g, '');
    if (clean.length < 4) { toast.error('Enter your PIN'); return; }
    setPinBusy(true);
    try {
      await unlockWithPin(clean);
      toast.success('Welcome back');
      nav('/app', { replace: true });
    } catch (err) {
      toast.error(err.message || 'Could not unlock');
      setPin('');
      if (!hasPin()) setMode('password'); // blob was wiped after too many tries
    } finally {
      setPinBusy(false);
    }
  };

  const onGoogle = async () => {
    setGoogleBusy(true);
    try { await signInWithGoogle(); }
    catch (err) { toast.error(err.message || 'Google sign-in failed'); setGoogleBusy(false); }
  };
  const onGithub = async () => {
    setGithubBusy(true);
    try { await signInWithGithub(); }
    catch (err) { toast.error(err.message || 'GitHub sign-in failed'); setGithubBusy(false); }
  };
  // Guest entry. The redirect is handled by the isAuthenticated effect above,
  // same as every other sign-in path.
  const onGuest = async () => {
    setGuestBusy(true);
    try { await signInAnonymously(); }
    catch (err) { toast.error(err.message || 'Could not start'); setGuestBusy(false); }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5 hover:opacity-90">
          <img src="/logo.png" alt="ManishaPay" className="h-10 w-10 rounded-lg shadow-glow"/>
          <span className="text-lg font-semibold text-slate-100">ManishaPay</span>
        </Link>

        {mode === 'pin' && hasPin() ? (
          <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-card">
            <div className="flex flex-col items-center text-center">
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand/15 text-brand"><KeyRound size={22} /></span>
              <h1 className="text-lg font-semibold text-slate-100">Welcome back</h1>
              {pinEmail() && <p className="mt-1 text-sm text-slate-400">{pinEmail()}</p>}
            </div>
            <form onSubmit={unlock} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Enter your PIN</label>
                <input
                  className="input w-full text-center font-mono text-lg tracking-[0.5em]"
                  type="password" inputMode="numeric" autoComplete="off"
                  maxLength={8} placeholder="••••" value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" loading={pinBusy}>Unlock</Button>
            </form>
            <p className="text-center text-xs text-slate-400">
              <button type="button" onClick={() => setMode('password')} className="text-brand hover:underline">Use password instead</button>
            </p>
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-card">
            <h1 className="text-lg font-semibold text-slate-100">Sign in</h1>

            <form onSubmit={submit} className="space-y-4">
              <Input label="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required autoComplete="email"/>
              <Input label="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required autoComplete="current-password"/>
              <div className="text-right">
                <Link to="/forgot-password" className="text-xs text-slate-400 hover:text-brand">Forgot password?</Link>
              </div>
              <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
            </form>

            {hasPin() && (
              <p className="text-center text-xs text-slate-400">
                <button type="button" onClick={() => setMode('pin')} className="inline-flex items-center gap-1 text-brand hover:underline">
                  <KeyRound size={12} /> Unlock with PIN
                </button>
              </p>
            )}

            <div className="flex items-center gap-3 text-xs text-slate-500">
              <div className="h-px flex-1 bg-slate-800" />
              <span>or</span>
              <div className="h-px flex-1 bg-slate-800" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <GoogleButton onClick={onGoogle} busy={googleBusy} />
              <GithubButton onClick={onGithub} busy={githubBusy} />
            </div>

            <div className="border-t border-slate-800 pt-4">
              <Button variant="ghost" className="w-full" onClick={onGuest} loading={guestBusy}>
                Have a look first — no signup
              </Button>
              <p className="mt-2 text-center text-[11px] text-slate-500">
                Opens a guest account you can add an email to later. Nothing you set up is lost.
              </p>
            </div>

            <p className="text-center text-xs text-slate-400">
              No account? <Link to="/register" className="text-brand hover:underline">Create one</Link>
            </p>
          </div>
        )}

        <Link to="/" className="mt-6 flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-300">
          <span aria-hidden="true">←</span> Back to main site
        </Link>
      </div>
    </div>
  );
}
