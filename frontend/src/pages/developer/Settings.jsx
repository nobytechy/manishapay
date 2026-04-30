import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function Settings() {
  const { user, profile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setFullName(profile?.full_name || ''); }, [profile]);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from('manishapay_developers').update({ full_name: fullName }).eq('id', user.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success('Saved');
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </header>
      <Card title="Profile">
        <div className="space-y-3 max-w-md">
          <Input label="Email" value={user?.email || ''} disabled/>
          <Input label="Full name" value={fullName} onChange={(e)=>setFullName(e.target.value)}/>
          <Button onClick={save} loading={busy}>Save changes</Button>
        </div>
      </Card>
      <Card title="Plan">
        <p className="text-sm text-slate-400">You are on the <span className="text-emerald-400 font-medium">{profile?.plan || 'free'}</span> plan.</p>
      </Card>
    </div>
  );
}
