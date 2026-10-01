// FIN-09A — Notes de crédit d'une facture émise : brouillon lié (motif obligatoire, lignes/quantités, montant ou solde exact),
// aperçu calculé par le serveur depuis l'instantané fiscal de la facture, puis émission explicite (numéro serveur, figée).
// L'émission envoie la révision et l'empreinte de l'aperçu affiché : toute modification (locale ou concurrente) invalide l'aperçu.
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
type Mode = "lines" | "amount" | "balance";
type Form = { reason: string; mode: Mode; qty: Record<number, string>; taxable: string; zero_rated: string; exempt: string };
const emptyForm = (): Form => ({ reason: "", mode: "lines", qty: {}, taxable: "", zero_rated: "", exempt: "" });
type Draft = { id: string; preview: R; rev: number; hash: string };
type Pending = { id: string; total: number; rev: number; hash: string };

/** Saisie décimale fr-CA : « 200,50 », « 0,5 », « 1 234,5 ». Vide = null; invalide = NaN (jamais converti en 0). */
export function parseDecimal(s: string): number | null {
  const t = s.replace(/[\s\u00A0\u202F]/g, "").replace(",", ".");
  if (t === "") return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

export function creditItems(f: Form): { ok: true; items: R } | { ok: false; error: string } {
  if (f.mode === "balance") return { ok: true, items: { mode: "balance" } };
  if (f.mode === "amount") {
    const out: R = { mode: "amount" };
    for (const [k, label] of [["taxable", "Base taxable"], ["zero_rated", "Détaxé"], ["exempt", "Exonéré"]] as const) {
      const v = parseDecimal(f[k]);
      if (v !== null && (Number.isNaN(v) || Math.round(v * 100) / 100 !== v)) return { ok: false, error: `${label} : montant invalide (ex. 200,50)` };
      out[k] = v ?? 0;
    }
    return { ok: true, items: out };
  }
  const lines: R[] = [];
  for (const [i, s] of Object.entries(f.qty)) {
    const v = parseDecimal(s);
    if (v === null || v === 0) continue;
    if (Number.isNaN(v)) return { ok: false, error: `Ligne ${Number(i) + 1} : quantité invalide (ex. 0,5)` };
    lines.push({ i: Number(i), qty: v });
  }
  return { ok: true, items: { mode: "lines", lines } };
}

async function logo(path?: string | null): Promise<CreditNotePdfData["logo"]> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).download(path); if (!data) return null;
  const url: string = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(data); });
  const dim: { w: number; h: number } = await new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.width, h: im.height }); im.onerror = () => res({ w: 1, h: 1 }); im.src = url; });
  return { data: url, format: /png/i.test(data.type) ? "PNG" : "JPEG", ...dim };
}

const asErr = (x: unknown) => ({ data: null, error: { message: (x as Error)?.message || "Réponse non reçue" } });

