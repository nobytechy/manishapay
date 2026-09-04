import { describe, it, expect } from 'vitest';
import { buildReceipt } from './ShareReceipt';

/*
 * A receipt leaves the app and lives on someone's phone. It gets forwarded,
 * screenshotted and read by a customer who has no idea what ManishaPay is, so
 * the guarantees worth pinning are about what it says, not how it renders.
 */
describe('buildReceipt', () => {
  const paid = {
    merchant_reference: 'INV-1042',
    merchant_amount: '25',
    currency: 'USD',
    mode: 'live',
    paynow_reference: 'PN-99',
    created_at: '2026-09-01T10:30:00.000Z',
  };

  it('leads with the business name so the customer knows who sent it', () => {
    expect(buildReceipt(paid, 'Manisha Butchery')).toMatch(/^Manisha Butchery — payment received/);
  });

  it('still works when the account has no name set', () => {
    expect(buildReceipt(paid, null)).toMatch(/^Payment received/);
  });

  it('formats the amount to two decimals with its currency', () => {
    expect(buildReceipt(paid, null)).toContain('USD 25.00');
  });

  it('carries the reference the customer would quote back', () => {
    expect(buildReceipt(paid, null)).toContain('INV-1042');
  });

  // The one that actually matters: a test payment forwarded to a customer as
  // proof of payment would be a lie the merchant didn't know they were telling.
  it('marks a test payment as not real money', () => {
    const text = buildReceipt({ ...paid, mode: 'test' }, null);
    expect(text).toContain('no real money was transferred');
  });

  it('marks a simulated payment as not real money', () => {
    const text = buildReceipt({ ...paid, mode: 'simulated' }, null);
    expect(text).toContain('no real money was transferred');
  });

  it('adds no such warning to a live payment', () => {
    expect(buildReceipt(paid, null)).not.toContain('no real money');
  });

  it('omits the gateway line when there is no gateway reference', () => {
    const text = buildReceipt({ ...paid, paynow_reference: null }, null);
    expect(text).not.toContain('Gateway:');
  });

  it('survives a transaction with almost nothing on it', () => {
    const text = buildReceipt({ merchant_reference: 'X' }, null);
    expect(text).toContain('USD 0.00');
    expect(text).toContain('X');
  });
});
