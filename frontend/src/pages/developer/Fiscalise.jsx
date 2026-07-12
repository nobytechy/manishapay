import {
  ScrollText,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  ShieldCheck,
  Wallet,
  Receipt,
  QrCode,
} from 'lucide-react';
import Card from '../../components/ui/Card';
import FiscalReceiptCard from '../../components/FiscalReceiptCard';

/*
 * Fiscalisation (ZIMRA FDMS).
 *
 * ManishaPay is the payments half of the story; its sibling app zimFDMS is the
 * tax-compliance half. Every VAT-registered Zimbabwean business that takes a
 * payment must also issue a ZIMRA fiscal tax invoice (FDMS). Rather than
 * rebuild a compliance-grade fiscalisation engine here, we point merchants to
 * the sibling service that already does it — one login story, two bridges.
 *
 * This page is honest: fiscalisation is delivered by zimFDMS (live), not faked
 * inside ManishaPay. The receipt card is a real preview of an FDMS invoice.
 */

const ZIMFDMS = 'https://zimrafdms.netlify.app';

export default function Fiscalise() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand">
          <ScrollText size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Fiscalisation · ZIMRA FDMS</h1>
          <p className="text-sm text-slate-400">
            Get paid with ManishaPay, stay ZIMRA-compliant with zimFDMS — the two halves of Zimbabwean commerce.
          </p>
        </div>
      </header>

      {/* Hero: value prop + live receipt preview */}
      <div className="grid items-center gap-8 md:grid-cols-2">
        <div className="space-y-5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brandblue/40 bg-brandblue/10 px-3 py-1 text-xs font-semibold text-brandblue-300">
            <ShieldCheck size={13} /> Sibling service · Sandbox preview
          </span>
          <p className="text-lg leading-relaxed text-slate-300">
            If you’re VAT-registered, every sale also needs a <b className="text-slate-100">ZIMRA fiscal tax
            invoice</b>. <b className="text-slate-100">zimFDMS</b> is our sibling bridge, built to the ZIMRA FDMS v7.2
            spec — the signature math, fiscal-day state machine and QR-coded ticketing, one endpoint instead of nine.
          </p>
          <p className="text-sm text-slate-400">
            Same idea as ManishaPay, for a different mandate. It’s in an <b className="text-slate-300">interactive
            sandbox preview</b> today — explore the full lifecycle now; the production ZIMRA-connected bridge is in
            active development.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href={ZIMFDMS}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-slate-950 transition-colors hover:bg-brand-dark hover:text-white"
            >
              Open zimFDMS <ArrowRight size={14} />
            </a>
            <a
              href={`${ZIMFDMS}/how-it-works`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
            >
              How it works <ExternalLink size={13} />
            </a>
          </div>
        </div>

        <div className="flex justify-center md:justify-end">
          <FiscalReceiptCard />
        </div>
      </div>

      {/* The complete stack */}
      <Card title="The complete Zimbabwe commerce stack" description="Two bridges, one mission — kill the integration headache.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
            <div className="flex items-center gap-2 text-brand">
              <Wallet size={18} />
              <span className="font-semibold text-slate-100">ManishaPay</span>
              <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-semibold text-brand">You’re here</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Collect the money — PayNow / EcoCash without the integration pain. Signed webhooks, sandbox, SDKs.
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center gap-2 text-slate-200">
              <Receipt size={18} />
              <span className="font-semibold text-slate-100">zimFDMS</span>
              <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-semibold text-slate-300">Sibling</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Fiscalise the sale — issue the ZIMRA fiscal invoice with QR + signature, automatically.
            </p>
          </div>
        </div>
      </Card>

      {/* How they work together */}
      <Card title="How they work together">
        <ol className="space-y-4">
          <Step n={1}>
            Customer pays through your <b className="text-slate-200">ManishaPay</b> integration (PayNow / EcoCash).
          </Step>
          <Step n={2}>
            On the confirmed payment, your POS or store sends that sale to <b className="text-slate-200">zimFDMS</b>.
          </Step>
          <Step n={3}>
            zimFDMS signs it, advances the fiscal day and submits it to ZIMRA’s FDMS — returning a fiscal invoice
            number, QR code and signature.
          </Step>
          <Step n={4}>
            The customer gets a compliant fiscal receipt; anyone can verify it on{' '}
            <span className="text-rose-400">invoice-verification.zimra.co.zw</span>.
          </Step>
        </ol>

        <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-800 pt-5">
          <a
            href={`${ZIMFDMS}/sandbox`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
          >
            <ScrollText size={14} /> Try the FDMS sandbox
          </a>
          <a
            href={`${ZIMFDMS}/verify`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
          >
            <QrCode size={14} /> Verify a receipt
          </a>
          <a
            href={`${ZIMFDMS}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
          >
            <ExternalLink size={14} /> FDMS API docs
          </a>
        </div>
      </Card>

      {/* Honest note */}
      <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-400">
        <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-brand" />
        <p>
          Fiscalisation is a <b className="text-slate-300">separate sibling app, zimFDMS</b> — currently a live{' '}
          <b className="text-slate-300">sandbox preview</b> where you can walk the full FDMS lifecycle. The
          production ZIMRA-connected bridge is in active development, so don’t rely on it for real fiscalisation yet.
          It’s aimed at <b className="text-slate-300">VAT-registered</b> merchants. Links open zimFDMS in a new tab.
        </p>
      </div>
    </div>
  );
}

function Step({ n, children }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-300">
        {n}
      </span>
      <div className="min-w-0 flex-1 text-sm text-slate-300">{children}</div>
    </li>
  );
}
