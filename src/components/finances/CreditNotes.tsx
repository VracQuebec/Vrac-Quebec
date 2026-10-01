// FIN-09A — Notes de crédit d'une facture émise : brouillon lié (motif obligatoire, lignes/quantités ou montant),
// aperçu calculé par le serveur depuis l'instantané fiscal de la facture, puis émission explicite (numéro serveur, figée).
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { renderCreditNotePdf, type CreditNotePdfData } from "@/lib/finances/creditNotePdf";

const db = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const BUCKET = "fin-invoices";
const money = (n?: number | null) => Number(n ?? 0).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
const stamp = (d?: string | null) => d ? new Date(d).toLocaleString("fr-CA", { timeZone: "America/Toronto" }) : "—";
type Form = { reason: string; mode: "lines" | "amount"; qty: Record<number, string>; taxable: string; zero_rated: string; exempt: string };
const emptyForm = (): Form => ({ reason: "", mode: "lines", qty: {}, taxable: "", zero_rated: "", exempt: "" });

export function creditItems(f: Form) {
  if (f.mode === "amount") return { mode: "amount", taxable: Number(f.taxable || 0), zero_rated: Number(f.zero_rated || 0), exempt: Number(f.exempt || 0) };
  return { mode: "lines", lines: Object.entries(f.qty).filter(([, v]) => Number(v) > 0).map(([i, v]) => ({ i: Number(i), qty: Number(v) })) };
}

async function logo(path?: string | null): Promise<CreditNotePdfData["logo"]> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).download(path); if (!data) return null;
  const url: string = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(data); });
  const dim: { w: number; h: number } = await new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.width, h: im.height }); im.onerror = () => res({ w: 1, h: 1 }); im.src = url; });
  return { data: url, format: /png/i.test(data.type) ? "PNG" : "JPEG", ...dim };
}

