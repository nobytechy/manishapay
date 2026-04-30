// Supabase Edge Function: webhook-relay
//
// Cron-style replay job. Picks up `webhook_deliveries.status = 'failed'`
// rows whose attempt count is below 5 and re-POSTs them, with backoff.
// Schedule it from the Supabase dashboard:
//
//   Schedules → New cron → */5 * * * * → Edge Function → webhook-relay
//
// Why an edge function and not the gateway?
//   The gateway runs as a single Node process on cPanel; if it dies, retries
//   die with it. Putting replay on Supabase's hosted runtime gives us a
//   different blast radius.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// `Deno` is provided by the Supabase edge runtime; the `// @ts-ignore` keeps
// non-Deno tooling (eslint in the gateway repo) happy when it scans this file.
// @ts-ignore
const env = (Deno as any).env;

const supabase = createClient(env.get('SUPABASE_URL')!, env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const MAX_ATTEMPTS = 5;

interface FailedDelivery {
  id: string;
  endpoint_id: string;
  payload: string;
  signature: string | null;
  attempt: number;
}

interface Endpoint {
  id: string;
  url: string;
  status: string;
}

async function replay(d: FailedDelivery, endpoint: Endpoint) {
  const start = Date.now();
  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ManishaPay-Signature': d.signature ?? '',
        'X-ManishaPay-Replay': 'true',
      },
      body: d.payload,
      signal: AbortSignal.timeout(8_000),
    });

    const ok = res.status < 400;
    await supabase.from('webhook_deliveries').insert({
      endpoint_id: d.endpoint_id,
      payload: d.payload,
      signature: d.signature,
      status: ok ? 'delivered' : 'failed',
      http_status: res.status,
      latency_ms: Date.now() - start,
      attempt: d.attempt + 1,
    });
  } catch (err) {
    await supabase.from('webhook_deliveries').insert({
      endpoint_id: d.endpoint_id,
      payload: d.payload,
      signature: d.signature,
      status: 'failed',
      error: (err as Error).message,
      latency_ms: Date.now() - start,
      attempt: d.attempt + 1,
    });
  }
}

// @ts-ignore — Deno.serve is in the edge runtime types
Deno.serve(async () => {
  // Pull failed rows whose attempt count is below the cap. We only look at
  // rows older than 60s (gives the inline delivery a chance to succeed) and
  // newer than 24h (after that we give up).
  const { data: failed, error } = await supabase
    .from('webhook_deliveries')
    .select('id, endpoint_id, payload, signature, attempt')
    .eq('status', 'failed')
    .lt('attempt', MAX_ATTEMPTS)
    .lt('created_at', new Date(Date.now() - 60_000).toISOString())
    .gt('created_at', new Date(Date.now() - 86_400_000).toISOString())
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  let processed = 0;
  for (const d of failed ?? []) {
    const { data: endpoint } = await supabase
      .from('webhook_endpoints')
      .select('id, url, status')
      .eq('id', d.endpoint_id)
      .maybeSingle();
    if (!endpoint || endpoint.status !== 'active') continue;
    await replay(d as FailedDelivery, endpoint as Endpoint);
    processed++;
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    headers: { 'content-type': 'application/json' },
  });
});
