import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Loader2, Plug, Play } from 'lucide-react';
import Button from '../ui/Button';
import { api } from '../../lib/api';

/**
 * First run: one button, and what happens when you press it.
 *
 * A brand-new account used to land on a header, a checklist, four stat tiles
 * reading zero, a promo card and a table saying "no payments yet" — five
 * elements all telling a first-time visitor the product is empty, and no
 * obvious way to find out whether it works. Proving it took a project, an API
 * key, a payment link and a second browser tab.
 *
 * So: one button. It runs a real simulated payment through the real pipeline
 * and shows the status move on screen. The pauses between stages are
 * deliberate — the whole point is watching it happen, and an instant jump to
 * "paid" reads like a mock-up rather than a system doing work.
 */

const STAGES = {
  idle: null,
  creating: 'Creating the payment…',
  sending: 'Sent to checkout — waiting for the customer…',
  confirming: 'Customer paid. Confirming…',
  done: null,
};

export default function FirstRun({ onPaid }) {
  const [stage, setStage] = useState('idle');
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState(null);

  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  const run = async () => {
    setError(null);
    setStage('creating');
    try {
      const created = await api.startDemoPayment({ description: 'Your first payment' });
      const { reference, tracker, amount, currency } = created.data;
      setPayment({ reference, amount, currency });
      await pause(700);

      setStage('sending');
      await pause(900);

      // The simulator is proxied same-origin, and only accepts transactions
      // that are actually simulated — so this can't touch a real payment.
      const res = await fetch(`/simulator/${tracker}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: 'paid' }),
      });
      if (!res.ok) throw new Error('The checkout did not respond. Try again.');

      setStage('confirming');

      // Poll our own record rather than trusting the trigger's response — this
      // is the same status the merchant's server would read via webhook.
      let paid = false;
      for (let i = 0; i < 8 && !paid; i += 1) {
        await pause(500);
        try {
          const status = await api.getDemoPayment(reference);
          paid = status?.data?.status_normalized === 'paid';
        } catch { /* keep polling */ }
      }
      if (!paid) throw new Error('The payment did not confirm in time. Try again.');

      setStage('done');
      onPaid?.();
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
      setStage('idle');
    }
  };

  if (stage === 'done') {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand/15 text-brand">
          <Check size={28} />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-slate-100">That's a payment.</h1>
        <p className="mt-2 text-sm text-slate-400">
          {payment?.currency} {payment?.amount} went from created to paid, and it's in your
          payments list. No real money moved.
        </p>
        <div className="mt-7">
          <Link to="/app/methods">
            <Button size="lg">
              <Plug size={18} /> Now add a payment method
            </Button>
          </Link>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          PayNow, Stripe, Paystack, M-Pesa and more — whichever your customers use.
        </p>
      </div>
    );
  }

  const running = stage !== 'idle';

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      {running ? (
        <>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-slate-800 text-brand">
            <Loader2 size={26} className="animate-spin" />
          </div>
          <p className="mt-5 text-lg font-medium text-slate-100">{STAGES[stage]}</p>
          {payment && (
            <p className="mt-2 font-mono text-sm text-slate-500">
              {payment.currency} {payment.amount} · {payment.reference}
            </p>
          )}
        </>
      ) : (
        <>
          <Button size="lg" onClick={run}>
            <Play size={18} /> See a payment work
          </Button>
          <p className="mx-auto mt-4 max-w-xs text-xs text-slate-500">
            Runs one test payment through the real pipeline, start to finish. Takes a few
            seconds. No setup, no real money.
          </p>
          {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        </>
      )}
    </div>
  );
}

/** The next thing to do, once a payment exists. One action, never a list. */
export function NextStep({ hasMethod, hasLive }) {
  if (!hasMethod) {
    return (
      <Card
        title="Add a payment method"
        body="Choose how your customers pay you — PayNow, Stripe, Paystack, M-Pesa and more."
        to="/app/methods"
        cta="Add"
      />
    );
  }
  if (!hasLive) {
    return (
      <Card
        title="Go live"
        body="You're set up for testing. Add your own keys in real-money mode to start getting paid."
        to="/app/methods"
        cta="Go live"
      />
    );
  }
  return null;
}

function Card({ title, body, to, cta }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-4 rounded-xl border border-brand/30 bg-brand/5 p-5 transition hover:border-brand/50"
    >
      <div className="min-w-0">
        <p className="font-semibold text-slate-100">{title}</p>
        <p className="mt-0.5 text-sm text-slate-400">{body}</p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-semibold text-brand">
        {cta} <ArrowRight size={15} />
      </span>
    </Link>
  );
}
