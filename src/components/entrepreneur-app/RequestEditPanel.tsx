import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Pencil, History } from "lucide-react";
import { changedRequestFields, requestFields, requestFieldLabels, requestWorkbenchCall, saveRequestEdit, type EditableRequest, type RequestEdit } from "@/lib/parcours/request-edit";

export default function RequestEditPanel({ id, onChanged, load = (id: string) => requestWorkbenchCall<EditableRequest>("submission_edit_read", { _id: id }), save = saveRequestEdit }: {
  id: string; onChanged: () => void; load?: (id: string) => Promise<EditableRequest>; save?: typeof saveRequestEdit;
}) {
  const [open, setOpen] = useState(false); const [row, setRow] = useState<EditableRequest | null>(null);
  const [form, setForm] = useState<RequestEdit | null>(null); const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false); const lock = useRef(false); const key = useRef(crypto.randomUUID());
  const begin = async () => {
    setOpen(true); setRow(null); setForm(null); setError(null); setConfirm(false);setBusy(true);
    try { const r = await load(id); if (r.id !== id) throw new Error("Dossier incorrect. Accès refusé."); setRow(r); setForm(r.values); }
    catch(e) {setError(e instanceof Error ? e.message : "Dossier indisponible.");} finally {setBusy(false);}
  };
  const submit = async () => {
    if (!row || !form || !row.editable || lock.current || !confirm) return;
    lock.current=true;setBusy(true);setError(null);
    try {await save(row,form,key.current); const r=await load(id); if(r.id!==id || r.version<=row.version)throw new Error("Sauvegarde non relue. Vos modifications restent ouvertes.");setRow(r);setForm(r.values);key.current=crypto.randomUUID();setOpen(false);onChanged();}
    catch(e){setError(e instanceof Error?e.message:"Enregistrement impossible.");}finally{lock.current=false;setBusy(false);}
  };
  return <section className="space-y-3">
    <Button variant="outline" className="min-h-11" onClick={() => void begin()}><Pencil className="h-4 w-4"/>Modifier ma demande</Button>
    <Dialog open={open} onOpenChange={o=>!busy&&setOpen(o)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Modifier ma demande</DialogTitle><DialogDescription>Le dossier et son numéro sont conservés. Les accords affectés devront être revalidés.</DialogDescription></DialogHeader>
      {busy&&!row&&<p role="status">Lecture du dossier et de vos droits…</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      {row&&!row.editable&&<p className="text-sm text-muted-foreground">{row.reason ?? "Cette demande n’est plus modifiable."}</p>}
      {row&&form&&row.editable&&<div className="space-y-4">{requestFields.map(k=><div key={k}><Label htmlFor={`edit-${k}`}>{requestFieldLabels[k]}</Label>{k==="materials"?<Input id={`edit-${k}`} value={form.materials.join(", ")} onChange={e=>setForm({...form,materials:e.target.value.split(",").map(v=>v.trim()).filter(Boolean)})}/>:k==="material_description"||k==="access_instructions"?<Textarea id={`edit-${k}`} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/>:<Input id={`edit-${k}`} type={k==="quantity_value"?"number":k==="desired_date"?"date":k==="desired_time"?"time":"text"} value={form[k]??""} onChange={e=>setForm({...form,[k]:k==="quantity_value"?(e.target.value===""?null:Number(e.target.value)):e.target.value||null})}/>}</div>)}
      {!confirm?<Button className="min-h-11" onClick={()=>{try{changedRequestFields(row.values,form);setConfirm(true);}catch{setError("Vérifiez les champs avant de confirmer.");}}}>Revoir les changements</Button>:<div className="space-y-3"><p className="text-sm">Confirmez la modification du même dossier et la revalidation des accords affectés.</p><Button className="min-h-11" disabled={busy} onClick={()=>void submit()}>Confirmer et enregistrer</Button></div>}
      </div>}
      {!!row?.history.length&&<details className="text-sm"><summary className="flex min-h-11 cursor-pointer items-center gap-2"><History className="h-4 w-4"/>Historique</summary>{row.history.map((e,i)=><p key={i}>{e.action} · version {e.version} · {new Date(e.created_at).toLocaleString("fr-CA")}</p>)}</details>}
    </DialogContent></Dialog>
  </section>;
}