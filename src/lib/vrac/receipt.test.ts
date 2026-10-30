import { beforeEach, describe, expect, it } from 'vitest';
import { clearQuoteReceipt, readQuoteReceipt, saveQuoteReceipt } from './receipt';
import type { PublicQuote } from '@/lib/jsc/engine';

describe('confirmation after reload', () => {
  beforeEach(() => sessionStorage.clear());
  it.each(['achat-vrac', 'soumission'])('retains the accepted reference and exact price for %s', (form) => {
    const receipt = { number: 'TEST-824', quote: { total: 4518.67, material: { name: 'Sable' }, taxes: [] } as unknown as PublicQuote };
    saveQuoteReceipt(form, receipt);
    expect(readQuoteReceipt(form)).toEqual(receipt);
    clearQuoteReceipt(form);
    expect(readQuoteReceipt(form)).toBeNull();
  });
  it('does not display an unconfirmed reference', () => {
    sessionStorage.setItem('vq.quote-receipt.soumission', JSON.stringify({ number: '', quote: { total: 10 } }));
    expect(readQuoteReceipt('soumission')).toBeNull();
  });
});