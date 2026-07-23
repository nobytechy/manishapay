import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import GoogleButton from '../components/auth/GoogleButton';
import GithubButton from '../components/auth/GithubButton';

export default function Register() {
  const { signUp, verifyEmailOtp, resendVerification, signInWithGoogle, signInWithGithub } = useAuth();
  const nav = useNavigate();
  const [stage, setStage] = useState('form'); // 'form' | 'verify'
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [githubBusy, setGithubBusy] = useState(false);

  // Verification step
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setBusy(true);
    try {
      await signUp(email, password, fullName);
      setStage('verify'); // move to the branded "check your email" + code screen
    } catch (err) {
      toast.error(err.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    const clean = code.replace(/\D/g, '');
    if (clean.length < 6) { toast.error('Enter the full code from your email'); return; }
    setVerifying(true);
    try {
      await verifyEmailOtp(email, clean);
      toast.success('Email verified — welcome to ManishaPay!');
      nav('/app', { replace: true });
    } catch (err) {
      toast.error(err.message || 'That code is incorrect or expired. Check the latest email or resend.');
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      await resendVerification(email);
      toast.success('New verification email sent — check your inbox and spam folder.');
    } catch (err) {
      toast.error(err.message || 'Could not resend — wait a moment and try again.');
    } finally {
      setResending(false);
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

  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5 hover:opacity-90">
          <img src="/logo.png" alt="ManishaPay" className="h-10 w-10 rounded-lg shadow-glow"/>
          <span className="text-lg font-semibold text-slate-100">ManishaPay</span>
        </Link>

        {stage === 'form' ? (
          <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-card">
            <h1 className="text-lg font-semibold text-slate-100">Create your account</h1>

            <form onSubmit={submit} className="space-y-4">
              <Input label="Full name" value={fullName} onChange={(e)=>setFullName(e.target.value)} required/>
              <Input label="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required autoComplete="email"/>
              <Input label="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required autoComplete="new-password" hint="Minimum 8 characters."/>
              <Input label="Confirm password" type="password" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} required autoComplete="new-password"
                error={confirmPassword && confirmPassword !== password ? 'Passwords do not match' : undefined}/>
              <Button type="submit" className="w-full" loading={busy}>Create account</Button>
            </form>

            <div className="flex items-center gap-3 text-xs text-slate-500">
              <div className="h-px flex-1 bg-slate-800" />
              <span>or sign up with</span>
              <div className="h-px flex-1 bg-slate-800" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <GoogleButton onClick={onGoogle} busy={googleBusy} />
              <GithubButton onClick={onGithub} busy={githubBusy} />
            </div>

            <p className="text-center text-xs text-slate-400">
              Already have one? <Link to="/login" className="text-brand hover:underline">Sign in</Link>
            </p>
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-card">
            <div className="flex flex-col items-center text-center">
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand/15 text-brand">
                <MailCheck size={22} />
              </span>
              <h1 className="text-lg font-semibold text-slate-100">Verify your email</h1>
              <p className="mt-1 text-sm text-slate-400">
                We sent a verification code and a confirmation link to
              </p>
              <p className="text-sm font-medium text-slate-200">{email}</p>
            </div>

            {/* Spam guidance — professional, reassuring */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-200/90">
              📩 Don't see it within a minute? Check your <span className="font-semibold">spam / junk</span> folder
              and mark it <span className="font-semibold">"Not spam"</span> so future emails land in your inbox.
            </div>

            <form onSubmit={verify} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Enter the code from your email</label>
                <input
                  className="input w-full text-center font-mono text-lg tracking-[0.3em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  placeholder="Enter code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" loading={verifying}>Verify &amp; continue</Button>
            </form>

            <p className="text-center text-xs text-slate-500">
              Prefer the link? Just click <span className="text-slate-300">"Confirm email address"</span> in the email — it works too.
            </p>

            <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
              <button type="button" onClick={resend} disabled={resending}
                className="text-brand hover:underline disabled:opacity-50">
                {resending ? 'Sending…' : 'Resend email'}
              </button>
              <button type="button" onClick={() => setStage('form')} className="text-slate-400 hover:text-slate-200">
                Wrong email? Go back
              </button>
            </div>
          </div>
        )}

        <Link to="/" className="mt-6 flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-300">
          <span aria-hidden="true">←</span> Back to main site
        </Link>
      </div>
    </div>
  );
}
