// Dossier documentaire de l'entreprise : assurance, RPEVL, RCV, Registre des entreprises, permis…
// Glisser-déposer, consultation directe (PDF et images) dans Vrac Québec, fichiers privés par entreprise.
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Eye, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
const BUCKET = "company-docs";
const MAX = 100 * 1024 * 1024;
const MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
export const DOC_CATEGORIES: { id: string; label: string; ref: string; issuer: string }[] = [
  { id: "assurance", label: "Contrat d'assurance", ref: "Numéro de police", issuer: "Assureur" },
  { id: "rpevl", label: "Attestation RPEVL (CTQ)", ref: "NIR", issuer: "Commission des transports du Québec" },
  { id: "rcv", label: "Registre du camionnage en vrac", ref: "Référence d'inscription RCV", issuer: "Commission des transports du Québec" },
  { id: "req", label: "Registre des entreprises (NEQ)", ref: "NEQ", issuer: "Registraire des entreprises" },
  { id: "permis", label: "Permis et licences", ref: "Numéro de permis", issuer: "Organisme" },
  { id: "cnesst", label: "Attestation CNESST", ref: "Numéro de dossier", issuer: "CNESST" },
  { id: "vehicule", label: "Immatriculation et véhicules", ref: "Plaque ou numéro de série", issuer: "SAAQ" },
  { id: "autre", label: "Autre document", ref: "Référence", issuer: "Émetteur" },
];
const cat = (id: string) => DOC_CATEGORIES.find((c) => c.id === id) ?? DOC_CATEGORIES[DOC_CATEGORIES.length - 1];
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
function expiry(d?: string | null) {
  if (!d) return null;
  const days = Math.round((new Date(d + "T12:00").getTime() - new Date(today() + "T12:00").getTime()) / 86400000);
  if (days < 0) return { label: `Expiré depuis ${-days} j`, variant: "destructive" as const };
  if (days <= 30) return { label: `Expire dans ${days} j`, variant: "secondary" as const };
  return { label: `Valide jusqu'au ${d}`, variant: "outline" as const };
}
const blank = { category: "assurance", title: "", reference: "", issuer: "", issued_on: "", expires_on: "", notes: "" };

