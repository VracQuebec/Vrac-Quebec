import type { PublicQuote } from '@/lib/jsc/engine';
import type { SubmitResult } from './submit';

export interface QuoteReceipt { number: string; quote: PublicQuote; result?: SubmitResult }
const key = (form: string) => `vq.quote-receipt.${form}`;

/** Same-tab confirmation only; never a bearer token or an authorization source. */
export function readQuoteReceipt(form: string): QuoteReceipt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key(form)) ?? 'null');
    return value && typeof value.number === 'string' && value.number.length > 0
      && value.quote && Number.isFinite(value.quote.total) && value.quote.material
      && Array.isArray(value.quote.taxes) ? value : null;
  } catch { return null; }
}
export function saveQuoteReceipt(form: string, receipt: QuoteReceipt) {
  try { sessionStorage.setItem(key(form), JSON.stringify(receipt)); } catch { /* CRM remains authoritative. */ }
}
export function clearQuoteReceipt(form: string) {
  try { sessionStorage.removeItem(key(form)); } catch { /* unavailable storage */ }
}