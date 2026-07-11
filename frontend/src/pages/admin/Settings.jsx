import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MessageCircle } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { api } from '../../lib/api';

/*
 * Super-admin platform settings. Currently the dynamic WhatsApp (UltraMsg)
 * config — instance + token set here, token stored encrypted, never shown back.
 * WhatsApp stays a no-op until it's enabled + configured, so nothing is forced.
 */
export default function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [instance, setInstance] = useState('');
  const [token, setToken] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [tokenSet, setTokenSet] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);

  const load = async () => {
    try {
      const r = await api.adminGetSettings();
      const d = r?.data || {};
      setInstance(d.ultramsg_instance || '');
      setEnabled(!!d.whatsapp_enabled);
      setTokenSet(!!d.token_set);
    } catch (e) {
      toast.error(e.message || 'Could not load settings');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body = { ultramsg_instance: instance.trim(), whatsapp_enabled: enabled };
      if (token.trim()) body.ultramsg_token = token.trim();
      await api.adminSaveSettings(body);
      setToken('');
      toast.success('Settings saved');
      load();
    } catch (e) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!testTo.trim()) { toast.error('Enter a WhatsApp number to test'); return; }
    setTesting(true);
    try {
      const r = await api.adminWhatsappTest(testTo.trim());
      if (r?.data?.sent) toast.success('Test message sent ✅');
      else toast.error(`Not sent: ${r?.data?.reason || 'unknown'}`);
    } catch (e) {
      toast.error(e.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Platform Settings</h1>
        <p className="text-sm text-slate-400">Super-admin configuration for the whole platform.</p>
      </header>

      <Card title="WhatsApp notifications (UltraMsg)"
        description="Set your UltraMsg instance + token to enable WhatsApp receipts and alerts. Left off, nothing is sent.">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand/15 text-brand"><MessageCircle size={16} /></span>
              <label className="flex flex-1 items-center justify-between">
                <span className="text-sm text-slate-200">WhatsApp enabled</span>
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="UltraMsg instance ID" placeholder="instance12345" value={instance} onChange={(e) => setInstance(e.target.value)} />
              <Input
                label={tokenSet ? 'UltraMsg token (set — leave blank to keep)' : 'UltraMsg token'}
                type="password"
                placeholder={tokenSet ? '••••••••••••' : 'your UltraMsg token'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            <p className="text-xs text-slate-500">
              The token is encrypted at rest and never shown back. WhatsApp only activates when enabled and configured.
            </p>
            <div className="flex justify-end">
              <Button onClick={save} loading={saving}>Save settings</Button>
            </div>

            <div className="border-t border-slate-800 pt-4">
              <label className="mb-1 block text-sm font-medium text-slate-300">Send a test message</label>
              <div className="flex gap-2">
                <Input placeholder="263771234567" value={testTo} onChange={(e) => setTestTo(e.target.value)} className="flex-1" />
                <Button onClick={test} loading={testing}>Send test</Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
