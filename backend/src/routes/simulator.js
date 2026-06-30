/**
 * /simulator/:tracker — the page a "simulated" transaction's browser_url
 * points at. A real PayNow integration takes the customer to a PayNow
 * checkout page; ours takes them to a small panel with three buttons:
 *
 *   • Mark Paid       — fires a webhook with status=Paid
 *   • Mark Cancelled  — fires a webhook with status=Cancelled
 *   • Simulate Timeout — leaves the txn in Sent, doesn't fire anything
 *
 * Public route (no auth) — anyone with the tracker can interact with the
 * simulated transaction. That's fine because simulated transactions
 * don't move money or count toward billing. Tracker is a 16-hex random
 * string, so it's already unguessable.
 *
 * GET  /simulator/:tracker         → the HTML page
 * POST /simulator/:tracker/poll    → form-encoded PayNow-shaped status response (lets devs test their pollUrl handling)
 * POST /simulator/:tracker/outcome → triggers the chosen outcome + webhook fan-out
 */
'use strict';

const router = require('express').Router();
const { supabase } = require('../config/supabase');
const { logger } = require('../services/logger');
const paynow = require('../services/paynow');
const webhookDelivery = require('../services/webhookDelivery');

// ── HTML page ───────────────────────────────────────────────────────────
router.get('/:tracker', async (req, res) => {
  const { tracker } = req.params;
  const { data: txn } = await supabase
    .from('manishapay_transactions')
    .select('id, tracker, merchant_reference, merchant_amount, currency, status, status_normalized, mode, method, created_at, project_id')
    .eq('tracker', tracker)
    .maybeSingle();

  if (!txn) {
    res.status(404).type('html').send(notFoundPage(tracker));
    return;
  }
  res.type('html').send(simulatorPage(txn));
});

// ── Empty POST poll endpoint, mimics PayNow's pollurl ───────────────────
router.post('/:tracker/poll', async (req, res) => {
  const { tracker } = req.params;
  const { data: txn } = await supabase
    .from('manishapay_transactions')
    .select('merchant_reference, merchant_amount, status, paynow_reference, mode')
    .eq('tracker', tracker)
    .maybeSingle();

  if (!txn) {
    res.type('text/plain').send('status=Error&error=Unknown+tracker');
    return;
  }
  // PayNow-shaped form-urlencoded response so SDKs that hit pollurl still
  // parse cleanly. No hash here — simulated mode skips hash verification.
  const payload = new URLSearchParams({
    reference: tracker,
    paynowreference: txn.paynow_reference || 'sim-' + tracker.slice(3, 11),
    amount: String(txn.merchant_amount),
    status: txn.status || 'Sent',
    pollurl: `${publicBase(req)}/simulator/${tracker}/poll`,
  });
  res.type('application/x-www-form-urlencoded').send(payload.toString());
});

// ── Outcome trigger: button on the page calls this ──────────────────────
router.post('/:tracker/outcome', async (req, res) => {
  const { tracker } = req.params;
  const outcome = String(req.body?.outcome || '').toLowerCase();

  const { data: txn, error: txnErr } = await supabase
    .from('manishapay_transactions')
    .select('id, tracker, merchant_reference, merchant_amount, mode, project_id, status')
    .eq('tracker', tracker)
    .maybeSingle();

  if (txnErr || !txn) {
    return res.status(404).json({ error: 'unknown tracker' });
  }
  if (txn.mode !== 'simulated') {
    return res.status(400).json({ error: 'only simulated transactions can be triggered here' });
  }

  let newStatus;
  if (outcome === 'paid') newStatus = 'Paid';
  else if (outcome === 'cancelled') newStatus = 'Cancelled';
  else if (outcome === 'timeout') newStatus = txn.status; // leave as-is
  else return res.status(400).json({ error: 'outcome must be paid|cancelled|timeout' });

  const updatedAt = new Date().toISOString();
  const newStatusNormalized = paynow.normalizeStatus(newStatus);

  // Update the transaction.
  if (outcome !== 'timeout') {
    await supabase
      .from('manishapay_transactions')
      .update({
        status: newStatus,
        status_normalized: newStatusNormalized,
        paid_at: newStatusNormalized === 'paid' ? updatedAt : null,
        updated_at: updatedAt,
      })
      .eq('id', txn.id);
  }

  // Fan-out signed webhooks to the merchant's configured endpoints.
  const { data: endpoints } = await supabase
    .from('manishapay_webhook_endpoints')
    .select('id, url, secret, status')
    .eq('project_id', txn.project_id)
    .eq('status', 'active');

  if (endpoints && endpoints.length > 0 && outcome !== 'timeout') {
    Promise.all(
      endpoints.map((ep) =>
        webhookDelivery.deliverOne(ep, {
          ...txn,
          status: newStatus,
          status_normalized: newStatusNormalized,
        }),
      ),
    ).catch((err) => logger.error({ err }, 'simulator webhook fan-out failed'));
  }

  res.json({
    ok: true,
    outcome,
    status: newStatus,
    status_normalized: newStatusNormalized,
    webhooks_dispatched: outcome === 'timeout' ? 0 : (endpoints?.length || 0),
  });
});

