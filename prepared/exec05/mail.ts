// Capture only; same existing queue payload/renderer seam. No provider or hosted client.
import { localServiceMail } from "../exec01b/service-mail";
import { validateInvoiceMail, type InvoiceMail } from "../../src/lib/finances/invoiceMail";
export async function captureInvoiceMail(db: any, user: string, invoice: string, key: string, mail: InvoiceMail) {
  const m = validateInvoiceMail(mail);
  return db.begin(async (tx: any) => {
    await tx`select set_config('request.jwt.claim.sub',${user},true)`;
    const rows = await tx`select i.id,i.number,i.is_test,i.pdf_path,fin_can_write(i.company_id) allowed from fin_invoices i where i.id=${invoice} and i.status='emise'`;
    const i=rows[0]; if(!i?.allowed || !i.is_test)throw Error("Facture TEST autorisée requise");
    if(!key || key.length<8)throw Error("Clé requise");
    const dedupe=`invoice-test:${invoice}:${key}`;
    await tx`select pg_advisory_xact_lock(hashtext(${dedupe}))`;
    const fingerprint=JSON.stringify(m);
    const previous=await tx`select id,payload from local_email_capture where payload->>'idempotency_key'=${dedupe}`;
    if(previous[0]){if(previous[0].payload.request_fingerprint!==fingerprint)throw Error("Clé utilisée pour un autre courriel");return {state:"captured",id:previous[0].id,already:true};}
    const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
    const prepare=localServiceMail(async()=>({text:m.message,html:`<html lang="fr"><body><p>${escape(m.message).replace(/\n/g,'<br>')}</p></body></html>`}));
    const payload=await prepare({requestId:invoice,kind:'invoice',subject:m.subject,url:'',summary:m.message,dedupeKey:dedupe,recipient:m.to});
    if('blocked' in payload)throw Error(payload.reason);
    const out=await tx`select enqueue_email('transactional_emails',${tx.json({...payload,label:'invoice',capture_only:true,invoice_id:invoice,document_path:i.pdf_path,request_fingerprint:fingerprint})}) id`;
    return {state:"captured",id:out[0].id,already:false};
  });
}