export default function CreditNotes({ invoice, companyId, canWrite, onChanged }: { invoice: R; companyId: string; canWrite: boolean; onChanged: () => void }) {
  const [rows, setRows] = useState<R[] | null>(null); const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false); const [f, setF] = useState<Form>(emptyForm);
  const [draft, setDraft] = useState<{ id: string; preview: R } | null>(null); const [busy, setBusy] = useState(false);
  const [pendingIssue, setPendingIssue] = useState<{ id: string; total: number } | null>(null);
  const draftKey = useRef(crypto.randomUUID()); const issueKey = useRef(crypto.randomUUID()); const gen = useRef(0);

  const load = useCallback(async () => {
    const my = gen.current; setError(null);
    const { data, error: e } = await db.from("fin_credit_notes").select("*").eq("invoice_id", invoice.id).order("created_at");
    if (my !== gen.current) return;
    if (e) { setError(e.message); return; }
    setRows(data ?? []);
  }, [invoice.id]);
  useEffect(() => { // changement de facture/entreprise : tout réinitialiser, réponses périmées ignorées
    gen.current++; setRows(null); setOpen(false); setF(emptyForm()); setDraft(null); setPendingIssue(null);
    draftKey.current = crypto.randomUUID(); issueKey.current = crypto.randomUUID(); void load();
  }, [invoice.id, companyId, load]);

  const preview = async () => {
    if (!f.reason.trim()) return toast({ title: "Motif obligatoire", variant: "destructive" });
    const my = gen.current; setBusy(true);
    const { data, error: e } = await db.rpc("fin_credit_save", { _invoice: invoice.id, _draft_key: draftKey.current, _reason: f.reason, _items: creditItems(f) });
    setBusy(false); if (my !== gen.current) return;
    if (e) return toast({ title: "Brouillon refusé", description: e.message, variant: "destructive" });
    setDraft({ id: data.id, preview: data.preview }); issueKey.current = crypto.randomUUID(); setPendingIssue(null); void load();
  };
  const issue = async () => {
    const p = pendingIssue ?? (draft ? { id: draft.id, total: Number(draft.preview.total) } : null); if (!p || busy) return;
    const my = gen.current; setBusy(true);
    const res = await db.rpc("fin_credit_issue", { _id: p.id, _issue_key: issueKey.current, _expect_total: p.total }).then((r: R) => r, (x: Error) => ({ error: { message: x.message } }));
    setBusy(false); if (my !== gen.current) return;
    if (res.error) {
      if (res.error.code === "P0409") { setPendingIssue(null); issueKey.current = crypto.randomUUID(); await preview(); }
      else setPendingIssue(p); // réponse perdue : même requête et même clé au prochain essai
      return toast({ title: "Émission non confirmée", description: res.error.message, variant: "destructive" });
    }
    toast({ title: res.data.replayed ? `Déjà émise : ${res.data.number}` : `Note de crédit ${res.data.number} émise`, description: `Net à recevoir : ${money(res.data.balance?.rest)}. Aucun remboursement ni mouvement bancaire créé.` });
    setPendingIssue(null); setDraft(null); setOpen(false); setF(emptyForm()); draftKey.current = crypto.randomUUID(); issueKey.current = crypto.randomUUID();
    await load(); onChanged();
  };
  const discard = async (id: string) => {
    const { error: e } = await db.rpc("fin_credit_discard", { _id: id }); if (e) return toast({ title: "Refusé", description: e.message, variant: "destructive" });
    if (draft?.id === id) { setDraft(null); draftKey.current = crypto.randomUUID(); } await load();
  };
  const resume = (c: R) => { const it = c.items ?? {}; setOpen(true); draftKey.current = c.draft_key;
    setF({ reason: c.reason, mode: it.mode === "amount" ? "amount" : "lines", qty: Object.fromEntries((it.lines ?? []).map((l: R) => [l.i, String(l.qty)])), taxable: String(it.taxable ?? ""), zero_rated: String(it.zero_rated ?? ""), exempt: String(it.exempt ?? "") }); setDraft(null); };
  const pdf = async (c: R, download: boolean) => {
    try {
      let path = c.pdf_path as string | null;
      if (!path) {
        const doc = renderCreditNotePdf({ status: "emise", isTest: !!invoice.is_test, number: c.number, issuedAt: c.issued_at, reason: c.reason, seller: c.seller_snapshot ?? {}, client: c.client_snapshot ?? {}, invoice: c.invoice_snapshot ?? {}, credit: c.credit_snapshot, template: c.template_snapshot ?? {}, logo: await logo(c.template_snapshot?.logo_path) });
        if (!canWrite) { download ? doc.save(`${c.number}.pdf`) : window.open(URL.createObjectURL(doc.output("blob")), "_blank"); return; }
        path = `${companyId}/credit/${c.id}-${c.number}.pdf`;
        const up = await supabase.storage.from(BUCKET).upload(path, doc.output("blob"), { contentType: "application/pdf", upsert: false });
        if (up.error && !/exists|Duplicate/i.test(up.error.message)) throw up.error;
        const { error: e } = await db.rpc("fin_credit_set_pdf", { _id: c.id, _path: path }); if (e) throw e; await load();
      }
      const { data, error: e } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120, download ? { download: `${c.number}.pdf` } : undefined);
      if (e) throw e; window.open(data.signedUrl, "_blank");
    } catch (x) { toast({ title: "PDF indisponible", description: (x as Error).message, variant: "destructive" }); }
  };

  if (error) return <section role="alert" className="space-y-2 rounded border border-destructive/50 p-2 text-sm"><h3 className="font-display font-bold">Notes de crédit</h3>
    <p className="text-xs">Notes de crédit indisponibles ({error}) : aucun montant affiché.</p><Button size="sm" variant="outline" onClick={() => void load()}>Réessayer</Button></section>;
  if (!rows) return <section aria-busy="true" className="rounded border border-border p-2 text-sm"><h3 className="font-display font-bold">Notes de crédit</h3><p className="text-xs text-muted-foreground">Chargement des notes de crédit…</p></section>;
  const lines: R[] = invoice.lines ?? []; const pv = draft?.preview; const issued = rows.filter((r) => r.status === "emise"); const drafts = rows.filter((r) => r.status === "brouillon");
  const credited = (i: number) => issued.reduce((a, c) => a + (c.credit_snapshot?.lines ?? []).filter((l: R) => l.i === i).reduce((s: number, l: R) => s + Number(l.qty), 0), 0);

  return <section className="space-y-2 rounded border border-border p-2 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display font-bold">Notes de crédit</h3>
      {canWrite && !open && <Button size="sm" variant="outline" onClick={() => { setOpen(true); setF(emptyForm()); setDraft(null); draftKey.current = crypto.randomUUID(); }}>Créer une note de crédit</Button>}</div>
    {open && <fieldset disabled={!!pendingIssue || busy} className="space-y-2 rounded bg-secondary/40 p-2">
      <p className="text-xs text-muted-foreground">Brouillon lié à la facture {invoice.number}. Il ne réduit pas le solde tant qu'il n'est pas émis. Taxes calculées avec les taux et traitements figés de la facture, jamais le profil actuel.</p>
      <Textarea aria-label="Motif" placeholder="Motif obligatoire (ex. retour de 2 t, rabais accordé…)" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      <div className="flex gap-3 text-xs"><label className="flex items-center gap-1"><input type="radio" checked={f.mode === "lines"} onChange={() => setF({ ...f, mode: "lines" })} />Par lignes / quantités</label>
        <label className="flex items-center gap-1"><input type="radio" checked={f.mode === "amount"} onChange={() => setF({ ...f, mode: "amount" })} />Par montant avant taxes (plafonné)</label></div>
      {f.mode === "lines" ? <ul className="space-y-1">{lines.map((l, i) => { const left = Number(l.qty ?? 0) - credited(i);
        return <li key={i} className="flex flex-wrap items-center gap-2 text-xs"><span className="min-w-0 flex-1">{l.desc || "—"} · {l.qty} {l.unit} · disponible {left}</span>
          <Input aria-label={`Quantité créditée ligne ${i + 1}`} className="w-24" type="number" min={0} max={left} disabled={left <= 0} value={f.qty[i] ?? ""} onChange={(e) => setF({ ...f, qty: { ...f.qty, [i]: e.target.value } })} />
          {left > 0 && <button type="button" className="underline" onClick={() => setF({ ...f, qty: { ...f.qty, [i]: String(left) } })}>Tout</button>}</li>; })}</ul>
        : <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs">Base taxable<Input inputMode="decimal" value={f.taxable} onChange={(e) => setF({ ...f, taxable: e.target.value })} /></label>
          <label className="text-xs">Détaxé<Input inputMode="decimal" value={f.zero_rated} onChange={(e) => setF({ ...f, zero_rated: e.target.value })} /></label>
          <label className="text-xs">Exonéré<Input inputMode="decimal" value={f.exempt} onChange={(e) => setF({ ...f, exempt: e.target.value })} /></label></div>}
    </fieldset>}
    {open && <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy || !!pendingIssue} onClick={preview}>{busy && !draft ? "Calcul…" : "Aperçu (enregistre le brouillon)"}</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setOpen(false); setDraft(null); setPendingIssue(null); void load(); }}>Fermer</Button></div>}
    {pv && <div className="space-y-1 rounded border border-border p-2 text-xs" role="status">
      <p className="font-semibold">Aperçu serveur de la note de crédit (BROUILLON)</p>
      <p>Base taxable {money(pv.taxable_base)}{Number(pv.zero_rated_base) ? ` · détaxé ${money(pv.zero_rated_base)}` : ""}{Number(pv.exempt_base) ? ` · exonéré ${money(pv.exempt_base)}` : ""} · TPS {money(pv.gst)} · TVQ {money(pv.qst)} · <strong>total crédité {money(pv.total)}</strong></p>
      <p className="text-muted-foreground">Disponible avant cette note : {money(pv.available?.total)} (base taxable {money(pv.available?.taxable_base)}, TPS {money(pv.available?.gst)}, TVQ {money(pv.available?.qst)}).</p>
      {(pv.errors ?? []).length > 0 && <p className="text-destructive">{pv.errors.join(" ; ")}</p>}
      {pendingIssue && <p>Émission non confirmée : réessayez la même requête (une seule note sera émise).</p>}
      {canWrite && !(pv.errors ?? []).length && Number(pv.total) > 0 && <Button size="sm" disabled={busy} onClick={issue}>{busy ? "Émission…" : pendingIssue ? "Réessayer la même émission" : `Émettre la note de crédit (${money(pv.total)})`}</Button>}
    </div>}
    <ul className="divide-y divide-border text-xs">
      {issued.map((c) => <li key={c.id} className="flex flex-wrap items-center gap-2 py-1">
        <span className="min-w-0 flex-1"><strong>{c.number}</strong> · − {money(c.total)} (TPS {money(c.gst)}, TVQ {money(c.qst)}) · émise le {stamp(c.issued_at)} · {c.reason}</span>
        <button className="underline" onClick={() => pdf(c, false)}>PDF</button><button className="underline" onClick={() => pdf(c, true)}>Télécharger</button></li>)}
      {drafts.map((c) => <li key={c.id} className="flex flex-wrap items-center gap-2 py-1 text-muted-foreground">
        <span className="min-w-0 flex-1">Brouillon · {c.reason} · créé le {stamp(c.created_at)}</span>
        {canWrite && <><button className="underline" onClick={() => resume(c)}>Reprendre</button><button className="underline" onClick={() => discard(c.id)}>Supprimer le brouillon</button></>}</li>)}
      {!rows.length && <li className="py-1 text-muted-foreground">Aucune note de crédit.</li>}
    </ul>
    <p className="text-[11px] text-muted-foreground">Une note émise n'est ni modifiable ni supprimable; aucune procédure d'annulation d'avoir n'existe encore (corriger par un nouveau document dans un lot ultérieur).</p>
  </section>;
}
