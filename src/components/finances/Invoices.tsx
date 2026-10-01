// FIN-08 — Factures : brouillon → aperçu → « Émettre » (numéro serveur, contenu figé) ; PDF en stockage privé.
// Montants : moteur commun FIN-07B (aperçu ici, recalcul et figement côté serveur).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import TaxSummary from "@/components/finances/TaxSummary";
import { computeTaxes, loadRates, TREATMENT_LABEL, type RegStatus, type TaxRates, type TaxTreatment } from "@/lib/finances/tax";
import { renderInvoicePdf, type InvoicePdfData } from "@/lib/finances/invoicePdf";
import { fmtDate, todayIn } from "@/lib/finances/period";
import InvoiceReceipts, { type Sum } from "@/components/finances/InvoiceReceipts";
import CreditNotes from "@/components/finances/CreditNotes";

const db = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const BUCKET = "fin-invoices";
const sel = "h-10 rounded-md border border-input bg-background px-2 text-sm";
const money = (n?: number | null) => n == null ? "À déterminer" : Number(n).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
const UNITS = ["unité", "t", "m³", "voyage", "h", "jour", "forfait"];
type Line = { desc: string; qty: number | null; unit: string; price: number | null; disc_pct?: number | null; tax?: TaxTreatment | null };
type Inv = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Avoirs émis sur la facture (lecture sous RLS). */
export const credits = (i: Inv) => (i.fin_credit_notes ?? []).filter((c: Inv) => c.status === "emise").reduce((a: number, c: Inv) => a + Number(c.total ?? 0), 0);
/** Net = total brut figé − avoirs émis (plancher zéro); même règle que fin_invoice_balance côté serveur. */
export const invoiceNet = (i: Inv) => Math.max(0, Math.round((Number(i.total ?? 0) - credits(i)) * 100) / 100);
export const invoiceRest = (i: Inv) => Math.max(0, invoiceNet(i) - Number(i.fin_expected_inflows?.received ?? 0));

/** État d'affichage dérivé : « Payée » vient uniquement des encaissements reliés, jamais d'un statut saisi. */
export function invoiceState(i: Inv, today: string) {
  if (i.status === "brouillon") return { label: "Brouillon", tone: "bg-muted text-muted-foreground" };
  const net = invoiceNet(i); const rec = Number(i.fin_expected_inflows?.received ?? 0);
  if (net <= 0.004 && credits(i) > 0) return { label: "Soldée par avoir", tone: "bg-primary/10 text-foreground" };
  if (net - rec <= 0.004) return { label: credits(i) > 0 ? "Payée (après avoir)" : "Payée (encaissements reliés)", tone: "bg-primary/15 text-foreground" };
  if (i.due_date && i.due_date < today) return { label: "En retard", tone: "bg-destructive/15 text-destructive" };
  return { label: i.sent_at ? "Envoyée" : "Émise (non envoyée)", tone: "bg-secondary text-foreground" };
}

async function logoFor(path: string | null | undefined): Promise<InvoicePdfData["logo"]> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).download(path); if (!data) return null;
  const url: string = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(data); });
  const dim: { w: number; h: number } = await new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.width, h: im.height }); im.onerror = () => res({ w: 1, h: 1 }); im.src = url; });
  return { data: url, format: /png/i.test(data.type) ? "PNG" : "JPEG", ...dim };
}

async function pdfData(i: Inv, live?: { seller: Inv; template: Inv; tax: Inv; project?: string | null }): Promise<InvoicePdfData> {
  const frozen = i.status === "emise";
  const seller = frozen ? i.seller_snapshot : live!.seller; const tpl = frozen ? i.template_snapshot : live!.template;
  const client = frozen ? i.client_snapshot : { name: i.client_name, address: i.client_address, email: i.client_email, phone: i.client_phone };
  return { status: i.status, isTest: !!i.is_test, number: i.number, issueDate: i.issue_date, dueDate: i.due_date, terms: i.terms, projectName: live?.project ?? i.ent_crm_projects?.name ?? null,
    seller, client, lines: i.lines, tax: frozen ? i.tax_snapshot : live!.tax as InvoicePdfData["tax"], template: { color: tpl?.color ?? tpl?.brand_color, footer: tpl?.footer, version: tpl?.version ?? tpl?.template_version }, logo: await logoFor(tpl?.logo_path) };
}

