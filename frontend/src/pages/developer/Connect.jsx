import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Globe, Smartphone, ShoppingCart, Server, Check, Copy, ArrowRight, ArrowLeft, Rocket } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { api } from '../../lib/api';

/*
 * "Connect an app" — one-screen integration wizard. The goal is that a
 * developer is live faster than they could read PayNow's own docs:
 *   1. What are you building?  (platform → we only ask for what it needs)
 *   2. How should it take payments?  (our sandbox, zero setup — or their PayNow)
 *   3. Done → copy-paste setup steps tailored to their platform.
 */

const PLATFORMS = [
  { id: 'web',       icon: Globe,        label: 'Website',                sub: 'Any site — drop-in button or API' },
  { id: 'mobile',    icon: Smartphone,   label: 'Mobile app',             sub: 'Android / iOS' },
  { id: 'wordpress', icon: ShoppingCart, label: 'WordPress / WooCommerce', sub: 'Plugin — no code' },
  { id: 'api',       icon: Server,       label: 'Custom / Server',        sub: 'Direct API + SDKs' },
];

const API_BASE = 'https://manishapay.netlify.app/api';

export default function Connect() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  // Step 1
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('web');
  const [returnUrl, setReturnUrl] = useState('');

  // Step 2
  const [connectMode, setConnectMode] = useState('sandbox'); // 'sandbox' | 'own'
  const [email, setEmail] = useState('');
  const [integrationId, setIntegrationId] = useState('');
  const [integrationKey, setIntegrationKey] = useState('');

  // Result
  const [created, setCreated] = useState(null); // { projectId }

  const platformLabel = PLATFORMS.find((p) => p.id === platform)?.label || 'App';

  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(() => toast.success('Copied'));
  };

  const canNext1 = name.trim().length > 0;
  const canFinish =
    connectMode === 'sandbox'
      ? email.trim().length > 3
      : integrationId.trim() && integrationKey.trim() && email.trim().length > 3;

  const finish = async () => {
    setBusy(true);
    try {
      const project = await api.createProject({
        name: name.trim(),
        description: `${platformLabel} integration`,
        return_url: returnUrl.trim() || null,
      });
      const projectId = project?.data?.id || project?.id;

      // Bring-your-own PayNow → save the credential (starts in test).
      if (connectMode === 'own' && projectId) {
        await api.saveCredential({
          project_id: projectId,
          mode: 'test',
          integration_id: integrationId.trim(),
          integration_key: integrationKey.trim(),
          merchant_email: email.trim(),
        });
      }

      // Mint a test key right here so they never leave the flow.
      let testKey = null;
      if (projectId) {
        try {
          const keyRes = await api.createKey({ project_id: projectId, mode: 'test', label: `${name.trim()} · wizard` });
          testKey = keyRes?.data?.key || keyRes?.key || null;
        } catch { /* non-fatal — they can mint one on the API Keys page */ }
      }
      setCreated({ projectId, testKey, email: email.trim(), sandbox: connectMode === 'sandbox' });
      setStep(3);
      toast.success('Connected — you’re ready to test.');
    } catch (err) {
      toast.error(err.message || 'Could not create the integration');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand"><Rocket size={18} /></div>
        <div>
          <h1 className="text-2xl font-semibold">Connect Your App</h1>
          <p className="text-sm text-slate-400">Live in a minute — no PayNow account needed to start. We only ask for what your platform needs.</p>
        </div>
      </header>

      <Stepper step={step} />

      {/* ── Step 1: what are you building ───────────────────────── */}
      {step === 1 && (
        <Card>
          <div className="space-y-5">
            <Input label="App / project name" placeholder="e.g. My Online Store" value={name} onChange={(e) => setName(e.target.value)} />
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">What are you building?</label>
              <div className="grid gap-3 sm:grid-cols-2">
                {PLATFORMS.map((p) => {
                  const Active = platform === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPlatform(p.id)}
                      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                        Active ? 'border-brand bg-brand/10' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                      }`}
                    >
                      <p.icon size={20} className={Active ? 'text-brand' : 'text-slate-400'} />
                      <div>
                        <div className="text-sm font-semibold text-slate-100">{p.label}</div>
                        <div className="text-xs text-slate-400">{p.sub}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            {(platform === 'web' || platform === 'mobile') && (
              <Input
                label="Return URL (optional)"
                placeholder={platform === 'mobile' ? 'myapp://payment-return' : 'https://yoursite.com/thank-you'}
                value={returnUrl}
                onChange={(e) => setReturnUrl(e.target.value)}
              />
            )}
            <div className="flex justify-end">
              <Button disabled={!canNext1} onClick={() => setStep(2)}>Continue <ArrowRight size={14} /></Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Step 2: how it takes payments ───────────────────────── */}
      {step === 2 && (
        <Card>
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">How should it take payments?</label>
              <div className="grid gap-3 sm:grid-cols-2">
                <ChoiceCard
                  active={connectMode === 'sandbox'}
                  onClick={() => setConnectMode('sandbox')}
                  title="Use ManishaPay Sandbox"
                  badge="Recommended to start"
                  body="No PayNow account needed. Test the full flow with signed webhooks instantly."
                />
                <ChoiceCard
                  active={connectMode === 'own'}
                  onClick={() => setConnectMode('own')}
                  title="Connect my PayNow account"
                  body="Use your own PayNow Integration ID + Key for real payments."
                />
              </div>
            </div>

            <Input
              label={connectMode === 'sandbox' ? 'Your email (used for test receipts / authemail)' : 'PayNow-registered email'}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {connectMode === 'own' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Integration ID" placeholder="e.g. 11627" value={integrationId} onChange={(e) => setIntegrationId(e.target.value)} />
                <Input label="Integration Key" type="password" placeholder="838c7e4e-…" value={integrationKey} onChange={(e) => setIntegrationKey(e.target.value)} />
                <p className="text-xs text-slate-500 sm:col-span-2">
                  Get these from{' '}
                  <a href="https://www.paynow.co.zw/Home/Receive" target="_blank" rel="noopener noreferrer" className="underline">
                    PayNow → Receive Payments → Manage Shopping Carts
                  </a>. Your key is encrypted and never shown back.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200" onClick={() => setStep(1)}>
                <ArrowLeft size={14} /> Back
              </button>
              <Button disabled={!canFinish} loading={busy} onClick={finish}>Create integration <ArrowRight size={14} /></Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Step 3: tailored setup ──────────────────────────────── */}
      {step === 3 && created && (
        <Card>
          <div className="space-y-5">
            <div className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 p-3 text-sm text-brand">
              <Check size={16} /> <b>{name}</b> is connected. Here’s how to finish on {platformLabel}:
            </div>

            {created.testKey && (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Your test API key — copy it now, it won’t be shown again
                </label>
                <CodeBlock code={created.testKey} copy={copy} />
              </div>
            )}
            {created.sandbox && created.email && (
              <p className="text-xs text-slate-400">
                Sandbox mode: pass <code className="text-slate-300">{created.email}</code> as the customer email in your test calls.
              </p>
            )}

            <SetupSteps platform={platform} copy={copy} apiKey={created.testKey} />

            <div className="flex flex-wrap gap-3 border-t border-slate-800 pt-4">
              <Button onClick={() => nav('/app/keys')}>Get your test API key</Button>
              <Link to="/app/sandbox" className="btn btn-secondary">Open the Sandbox</Link>
              <Link to="/app/credentials" className="btn btn-secondary">Manage PayNow credentials</Link>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stepper({ step }) {
  const steps = ['Your app', 'Payments', 'Go live'];
  return (
    <div className="flex items-center gap-2 text-xs">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <div key={label} className="flex items-center gap-2">
            <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${
              done ? 'bg-brand text-slate-950' : active ? 'bg-brand/20 text-brand ring-1 ring-brand' : 'bg-slate-800 text-slate-500'
            }`}>{done ? <Check size={12} /> : n}</span>
            <span className={active ? 'text-slate-200' : 'text-slate-500'}>{label}</span>
            {n < steps.length && <span className="mx-1 h-px w-6 bg-slate-800" />}
          </div>
        );
      })}
    </div>
  );
}

