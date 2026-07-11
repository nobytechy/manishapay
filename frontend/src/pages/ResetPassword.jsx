import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

/*
 * Step 2 of password recovery. The link from the reset email lands here with a
 * recovery token; Supabase turns it into a temporary session (PASSWORD_RECOVERY
 * event). We then let the user set a new password via updateUser.
 */
export default function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // A valid recovery link produces a session. Confirm one exists so we don't
    // show the form to someone who arrived here without a token.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { toast.error('Use at least 8 characters.'); return; }
    if (password !== confirm) { toast.error('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Password updated — please sign in.');
      await supabase.auth.signOut();
      nav('/login', { replace: true });
    } catch (err) {
      toast.error(err.message || 'Could not update password');
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
          <h1 className="text-lg font-semibold text-slate-100">Choose a new password</h1>
          {ready ? (
            <form onSubmit={submit} className="space-y-4">
              <Input label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
              <Input label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
              <Button type="submit" className="w-full" loading={busy}>Update password</Button>
            </form>
          ) : (
            <p className="text-sm text-slate-400">
              This page opens from the reset link in your email. If you got here another way, request a
              new link on the <Link to="/forgot-password" className="text-brand hover:underline">reset page</Link>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
