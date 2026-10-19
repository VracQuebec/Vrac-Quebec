import { describe,it,expect } from 'vitest';
import { invoiceState,invoiceRest } from '@/components/finances/Invoices';
import { validateInvoiceMail,invoiceMailDraft } from '@/lib/finances/invoiceMail';
import type { InvoicePdfData } from '@/lib/finances/invoicePdf';

describe('EXEC-05 règles de facturation',()=>{
  const invoice={status:'emise',total:344.93,due_date:'2026-11-19',fin_credit_notes:[],fin_expected_inflows:{received:100}};
  it('un courriel envoyé ne paie jamais une facture',()=>{
    expect(invoiceRest({...invoice,sent_at:'2026-10-19'})).toBeCloseTo(244.93,2);
    expect(invoiceState({...invoice,sent_at:'2026-10-19'},'2026-10-19').label).toBe('Partiellement payée');
  });
  it('solde nul par avoir ne signifie pas encaissement',()=>{
    expect(invoiceState({...invoice,fin_credit_notes:[{status:'emise',total:344.93}]},'2026-10-19').label).toBe('Soldée par avoir');
  });
  it('refuse une injection dans les en-têtes de courriel',()=>{
    expect(()=>validateInvoiceMail({to:'camille@test.invalid',subject:'Facture\r\nBcc: autre@test.invalid',message:'TEST'})).toThrow();
  });
  it('le courriel reste un brouillon avec le PDF émis',async()=>{
    const d={status:'emise',number:'F-00001'} as InvoicePdfData;
    const blob=invoiceMailDraft({to:'camille@test.invalid',subject:'Facture TEST',message:'TEST'},d,'JVBERg==');
    const text=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsText(blob);});
    expect(text).toContain('X-Unsent: 1');expect(text).toContain('JVBERg==');
    expect(()=>invoiceMailDraft({to:'camille@test.invalid',subject:'TEST',message:'TEST'},{...d,status:'brouillon'},'JVBERg==')).toThrow();
  });
});