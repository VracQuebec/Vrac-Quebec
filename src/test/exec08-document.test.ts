import {describe,it,expect,vi} from 'vitest';
import {frozenInvoicePdf,invoicePdfBase64,invoiceMailDraft} from '@/lib/finances/invoiceMail';
import type {InvoicePdfData} from '@/lib/finances/invoicePdf';
describe('EXEC08 document émis unique',()=>{
 it('le brouillon courrier conserve les octets du fichier privé, pas un nouveau rendu',async()=>{
  const original=new Blob(['%PDF-1.4\nTEST frozen original\n%%EOF'],{type:'application/pdf'});
  const download=vi.fn(async()=>({data:original,error:null}));
  const loaded=await frozenInvoicePdf('company/pdf/invoice.pdf',download);
  expect(loaded).toBe(original);expect(download).toHaveBeenCalledWith('company/pdf/invoice.pdf');
  const base64=await invoicePdfBase64(loaded);
  expect(atob(base64)).toBe('%PDF-1.4\nTEST frozen original\n%%EOF');
  const eml=invoiceMailDraft({to:'test@example.invalid',subject:'TEST',message:'TEST'},{status:'emise',number:'F-TEST'} as InvoicePdfData,base64);
  const text=await new Promise<string>((resolve)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.readAsText(eml);});
  expect(text).toContain(base64);
 });
 it('fichier absent ou accès refusé bloque la préparation sans remplacement',async()=>{
  const download=vi.fn(async()=>({data:null,error:Error('denied')}));
  await expect(frozenInvoicePdf(null,download)).rejects.toThrow('PDF figé absent');expect(download).not.toHaveBeenCalled();
  await expect(frozenInvoicePdf('company/pdf/invoice.pdf',download)).rejects.toThrow('PDF privé indisponible');
 });
});