export default function CompanyDocuments({ companyId, canWrite }: { companyId: string; canWrite: boolean }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [ids, setIds] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ ...blank });
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [showArch, setShowArch] = useState(false);
  const [viewer, setViewer] = useState<{ doc: any; url: string } | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await db.from("ent_company_documents").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
    if (error) toast({ title: "Chargement impossible", description: error.message, variant: "destructive" });
    setDocs(data ?? []);
    const { data: i } = await db.from("obl_company_ids").select("neq,nir,rcv_ref,legal_form").eq("company_id", companyId).maybeSingle();
    setIds(i);
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  const choose = (f?: File | null) => {
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!MIME[ext]) return toast({ title: "Format non accepté", description: "PDF, JPG, PNG ou WEBP.", variant: "destructive" });
    if (!f.size || f.size > MAX) return toast({ title: "Fichier vide ou trop lourd (100 Mo au maximum)", variant: "destructive" });
    setFile(f);
    // Pré-remplit avec ce que Vrac Québec détient déjà, sans écraser une saisie.
    setForm((p) => ({ ...p, title: p.title || f.name.replace(/\.[^.]+$/, ""), reference: p.reference || prefillRef(p.category) }));
  };
  const prefillRef = (c: string) => (c === "rpevl" ? ids?.nir : c === "rcv" ? ids?.rcv_ref : c === "req" ? ids?.neq : "") ?? "";

  const submit = async () => {
    if (!file || busy) return;
    if (!form.title.trim()) return toast({ title: "Titre requis", variant: "destructive" });
    setBusy(true);
    const ext = file.name.split(".").pop()!.toLowerCase();
    const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: MIME[ext], upsert: false });
    if (up.error) { setBusy(false); return toast({ title: "Envoi refusé", description: up.error.message, variant: "destructive" }); }
    const { error } = await db.from("ent_company_documents").insert({
      company_id: companyId, category: form.category, title: form.title.trim(), reference: form.reference.trim() || null,
      issuer: form.issuer.trim() || null, issued_on: form.issued_on || null, expires_on: form.expires_on || null, notes: form.notes.trim() || null,
      storage_path: path, file_name: file.name, mime_type: MIME[ext], size_bytes: file.size,
    });
    setBusy(false);
    if (error) { await supabase.storage.from(BUCKET).remove([path]); return toast({ title: "Enregistrement refusé", description: error.message, variant: "destructive" }); }
    toast({ title: "Document ajouté" });
    setFile(null); setForm({ ...blank, category: form.category }); if (pick.current) pick.current.value = "";
    load();
  };

  const open = async (d: any) => {
    const { data, error } = await supabase.storage.from(BUCKET).download(d.storage_path);
    if (error || !data) return toast({ title: "Accès refusé", description: error?.message, variant: "destructive" });
    setViewer({ doc: d, url: URL.createObjectURL(new Blob([data], { type: d.mime_type })) });
  };
  const closeViewer = () => { if (viewer) URL.revokeObjectURL(viewer.url); setViewer(null); };
  const toggleArchive = async (d: any) => {
    const { error } = await db.from("ent_company_documents").update({ archived_at: d.archived_at ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", d.id);
    if (error) return toast({ title: "Modification refusée", description: error.message, variant: "destructive" });
    load();
  };

  const list = docs.filter((d) => (showArch || !d.archived_at) && (!filter || d.category === filter));
  const c = cat(form.category);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Ce que Vrac Québec détient pour votre entreprise</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {[["NEQ", ids?.neq], ["NIR", ids?.nir], ["Référence RCV", ids?.rcv_ref], ["Forme juridique", ids?.legal_form]].map(([k, v]) => (
            <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="break-all">{v || <span className="text-muted-foreground">À compléter</span>}</dd></div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">Ces renseignements se modifient dans Obligations et renouvellements. Ils servent à pré-remplir vos documents.</p>
      </section>

      {canWrite && (
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Ajouter un document</h2>
          <div
            role="button" tabIndex={0} aria-label="Glisser un fichier ici ou cliquer pour choisir"
            onClick={() => pick.current?.click()} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && pick.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); choose(e.dataTransfer.files?.[0]); }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors ${drag ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"}`}
          >
            <Upload className="h-6 w-6 text-primary" />
            {file ? <span className="break-all font-medium">{file.name} · {(file.size / 1048576).toFixed(1)} Mo</span>
              : <span>Glissez votre fichier ici ou touchez pour choisir<br /><span className="text-xs text-muted-foreground">PDF, JPG, PNG ou WEBP · 100 Mo au maximum</span></span>}
            <input ref={pick} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">Type de document
              <select className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2 text-sm" value={form.category}
                onChange={(e) => { const v = e.target.value; setForm((p) => ({ ...p, category: v, reference: p.reference || prefillRef(v), issuer: p.issuer })); }}>
                {DOC_CATEGORIES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select></label>
            <label className="text-xs">Titre<Input className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="text-xs">{c.ref}<Input className="mt-1" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></label>
            <label className="text-xs">{c.issuer}<Input className="mt-1" placeholder={c.issuer} value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} /></label>
            <label className="text-xs">Date d'émission<Input className="mt-1" type="date" value={form.issued_on} onChange={(e) => setForm({ ...form, issued_on: e.target.value })} /></label>
            <label className="text-xs">Date d'expiration<Input className="mt-1" type="date" value={form.expires_on} onChange={(e) => setForm({ ...form, expires_on: e.target.value })} /></label>
            <label className="text-xs sm:col-span-2">Note<Input className="mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
          <Button onClick={submit} disabled={!file || busy} className="w-full sm:w-auto">{busy ? "Envoi…" : "Enregistrer le document"}</Button>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Filtrer par type" className="h-10 rounded-md border border-border bg-background px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Tous les documents</option>
            {DOC_CATEGORIES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showArch} onChange={(e) => setShowArch(e.target.checked)} /> Afficher les archivés</label>
        </div>
        {!list.length ? <p className="text-sm text-muted-foreground">Aucun document pour l'instant.</p> : (
          <ul className="space-y-2">
            {list.map((d) => { const ex = expiry(d.expires_on); return (
              <li key={d.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center">
                <FileText className="hidden h-5 w-5 shrink-0 text-primary sm:block" />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{d.title} {d.archived_at && <Badge variant="outline">Archivé</Badge>}</p>
                  <p className="text-xs text-muted-foreground break-words">{cat(d.category).label}{d.reference ? ` · ${cat(d.category).ref} : ${d.reference}` : ""}{d.issuer ? ` · ${d.issuer}` : ""}</p>
                  {ex && <Badge variant={ex.variant} className="mt-1">{ex.label}</Badge>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => open(d)}><Eye className="mr-1 h-4 w-4" />Consulter</Button>
                  {canWrite && <Button size="sm" variant="outline" onClick={() => toggleArchive(d)}><Archive className="mr-1 h-4 w-4" />{d.archived_at ? "Restaurer" : "Archiver"}</Button>}
                </div>
              </li>); })}
          </ul>
        )}
      </section>

      <Dialog open={!!viewer} onOpenChange={(o) => !o && closeViewer()}>
        <DialogContent className="flex h-[90vh] max-w-4xl flex-col p-3 sm:p-4">
          <DialogHeader><DialogTitle className="pr-6 text-base break-words">{viewer?.doc.title}</DialogTitle></DialogHeader>
          {viewer && (viewer.doc.mime_type === "application/pdf"
            ? <object data={viewer.url} type="application/pdf" className="min-h-0 w-full flex-1 rounded border border-border">
                <p className="p-4 text-sm">L'aperçu PDF n'est pas pris en charge sur cet appareil. <a className="text-primary underline" href={viewer.url} target="_blank" rel="noopener noreferrer">Ouvrir le PDF</a></p>
              </object>
            : <div className="min-h-0 flex-1 overflow-auto"><img src={viewer.url} alt={viewer.doc.title} className="mx-auto max-w-full" /></div>)}
          {viewer && <a className="text-sm text-primary underline" href={viewer.url} download={viewer.doc.file_name}>Télécharger {viewer.doc.file_name}</a>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
