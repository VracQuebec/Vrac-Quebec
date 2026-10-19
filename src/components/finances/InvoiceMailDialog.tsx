import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { defaultInvoiceMail, invoiceMailDraft, validateInvoiceMail, type InvoiceMail } from "@/lib/finances/invoiceMail";
import { downloadFinanceBlob } from "@/lib/finances/download";
import { renderInvoicePdf, type InvoicePdfData } from "@/lib/finances/invoicePdf";
import { isExec05Local } from "@/lib/finances/exec05";

export default function InvoiceMailDialog({ data, invoiceId, onClose }: { data: InvoicePdfData; invoiceId: string; onClose: () => void }) {
  const [mail, setMail] = useState<InvoiceMail>(() => defaultInvoiceMail(data));
  const [ready, setReady] = useState<Blob | null>(null); const [error, setError] = useState("");
  const [capture,setCapture]=useState(""); const [key]=useState(()=>crypto.randomUUID());
  useEffect(() => { setReady(null); setError(""); }, [mail]);
  const prepare = () => {
    try { validateInvoiceMail(mail); const pdf = renderInvoicePdf(data).output("datauristring").split(",")[1];
      if (!pdf) throw Error("PDF indisponible."); setReady(invoiceMailDraft(mail, data, pdf));
    } catch (e) { setError((e as Error).message); }
  };
  return <Dialog open onOpenChange={onClose}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Courriel — {data.number}</DialogTitle></DialogHeader>
    <label className="text-sm">Destinataire<Input type="email" value={mail.to} onChange={e => setMail({ ...mail, to: e.target.value })}/></label>
    <label className="text-sm">Objet<Input maxLength={200} value={mail.subject} onChange={e => setMail({ ...mail, subject: e.target.value })}/></label>
    <label className="text-sm">Message<Textarea rows={7} maxLength={10000} value={mail.message} onChange={e => setMail({ ...mail, message: e.target.value })}/></label>
    <p className="text-xs text-muted-foreground">Pièce jointe : {data.number}.pdf · version émise. Aucun envoi automatique ni paiement en ligne activé. Le brouillon téléchargé n’est pas un courriel envoyé.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button onClick={prepare}>Préparer le courriel</Button>
    {ready && <><p role="status" className="text-sm">Préparé — non envoyé</p><Button variant="outline" onClick={() => downloadFinanceBlob(ready, `facture-${data.number}.eml`)}>Télécharger le courriel avec PDF</Button></>}
    {ready && isExec05Local() && <Button variant="outline" onClick={async()=>{try{const r=await fetch("http://localhost:55445/mail",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({invoice:invoiceId,key,mail})});const v=await r.json();if(!r.ok)throw Error(v.message);setCapture("Capturé localement — ni envoyé ni livré");}catch(e){setError((e as Error).message);}}}>Capturer en TEST local</Button>}
    {capture && <p role="status">{capture}</p>}
  </DialogContent></Dialog>;
}