function ChoiceCard({ active, onClick, title, body, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition ${
        active ? 'border-brand bg-brand/10' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-100">{title}</span>
        {badge && <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-semibold text-brand">{badge}</span>}
      </div>
      <p className="mt-1 text-xs text-slate-400">{body}</p>
    </button>
  );
}

function CodeBlock({ code, copy }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200"><code>{code}</code></pre>
      <button onClick={() => copy(code)} className="absolute right-2 top-2 rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200" title="Copy">
        <Copy size={13} />
      </button>
    </div>
  );
}

function Step({ n, children }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-300">{n}</span>
      <div className="min-w-0 flex-1 space-y-2 text-sm text-slate-300">{children}</div>
    </li>
  );
}

function SetupSteps({ platform, copy, apiKey }) {
  const key = apiKey || 'mp_test_xxxxxxxxxxxx';
  const curl = `curl -X POST ${API_BASE}/v1/pay \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"reference":"order-1","amount":"5.00"}'`;

  if (platform === 'wordpress') {
    return (
      <ol className="space-y-4">
        <Step n={1}>Download the <b>ManishaPay / PayNow Bridge</b> plugin from{' '}
          <a href="https://github.com/nobytechy/manishapay-sdks" target="_blank" rel="noopener noreferrer" className="text-brand underline">GitHub</a>.</Step>
        <Step n={2}>In WordPress: <b>Plugins → Add New → Upload</b>, then <b>Activate</b>.</Step>
        <Step n={3}>Go to <b>WooCommerce → Settings → Payments → ManishaPay</b> and paste your <b>test API key</b>.</Step>
        <Step n={4}>Place a test order — it runs through the sandbox with a signed webhook back to WooCommerce.</Step>
      </ol>
    );
  }
  if (platform === 'web') {
    const snippet = `<script src="https://manishapay.netlify.app/checkout.js"></script>
<script>
  ManishaPay.checkout({
    key: '${key}',
    reference: 'order-1',
    amount: '5.00',
    description: 'Pro plan'
  });
</script>`;
    return (
      <ol className="space-y-4">
        <Step n={1}>Grab your <b>test API key</b> (button below).</Step>
        <Step n={2}>Drop this button on any page — no backend needed:<CodeBlock code={snippet} copy={copy} /></Step>
        <Step n={3}>Prefer the API? Call it directly:<CodeBlock code={curl} copy={copy} /></Step>
        <Step n={4}>Test outcomes (Paid / Cancelled) in the <b>Sandbox</b>.</Step>
      </ol>
    );
  }
  if (platform === 'mobile') {
    return (
      <ol className="space-y-4">
        <Step n={1}>Grab your <b>test API key</b> and keep it on your server, never in the app.</Step>
        <Step n={2}>From your backend, create the payment:<CodeBlock code={curl} copy={copy} /></Step>
        <Step n={3}>Open the returned <code>browser_url</code> in a WebView / browser; PayNow returns to your <code>Return URL</code> (deep link).</Step>
        <Step n={4}>Confirm the result from the signed webhook — verify it in one line with our Node / PHP SDK.</Step>
      </ol>
    );
  }
  // api / custom
  return (
    <ol className="space-y-4">
      <Step n={1}>Install an SDK:<CodeBlock code={`npm install manishapay\n# or\ncomposer require manishapay/manishapay`} copy={copy} /></Step>
      <Step n={2}>Create a payment:<CodeBlock code={curl} copy={copy} /></Step>
      <Step n={3}>Redirect the customer to <code>browser_url</code>; PayNow calls your <code>Result URL</code> webhook.</Step>
      <Step n={4}>Verify the webhook signature (SDK <code>verifyWebhook</code>) and mark the order paid.</Step>
    </ol>
  );
}
