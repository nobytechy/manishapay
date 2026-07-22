'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.MOCK_MODE = 'true';
const dpo = require('../src/providers/dpo');

test('buildXml for createToken contains all required fields', () => {
  const xml = dpo.buildXml({
    CompanyToken: 'TOKEN-123',
    Request: 'createToken',
    Transaction: {
      PaymentAmount: dpo.toGatewayAmount('10'),
      PaymentCurrency: 'USD',
      CompanyRef: 'order-1',
      RedirectURL: 'https://m.example/return',
      BackURL: 'https://m.example/back',
      CompanyRefUnique: '1',
      PTL: '96',
    },
    Services: {
      Service: {
        ServiceType: '3854',
        ServiceDescription: 'Test payment',
        ServiceDate: '2026/07/18 12:00',
      },
    },
  });

  assert.match(xml, /^<\?xml version="1\.0" encoding="utf-8"\?><API3G>/);
  assert.match(xml, /<Request>createToken<\/Request>/);
  assert.match(xml, /<CompanyToken>TOKEN-123<\/CompanyToken>/);
  assert.match(xml, /<PaymentAmount>10\.00<\/PaymentAmount>/);
  assert.match(xml, /<PaymentCurrency>USD<\/PaymentCurrency>/);
  assert.match(xml, /<CompanyRef>order-1<\/CompanyRef>/);
  assert.match(xml, /<RedirectURL>https:\/\/m\.example\/return<\/RedirectURL>/);
  assert.match(xml, /<BackURL>https:\/\/m\.example\/back<\/BackURL>/);
  assert.match(xml, /<CompanyRefUnique>1<\/CompanyRefUnique>/);
  assert.match(xml, /<PTL>96<\/PTL>/);
  assert.match(xml, /<Service><ServiceType>3854<\/ServiceType>/);
  assert.match(xml, /<ServiceDescription>Test payment<\/ServiceDescription>/);
  assert.match(xml, /<\/API3G>$/);
});

test('buildXml escapes special characters in values', () => {
  const xml = dpo.buildXml({ CompanyRef: 'a & b <x> "q"' });
  assert.match(xml, /<CompanyRef>a &amp; b &lt;x&gt; &quot;q&quot;<\/CompanyRef>/);
  assert.doesNotMatch(xml, /<x>/);
});

test('toGatewayAmount formats to a 2dp decimal string', () => {
  assert.equal(dpo.toGatewayAmount('10'), '10.00');
  assert.equal(dpo.toGatewayAmount(2.5), '2.50');
  assert.equal(dpo.toGatewayAmount('2,50'), '2.50'); // comma-decimal locale
  assert.throws(() => dpo.toGatewayAmount('0'));
  assert.throws(() => dpo.toGatewayAmount('abc'));
  assert.throws(() => dpo.toGatewayAmount(-5));
});

test('parseResponse extracts Result and TransToken from a createToken response', () => {
  const sample =
    '<?xml version="1.0" encoding="utf-8"?><API3G>' +
    '<Result>000</Result>' +
    '<ResultExplanation>Transaction created</ResultExplanation>' +
    '<TransToken>ABC-TOKEN-999</TransToken>' +
    '<TransRef>1234567</TransRef>' +
    '</API3G>';
  const parsed = dpo.parseResponse(sample);
  assert.equal(parsed.result, '000');
  assert.equal(parsed.transToken, 'ABC-TOKEN-999');
  assert.equal(parsed.transRef, '1234567');
  assert.equal(parsed.resultExplanation, 'Transaction created');
});

test('parseResponse handles a verifyToken response with only Result', () => {
  const sample =
    '<?xml version="1.0" encoding="utf-8"?><API3G><Result>901</Result>' +
    '<ResultExplanation>Declined</ResultExplanation></API3G>';
  const parsed = dpo.parseResponse(sample);
  assert.equal(parsed.result, '901');
  assert.equal(parsed.transToken, undefined);
});

test('normalizeStatus maps DPO Result codes into the 5-value enum', () => {
  assert.equal(dpo.normalizeStatus('000'), 'paid'); // paid & captured
  assert.equal(dpo.normalizeStatus('001'), 'pending'); // auth-only — NOT paid
  assert.equal(dpo.normalizeStatus('002'), 'paid'); // over/under paid
  assert.equal(dpo.normalizeStatus('007'), 'pending');
  assert.equal(dpo.normalizeStatus('900'), 'pending'); // pending/not processed
  assert.equal(dpo.normalizeStatus('006'), 'disputed'); // fraud hold
  assert.equal(dpo.normalizeStatus('901'), 'failed'); // declined
  assert.equal(dpo.normalizeStatus('903'), 'failed'); // expired
  assert.equal(dpo.normalizeStatus('904'), 'failed'); // cancelled
  assert.equal(dpo.normalizeStatus('9999'), 'pending'); // unknown -> safe default
  assert.equal(dpo.normalizeStatus(''), 'pending');
  assert.equal(dpo.normalizeStatus(null), 'pending');
});

test('normalizeStatus never returns a value outside the canonical enum', () => {
  const canonical = new Set(['paid', 'pending', 'failed', 'disputed', 'refunded']);
  for (const code of ['000', '001', '002', '006', '007', '801', '900', '901', '902', '903', '904', '950', 'xyz']) {
    assert.ok(canonical.has(dpo.normalizeStatus(code)), `code ${code} mapped outside enum`);
  }
});
