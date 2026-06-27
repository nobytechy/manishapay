'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const qr = require('../src/services/qr');

test('qr.toDataUrl returns a PNG data URL for a checkout link', async () => {
  const d = await qr.toDataUrl('https://pay.example.com/simulator/mp_abc123');
  assert.match(d, /^data:image\/png;base64,/);
  assert.ok(d.length > 100, 'should produce a non-trivial image');
});

test('qr.toDataUrl rejects empty / non-string input', async () => {
  await assert.rejects(() => qr.toDataUrl(''));
  await assert.rejects(() => qr.toDataUrl(null));
});