function publicBase(req) {
  const proto = req.header('x-forwarded-proto') || req.protocol;
  const host = req.header('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}

// ── Page templates (kept inline so the simulator works without a build step) ──
function simulatorPage(txn) {
  const isFinal = txn.status_normalized === 'paid' || txn.status_normalized === 'failed';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>ManishaPay — Simulated checkout</title>
  <style>
    :root { --green:#10b981; --green-dark:#047857; --green-deepest:#064e3b; --slate:#0b1220; --slate-2:#1e293b; --slate-3:#334155; --text:#f1f5f9; --muted:#94a3b8; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; background:#0b1220; color:var(--text); font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; display:grid; place-items:center; padding:24px; }
    .card { width:100%; max-width:480px; background:#0f172a; border:1px solid #1e293b; border-radius:16px; overflow:hidden; box-shadow:0 30px 60px -20px rgba(0,0,0,.5); }
    .head { background:linear-gradient(135deg,#10b981 0%,#047857 100%); padding:22px 24px; }
    .head .row { display:flex; align-items:center; justify-content:space-between; }
    .badge { background:rgba(255,255,255,.18); color:white; padding:4px 10px; border-radius:999px; font-size:11px; font-weight:600; letter-spacing:.4px; text-transform:uppercase; }
    h1 { font-size:18px; font-weight:600; margin:0; color:white; }
    .amount { color:white; font-size:32px; font-weight:700; margin-top:14px; letter-spacing:-0.5px; }
    .ref { color:rgba(255,255,255,.85); font-size:13px; margin-top:2px; font-family:ui-monospace,Menlo,Consolas,monospace; }
    .body { padding:22px 24px; }
    .row2 { display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #1e293b; font-size:13px; }
    .row2:last-of-type { border-bottom:none; }
    .row2 .k { color:var(--muted); }
    .row2 .v { color:var(--text); font-family:ui-monospace,Menlo,Consolas,monospace; }
    .actions { padding:18px 24px 24px; display:grid; gap:10px; }
    button { font:inherit; cursor:pointer; padding:14px 18px; border-radius:10px; border:none; font-weight:600; display:flex; align-items:center; justify-content:center; gap:8px; transition:transform .1s,opacity .15s; }
    button:active { transform:translateY(1px); }
    button:disabled { opacity:.5; cursor:not-allowed; }
    .btn-paid { background:linear-gradient(135deg,#10b981 0%,#047857 100%); color:white; }
    .btn-cancel { background:#1e293b; color:#fca5a5; border:1px solid #334155; }
    .btn-timeout { background:transparent; color:var(--muted); border:1px solid #334155; }
    .note { padding:12px 24px 22px; color:var(--muted); font-size:12px; text-align:center; line-height:1.5; }
    .result { margin-top:14px; padding:12px 14px; border-radius:8px; background:#0b3b2e; color:#a7f3d0; font-size:13px; display:none; }
    .result.show { display:block; }
    .result.error { background:#3b0b0b; color:#fca5a5; }
    .footer { padding:14px 24px; border-top:1px solid #1e293b; text-align:center; font-size:11px; color:var(--muted); }
    .logo { display:inline-flex; align-items:center; gap:6px; color:var(--muted); }
    .logo svg { width:14px; height:14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div class="row">
        <span class="badge">Simulated</span>
        <span class="badge" style="background:rgba(0,0,0,.2)">${escape(txn.mode)}</span>
      </div>
      <div class="amount">${escape(txn.currency || 'USD')} ${escape(Number(txn.merchant_amount).toFixed(2))}</div>
      <div class="ref">${escape(txn.merchant_reference)}</div>
    </div>
    <div class="body">
      <div class="row2"><span class="k">Tracker</span><span class="v">${escape(txn.tracker)}</span></div>
      <div class="row2"><span class="k">Method</span><span class="v">${escape(txn.method || 'Web redirect')}</span></div>
      <div class="row2"><span class="k">Current status</span><span class="v" id="status">${escape(txn.status)}</span></div>
    </div>
    <div class="actions">
      <button class="btn-paid" id="btn-paid" ${isFinal ? 'disabled' : ''}>✓ Mark as Paid</button>
      <button class="btn-cancel" id="btn-cancel" ${isFinal ? 'disabled' : ''}>✕ Mark as Cancelled</button>
      <button class="btn-timeout" id="btn-timeout" ${isFinal ? 'disabled' : ''}>⏱ Simulate timeout (no webhook)</button>
      <div class="result" id="result"></div>
    </div>
    <div class="note">
      No real PayNow call was made. Configure your project's PayNow credentials in the dashboard to switch from simulated to real test/live mode.
    </div>
    <div class="footer">
      <a class="logo" href="/" target="_blank" style="text-decoration:none;color:inherit">
        <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="14" fill="#10b981"/></svg>
        ManishaPay simulator
      </a>
    </div>
  </div>
  <script>
    const tracker = ${JSON.stringify(txn.tracker)};
    const reference = ${JSON.stringify(txn.merchant_reference)};
    const result = document.getElementById('result');
    const statusEl = document.getElementById('status');
    function setBusy(on) {
      ['btn-paid','btn-cancel','btn-timeout'].forEach(id => document.getElementById(id).disabled = on);
    }
    async function trigger(outcome) {
      setBusy(true);
      result.classList.remove('show','error');
      try {
        const r = await fetch('/simulator/' + tracker + '/outcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outcome }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        statusEl.textContent = j.status;
        result.textContent = '✓ ' + outcome.charAt(0).toUpperCase() + outcome.slice(1)
          + (j.webhooks_dispatched ? ' — fired ' + j.webhooks_dispatched + ' webhook(s) to your endpoints' : ' — no webhook endpoints configured for this project');
        result.classList.add('show');
        // Notify any parent window that opened us in an iframe (the
        // drop-in checkout.js widget). Wildcard target is fine because
        // we only emit non-sensitive data.
        var inIframe = window.parent && window.parent !== window;
        try {
          if (inIframe) {
            window.parent.postMessage({
              source: 'manishapay',
              type: outcome === 'cancelled' ? 'payment.cancelled' : 'payment.completed',
              data: { tracker: tracker, outcome: outcome, status: j.status },
            }, '*');
          }
        } catch (_) { /* sandboxed — ignore */ }
        // Standalone (web-redirect) flow: return the customer to the merchant's
        // return_url, just like real PayNow. Timeout leaves them on the page.
        var returnUrl = new URLSearchParams(window.location.search).get('return_url');
        if (!inIframe && returnUrl && outcome !== 'timeout') {
          result.textContent += ' — returning you to the merchant…';
          setTimeout(function () {
            var sep = returnUrl.indexOf('?') >= 0 ? '&' : '?';
            window.location.href = returnUrl + sep + 'reference=' + encodeURIComponent(reference) + '&status=' + encodeURIComponent(j.status);
          }, 1500);
        }
      } catch (err) {
        result.textContent = '✗ ' + (err.message || 'Failed');
        result.classList.add('show','error');
      }
      setBusy(false);
    }
    document.getElementById('btn-paid').onclick = () => trigger('paid');
    document.getElementById('btn-cancel').onclick = () => trigger('cancelled');
    document.getElementById('btn-timeout').onclick = () => trigger('timeout');
  </script>
</body>
</html>`;
}

function notFoundPage(tracker) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Tracker not found</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#0b1220;color:#f1f5f9;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}.b{max-width:480px;text-align:center}.b code{background:#1e293b;padding:2px 6px;border-radius:4px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px}</style>
</head><body><div class="b"><h1>Tracker not found</h1><p>The tracker <code>${escape(tracker)}</code> doesn't match any transaction. Either it expired, was generated against a different ManishaPay instance, or the URL was mistyped.</p></div></body></html>`;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

module.exports = router;
