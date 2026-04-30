/**
 * ManishaPay — Node.js example.
 *
 * Run:
 *   API_KEY=mp_test_xxx node example.js
 */
const API = process.env.API_BASE || 'https://api.manishapay.dev';
const KEY = process.env.API_KEY;

if (!KEY) {
  console.error('Set API_KEY=mp_test_xxx first.');
  process.exit(1);
}

async function pay() {
  const res = await fetch(`${API}/v1/pay`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'X-Request-Id': `nodejs-${Date.now()}`,
    },
    body: JSON.stringify({
      reference: `INV-${Date.now()}`,
      amount: '10.00',           // ManishaPay normalises any decimal format
      description: 'Pro plan',
      email: 'buyer@test.com',
      method: 'ecocash',         // Optional: omit for redirect-style flow
      phone: '0772123456',       // Auto-formatted to MSISDN
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Failed:', err.error || res.status);
    return;
  }

  const { data, requestId } = await res.json();
  console.log('Initiated:', data);
  console.log('Trace with requestId:', requestId);
}

pay().catch((err) => console.error(err));