export default function CreditNotes({ invoice, companyId, canWrite, onChanged }: { invoice: R; companyId: string; canWrite: boolean; onChanged: () => void }) {
  const [rows, setRows] = useState<R[] | null>(null); const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false); const [f, setF] = useState<Form>(emptyForm);
  const [draft, setDraft] = useState<Draft | null>(null); const [busy, setBusy] = useState(false);
  const [pendingIssue, setPendingIssue] = useState<Pending | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const draftKey = useRef(crypto.randomUUID()); const issueKey = useRef(crypto.randomUUID()); const gen = useRef(0);
  const rev = useRef<number | null>(null); // révision serveur connue du brouillon courant (null = nouveau)

  const load = useCallback(async () => {
    const my = gen.current; setError(null);
    const res = await db.from("fin_credit_notes").select("*").eq("invoice_id", invoice.id).order("created_at").then((r: R) => r, asErr);
    if (my !== gen.current) return;
    if (res.error) { setError(res.error.message); return; }
    setRows(res.data ?? []);
  }, [invoice.id]);
  useEffect(() => { // changement de facture/entreprise : tout réinitialiser, réponses périmées ignorées
    gen.current++; setRows(null); setOpen(false); setF(emptyForm()); setDraft(null); setPendingIssue(null); setBusy(false); setConflict(null);
    draftKey.current = crypto.randomUUID(); issueKey.current = crypto.randomUUID(); rev.current = null; void load();
  }, [invoice.id, companyId, load]);

  /** Toute modification du formulaire invalide l'aperçu affiché (Émettre disparaît jusqu'au prochain aperçu). */
  const edit = (p: Partial<Form>) => { if (pendingIssue) return; setF((x) => ({ ...x, ...p })); setDraft(null); };

  const preview = async () => {
    if (!f.reason.trim()) return toast({ title: "Motif obligatoire", variant: "destructive" });
    const it = creditItems(f); if ("error" in it) return toast({ title: "Saisie invalide", description: it.error, variant: "destructive" });
    const my = gen.current; setBusy(true); setConflict(null);
    const res = await db.rpc("fin_credit_save", { _invoice: invoice.id, _draft_key: draftKey.current, _reason: f.reason, _items: it.items, _base_rev: rev.current }).then((r: R) => r, asErr);
    if (my !== gen.current) return; setBusy(false);
    if (res.error) {
      if (res.error.code === "P0409") setConflict(res.error.message);
      return toast({ title: "Brouillon refusé", description: res.error.message, variant: "destructive" });
    }
    const d = res.data; rev.current = d.rev;
    setDraft({ id: d.id, preview: d.preview, rev: d.rev, hash: d.hash }); issueKey.current = crypto.randomUUID(); setPendingIssue(null); void load();
  };
  const issue = async () => {
    const p: Pending | null = pendingIssue ?? (draft ? { id: draft.id, total: Number(draft.preview.total), rev: draft.rev, hash: draft.hash } : null); if (!p || busy) return;
    const my = gen.current; setBusy(true);
    const res = await db.rpc("fin_credit_issue", { _id: p.id, _issue_key: issueKey.current, _expect_total: p.total, _expect_rev: p.rev, _expect_hash: p.hash }).then((r: R) => r, asErr);
    if (my !== gen.current) return; setBusy(false);
    if (res.error) {
      if (res.error.code === "P0409") { // conflit : aucune nouvelle émission automatique; l'utilisateur recharge et revoit l'aperçu
        setPendingIssue(null); setDraft(null); issueKey.current = crypto.randomUUID(); setConflict(res.error.message); void load();
      } else setPendingIssue(p); // réponse perdue : même requête, même révision et même clé au prochain essai
      return toast({ title: "Émission non confirmée", description: res.error.message, variant: "destructive" });
    }
    toast({ title: res.data.replayed ? `Déjà émise : ${res.data.number}` : `Note de crédit ${res.data.number} émise`, description: `Net à recevoir : ${money(res.data.balance?.rest)}. Aucun remboursement ni mouvement bancaire créé.` });
    setPendingIssue(null); setDraft(null); setOpen(false); setF(emptyForm()); draftKey.current = crypto.randomUUID(); issueKey.current = crypto.randomUUID(); rev.current = null;
    await load(); onChanged();
  };
  const discard = async (id: string) => {
    const my = gen.current;
    const res = await db.rpc("fin_credit_discard", { _id: id }).then((r: R) => r, asErr); if (my !== gen.current) return;
    if (res.error) return toast({ title: "Refusé", description: res.error.message, variant: "destructive" });
    if (draft?.id === id || rows?.find((r) => r.id === id)?.draft_key === draftKey.current) { setDraft(null); setOpen(false); draftKey.current = crypto.randomUUID(); rev.current = null; }
    await load();
  };
  const resume = (c: R) => { const it = c.items ?? {}; setOpen(true); draftKey.current = c.draft_key; rev.current = c.rev ?? 1; setConflict(null); setPendingIssue(null);
    setF({ reason: c.reason, mode: it.mode === "amount" ? "amount" : it.mode === "balance" ? "balance" : "lines", qty: Object.fromEntries((it.lines ?? []).map((l: R) => [l.i, String(l.qty).replace(".", ",")])),
      taxable: it.taxable ? String(it.taxable).replace(".", ",") : "", zero_rated: it.zero_rated ? String(it.zero_rated).replace(".", ",") : "", exempt: it.exempt ? String(it.exempt).replace(".", ",") : "" }); setDraft(null); };
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
  const fmtQty = (n: number) => n.toLocaleString("fr-CA", { maximumFractionDigits: 4 });

  return <section className="space-y-2 rounded border border-border p-2 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display font-bold">Notes de crédit</h3>
      {canWrite && !open && <Button size="sm" variant="outline" onClick={() => { setOpen(true); setF(emptyForm()); setDraft(null); setConflict(null); draftKey.current = crypto.randomUUID(); rev.current = null; }}>Créer une note de crédit</Button>}</div>
    {conflict && <p role="alert" className="rounded border border-destructive/50 p-2 text-xs">Conflit : {conflict}. Rien n'a été émis. Reprenez le brouillon depuis la liste ci-dessous, vérifiez-le puis refaites l'aperçu.</p>}
    {open && <fieldset disabled={!!pendingIssue || busy} className="space-y-2 rounded bg-secondary/40 p-2">
      <p className="text-xs text-muted-foreground">Brouillon lié à la facture {invoice.number}. Il ne réduit pas le solde tant qu'il n'est pas émis. Taxes calculées avec les taux et traitements figés de la facture, jamais le profil actuel.</p>
      <Textarea aria-label="Motif" placeholder="Motif obligatoire (ex. retour de 2 t, rabais accordé…)" value={f.reason} onChange={(e) => edit({ reason: e.target.value })} />
      <div className="flex flex-wrap gap-3 text-xs"><label className="flex items-center gap-1"><input type="radio" checked={f.mode === "lines"} onChange={() => edit({ mode: "lines" })} />Par lignes / quantités</label>
        <label className="flex items-center gap-1"><input type="radio" checked={f.mode === "amount"} onChange={() => edit({ mode: "amount" })} />Par montant avant taxes (plafonné)</label>
        <label className="flex items-center gap-1"><input type="radio" checked={f.mode === "balance"} onChange={() => edit({ mode: "balance" })} />Solde exact restant</label></div>
      {f.mode === "lines" ? <ul className="space-y-1">{lines.map((l, i) => { const left = Number(l.qty ?? 0) - credited(i);
        return <li key={i} className="flex flex-wrap items-center gap-2 text-xs"><span className="min-w-0 flex-1 break-words">{l.desc || "—"} · {l.qty} {l.unit} · disponible {fmtQty(left)}</span>
          <Input aria-label={`Quantité créditée ligne ${i + 1}`} className="w-24" inputMode="decimal" disabled={left <= 0} value={f.qty[i] ?? ""} onChange={(e) => edit({ qty: { ...f.qty, [i]: e.target.value } })} />
          {left > 0 && <button type="button" className="underline" onClick={() => edit({ qty: { ...f.qty, [i]: fmtQty(left).replace(/\s/g, "") } })}>Tout</button>}</li>; })}</ul>
        : f.mode === "amount" ? <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs">Base taxable<Input inputMode="decimal" value={f.taxable} onChange={(e) => edit({ taxable: e.target.value })} /></label>
          <label className="text-xs">Détaxé<Input inputMode="decimal" value={f.zero_rated} onChange={(e) => edit({ zero_rated: e.target.value })} /></label>
          <label className="text-xs">Exonéré<Input inputMode="decimal" value={f.exempt} onChange={(e) => edit({ exempt: e.target.value })} /></label></div>
        : <p className="text-xs">Crédite exactement tout le disponible (bases et taxes résiduelles), par exemple après des crédits par montant.</p>}
    </fieldset>}
    {open && <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy || !!pendingIssue} onClick={preview}>{busy && !draft ? "Calcul…" : "Aperçu (enregistre le brouillon)"}</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setOpen(false); setDraft(null); setPendingIssue(null); void load(); }}>Fermer</Button></div>}
    {open && !pv && !busy && <p className="text-xs text-muted-foreground">Aucun aperçu à jour : faites l'aperçu pour pouvoir émettre.</p>}
    {pv && <div className="space-y-1 rounded border border-border p-2 text-xs" role="status">
      <p className="font-semibold">Aperçu serveur de la note de crédit (BROUILLON, révision {draft?.rev})</p>
      {(pv.lines ?? []).length > 0 && <ul className="space-y-0.5">{pv.lines.map((l: R) => <li key={l.i}>Ligne {l.i + 1} · {l.desc || "—"} · {fmtQty(Number(l.qty))} {l.unit ?? ""} · montant {money(l.gross)} · base {money(l.base)}{Number(l.rounding_adjustment) ? ` (ajustement d'arrondi cumulatif ${money(l.rounding_adjustment)})` : ""}</li>)}</ul>}
      <p>Base taxable {money(pv.taxable_base)}{Number(pv.zero_rated_base) ? ` · détaxé ${money(pv.zero_rated_base)}` : ""}{Number(pv.exempt_base) ? ` · exonéré ${money(pv.exempt_base)}` : ""} · TPS {money(pv.gst)} · TVQ {money(pv.qst)} · <strong>total crédité {money(pv.total)}</strong></p>
      <p className="text-muted-foreground">Disponible avant cette note : {money(pv.available?.total)} (base taxable {money(pv.available?.taxable_base)}, TPS {money(pv.available?.gst)}, TVQ {money(pv.available?.qst)}).</p>
      {(pv.errors ?? []).length > 0 && <p className="text-destructive">Refusé : {pv.errors.join(" ; ")}</p>}
      {pendingIssue && <p>Émission non confirmée : réessayez la même requête (une seule note sera émise).</p>}
      {canWrite && !(pv.errors ?? []).length && Number(pv.total) > 0 && <Button size="sm" disabled={busy} onClick={issue}>{busy ? "Émission…" : pendingIssue ? "Réessayer la même émission" : `Émettre la note de crédit (${money(pv.total)})`}</Button>}
    </div>}
    <ul className="divide-y divide-border text-xs">
      {issued.map((c) => <li key={c.id} className="flex flex-wrap items-center gap-2 py-1">
        <span className="min-w-0 flex-1 break-words"><strong>{c.number}</strong> · − {money(c.total)} (TPS {money(c.gst)}, TVQ {money(c.qst)}) · émise le {stamp(c.issued_at)} · {c.reason}</span>
        <button className="underline" onClick={() => pdf(c, false)}>PDF</button><button className="underline" onClick={() => pdf(c, true)}>Télécharger</button></li>)}
      {drafts.map((c) => <li key={c.id} className="flex flex-wrap items-center gap-2 py-1 text-muted-foreground">
        <span className="min-w-0 flex-1 break-words">Brouillon · {c.reason} · créé le {stamp(c.created_at)}</span>
        {canWrite && <><button className="underline" onClick={() => resume(c)}>Reprendre</button><button className="underline" onClick={() => discard(c.id)}>Supprimer le brouillon</button></>}</li>)}
      {!rows.length && <li className="py-1 text-muted-foreground">Aucune note de crédit.</li>}
    </ul>
    <p className="text-[11px] text-muted-foreground">Une note émise n'est ni modifiable ni supprimable; aucune procédure d'annulation d'avoir n'existe encore (corriger par un nouveau document dans un lot ultérieur).</p>
  </section>;
}
