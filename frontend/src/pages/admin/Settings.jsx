import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MessageCircle, Landmark, Smartphone } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { api } from '../../lib/api';

/*
 * Super-admin platform settings:
 *  - Dynamic WhatsApp (UltraMsg) config — token stored encrypted, never shown back.
 *  - Receiving / payout details — the bank account + PayNow that ManishaPay itself
 *    uses to collect developer/platform fees. Kept configurable (not hardcoded) so
 *    the receiving details can change without a redeploy. Bank fields are the
 *    display-for-payer details shown on ManishaPay's own invoices; the billing
 *    PayNow credential is encrypted at rest like every other credential.
 */
export default function AdminSettings() {
  const [loading, setLoading] = useState(true);

  // WhatsApp
  const [saving, setSaving] = useState(false);
  const [instance, setInstance] = useState('');
  const [token, setToken] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [tokenSet, setTokenSet] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);

  // Receiving / payout details
  const [savingRecv, setSavingRecv] = useState(false);
  const [bank, setBank] = useState({
    bank_name: '', bank_account_name: '', bank_account_number: '',
    bank_branch: '', bank_swift: '', bank_currency: '', billing_notes: '',
  });
  const [bankEnabled, setBankEnabled] = useState(false);
  const [pnId, setPnId] = useState('');
  const [pnKey, setPnKey] = useState('');
  const [pnSet, setPnSet] = useState(false);
  const [pnEnabled, setPnEnabled] = useState(false);

  const load = async () => {
    try {
      const r = await api.adminGetSettings();
      const d = r?.data || {};
      setInstance(d.ultramsg_instance || '');
      setEnabled(!!d.whatsapp_enabled);
      setTokenSet(!!d.token_set);
      setBank({
        bank_name: d.bank_name || '',
        bank_account_name: d.bank_account_name || '',
        bank_account_number: d.bank_account_number || '',
        bank_branch: d.bank_branch || '',
        bank_swift: d.bank_swift || '',
        bank_currency: d.bank_currency || '',
        billing_notes: d.billing_notes || '',
      });
      setBankEnabled(!!d.bank_enabled);
      setPnSet(!!d.billing_paynow_set);
      setPnEnabled(!!d.billing_paynow_enabled);
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

  const saveReceiving = async () => {
    setSavingRecv(true);
    try {
      const body = {
        ...Object.fromEntries(Object.entries(bank).map(([k, v]) => [k, v.trim()])),
        bank_enabled: bankEnabled,
        billing_paynow_enabled: pnEnabled,
      };
      if (pnId.trim() && pnKey.trim()) {
        body.billing_paynow_id = pnId.trim();
        body.billing_paynow_key = pnKey.trim();
      }
      await api.adminSaveSettings(body);
      setPnId(''); setPnKey('');
      toast.success('Receiving details saved');
      load();
    } catch (e) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSavingRecv(false);
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

  const setBankField = (k) => (e) => setBank((b) => ({ ...b, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Platform Settings</h1>
        <p className="text-sm text-slate-400">Super-admin configuration for the whole platform.</p>
      </header>

      {/* ── Receiving / payout details ─────────────────────────────────── */}
      <Card title="Receiving / payout details"
        description="How ManishaPay itself gets paid its fees. Configurable here — nothing is hardcoded, so you can change the receiving account any time.">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-6">
            {/* Bank account */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand/15 text-brand"><Landmark size={16} /></span>
                <label className="flex flex-1 items-center justify-between">
                  <span className="text-sm text-slate-200">Bank account enabled <span className="text-slate-500">(for international / bank-to-bank transfers)</span></span>
                  <input type="checkbox" checked={bankEnabled} onChange={(e) => setBankEnabled(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="Bank name" placeholder="First Capital Bank" value={bank.bank_name} onChange={setBankField('bank_name')} />
                <Input label="Account name" placeholder="Nobody Tebulo / ManishaPay" value={bank.bank_account_name} onChange={setBankField('bank_account_name')} />
                <Input label="Account number" placeholder="0123456789" value={bank.bank_account_number} onChange={setBankField('bank_account_number')} />
                <Input label="Branch" placeholder="Harare Branch" value={bank.bank_branch} onChange={setBankField('bank_branch')} />
                <Input label="SWIFT / BIC (international)" placeholder="FCZWZWHA" value={bank.bank_swift} onChange={setBankField('bank_swift')} />
                <Input label="Currency" placeholder="USD" value={bank.bank_currency} onChange={setBankField('bank_currency')} />
              </div>
              <Input label="Notes shown to payer (optional)" placeholder="Reference your developer email on the transfer" value={bank.billing_notes} onChange={setBankField('billing_notes')} />
              <p className="text-xs text-slate-500">These details are shown on ManishaPay's own invoices so developers can pay by bank/international transfer.</p>
            </div>

            {/* PayNow billing account */}
            <div className="space-y-4 border-t border-slate-800 pt-5">
              <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand/15 text-brand"><Smartphone size={16} /></span>
                <label className="flex flex-1 items-center justify-between">
                  <span className="text-sm text-slate-200">PayNow billing account enabled <span className="text-slate-500">(EcoCash / OneMoney fee collection)</span></span>
                  <input type="checkbox" checked={pnEnabled} onChange={(e) => setPnEnabled(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="PayNow Integration ID" placeholder="e.g. 12345" value={pnId} onChange={(e) => setPnId(e.target.value)} />
                <Input
                  label={pnSet ? 'PayNow Integration Key (set — leave blank to keep)' : 'PayNow Integration Key'}
                  type="password"
                  placeholder={pnSet ? '••••••••••••' : 'your PayNow integration key'}
                  value={pnKey}
                  onChange={(e) => setPnKey(e.target.value)}
                />
              </div>
              <p className="text-xs text-slate-500">
                This is <span className="text-slate-300">your own</span> PayNow account — used to collect ManishaPay fees from developers.
                The key is encrypted at rest and never shown back.
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveReceiving} loading={savingRecv}>Save receiving details</Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── WhatsApp ───────────────────────────────────────────────────── */}
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
