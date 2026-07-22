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

      <MfaSection />

      <PinSection />

      <Card title="Plan">
        <p className="text-sm text-slate-400">You are on the <span className="text-brand-400 font-medium">{profile?.plan || 'free'}</span> plan.</p>
      </Card>
    </div>
  );
}

/*
 * PIN "easy login" — device-local convenience unlock. Opt-in, per device.
 * The PIN encrypts this device's session locally; it never leaves the browser
 * and is not an account credential. Only offered once the email is verified.
 */
function PinSection() {
  const { user, enablePinLogin, disablePinLogin, hasPin } = useAuth();
  const emailVerified = !!(user?.email_confirmed_at || user?.confirmed_at);
  const [enabled, setEnabled] = useState(hasPin());
  const [setting, setSetting] = useState(false);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const a = pin.replace(/\D/g, '');
    if (a.length < 4 || a.length > 8) { toast.error('Choose a 4–8 digit PIN'); return; }
    if (a !== confirm.replace(/\D/g, '')) { toast.error('PINs do not match'); return; }
    setBusy(true);
    try {
      await enablePinLogin(a);
      toast.success('PIN login enabled on this device');
      setEnabled(true); setSetting(false); setPin(''); setConfirm('');
    } catch (e) {
      toast.error(e.message || 'Could not enable PIN login');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = () => {
    if (!window.confirm('Turn off PIN login on this device?')) return;
    disablePinLogin();
    setEnabled(false);
    toast.success('PIN login turned off');
  };

  return (
    <Card title="Easy login (PIN)" description="Unlock ManishaPay on this device with a PIN instead of typing your password each time. Convenience only — your password still protects the account.">
      {!emailVerified ? (
        <p className="text-sm text-slate-400">Verify your email first, then you can turn on PIN login.</p>
      ) : enabled ? (
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-brand-400">✓ PIN login is ON for this device</p>
          <Button onClick={turnOff}>Turn off</Button>
        </div>
      ) : setting ? (
        <div className="max-w-md space-y-3">
          <p className="text-xs text-slate-500">
            Choose a 4–8 digit PIN. It stays on this device (encrypted) and is never sent to our servers.
            After 5 wrong tries it clears and you'll use your password.
          </p>
          <div className="flex gap-2">
            <Input type="password" inputMode="numeric" placeholder="PIN" value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} className="max-w-[140px]" />
            <Input type="password" inputMode="numeric" placeholder="Confirm PIN" value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))} className="max-w-[160px]" />
            <Button onClick={save} loading={busy}>Enable</Button>
          </div>
          <button type="button" onClick={() => { setSetting(false); setPin(''); setConfirm(''); }} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">PIN login is off on this device.</p>
          <Button onClick={() => setSetting(true)}>Set up PIN</Button>
        </div>
      )}
    </Card>
  );
}

/*
 * Two-factor authentication — opt-in, self-service. Users enable or disable it
 * themselves with any authenticator app (TOTP via Supabase MFA). Never forced.
 */
function MfaSection() {
  const [factors, setFactors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enroll, setEnroll] = useState(null); // { factorId, qr, secret }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (!error) setFactors(data?.totp || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const verified = factors.find((f) => f.status === 'verified');

  const startEnroll = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (e) {
      toast.error(e.message || 'Could not start enrolment');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!enroll) return;
    setBusy(true);
    try {
      const ch = await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
      if (ch.error) throw ch.error;
      const v = await supabase.auth.mfa.verify({ factorId: enroll.factorId, challengeId: ch.data.id, code: code.trim() });
      if (v.error) throw v.error;
      toast.success('Two-factor authentication enabled');
      setEnroll(null); setCode(''); load();
    } catch (e) {
      toast.error(e.message || 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!verified) return;
    if (!window.confirm('Turn off two-factor authentication?')) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verified.id });
      if (error) throw error;
      toast.success('Two-factor disabled'); load();
    } catch (e) {
      toast.error(e.message || 'Could not disable');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Two-factor authentication (2FA)" description="Add an authenticator-app code to your sign-in. Optional — turn it on or off any time.">
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : verified ? (
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-brand-400">✓ Two-factor is ON</p>
          <Button onClick={disable} loading={busy}>Turn off</Button>
        </div>
      ) : enroll ? (
        <div className="max-w-md space-y-3">
          <p className="text-sm text-slate-400">Scan this in Google Authenticator, Authy or 1Password, then enter the 6-digit code.</p>
          <div className="inline-block rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: enroll.qr }} />
          <p className="text-xs text-slate-500">Or enter this secret manually: <code className="text-slate-300">{enroll.secret}</code></p>
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="max-w-[140px]" />
            <Button onClick={confirm} loading={busy}>Verify &amp; enable</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">Two-factor is off.</p>
          <Button onClick={startEnroll} loading={busy}>Enable 2FA</Button>
        </div>
      )}
    </Card>
  );
}
