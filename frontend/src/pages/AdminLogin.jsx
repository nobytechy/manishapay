import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

/*
 * Separate administrator sign-in. Uses the same Supabase auth as developers,
 * but this entry point verifies the account carries role = 'admin' before
 * letting anyone through — a valid developer login lands here and is bounced.
 * There is no self-service here (no register / social); staff only.
 */
export default function AdminLogin() {
  const { signIn, isAuthenticated, isAdmin, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Already signed in as an admin? Skip straight to the console.
  useEffect(() => {
    if (!loading && isAuthenticated && isAdmin) nav('/admin', { replace: true });
  }, [loading, isAuthenticated, isAdmin, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signIn(email, password);
      // Deterministic role check — don't rely on context timing.
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from('manishapay_developers')
        .select('role')
        .eq('id', user?.id)
        .maybeSingle();

      if (prof?.role === 'admin') {
        toast.success('Welcome, administrator');
        nav('/admin', { replace: true });
      } else {
        // Not staff — revoke the session we just created and refuse.
        await supabase.auth.signOut();
        toast.error('This portal is for administrators only.');
      }
    } catch (err) {
      toast.error(err.message || 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5 hover:opacity-90">
          <img src="/logo.png" alt="ManishaPay" className="h-10 w-10 rounded-lg shadow-glow" />
          <span className="text-lg font-semibold text-slate-100">ManishaPay</span>
        </Link>

        <div className="space-y-4 rounded-xl border border-sky-500/25 bg-slate-900/60 p-6 shadow-card">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-500/15 text-sky-400" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="10" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <div>
              <h1 className="text-lg font-semibold text-slate-100">Administrator sign-in</h1>
              <p className="text-xs text-slate-500">Restricted — staff access only</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            <div className="text-right">
              <Link to="/forgot-password" className="text-xs text-slate-400 hover:text-brand">Forgot password?</Link>
            </div>
            <Button type="submit" className="w-full" loading={busy}>Sign in to console</Button>
          </form>

          <p className="text-center text-xs text-slate-500">
            Not staff? <Link to="/login" className="text-brand hover:underline">Developer sign-in</Link>
          </p>
        </div>

        <Link to="/" className="mt-6 flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-300">
          <span aria-hidden="true">←</span> Back to main site
        </Link>
      </div>
    </div>
  );
}
