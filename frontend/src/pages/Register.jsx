import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import GoogleButton from '../components/auth/GoogleButton';
import GithubButton from '../components/auth/GithubButton';

export default function Register() {
  const { signUp, signInWithGoogle, signInWithGithub } = useAuth();
  const nav = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [githubBusy, setGithubBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      await signUp(email, password, fullName);
      toast.success('Account created — check your email if confirmation is required.');
      nav('/login');
    } catch (err) {
      toast.error(err.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      toast.error(err.message || 'Google sign-in failed');
      setGoogleBusy(false);
    }
  };

  const onGithub = async () => {
    setGithubBusy(true);
    try {
      await signInWithGithub();
    } catch (err) {
      toast.error(err.message || 'GitHub sign-in failed');
      setGithubBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5 hover:opacity-90">
          <img src="/logo.svg" alt="ManishaPay" className="h-10 w-10 rounded-lg shadow-glow"/>
          <span className="text-lg font-semibold text-slate-100">ManishaPay</span>
        </Link>
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-card">
          <h1 className="text-lg font-semibold text-slate-100">Create your account</h1>

          <form onSubmit={submit} className="space-y-4">
            <Input label="Full name" value={fullName} onChange={(e)=>setFullName(e.target.value)} required/>
            <Input label="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required autoComplete="email"/>
            <Input label="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required autoComplete="new-password" hint="Minimum 8 characters."/>
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
        <Link to="/" className="mt-6 flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-300">
          <span aria-hidden="true">←</span> Back to main site
        </Link>
      </div>
    </div>
  );
}
