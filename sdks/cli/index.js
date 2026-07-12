#!/usr/bin/env node
/**
 * ManishaPay CLI — local webhook forwarding.
 *
 * Forwards live payment events to your localhost while you develop, so you can
 * build and test your webhook handler without deploying or exposing a public URL.
 *
 * Usage:
 *   manishapay listen --key mp_test_xxx --forward-to http://localhost:3000/webhook
 *   # optional: --secret whsec_xxx (signs like a real webhook), --api <base>
 *
 * © 2026 Noby Tebulo (https://nobie.netlify.app). MIT.
 */
'use strict';

const crypto = require('crypto');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
}

const key = arg('key');
const forwardTo = arg('forward-to');
const api = (arg('api', 'https://manishapay.netlify.app/api')).replace(/\/+$/, '');
const secret = arg('secret');
const interval = Number(arg('interval', '3000'));

if (!key || !forwardTo) {
  console.error('ManishaPay CLI — forward webhook events to localhost\n');
  console.error('Usage:\n  manishapay listen --key mp_test_xxx --forward-to http://localhost:3000/webhook \\');
  console.error('    [--secret whsec_xxx] [--api https://manishapay.netlify.app/api] [--interval 3000]');
  process.exit(1);
}

let cursor = new Date().toISOString();
console.log(`ManishaPay CLI listening — forwarding events to ${forwardTo}`);
console.log('Waiting for payment events… (Ctrl+C to stop)\n');

async function tick() {
  try {
    const r = await fetch(`${api}/v1/cli/events?since=${encodeURIComponent(cursor)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) {
      console.error(`poll error: HTTP ${r.status}`);
      return;
    }
    const { data } = await r.json();
    cursor = data.cursor || cursor;
    for (const ev of data.events || []) {
      const body = JSON.stringify(ev);
      const headers = { 'Content-Type': 'application/json' };
      if (secret) {
        const t = Math.floor(Date.now() / 1000);
        const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
        headers['X-ManishaPay-Signature'] = `t=${t},v1=${sig}`;
      }
      try {
        const resp = await fetch(forwardTo, { method: 'POST', headers, body });
        console.log(`→ ${ev.data.status_normalized || ev.data.status}  ${ev.data.reference}  [${resp.status}]`);
      } catch (e) {
        console.error(`forward failed: ${e.message}`);
      }
    }
  } catch (e) {
    console.error(`error: ${e.message}`);
  }
}

setInterval(tick, Number.isFinite(interval) && interval >= 1000 ? interval : 3000);
tick();
