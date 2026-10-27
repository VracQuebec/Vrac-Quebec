import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Pencil, History } from "lucide-react";
import { changedRequestFields, requestFields, requestFieldLabels, requestWorkbenchCall, saveRequestEdit, isNotLinkedError, NOT_LINKED_MESSAGE, requestOwnershipVerification, type EditableRequest, type RequestEdit } from "@/lib/parcours/request-edit";

export default function RequestEditPanel({ id, onChanged, companyId, load = (id: string) => requestWorkbenchCall<EditableRequest>("submission_edit_read", { _id: id }), save = saveRequestEdit, requestLink = requestOwnershipVerification }: {
  id: string; onChanged: () => void; companyId?: string; load?: (id: string) => Promise<EditableRequest>; save?: typeof saveRequestEdit; requestLink?: typeof requestOwnershipVerification;
}) {
  const [notLinked, setNotLinked] = useState(false); const [note, setNote] = useState(""); const [linkStatus, setLinkStatus] = useState<string | null>(null); const [linkError, setLinkError] = useState<string | null>(null);
  const askLink = async () => { if (!companyId || busy) return; setBusy(true); setLinkError(null); try { await requestLink(id, companyId, note); setLinkStatus("Demande de vérification envoyée à l’équipe Vrac Québec. Vous serez avisé de la décision ; rien n’est modifié d’ici là."); } catch (e) { setLinkError(e instanceof Error ? e.message : "Demande impossible."); } finally { setBusy(false); } };
  const [open, setOpen] = useState(false); const [row, setRow] = useState<EditableRequest | null>(null);
  const [form, setForm] = useState<RequestEdit | null>(null); const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false); const lock = useRef(false); const key = useRef(crypto.randomUUID());
  const generation = useRef(0);
  useEffect(()=>{generation.current+=1;setRow(null);setForm(null);setOpen(false);return()=>{generation.current+=1;};},[id]);
  const begin = async () => {
    setOpen(true); setRow(null); setForm(null); setError(null); setConfirm(false);setBusy(true);setNotLinked(false);setLinkStatus(null);setLinkError(null);
    const current=generation.current;
    try { const r = await load(id); if(current!==generation.current)return; if (r.id !== id) throw new Error("Dossier incorrect. Accès refusé."); setRow(r); setForm(r.values); }
    catch(e) {const m=e instanceof Error ? e.message : "Dossier indisponible."; if(isNotLinkedError(m)) setNotLinked(true); else setError(m);} finally {setBusy(false);}
  };
  const submit = async () => {
    if (!row || !form || !row.editable || lock.current || !confirm) return;
    lock.current=true;setBusy(true);setError(null);
    try {if(!Object.keys(changedRequestFields(row.values,form)).length){setOpen(false);return;}await save(row,form,key.current); const r=await load(id); if(r.id!==id || r.version<=row.version)throw new Error("Sauvegarde non relue. Vos modifications restent ouvertes.");setRow(r);setForm(r.values);key.current=crypto.randomUUID();setOpen(false);onChanged();}
    catch(e){setError(e instanceof Error?e.message:"Enregistrement impossible.");}finally{lock.current=false;setBusy(false);}
  };
  return <section className="space-y-3">
    <Button variant="outline" className="min-h-11" onClick={() => void begin()}><Pencil className="h-4 w-4"/>Modifier ma demande</Button>
    <Dialog open={open} onOpenChange={o=>!busy&&setOpen(o)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Modifier ma demande</DialogTitle><DialogDescription>Le dossier et son numéro sont conservés. Les accords affectés devront être revalidés.</DialogDescription></DialogHeader>
      {busy&&!row&&<p role="status">Lecture du dossier et de vos droits…</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      {notLinked&&<div className="space-y-3 rounded-md border border-border p-3"><p className="text-sm">{NOT_LINKED_MESSAGE}</p>
        {linkStatus?<p role="status" className="text-sm">{linkStatus}</p>:companyId?<><Label htmlFor="link-note">Précision utile à la vérification (facultatif)</Label><Textarea id="link-note" maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Ex. : référence de soumission, date de la demande"/>
        <Button variant="outline" className="min-h-11" disabled={busy} onClick={()=>void askLink()}>Demander la vérification du rattachement</Button></>:<p className="text-sm text-muted-foreground">Choisissez d’abord l’entreprise concernée.</p>}
        {linkError&&<p role="alert" className="text-sm text-destructive">{linkError}</p>}</div>}
      {row&&!row.editable&&<p className="text-sm text-muted-foreground">{row.reason ?? "Cette demande n’est plus modifiable."}</p>}
      {row&&form&&row.editable&&<div className="space-y-4">{requestFields.map(k=><div key={k}><Label htmlFor={`edit-${k}`}>{requestFieldLabels[k]}</Label>{k==="materials"?<Input id={`edit-${k}`} value={form.materials.join(", ")} onChange={e=>setForm({...form,materials:e.target.value.split(",").map(v=>v.trim()).filter(Boolean)})}/>:k==="material_description"||k==="access_instructions"?<Textarea id={`edit-${k}`} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/>:<Input id={`edit-${k}`} type={k==="quantity_value"?"number":k==="desired_date"?"date":k==="desired_time"?"time":"text"} value={form[k]??""} onChange={e=>setForm({...form,[k]:k==="quantity_value"?(e.target.value===""?null:Number(e.target.value)):e.target.value||null})}/>}</div>)}
      {!confirm?<Button className="min-h-11" onClick={()=>{try{changedRequestFields(row.values,form);setConfirm(true);}catch{setError("Vérifiez les champs avant de confirmer.");}}}>Revoir les changements</Button>:<div className="space-y-3"><p className="text-sm">Confirmez la modification du même dossier et la revalidation des accords affectés.</p><Button className="min-h-11" disabled={busy} onClick={()=>void submit()}>Confirmer et enregistrer</Button></div>}
      </div>}
      {!!row?.history.length&&<details className="text-sm"><summary className="flex min-h-11 cursor-pointer items-center gap-2"><History className="h-4 w-4"/>Historique</summary>{row.history.map((e,i)=><p key={i}>{e.action} · version {e.version} · {new Date(e.created_at).toLocaleString("fr-CA")}</p>)}</details>}
    </DialogContent></Dialog>
  </section>;
}