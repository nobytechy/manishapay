import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

export default function Login() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5 hover:opacity-90">
          <img src="/logo.svg" alt="ManishaPay" className="h-10 w-10 rounded-lg shadow-glow"/>
          <span className="text-lg font-semibold text-slate-100">ManishaPay</span>
        </Link>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-card">
          <h1 className="text-lg font-semibold text-slate-100">Sign in</h1>
          <Input label="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required autoComplete="email"/>
          <Input label="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required autoComplete="current-password"/>
          <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
          <p className="text-center text-xs text-slate-400">
            No account? <Link to="/register" className="text-brand hover:underline">Create one</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
