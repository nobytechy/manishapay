import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

/*
 * Step 1 of password recovery: email a reset link. Supabase sends a message
 * whose link returns to /reset-password with a short-lived recovery session,
 * where the user sets a new password.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success('Reset link sent — check your inbox.');
    } catch (err) {
      toast.error(err.message || 'Could not send reset email');
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
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-card">
          <h1 className="text-lg font-semibold text-slate-100">Reset your password</h1>
          {sent ? (
            <p className="text-sm text-slate-400">
              If an account exists for <span className="text-slate-200">{email}</span>, a reset link is on
              its way. Open it to choose a new password.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-400">
                Enter your account email and we'll send you a link to set a new password.
              </p>
              <form onSubmit={submit} className="space-y-4">
                <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
              </form>
            </>
          )}
          <p className="text-center text-xs text-slate-400">
            Remembered it? <Link to="/login" className="text-brand hover:underline">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