export default function Invoices({ companyId, canWrite }: { companyId: string; companyName: string; canWrite: boolean }) {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Inv[] | null>(null);
  const [f, setF] = useState({ q: "", status: "", from: "", to: "", due: "" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openId = params.get("facture");
  const setOpen = (id: string | null) => { const p = new URLSearchParams(params); id ? p.set("facture", id) : p.delete("facture"); setParams(p); };
  const today = todayIn();

  const load = useCallback(async () => {
    const { data, error } = await db.from("fin_invoices").select("id,status,number,client_name,issue_date,due_date,total,sent_at,is_test,quote_id,fin_expected_inflows!fin_invoices_expected_inflow_id_fkey(received),fin_credit_notes(total,status)").eq("company_id", companyId).order("created_at", { ascending: false }).limit(500);
    if (error) toast({ title: "Lecture impossible", description: error.message, variant: "destructive" });
    setRows(data ?? []);
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  const list = useMemo(() => (rows ?? []).filter((i) => {
    const q = f.q.trim().toLowerCase(); const stt = invoiceState(i, today).label;
    if (q && !`${i.number ?? ""} ${i.client_name ?? ""}`.toLowerCase().includes(q)) return false;
    if (f.status === "brouillon" && i.status !== "brouillon") return false;
    if (f.status === "ouverte" && (i.status !== "emise" || stt.startsWith("Payée"))) return false;
    if (f.status === "retard" && stt !== "En retard") return false;
    if (f.status === "payee" && !stt.startsWith("Payée")) return false;
    if (f.from && (i.issue_date ?? "") < f.from) return false;
    if (f.to && (i.issue_date ?? "9999") > f.to) return false;
    if (f.due && (!i.due_date || i.due_date > f.due)) return false;
    return true;
  }), [rows, f, today]);
  const issued = list.filter((i) => i.status === "emise");
  const totals = { total: issued.reduce((a, i) => a + Number(i.total ?? 0), 0), credits: issued.reduce((a, i) => a + credits(i), 0), rest: issued.reduce((a, i) => a + invoiceRest(i), 0) };

  const create = async () => {
    const { data, error } = await db.from("fin_invoices").insert({ company_id: companyId, issue_date: today, lines: [{ desc: "", qty: 1, unit: "unité", price: null, tax: null }] }).select("id").single();
    if (error) return toast({ title: "Refusé", description: error.message, variant: "destructive" });
    await load(); setOpen(data.id);
  };

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      {canWrite && <Button onClick={create}>+ Nouvelle facture</Button>}
      <Button variant="outline" onClick={() => setSettingsOpen(true)}>Modèle et numérotation</Button>
      <p className="text-xs text-muted-foreground">Depuis une soumission acceptée : CRM → Soumissions → « Créer la facture ».</p>
    </div>
    <div className="grid gap-2 sm:grid-cols-5">
      <Input placeholder="N° ou client" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
      <select aria-label="Statut" className={sel} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Tous les statuts</option><option value="brouillon">Brouillons</option><option value="ouverte">Émises à recevoir</option><option value="retard">En retard</option><option value="payee">Payées</option></select>
      <label className="text-xs">Émise du<Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
      <label className="text-xs">au<Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
      <label className="text-xs">Échéance au plus tard<Input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label>
    </div>
    <p className="text-sm">Factures émises affichées : <strong>{money(totals.total)}</strong> · {totals.credits > 0 && <>notes de crédit − {money(totals.credits)} · </>}net à recevoir : <strong>{money(totals.rest)}</strong> <span className="text-xs text-muted-foreground">(brut figé − avoirs émis − encaissements reliés; brouillons exclus)</span></p>
    {rows == null ? <p className="text-muted-foreground">Chargement…</p> : !list.length ? <p className="text-muted-foreground">Aucune facture.</p> :
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">{list.map((i) => { const s = invoiceState(i, today); const rest = invoiceRest(i);
        return <li key={i.id}><button className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left" onClick={() => setOpen(i.id)}>
          <span className="min-w-0"><span className="font-display font-semibold">{i.number ?? "Brouillon"}{i.is_test ? " · TEST" : ""}</span> · {i.client_name || "Client à compléter"}
            <span className="block text-xs text-muted-foreground">{i.issue_date ? `Date ${fmtDate(i.issue_date)}` : ""}{i.due_date ? ` · échéance ${fmtDate(i.due_date)}` : ""}</span></span>
          <span className="text-right text-sm"><span className={`rounded px-1.5 py-0.5 text-xs ${s.tone}`}>{s.label}</span><span className="block">{money(i.total)}{i.status === "emise" ? `${credits(i) > 0 ? ` · avoirs − ${money(credits(i))}` : ""} · reste ${money(rest)}` : ""}</span></span>
        </button></li>; })}</ul>}
    {openId && <InvoiceDialog key={openId} id={openId} companyId={companyId} canWrite={canWrite} onClose={() => setOpen(null)} onChanged={load} />}
    {settingsOpen && <InvoiceSettings companyId={companyId} canWrite={canWrite} onClose={() => setSettingsOpen(false)} />}
  </div>;
}

function InvoiceDialog({ id, companyId, canWrite, onClose, onChanged }: { id: string; companyId: string; canWrite: boolean; onClose: () => void; onChanged: () => void }) {
  const [inv, setInv] = useState<Inv | null>(null); const [ctx, setCtx] = useState<{ rates: TaxRates; gst: RegStatus; qst: RegStatus; seller: Inv; template: Inv } | null>(null);
  const [clients, setClients] = useState<Inv[]>([]); const [projects, setProjects] = useState<Inv[]>([]); const [inflows, setInflows] = useState<Inv[]>([]);
  const [quote, setQuote] = useState<Inv | null>(null); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false); const [replace, setReplace] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0); const [bal, setBal] = useState<Sum | null>(null); // solde : source commune (fin_invoice_receipt_summary)

  const load = useCallback(async () => {
    const { data } = await db.from("fin_invoices").select("*, ent_crm_projects(name), fin_expected_inflows!fin_invoices_expected_inflow_id_fkey(id,amount,received,archived_at)").eq("id", id).maybeSingle();
    setInv(data);
    if (data?.quote_id) { const { data: q } = await db.from("ent_crm_quotes").select("number,version,tax_snapshot,total,subtotal").eq("id", data.quote_id).maybeSingle(); setQuote(q); }
  }, [id]);
  useEffect(() => { void load();
    (async () => {
      const [rates, s, co, t, cl, pj, inf] = await Promise.all([loadRates(db), db.from("ent_crm_settings").select("gst_status,qst_status,gst_number,qst_number").eq("company_id", companyId).maybeSingle(),
        db.from("jsc_companies").select("name,legal_name,address,phone,email").eq("id", companyId).maybeSingle(), db.from("fin_invoice_settings").select("*").eq("company_id", companyId).maybeSingle(),
        db.from("ent_crm_clients").select("id,name,email,phone,city").eq("company_id", companyId).is("archived_at", null).order("name").limit(500),
        db.from("ent_crm_projects").select("id,name").eq("company_id", companyId).is("archived_at", null).order("name").limit(300),
        db.from("fin_expected_inflows").select("id,amount,received,counterparty,expected_on").eq("company_id", companyId).is("invoice_id", null).is("archived_at", null).order("expected_on").limit(200)]);
      const sd = s.data ?? {}; setCtx({ rates, gst: sd.gst_status ?? "a_completer", qst: sd.qst_status ?? "a_completer",
        seller: { ...(co.data ?? {}), gst_number: sd.gst_status === "inscrit" ? sd.gst_number : null, qst_number: sd.qst_status === "inscrit" ? sd.qst_number : null }, template: t.data ?? {} });
      setClients(cl.data ?? []); setProjects(pj.data ?? []); setInflows(inf.data ?? []);
    })(); }, [id, companyId, load]);

  if (!inv || !ctx) return <Dialog open onOpenChange={onClose}><DialogContent><p>Chargement…</p></DialogContent></Dialog>;
  const draft = inv.status === "brouillon"; const editable = draft && canWrite;
  const lines: Line[] = inv.lines ?? [];
  const preview = draft ? computeTaxes(lines, { gstStatus: ctx.gst, qstStatus: ctx.qst, rates: ctx.rates, pricesIncludeTax: !!inv.prices_include_tax }) : inv.tax_snapshot;
  const qs = quote?.tax_snapshot; const gap = draft && qs && preview && (qs.total !== preview.total || qs.gst !== preview.gst || qs.qst !== preview.qst);
  const set = (p: Inv) => setInv({ ...inv, ...p });
  const setLine = (i: number, p: Partial<Line>) => set({ lines: lines.map((l, j) => j === i ? { ...l, ...p } : l) });

  const save = async () => {
    setBusy(true); setErr(null);
    const row = { client_id: inv.client_id || null, client_name: inv.client_name || null, client_address: inv.client_address || null, client_email: inv.client_email || null, client_phone: inv.client_phone || null,
      project_id: inv.project_id || null, issue_date: inv.issue_date || null, due_date: inv.due_date || null, terms: inv.terms || null, lines, prices_include_tax: !!inv.prices_include_tax, is_test: !!inv.is_test, private_note: inv.private_note || null };
    const { error } = await db.from("fin_invoices").update(row).eq("id", id); setBusy(false);
    if (error) { toast({ title: "Refusé", description: error.message, variant: "destructive" }); return false; }
    await load(); onChanged(); return true;
  };
  const issue = async () => {
    if (busy) return; setBusy(true); setErr(null);
    if (!(await save())) { setBusy(false); return; }
    setBusy(true);
    const { data, error } = await db.rpc("fin_invoice_issue", { _id: id, _replace_inflow: replace || null }); setBusy(false); setConfirm(false);
    if (error) { setErr(error.message); return; }
    toast({ title: data.already ? `Déjà émise : ${data.number}` : `Facture ${data.number} émise`, description: "Émise ne veut pas dire envoyée : transmettez-la vous-même puis marquez-la « Envoyée »." });
    await load(); onChanged();
  };
  const openPdf = async (download: boolean) => {
    setBusy(true);
    try {
      let path = inv.pdf_path as string | null;
      if (!draft && !path && !canWrite) { const doc = renderInvoicePdf(await pdfData(inv)); download ? doc.save(`${inv.number}.pdf`) : window.open(URL.createObjectURL(doc.output("blob")), "_blank"); return; }
      if (!draft && !path) { // premier rendu d'une facture émise : figé dans le stockage privé
        const blob = renderInvoicePdf(await pdfData(inv)).output("blob"); path = `${companyId}/pdf/${id}-${inv.number}.pdf`;
        const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "application/pdf", upsert: false });
        if (up.error && !/exists|Duplicate/i.test(up.error.message)) throw up.error;
        await db.from("fin_invoices").update({ pdf_path: path }).eq("id", id).is("pdf_path", null); await load();
      }
      if (draft) { const doc = renderInvoicePdf(await pdfData({ ...inv, lines }, { seller: ctx.seller, template: ctx.template, tax: preview })); download ? doc.save(`brouillon-facture.pdf`) : window.open(URL.createObjectURL(doc.output("blob")), "_blank"); return; }
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path!, 120, download ? { download: `${inv.number}.pdf` } : undefined);
      if (error) throw error; window.open(data.signedUrl, "_blank");
    } catch (e) { toast({ title: "PDF indisponible", description: (e as Error).message, variant: "destructive" }); } finally { setBusy(false); }
  };
  const markSent = async () => { const note = window.prompt("Comment la facture a-t-elle été transmise ? (ex. courriel envoyé par vous le …)") ?? ""; if (!note.trim()) return;
    const { error } = await db.rpc("fin_invoice_mark_sent", { _id: id, _note: note }); if (error) return toast({ title: "Refusé", description: error.message, variant: "destructive" }); await load(); onChanged(); };
  const del = async () => { if (!window.confirm("Supprimer ce brouillon ?")) return; const { error } = await db.from("fin_invoices").delete().eq("id", id); if (error) return toast({ title: "Refusé", description: error.message, variant: "destructive" }); onChanged(); onClose(); };
  const pickClient = (cid: string) => { const c = clients.find((x) => x.id === cid); set({ client_id: cid || null, client_name: c?.name ?? inv.client_name, client_email: c?.email ?? inv.client_email, client_phone: c?.phone ?? inv.client_phone }); };
  const rec = inv.fin_expected_inflows; const profileLink = `/entrepreneur/crm?company=${companyId}&tab=team`;

  return <Dialog open onOpenChange={onClose}><DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
    <DialogHeader><DialogTitle>{inv.number ? `Facture ${inv.number}` : "Facture — brouillon"}{inv.is_test ? " (TEST)" : ""}</DialogTitle></DialogHeader>
    {!draft && <div className="rounded border border-border p-2 text-xs">Émise le {new Date(inv.issued_at).toLocaleString("fr-CA", { timeZone: "America/Toronto" })} · contenu figé (client, entreprise, lignes, taxes, modalités, modèle v{inv.template_snapshot?.version}).
      {inv.sent_at ? ` Envoyée (déclarée) le ${new Date(inv.sent_at).toLocaleString("fr-CA", { timeZone: "America/Toronto" })} — ${inv.sent_note}.` : " Pas encore marquée envoyée (un téléchargement ne prouve pas l'envoi)."}
      {rec && <> Entrée attendue liée : {bal ? <>net après avoirs {money(bal.net)} · encaissé {money(bal.collected ?? bal.received)} · net à recevoir {money(bal.rest)}</> : "solde en cours de lecture"}{rec.archived_at ? " · retirée des prévisions de trésorerie (soldée par note de crédit)" : ""}.</>} Correction : par une note de crédit (ci-dessous); la facture originale et son PDF restent inchangés.</div>}
    {!draft && <CreditNotes invoice={inv} companyId={companyId} canWrite={canWrite} onChanged={() => { setRefresh((n) => n + 1); void load(); onChanged(); }} />}
    {!draft && <InvoiceReceipts invoiceId={id} companyId={companyId} canWrite={canWrite} refreshKey={refresh} onSummary={setBal} onChanged={() => { void load(); onChanged(); }} />}
    {quote && <p className="text-xs text-muted-foreground">Créée depuis la soumission {quote.number ?? ""} v{quote.version} (soumission inchangée).</p>}
    {gap && <p role="status" className="rounded border border-amber-500/50 bg-amber-500/10 p-2 text-xs">Écart fiscal avec la soumission : total {money(qs.total)} → {money(preview.total)} (TPS {money(qs.gst)} → {money(preview.gst)}, TVQ {money(qs.qst)} → {money(preview.qst)}). Vérifiez avant d'émettre.</p>}

    <fieldset disabled={!editable} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <select aria-label="Client existant" className={sel} value={inv.client_id ?? ""} onChange={(e) => pickClient(e.target.value)}><option value="">Nouveau client (saisie libre)</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <Input placeholder="Nom du client *" value={inv.client_name ?? ""} onChange={(e) => set({ client_name: e.target.value })} />
        <Input placeholder="Adresse du client" value={inv.client_address ?? ""} onChange={(e) => set({ client_address: e.target.value })} />
        <div className="grid grid-cols-2 gap-1"><Input placeholder="Courriel" value={inv.client_email ?? ""} onChange={(e) => set({ client_email: e.target.value })} /><Input placeholder="Téléphone" value={inv.client_phone ?? ""} onChange={(e) => set({ client_phone: e.target.value })} /></div>
        <label className="text-xs">Date de facture<Input type="date" value={inv.issue_date ?? ""} onChange={(e) => set({ issue_date: e.target.value })} /></label>
        <label className="text-xs">Échéance<Input type="date" value={inv.due_date ?? ""} onChange={(e) => set({ due_date: e.target.value })} /></label>
        <select aria-label="Chantier" className={sel} value={inv.project_id ?? ""} onChange={(e) => set({ project_id: e.target.value || null })}><option value="">Sans référence chantier</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!inv.is_test} onChange={(e) => set({ is_test: e.target.checked })} />Exemple fictif (marqué « TEST »)</label>
      </div>
      <Textarea placeholder={ctx.template.default_terms ? `Modalités (ex. ${ctx.template.default_terms})` : "Modalités de paiement"} value={inv.terms ?? ""} onChange={(e) => set({ terms: e.target.value })} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!inv.prices_include_tax} onChange={(e) => set({ prices_include_tax: e.target.checked })} />Prix saisis taxes incluses</label>
      {lines.map((l, i) => <div key={i} className="space-y-1 rounded border border-border p-1.5">
        <Textarea aria-label="Description" rows={2} placeholder="Description" value={l.desc} onChange={(e) => setLine(i, { desc: e.target.value })} />
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
          <Input aria-label="Quantité" type="number" placeholder="Qté" value={l.qty ?? ""} onChange={(e) => setLine(i, { qty: e.target.value === "" ? null : Number(e.target.value) })} />
          <select aria-label="Unité" className={sel} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })}>{[...new Set([...UNITS, l.unit])].map((u) => <option key={u} value={u}>{u}</option>)}</select>
          <Input aria-label="Prix" type="number" placeholder="Prix" value={l.price ?? ""} onChange={(e) => setLine(i, { price: e.target.value === "" ? null : Number(e.target.value) })} />
          <Input aria-label="Rabais (%)" type="number" placeholder="Rabais %" value={l.disc_pct ?? ""} onChange={(e) => setLine(i, { disc_pct: e.target.value === "" ? null : Number(e.target.value) })} />
          <select aria-label="Traitement fiscal" className={`${sel} ${l.tax ? "" : "border-destructive"}`} value={l.tax ?? "a_determiner"} onChange={(e) => setLine(i, { tax: e.target.value as TaxTreatment })}>{(Object.keys(TREATMENT_LABEL) as TaxTreatment[]).map((t) => <option key={t} value={t}>{TREATMENT_LABEL[t]}</option>)}</select>
          <Button type="button" variant="ghost" onClick={() => set({ lines: lines.filter((_, j) => j !== i) })}>Retirer</Button>
        </div></div>)}
      <Button type="button" variant="outline" size="sm" onClick={() => set({ lines: [...lines, { desc: "", qty: 1, unit: "unité", price: null, tax: null }] })}>+ Ligne</Button>
      <Textarea placeholder="Note interne (jamais dans le document client)" value={inv.private_note ?? ""} onChange={(e) => set({ private_note: e.target.value })} />
    </fieldset>

    {preview && <TaxSummary r={preview} className="rounded border border-border p-2" gstNumber={draft ? ctx.seller.gst_number : inv.seller_snapshot?.gst_number} qstNumber={draft ? ctx.seller.qst_number : inv.seller_snapshot?.qst_number} />}
    {preview && (preview.zero_rated_base || preview.exempt_base) ? <p className="text-xs text-muted-foreground">Montant avant taxes {money(preview.pre_tax)} = base taxable {money(preview.taxable_base)} + détaxé {money(preview.zero_rated_base)} + exonéré {money(preview.exempt_base)}.</p> : null}
    {draft && <p className="text-xs text-muted-foreground">Aperçu calculé avec le même moteur que le serveur; les montants enregistrés sont recalculés et figés à l'émission.</p>}
    {err && <div role="alert" className="rounded border border-destructive/50 bg-destructive/10 p-2 text-sm">Émission refusée : {err}. La facture reste en brouillon.
      {/Statut T(PS|VQ)/.test(err) && <> <Link className="underline" to={profileLink}>Compléter le profil fiscal</Link></>}{/Ligne au traitement/.test(err) && " Choisissez le traitement fiscal de chaque ligne (aucun choix automatique)."}</div>}

    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={() => openPdf(false)}>{draft ? "Aperçu PDF (BROUILLON)" : "Ouvrir le PDF"}</Button>
      <Button variant="outline" disabled={busy} onClick={() => openPdf(true)}>Télécharger</Button>
      {editable && <><Button variant="outline" disabled={busy} onClick={save}>Enregistrer le brouillon</Button><Button disabled={busy} onClick={() => setConfirm(true)}>Émettre…</Button><Button variant="ghost" onClick={del}>Supprimer le brouillon</Button></>}
      {!draft && canWrite && !inv.sent_at && <Button variant="outline" onClick={markSent}>Marquer « Envoyée »</Button>}
    </div>
    {confirm && <div className="rounded border border-border p-2 text-sm"><p className="font-semibold">Émettre la facture ?</p><p className="text-xs">Un numéro unique sera attribué et le contenu sera figé (plus de modification ni de suppression). Une entrée attendue sera créée dans la trésorerie.</p>
      {inflows.length > 0 && <label className="mt-1 block text-xs">Remplacer une prévision existante (encaissements conservés) :<select className={`${sel} mt-1 w-full`} value={replace} onChange={(e) => setReplace(e.target.value)}><option value="">Non, créer une nouvelle entrée attendue</option>{inflows.map((x) => <option key={x.id} value={x.id}>{x.counterparty || "Entrée"} · {money(x.amount)} · {fmtDate(x.expected_on)}{Number(x.received) ? ` · déjà encaissé ${money(x.received)}` : ""}</option>)}</select></label>}
      <div className="mt-2 flex gap-2"><Button disabled={busy} onClick={issue}>Confirmer l'émission</Button><Button variant="ghost" onClick={() => setConfirm(false)}>Annuler</Button></div></div>}
  </DialogContent></Dialog>;
}

function InvoiceSettings({ companyId, canWrite, onClose }: { companyId: string; canWrite: boolean; onClose: () => void }) {
  const [s, setS] = useState<Inv | null>(null); const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => { db.from("fin_invoice_settings").select("*").eq("company_id", companyId).maybeSingle().then(async ({ data }: Inv) => {
    setS(data ?? { prefix: "F-", next_number: 1, brand_color: "#7ED321" });
    if (data?.logo_path) { const { data: u } = await supabase.storage.from(BUCKET).createSignedUrl(data.logo_path, 300); setLogoUrl(u?.signedUrl ?? null); } }); }, [companyId]);
  if (!s) return null;
  const save = async (extra: Inv = {}) => { const row = { company_id: companyId, prefix: s.prefix || "F-", brand_color: s.brand_color || null, footer: s.footer || null, default_terms: s.default_terms || null, updated_at: new Date().toISOString(), ...extra };
    const { error } = await db.from("fin_invoice_settings").upsert(row); toast({ title: error ? "Refusé" : "Modèle enregistré", description: error?.message ?? "S'applique aux prochaines émissions; les factures déjà émises ne changent pas.", variant: error ? "destructive" : undefined }); if (!error) setS({ ...s, ...row }); };
  const upload = async (file: File) => {
    if (!/image\/(png|jpeg)/.test(file.type) || file.size > 2_000_000) return toast({ title: "Logo refusé", description: "PNG ou JPEG de 2 Mo maximum.", variant: "destructive" });
    const path = `${companyId}/logo/${Date.now()}.${file.type === "image/png" ? "png" : "jpg"}`; // nouveau fichier à chaque fois : les anciennes factures gardent le leur
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type }); if (error) return toast({ title: "Refusé", description: error.message, variant: "destructive" });
    await save({ logo_path: path }); setLogoUrl(URL.createObjectURL(file));
  };
  return <Dialog open onOpenChange={onClose}><DialogContent><DialogHeader><DialogTitle>Modèle de facture et numérotation</DialogTitle></DialogHeader>
    <fieldset disabled={!canWrite} className="space-y-2">
      <div className="grid grid-cols-2 gap-2"><label className="text-xs">Préfixe<Input value={s.prefix ?? ""} maxLength={12} onChange={(e) => setS({ ...s, prefix: e.target.value })} /></label>
        <p className="text-xs text-muted-foreground self-end">Prochain numéro : {(s.prefix || "F-") + String(s.next_number ?? 1).padStart(5, "0")} (attribué par le serveur à l'émission)</p></div>
      <label className="text-xs">Couleur principale<Input type="color" value={s.brand_color ?? "#7ED321"} onChange={(e) => setS({ ...s, brand_color: e.target.value })} /></label>
      <Textarea placeholder="Pied de page (ex. modalités de virement)" maxLength={600} value={s.footer ?? ""} onChange={(e) => setS({ ...s, footer: e.target.value })} />
      <Input placeholder="Modalités proposées par défaut (ex. Net 30 jours)" value={s.default_terms ?? ""} onChange={(e) => setS({ ...s, default_terms: e.target.value })} />
      <div className="flex items-center gap-2">{logoUrl && <img src={logoUrl} alt="Logo actuel" className="h-12 max-w-[8rem] object-contain" />}<label className="text-xs">Logo (PNG ou JPEG)<Input type="file" accept="image/png,image/jpeg" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label></div>
      <p className="text-xs text-muted-foreground">Modèle « standard ». Un modèle sur mesure par entreprise pourra être ajouté plus tard (sur demande, sans tarif défini).</p>
      <Button onClick={() => save()}>Enregistrer</Button>
    </fieldset></DialogContent></Dialog>;
}
