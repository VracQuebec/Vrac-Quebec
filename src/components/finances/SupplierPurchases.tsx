// FIN-12A — Fournisseurs et achats : fiche fournisseur, facture fournisseur (brouillon → confirmation),
// remplacement d'une estimation, justificatifs et doublons. La dette reste l'échéance existante (aucun 2e registre).
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import * as P from "@/lib/finances/purchases";
import * as api from "@/lib/finances/api";
import * as st from "@/lib/finances/settlement";
import { fmtDate, fmtMoney } from "@/lib/finances/period";
import { PaymentDialog, type PayTarget } from "@/components/finances/Settlements";
import PurchaseOrders from "@/components/finances/PurchaseOrders";
import DocumentCaptures from "@/components/finances/DocumentCaptures";
import * as Cap from "@/lib/finances/captures";
import CsvPurchaseImport from "@/components/finances/CsvPurchaseImport";

const sel = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";
type View = { k: "list" } | { k: "csv" } | { k: "bill"; id: string | null } | { k: "supplier"; id: string } | { k: "credit"; id: string | null };
const L = ({ l, children, className = "" }: { l: string; children: React.ReactNode; className?: string }) => <label className={`block text-sm ${className}`}><span className="mb-1 block text-xs font-semibold text-muted-foreground">{l}</span>{children}</label>;
const money = (n: number | null | undefined) => (n == null ? "—" : fmtMoney(n));

export default function SupplierPurchases({ companyId, companyName, canWrite, canCorrect, initialOcc }: { companyId: string; companyName: string; canWrite: boolean; canCorrect: boolean; initialOcc?: string | null }) {
  const [view, setView] = useState<View>(() => (initialOcc && canWrite ? { k: "bill", id: null } : { k: "list" }));
  const [sups, setSups] = useState<{ id: string; name: string; archived: boolean }[] | null>(null);
  const [rev, setRev] = useState(0);
  const loadSups = useCallback(() => { P.suppliers(companyId).then(setSups).catch(() => setSups(null)); }, [companyId]);
  useEffect(() => { loadSups(); }, [loadSups, rev]);
  const back = () => { setView({ k: "list" }); setRev((r) => r + 1); };
  const [tab, setTab] = useState<"bills" | "orders" | "docs">("bills");
  return <div className="space-y-3" data-testid="fin12a">
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Achats">
      <Button size="sm" role="tab" aria-selected={tab === "bills"} variant={tab === "bills" ? "default" : "outline"} onClick={() => { setTab("bills"); back(); }}>Factures et crédits</Button>
      <Button size="sm" role="tab" aria-selected={tab === "docs"} variant={tab === "docs" ? "default" : "outline"} onClick={() => setTab("docs")}>Reçus et documents</Button>
      <Button size="sm" role="tab" aria-selected={tab === "orders"} variant={tab === "orders" ? "default" : "outline"} onClick={() => setTab("orders")}>Commandes</Button>
    </div>
    {tab === "docs" ? <DocumentCaptures key={companyId} companyId={companyId} sups={sups} canWrite={canWrite} onOpenBill={(id) => { setTab("bills"); setView({ k: "bill", id }); }} onOpenCredit={(id) => { setTab("bills"); setView({ k: "credit", id }); }} />
    : tab === "orders" ? <PurchaseOrders key={companyId} companyId={companyId} sups={sups} canWrite={canWrite} canCorrect={canCorrect} onOpenBill={(id) => { setTab("bills"); setView({ k: "bill", id }); }} /> : <>
    <p className="text-xs text-muted-foreground">Factures et notes de crédit fournisseurs : un brouillon n'a aucun effet financier; la confirmation d'une facture crée ou remplace exactement une échéance « À payer »; un crédit réduit le solde d'une facture sans être un encaissement. Lecture des reçus : onglet « Reçus et documents ». Import CSV : bouton « Importer un CSV » (brouillons seulement).</p>
    {view.k === "csv" && <CsvPurchaseImport key={companyId} companyId={companyId} sups={sups} onOpenBill={(id) => setView({ k: "bill", id })} onOpenCredit={(id) => setView({ k: "credit", id })} onClose={back} />}
    {view.k === "list" && <BillList onCsv={() => setView({ k: "csv" })} companyId={companyId} sups={sups} rev={rev} canWrite={canWrite} onOpen={(id) => setView({ k: "bill", id })} onSupplier={(id) => setView({ k: "supplier", id })} onNewSupplier={() => setView({ k: "supplier", id: "" })} onCredit={(id) => setView({ k: "credit", id })} />}
    {view.k === "bill" && <BillEditor key={view.id ?? "new"} companyId={companyId} companyName={companyName} id={view.id} sups={sups ?? []} canWrite={canWrite} canCorrect={canCorrect} initialOcc={view.id ? null : initialOcc ?? null}
      onOpen={(id) => setView({ k: "bill", id })} onBack={back} />}
    {view.k === "supplier" && <SupplierSheet key={view.id} companyId={companyId} id={view.id || null} canWrite={canWrite} onBack={back} onSaved={(id) => { loadSups(); setView({ k: "supplier", id }); }} onOpenBill={(id) => setView({ k: "bill", id })} onOpenCredit={(id) => setView({ k: "credit", id })} />}
    {view.k === "credit" && <CreditEditor key={view.id ?? "new"} companyId={companyId} id={view.id} sups={sups ?? []} canWrite={canWrite} canCorrect={canCorrect} onOpen={(id) => setView({ k: "credit", id })} onOpenBill={(id) => setView({ k: "bill", id })} onBack={back} />}
    </>}
  </div>;
}

function BillList({ companyId, sups, rev, canWrite, onOpen, onSupplier, onNewSupplier, onCredit, onCsv }: { onCsv: () => void; companyId: string; sups: { id: string; name: string; archived: boolean }[] | null; rev: number; canWrite: boolean; onOpen: (id: string | null) => void; onSupplier: (id: string) => void; onNewSupplier: () => void; onCredit: (id: string | null) => void }) {
  const [f, setF] = useState<{ supplier_id: string; status: string; q: string }>({ supplier_id: "", status: "active", q: "" });
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Awaited<ReturnType<typeof P.overview>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [crs, setCrs] = useState<P.CreditRow[] | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current; setError(null); setData(null); setCrs(null);
    P.overview(companyId, f, 25, page * 25).then((d) => { if (my === seq.current) setData(d); }).catch((e) => { if (my === seq.current) setError(e.message); });
    P.credits(companyId, f.supplier_id || null).then((c) => { if (my === seq.current) setCrs(c); }).catch(() => { if (my === seq.current) setCrs(null); });
  }, [companyId, f, page, rev]);
  const t = data?.totals;
  return <section className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {canWrite && <Button size="sm" onClick={() => onOpen(null)} disabled={!sups?.length}>Ajouter une facture fournisseur</Button>}
      {canWrite && <Button size="sm" variant="outline" onClick={() => onCredit(null)} disabled={!sups?.length}>Ajouter une note de crédit</Button>}
      {canWrite && <Button size="sm" variant="outline" onClick={onCsv} disabled={!sups?.length}>Importer un CSV</Button>}
      {canWrite && <Button size="sm" variant="outline" onClick={onNewSupplier}>Ajouter ou réutiliser un fournisseur</Button>}
    </div>
    {sups && !sups.length && <p className="text-sm text-muted-foreground">Aucun fournisseur. Ajoutez-en un (ou réutilisez une fiche existante) avant la première facture.</p>}
    <div className="grid gap-2 sm:grid-cols-3">
      <select aria-label="Fournisseur" className={sel} value={f.supplier_id} onChange={(e) => { setPage(0); setF({ ...f, supplier_id: e.target.value }); }}><option value="">Tous les fournisseurs</option>{sups?.map((s) => <option key={s.id} value={s.id}>{s.name}{s.archived ? " (archivé)" : ""}</option>)}</select>
      <select aria-label="Statut" className={sel} value={f.status} onChange={(e) => { setPage(0); setF({ ...f, status: e.target.value }); }}><option value="active">Brouillons et confirmées</option><option value="draft">Brouillons</option><option value="confirmed">Confirmées</option><option value="void">Annulées</option><option value="all">Toutes</option></select>
      <Input aria-label="Recherche" placeholder="Fournisseur ou référence" value={f.q} onChange={(e) => { setPage(0); setF({ ...f, q: e.target.value }); }} />
    </div>
    {f.supplier_id && <Button size="sm" variant="link" className="px-0" onClick={() => onSupplier(f.supplier_id)}>Ouvrir la fiche du fournisseur</Button>}
    {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">Impossible de charger les factures : {error}. Aucun total n'est affiché.</p>
      : !data ? <p className="text-sm text-muted-foreground">Chargement…</p>
      : <>
        <div className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-4" aria-label="Totaux filtrés">
          <div><div className="text-xs text-muted-foreground">Confirmé</div><strong>{fmtMoney(t!.confirmed_total)}</strong></div>
          <div><div className="text-xs text-muted-foreground">Réglé · crédits affectés</div><strong>{fmtMoney(t!.paid)}</strong> · <strong data-testid="credited">{fmtMoney(t!.credited ?? 0)}</strong></div>
          <div><div className="text-xs text-muted-foreground">Reste à payer</div><strong data-testid="rest">{fmtMoney(t!.rest)}</strong></div>
          <div className="text-xs text-muted-foreground">dont échéance connue {fmtMoney(t!.rest_due_known)} · <span>échéance inconnue {fmtMoney(t!.rest_due_unknown)}</span>{t!.overpaid > 0 && <div className="text-destructive">Trop-payé {fmtMoney(t!.overpaid)}</div>}</div>
          <p className="text-xs sm:col-span-4">Crédit fournisseur disponible (non affecté, conservé à part) : <strong data-testid="credit-available">{fmtMoney(t!.credit_available ?? 0)}</strong> — ce n'est pas un encaissement.</p>
          <p className="text-[11px] text-muted-foreground sm:col-span-4">Totaux sur les {t!.count} résultats filtrés (toutes pages). {t!.drafts} brouillon(s) non comptés. {t!.tax_incomplete} avec ventilation fiscale à compléter.</p>
        </div>
        <ul className="divide-y rounded-md border">{data.rows.map((r) => <li key={r.id}><button className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted/40" onClick={() => onOpen(r.id)}>
          <span><strong>{r.supplier}</strong> · {r.reference ?? "sans référence"} <span className="text-xs text-muted-foreground">({P.STATUS_LABEL[r.status]}{r.tax_status === "a_completer" ? " · ventilation fiscale à compléter" : ""})</span><br />
            <span className="text-xs text-muted-foreground">Document {r.doc_date ? fmtDate(r.doc_date) : "—"} · échéance {r.due_unknown || !r.due_date ? (r.replaced && !r.due_unknown ? "de l'estimation" : "inconnue") : fmtDate(r.due_date)}{r.replaced ? ` · remplace une estimation de ${money(r.estimate)}` : ""}</span></span>
          <span className="text-right">{money(r.total)}{r.status === "confirmed" && <><br /><span className="text-xs">{(r.credited ?? 0) > 0 ? `crédits ${money(r.credited)} · ` : ""}reste {money(r.rest)}{(r.overpaid ?? 0) > 0 ? ` · trop-payé ${money(r.overpaid)}` : ""}</span></>}</span>
        </button></li>)}{!data.rows.length && <li className="p-3 text-sm text-muted-foreground">Aucune facture.</li>}</ul>
        {crs && crs.length > 0 && <div className="space-y-1"><p className="text-xs font-semibold text-muted-foreground">Notes de crédit</p><ul className="divide-y rounded-md border">{crs.map((c) => <li key={c.id}><button className="flex w-full flex-wrap justify-between gap-2 p-2 text-left text-sm hover:bg-muted/40" onClick={() => onCredit(c.id)}>
          <span><strong>{c.supplier}</strong> · {c.reference ?? "sans numéro"} <span className="text-xs text-muted-foreground">({P.STATUS_LABEL[c.status]})</span></span>
          <span className="text-right text-xs">{money(c.total)}{c.status === "confirmed" && <> · affecté {fmtMoney(c.allocated)} · disponible {money(c.available)}</>}</span></button></li>)}</ul></div>}
        {data.total > 25 && <div className="flex items-center gap-2 text-sm"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</Button>Page {page + 1} / {Math.ceil(data.total / 25)}<Button size="sm" variant="outline" disabled={(page + 1) * 25 >= data.total} onClick={() => setPage(page + 1)}>Suivant</Button></div>}
      </>}
  </section>;
}

function BillEditor({ companyId, companyName, id, sups, canWrite, canCorrect, initialOcc, onOpen, onBack }: { companyId: string; companyName: string; id: string | null; sups: { id: string; name: string; archived: boolean }[]; canWrite: boolean; canCorrect: boolean; initialOcc: string | null; onOpen: (id: string) => void; onBack: () => void }) {
  const lk = `vq.fin12a.bill.${companyId}.${id ?? "new"}`;
  const stored = (() => { try { return JSON.parse(localStorage.getItem(lk) || "null"); } catch { return null; } })();
  const [b, setB] = useState<any>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [form, setForm] = useState<P.BillForm>(stored?.form ?? P.emptyBill(sups.length === 1 ? sups[0].id : ""));
  const [createKey] = useState<string>(stored?.createKey ?? crypto.randomUUID());
  const [dirty, setDirty] = useState(!!stored);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dups, setDups] = useState<P.Dups | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [lk2, setLk2] = useState<Awaited<ReturnType<typeof api.lookups>> | null>(null);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [files, setFiles] = useState<Awaited<ReturnType<typeof P.companyFiles>>>([]);
  const [confirmOpen, setConfirmOpen] = useState(!!initialOcc);
  const [pay, setPay] = useState<PayTarget[] | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [pos, setPos] = useState<P.Position | null>(null);
  const [posErr, setPosErr] = useState<string | null>(null);
  const [allocReason, setAllocReason] = useState("");
  const [capFiles, setCapFiles] = useState<Awaited<ReturnType<typeof Cap.forBill>>>([]);
  useEffect(() => { if (id) Cap.forBill(id).then(setCapFiles).catch(() => setCapFiles([])); }, [id]);
  const alive = useRef(true); useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try { const x = await P.bill(id); if (!alive.current) return; if (!x) { setLoadErr("Facture introuvable ou inaccessible"); return; } setB(x); setEvents(await P.billEvents(id));
      if (x.status === "confirmed") { try { const p = await P.billPosition(id); if (alive.current) { setPos(p); setPosErr(null); } } catch (e: any) { if (alive.current) { setPos(null); setPosErr(e.message); } } }
      if (!stored) setForm({ supplier_id: x.supplier_id, reference: x.reference ?? "", doc_date: x.doc_date ?? "", due_date: x.due_date ?? "", description: x.description ?? "", category_id: x.category_id ?? "", truck_id: x.truck_id ?? "", project_id: x.project_id ?? "",
        subtotal: x.subtotal?.toString() ?? "", gst: x.gst?.toString() ?? "", qst: x.qst?.toString() ?? "", total: x.total?.toString() ?? "", file_id: x.file_id ?? "", file_sha256: x.file_sha256 ?? "", file_name: x.file_id ? "pièce jointe" : "" });
    } catch (e: any) { if (alive.current) setLoadErr(e.message); }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); api.lookups(companyId).then(setLk2).catch(() => {}); api.categories(companyId).then((c) => setCats(c.filter((x) => !x.archived_at))).catch(() => {}); P.companyFiles(companyId).then(setFiles).catch(() => {}); }, [load, companyId]);
  useEffect(() => { if (!dirty) return; try { localStorage.setItem(lk, JSON.stringify({ form, createKey })); } catch { /* stockage indisponible */ } }, [form, dirty, lk, createKey]);
  const up = (k: keyof P.BillForm, v: string) => { setDirty(true); setForm((f) => ({ ...f, [k]: v })); };
  const editable = canWrite && (!id || b?.status === "draft");
  const gap = P.taxGap(form);

  const save = async () => {
    setBusy(true); setSaveErr(null);
    try {
      const d = await P.dups(companyId, id, form); setDups(d);
      const r = await P.saveBill(companyId, id, form, b?.rev ?? null, id ? null : createKey);
      try { localStorage.removeItem(lk); } catch { /* ignore */ }
      setDirty(false);
      toast({ title: r.replay ? "Brouillon déjà enregistré (repris)" : "Brouillon enregistré", description: "Aucune dette n'est créée tant que le document n'est pas confirmé." });
      if (!id) onOpen(r.id); else await load();
    } catch (e: any) { setSaveErr(e.message); } finally { setBusy(false); }
  };
  const attach = async (file?: File | null) => {
    if (!file) return; setBusy(true);
    try { const r = await P.uploadProof(companyId, file); setDirty(true); setForm((f) => ({ ...f, file_id: r.id, file_sha256: r.sha, file_name: r.name })); setDups(await P.dups(companyId, id, { ...form, file_id: r.id, file_sha256: r.sha }));
      setFiles(await P.companyFiles(companyId)); } catch (e: any) { toast({ title: "Pièce non jointe", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  };
  const openPay = async () => { const d = await st.occDetail(b.occurrence_id); const o = d?.occ; if (!o) return toast({ title: "Échéance inaccessible", variant: "destructive" });
    setPay([{ id: o.id, label: o.label, due_date: o.due_date, balance: o.balance, amount_quality: o.amount_quality, payee: o.payee, payee_key: o.payee_key }]); };

  if (loadErr) return <section className="space-y-2"><p role="alert" className="text-sm text-destructive">{loadErr}</p><Button size="sm" variant="outline" onClick={onBack}>Retour à la liste</Button></section>;
  if (id && !b) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  return <section className="space-y-3 rounded-md border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display font-semibold">{id ? `Facture ${b.reference ?? ""} — ${P.STATUS_LABEL[b.status]}` : "Nouvelle facture fournisseur (brouillon)"}</h3><Button size="sm" variant="outline" onClick={onBack}>Retour à la liste</Button></div>
    {id && <p className="text-xs text-muted-foreground">Créée {P.fmtStamp(b.created_at)} · modifiée {P.fmtStamp(b.updated_at)}{b.confirmed_at ? ` · confirmée ${P.fmtStamp(b.confirmed_at)}` : ""}{b.voided_at ? ` · annulée ${P.fmtStamp(b.voided_at)} (${b.void_reason})` : ""} (heure de Toronto)</p>}
    {dirty && editable && <p className="text-xs text-amber-700">Saisie conservée sur cet appareil jusqu'à l'enregistrement.</p>}
    <fieldset disabled={!editable || busy} className="grid gap-3 sm:grid-cols-2">
      <L l="Fournisseur *"><select aria-label="Fournisseur" className={sel} value={form.supplier_id} onChange={(e) => up("supplier_id", e.target.value)}><option value="">— Choisir —</option>{sups.filter((s) => !s.archived || s.id === form.supplier_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></L>
      <L l="Référence de la facture *"><Input aria-label="Référence" value={form.reference} onChange={(e) => up("reference", e.target.value)} /></L>
      <L l="Date du document *"><Input aria-label="Date du document" type="date" value={form.doc_date} onChange={(e) => up("doc_date", e.target.value)} /></L>
      <L l="Échéance (laisser vide si inconnue)"><Input aria-label="Échéance" type="date" value={form.due_date} onChange={(e) => up("due_date", e.target.value)} /></L>
      <L l="Description / lignes" className="sm:col-span-2"><Textarea aria-label="Description" rows={2} value={form.description} onChange={(e) => up("description", e.target.value)} /></L>
      <L l="Catégorie"><select className={sel} value={form.category_id} onChange={(e) => up("category_id", e.target.value)}><option value="">Aucune</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
      <L l="Devise"><Input value="CAD" disabled /></L>
      <L l="Camion / équipement (facultatif)"><select className={sel} value={form.truck_id} onChange={(e) => up("truck_id", e.target.value)}><option value="">Aucun</option>{lk2?.trucks.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
      <L l="Chantier (facultatif)"><select className={sel} value={form.project_id} onChange={(e) => up("project_id", e.target.value)}><option value="">Aucun</option>{lk2?.projects.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
      <L l="Avant taxes"><Input aria-label="Avant taxes" inputMode="decimal" value={form.subtotal} onChange={(e) => up("subtotal", e.target.value)} /></L>
      <L l="TPS"><Input aria-label="TPS" inputMode="decimal" value={form.gst} onChange={(e) => up("gst", e.target.value)} /></L>
      <L l="TVQ"><Input aria-label="TVQ" inputMode="decimal" value={form.qst} onChange={(e) => up("qst", e.target.value)} /></L>
      <L l="Total du document *"><Input aria-label="Total" inputMode="decimal" value={form.total} onChange={(e) => up("total", e.target.value)} /></L>
    </fieldset>
    {!P.taxComplete(form) && <p className="text-xs text-amber-700">Ventilation fiscale à compléter : aucune taxe n'est supposée nulle et aucune admissibilité n'est déduite.</p>}
    {gap != null && gap !== 0 && <p className="text-xs text-destructive">Écart de {fmtMoney(gap)} entre le total et avant taxes + TPS + TVQ. Le document est conservé tel quel : vérifiez la saisie.</p>}
    {capFiles.length > 0 && <div className="text-sm" data-testid="cap-files"><span className="text-xs font-semibold text-muted-foreground">Pièces jointes depuis « Reçus et documents »</span>
      <ul className="text-xs">{capFiles.map((x) => <li key={x.capture_id + x.kind}>{x.name} · {x.kind === "attached" ? "jointe" : "source du brouillon"} · {P.fmtStamp(x.at)} <Button size="sm" variant="link" onClick={() => P.openFile(x.file_id).then((u) => window.open(u, "_blank", "noopener")).catch((e) => toast({ title: e.message, variant: "destructive" }))}>Ouvrir</Button></li>)}</ul></div>}
    <div className="space-y-1 text-sm"><span className="text-xs font-semibold text-muted-foreground">Justificatif (photo ou PDF, stockage privé)</span>
      {form.file_id ? <p>{form.file_name || "pièce jointe"} <Button size="sm" variant="link" onClick={() => P.openFile(form.file_id).then((u) => window.open(u, "_blank", "noopener")).catch((e) => toast({ title: e.message, variant: "destructive" }))}>Ouvrir</Button>{editable && <Button size="sm" variant="link" onClick={() => { setDirty(true); setForm((f) => ({ ...f, file_id: "", file_sha256: "", file_name: "" })); }}>Retirer</Button>}</p>
        : editable && <div className="flex flex-wrap gap-2"><Input aria-label="Joindre un justificatif" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" capture="environment" className="max-w-xs" onChange={(e) => attach(e.target.files?.[0])} />
          <select aria-label="Lier une pièce existante" className={`${sel} max-w-xs`} value="" onChange={(e) => { const x = files.find((f) => f.id === e.target.value); if (x) { setDirty(true); setForm((f) => ({ ...f, file_id: x.id, file_sha256: "", file_name: x.file_name })); } }}><option value="">Lier une pièce déjà présente…</option>{files.map((f) => <option key={f.id} value={f.id}>{f.file_name}</option>)}</select></div>}
    </div>
    {dups && (dups.exact.length > 0 || dups.probable.length > 0) && <div role="status" className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
      {dups.exact.map((d) => <p key={d.id}><strong>Déjà enregistré</strong> ({d.why === "fichier" ? "même fichier" : "même fournisseur et référence"}) : {d.reference ?? "—"} · {money(d.total)} · {P.STATUS_LABEL[d.status]} <Button size="sm" variant="link" onClick={() => onOpen(d.id)}>Ouvrir le document existant</Button></p>)}
      {dups.probable.map((d) => <p key={d.id}>Doublon probable ({d.why}) : {d.reference ?? "—"} · {money(d.total)} <Button size="sm" variant="link" onClick={() => onOpen(d.id)}>Ouvrir</Button></p>)}
    </div>}
    {saveErr && <p role="alert" className="text-sm text-destructive">Enregistrement refusé : {saveErr}. Votre saisie est conservée.</p>}
    <div className="flex flex-wrap gap-2">
      {editable && <Button size="sm" onClick={save} disabled={busy}>Enregistrer le brouillon</Button>}
      {editable && id && !dirty && <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)}>Confirmer le document…</Button>}
      {b?.status === "confirmed" && canWrite && <Button size="sm" onClick={openPay}>Enregistrer un règlement</Button>}
    </div>
    {confirmOpen && id && b?.status === "draft" && <ConfirmPanel companyId={companyId} bill={b} initialOcc={initialOcc} onClose={() => setConfirmOpen(false)} onDone={() => { setConfirmOpen(false); void load(); }} onOpen={onOpen} />}
    {confirmOpen && !id && <p className="text-xs text-muted-foreground">Enregistrez d'abord le brouillon; l'estimation choisie sera proposée à la confirmation.</p>}
    {b?.status === "confirmed" && <div className="space-y-1 rounded-md bg-muted/40 p-2 text-sm">
      <p>{b.replaced_estimate ? <>Remplace l'estimation de {money(b.estimate_amount)} ({b.estimate_quality === "estimated" ? "estimée" : b.estimate_quality === "unknown" ? "à compléter" : b.estimate_quality}); le montant réel est compté une seule fois.</> : <>Nouvelle échéance unique créée à la confirmation{b.due_date ? "" : " — échéance inconnue : comptée dans la dette, mais hors des prévisions datées"}.</>}</p>
      {posErr ? <p role="alert" className="text-destructive">Position indisponible : {posErr}. Aucun solde n'est affiché.</p> : pos && <dl className="grid grid-cols-2 gap-1 sm:grid-cols-5" aria-label="Position de la facture">
        <div><dt className="text-xs text-muted-foreground">Montant facturé</dt><dd>{money(pos.total)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Crédits affectés</dt><dd data-testid="pos-credited">{fmtMoney(pos.credited)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Règlements</dt><dd data-testid="pos-paid">{fmtMoney(pos.paid)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Reste à payer</dt><dd data-testid="pos-rest"><strong>{money(pos.rest)}</strong></dd></div>
        <div><dt className="text-xs text-muted-foreground">Échéance</dt><dd>{pos.due_unknown ? "inconnue" : "datée"}</dd></div>
      </dl>}
      {pos && pos.allocs.length > 0 && <ul className="text-xs">{pos.allocs.map((a) => <li key={a.id} className="flex flex-wrap items-center gap-2">Crédit {a.reference ?? "—"} · {fmtMoney(a.amount)} · {P.fmtStamp(a.created_at)}{a.reversed_at ? ` · annulé ${P.fmtStamp(a.reversed_at)} (${a.reverse_reason})` : ""}
        {!a.reversed_at && canCorrect && <Button size="sm" variant="link" disabled={!allocReason.trim() || busy} onClick={async () => { setBusy(true); try { await P.voidAlloc(a.id, allocReason); setAllocReason(""); toast({ title: "Affectation annulée", description: "Le crédit redevient disponible; l'historique est conservé." }); await load(); } catch (e: any) { toast({ title: "Annulation refusée", description: e.message, variant: "destructive" }); } finally { setBusy(false); } }}>Annuler cette affectation</Button>}</li>)}
        {canCorrect && pos.allocs.some((a) => !a.reversed_at) && <li><Input aria-label="Motif d'annulation d'affectation" placeholder="Motif (requis pour annuler une affectation)" value={allocReason} onChange={(e) => setAllocReason(e.target.value)} className="h-8 max-w-sm" /></li>}</ul>}
      {canCorrect && <div className="flex flex-wrap items-end gap-2"><L l="Annuler (correction) — motif requis"><Input aria-label="Motif d'annulation" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} /></L>
        <Button size="sm" variant="outline" disabled={!voidReason.trim() || busy} onClick={async () => { setBusy(true); try { await P.voidBill(b.id, b.rev, voidReason); toast({ title: "Facture annulée", description: "Les règlements sont conservés; saisissez au besoin une nouvelle facture." }); await load(); } catch (e: any) { toast({ title: "Annulation refusée", description: e.message, variant: "destructive" }); } finally { setBusy(false); } }}>Annuler la facture</Button></div>}
    </div>}
    {events.length > 0 && <details className="text-xs"><summary>Historique</summary><ul>{events.map((e, i) => <li key={i}>{P.fmtStamp(e.created_at)} — {P.EVENT_LABEL[e.action] ?? e.action}{e.reason ? ` · ${e.reason}` : ""}</li>)}</ul></details>}
    {pay && <PaymentDialog companyId={companyId} companyName={companyName} targets={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); void load(); }} />}
  </section>;
}

function ConfirmPanel({ companyId, bill, initialOcc, onClose, onDone, onOpen }: { companyId: string; bill: any; initialOcc: string | null; onClose: () => void; onDone: () => void; onOpen: (id: string) => void }) {
  const kk = `vq.fin12a.confirm.${bill.id}`;
  const [key] = useState(() => { try { const k = localStorage.getItem(kk); if (k) return k; const n = crypto.randomUUID(); localStorage.setItem(kk, n); return n; } catch { return crypto.randomUUID(); } });
  const [cands, setCands] = useState<Awaited<ReturnType<typeof P.candidates>> | null>(null);
  const [occ, setOcc] = useState<string>(initialOcc ?? "");
  const [pv, setPv] = useState<P.Preview | null>(null);
  const [pvErr, setPvErr] = useState<string | null>(null);
  const [dups, setDups] = useState<P.Dups | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { P.candidates(companyId, bill.supplier_id).then(setCands).catch((e) => setPvErr(e.message));
    P.dups(companyId, bill.id, { ...P.emptyBill(bill.supplier_id), reference: bill.reference ?? "", doc_date: bill.doc_date ?? "", total: bill.total?.toString() ?? "", file_id: bill.file_id ?? "", file_sha256: bill.file_sha256 ?? "" }).then(setDups).catch(() => {}); }, [companyId, bill]);
  useEffect(() => { setPv(null); setPvErr(null); P.preview(bill.id, occ || null).then(setPv).catch((e) => setPvErr(e.message)); }, [bill.id, occ]);
  const exact = (dups?.exact.length ?? 0) > 0;
  const blocked = !pv || (pv.overpaid ?? 0) > 0 || !!pv.taken_by || pv.payee_match === false || (exact && !reason.trim());
  const go = async () => {
    setBusy(true); setErr(null);
    try { const r = await P.confirm(bill.id, occ || null, bill.rev, key, exact ? reason : null); try { localStorage.removeItem(kk); } catch { /* ignore */ }
      toast({ title: r.replay ? "Déjà confirmée (même demande)" : "Document confirmé", description: "Une seule échéance « À payer » liée." }); onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return <div className="space-y-2 rounded-md border border-primary/40 p-3 text-sm" data-testid="confirm-panel">
    <h4 className="font-semibold">Confirmer le document</h4>
    <L l="Remplacer une estimation (facultatif)"><select aria-label="Estimation à remplacer" className={sel} value={occ} onChange={(e) => setOcc(e.target.value)}><option value="">Aucune — créer une nouvelle échéance</option>
      {cands?.map((c) => <option key={c.id} value={c.id}>{c.label} · {fmtDate(c.due_date)} · {money(c.amount)} ({c.quality === "estimated" ? "estimé" : "à compléter"})</option>)}
      {occ && cands && !cands.some((c) => c.id === occ) && <option value={occ}>Échéance choisie</option>}</select></L>
    {pvErr ? <p role="alert" className="text-destructive">{pvErr}</p> : !pv ? <p className="text-muted-foreground">Calcul de l'aperçu…</p> : <dl className="grid grid-cols-2 gap-1 sm:grid-cols-3" aria-label="Aperçu">
      <dt className="text-muted-foreground">Estimation</dt><dd>{pv.mode === "new" ? "aucune" : money(pv.estimate)}</dd>
      <dt className="text-muted-foreground">Montant réel</dt><dd>{money(pv.real)}</dd>
      <dt className="text-muted-foreground">Écart</dt><dd>{pv.diff == null ? "—" : fmtMoney(pv.diff)}</dd>
      <dt className="text-muted-foreground">Déjà réglé</dt><dd>{fmtMoney(pv.paid)}</dd>
      <dt className="text-muted-foreground">Nouveau solde</dt><dd data-testid="new-rest"><strong>{money(pv.rest)}</strong></dd>
      {pv.overpaid > 0 && <dd className="col-span-2 text-destructive">Trop-payé de {fmtMoney(pv.overpaid)} : retirez d'abord l'affectation excédentaire; rien n'est masqué.</dd>}
      {pv.taken_by && <dd className="col-span-2 text-destructive">Cette échéance est déjà remplacée par une autre facture.</dd>}
      {pv.payee_match === false && <dd className="col-span-2 text-destructive">Échéance d'un autre fournisseur.</dd>}
    </dl>}
    {exact && <div className="space-y-1 rounded border border-destructive/40 p-2"><p>Opération déjà enregistrée : {dups!.exact.map((d) => <Button key={d.id} size="sm" variant="link" onClick={() => onOpen(d.id)}>ouvrir {d.reference ?? "le document"}</Button>)}</p>
      <L l="Exception légitime — motif (tracé)"><Input aria-label="Motif de l'exception" value={reason} onChange={(e) => setReason(e.target.value)} /></L></div>}
    {err && <p role="alert" className="text-destructive">Confirmation refusée : {err}</p>}
    <div className="flex gap-2"><Button size="sm" disabled={busy || blocked} onClick={go}>Confirmer</Button><Button size="sm" variant="outline" onClick={onClose}>Fermer</Button></div>
  </div>;
}

function SupplierSheet({ companyId, id, canWrite, onBack, onSaved, onOpenBill, onOpenCredit }: { companyId: string; id: string | null; canWrite: boolean; onBack: () => void; onSaved: (id: string) => void; onOpenBill: (id: string) => void; onOpenCredit: (id: string) => void }) {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState<string | null>(null);
  const [p, setP] = useState<Record<string, string>>({ name: "", phone: "", email: "", address: "", city: "", account_ref: "", payment_terms: "", internal_notes: "" });
  const [reuse, setReuse] = useState(""); const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [bills, setBills] = useState<Awaited<ReturnType<typeof P.overview>> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id) { P.contacts(companyId).then(setContacts).catch(() => {}); return; }
    P.supplierDetail(companyId, id).then((x) => { setD(x); setP({ name: x.name ?? "", phone: x.phone ?? "", email: x.email ?? "", address: x.address ?? "", city: x.city ?? "", account_ref: x.account_ref ?? "", payment_terms: x.payment_terms ?? "", internal_notes: x.internal_notes ?? "" }); }).catch((e) => setErr(e.message));
    P.overview(companyId, { supplier_id: id, status: "all" }, 50, 0).then(setBills).catch((e) => setErr(e.message));
  }, [companyId, id]);
  const save = async (extra: Record<string, unknown> = {}) => { setBusy(true); try { const body = reuse && !id ? { account_ref: p.account_ref, payment_terms: p.payment_terms, internal_notes: p.internal_notes } : { ...p }; if (d?.synced) delete (body as any).name;
    const r = await P.saveSupplier(companyId, id ?? (reuse || null), { ...body, ...extra }); toast({ title: "Fournisseur enregistré" }); onSaved(r); } catch (e: any) { toast({ title: "Enregistrement refusé", description: e.message, variant: "destructive" }); } finally { setBusy(false); } };
  if (err) return <section className="space-y-2"><p role="alert" className="text-sm text-destructive">{err}</p><Button size="sm" variant="outline" onClick={onBack}>Retour</Button></section>;
  if (id && !d) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  const f = (k: string, l: string) => <L l={l}><Input aria-label={l} value={p[k]} disabled={!canWrite || (k === "name" && d?.synced)} onChange={(e) => setP({ ...p, [k]: e.target.value })} /></L>;
  return <section className="space-y-3 rounded-md border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display font-semibold">{id ? `Fournisseur — ${d.name}${d.archived_at ? " (archivé)" : ""}` : "Ajouter ou réutiliser un fournisseur"}</h3><Button size="sm" variant="outline" onClick={onBack}>Retour à la liste</Button></div>
    {!id && <L l="Réutiliser une fiche existante (sans la dupliquer)"><select aria-label="Fiche existante" className={sel} value={reuse} onChange={(e) => setReuse(e.target.value)}><option value="">Non — créer une nouvelle fiche</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>}
    <div className="grid gap-3 sm:grid-cols-2">
      {!(reuse && !id) && <>{f("name", "Nom *")}{f("phone", "Téléphone")}{f("email", "Courriel")}{f("address", "Adresse")}{f("city", "Ville")}</>}
      {f("account_ref", "Référence de compte")}{f("payment_terms", "Modalités de paiement")}
      <L l="Notes internes" className="sm:col-span-2"><Textarea value={p.internal_notes} disabled={!canWrite} onChange={(e) => setP({ ...p, internal_notes: e.target.value })} /></L>
    </div>
    {d?.synced && <p className="text-xs text-muted-foreground">Identité synchronisée depuis Transport JSC : le nom n'est pas modifiable ici.</p>}
    {canWrite && <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => save()}>Enregistrer</Button>
      {id && <Button size="sm" variant="outline" disabled={busy} onClick={() => save({ archived: !d.archived_at })}>{d.archived_at ? "Réactiver" : "Archiver (historique conservé)"}</Button>}</div>}
    {id && <>
      <p className="text-xs text-muted-foreground">Fiche créée {P.fmtStamp(d.created_at)} · modifiée {P.fmtStamp(d.updated_at)} (heure de Toronto).</p>
      {bills && <div className="text-sm"><p><strong>Solde à payer {fmtMoney(bills.totals.rest)}</strong> · confirmé {fmtMoney(bills.totals.confirmed_total)} · réglé {fmtMoney(bills.totals.paid)} · crédits affectés {fmtMoney(bills.totals.credited ?? 0)} · crédit disponible {fmtMoney(bills.totals.credit_available ?? 0)} · dont échéance inconnue {fmtMoney(bills.totals.rest_due_unknown)}{bills.totals.overpaid > 0 ? ` · trop-payé ${fmtMoney(bills.totals.overpaid)}` : ""}</p>
        <ul className="mt-1 divide-y rounded border">{bills.rows.map((r) => <li key={r.id}><button className="w-full p-2 text-left hover:bg-muted/40" onClick={() => onOpenBill(r.id)}>{r.reference ?? "—"} · {P.STATUS_LABEL[r.status]} · {money(r.total)}{r.status === "confirmed" ? ` · reste ${money(r.rest)}` : ""}{r.file_id ? " · pièce jointe" : ""}</button></li>)}{!bills.rows.length && <li className="p-2 text-muted-foreground">Aucune facture.</li>}</ul></div>}
      <div className="text-sm"><p className="font-semibold">Notes de crédit</p><ul className="text-xs">{((d.credits ?? []) as any[]).map((c) => <li key={c.id}><button className="underline-offset-2 hover:underline" onClick={() => onOpenCredit(c.id)}>{c.reference ?? "—"} · {P.STATUS_LABEL[c.status]} · {money(c.total == null ? null : Number(c.total))}{c.status === "confirmed" ? ` · disponible ${fmtMoney(Number(c.available))}` : ""}</button></li>)}{!(d.credits ?? []).length && <li className="text-muted-foreground">Aucune note de crédit.</li>}</ul></div>
      <div className="text-sm"><p className="font-semibold">Règlements</p><ul className="text-xs">{(d.payments as any[]).map((x) => <li key={x.id}>{fmtDate(x.paid_on)} · {fmtMoney(Number(x.amount))} · {st.METHOD_LABEL[x.method] ?? x.method}{x.status !== "validated" ? ` (${st.PAY_STATUS[x.status] ?? x.status})` : ""}{x.reference ? ` · ${x.reference}` : ""}</li>)}{!d.payments.length && <li className="text-muted-foreground">Aucun règlement.</li>}</ul></div>
    </>}
  </section>;
}

/** FIN-12A1 — Note de crédit fournisseur : brouillon (aucun effet) → confirmation → affectation(s) à des factures confirmées du même fournisseur. */
function CreditEditor({ companyId, id, sups, canWrite, canCorrect, onOpen, onOpenBill, onBack }: { companyId: string; id: string | null; sups: { id: string; name: string; archived: boolean }[]; canWrite: boolean; canCorrect: boolean; onOpen: (id: string) => void; onOpenBill: (id: string) => void; onBack: () => void }) {
  const lk = `vq.fin12a1.credit.${companyId}.${id ?? "new"}`;
  const stored = (() => { try { return JSON.parse(localStorage.getItem(lk) || "null"); } catch { return null; } })();
  const [c, setC] = useState<any>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [form, setForm] = useState<P.CreditForm>(stored?.form ?? P.emptyCredit(sups.length === 1 ? sups[0].id : ""));
  const [createKey] = useState<string>(stored?.createKey ?? crypto.randomUUID());
  const [dirty, setDirty] = useState(!!stored);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bills, setBills] = useState<P.BillRow[]>([]);
  const [allocs, setAllocs] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [avail, setAvail] = useState<number | null>(null);
  const [dupReason, setDupReason] = useState("");
  const [target, setTarget] = useState(""); const [amt, setAmt] = useState("");
  const [reason, setReason] = useState("");
  const alive = useRef(true); useEffect(() => () => { alive.current = false; }, []);
  const ck = `vq.fin12a1.creditconfirm.${id}`;
  const load = useCallback(async () => {
    if (!id) return;
    try { const x = await P.credit(id); if (!alive.current) return; if (!x) { setLoadErr("Note de crédit introuvable ou inaccessible"); return; } setC(x);
      if (!stored) setForm({ supplier_id: x.supplier_id, reference: x.reference ?? "", doc_date: x.doc_date ?? "", description: x.description ?? "", subtotal: x.subtotal?.toString() ?? "", gst: x.gst?.toString() ?? "", qst: x.qst?.toString() ?? "", total: x.total?.toString() ?? "", file_id: x.file_id ?? "", file_sha256: x.file_sha256 ?? "", file_name: x.file_id ? "pièce jointe" : "", linked_bill_id: x.linked_bill_id ?? "" });
      const [al, ev, list] = await Promise.all([P.creditAllocs(id), P.creditEvents(id), P.credits(companyId, x.supplier_id)]);
      if (!alive.current) return; setAllocs(al); setEvents(ev); setAvail(list.find((r) => r.id === id)?.available ?? null);
    } catch (e: any) { if (alive.current) setLoadErr(e.message); }
  }, [id, companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!form.supplier_id) { setBills([]); return; } P.overview(companyId, { supplier_id: form.supplier_id, status: "confirmed" }, 200, 0).then((d) => { if (alive.current) setBills(d.rows); }).catch(() => setBills([])); }, [companyId, form.supplier_id, c?.rev]);
  useEffect(() => { if (!dirty) return; try { localStorage.setItem(lk, JSON.stringify({ form, createKey })); } catch { /* indisponible */ } }, [form, dirty, lk, createKey]);
  const up = (k: keyof P.CreditForm, v: string) => { setDirty(true); setForm((f) => ({ ...f, [k]: v })); };
  const editable = canWrite && (!id || c?.status === "draft");
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const save = () => run(async () => { const r = await P.saveCredit(companyId, id, form, c?.rev ?? null, id ? null : createKey); try { localStorage.removeItem(lk); } catch { /* */ } setDirty(false);
    toast({ title: r.replay ? "Brouillon déjà enregistré (repris)" : "Brouillon enregistré", description: "Aucun effet financier tant que la note n'est pas confirmée et affectée." }); if (!id) onOpen(r.id); else await load(); });
  const confirmIt = () => run(async () => { let key: string; try { key = localStorage.getItem(ck) || crypto.randomUUID(); localStorage.setItem(ck, key); } catch { key = crypto.randomUUID(); }
    const r = await P.confirmCredit(id!, c.rev, key, dupReason.trim() || null); try { localStorage.removeItem(ck); } catch { /* */ } toast({ title: r.replay ? "Déjà confirmée (même demande)" : "Note de crédit confirmée" }); await load(); });
  const allocate = () => run(async () => { const ak = `vq.fin12a1.alloc.${id}.${target}.${amt}`; let key: string; try { key = localStorage.getItem(ak) || crypto.randomUUID(); localStorage.setItem(ak, key); } catch { key = crypto.randomUUID(); }
    const v = amt.trim() === "" ? null : Number(amt.replace(",", ".")); if (v != null && (!Number.isFinite(v) || v <= 0)) throw new Error("Montant invalide");
    const r = await P.allocCredit(id!, target, v, key); try { localStorage.removeItem(ak); } catch { /* */ } setTarget(""); setAmt("");
    toast({ title: r.replay ? "Affectation déjà enregistrée (même demande)" : `Crédit affecté : ${fmtMoney(Number(r.amount))}` }); await load(); });
  if (loadErr) return <section className="space-y-2"><p role="alert" className="text-sm text-destructive">{loadErr}</p><Button size="sm" variant="outline" onClick={onBack}>Retour à la liste</Button></section>;
  if (id && !c) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  const open = bills.filter((b) => (b.rest ?? 0) > 0);
  return <section className="space-y-3 rounded-md border p-3" data-testid="credit-editor">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display font-semibold">{id ? `Note de crédit ${c.reference ?? ""} — ${P.STATUS_LABEL[c.status]}` : "Nouvelle note de crédit fournisseur (brouillon)"}</h3><Button size="sm" variant="outline" onClick={onBack}>Retour à la liste</Button></div>
    {id && <p className="text-xs text-muted-foreground">Créée {P.fmtStamp(c.created_at)} · modifiée {P.fmtStamp(c.updated_at)}{c.confirmed_at ? ` · confirmée ${P.fmtStamp(c.confirmed_at)}` : ""}{c.voided_at ? ` · annulée ${P.fmtStamp(c.voided_at)} (${c.void_reason})` : ""} (heure de Toronto)</p>}
    <p className="text-xs text-muted-foreground">Un crédit fournisseur réduit ce que vous devez; ce n'est ni un encaissement ni un remboursement.</p>
    {dirty && editable && <p className="text-xs text-amber-700">Saisie conservée sur cet appareil jusqu'à l'enregistrement.</p>}
    <fieldset disabled={!editable || busy} className="grid gap-3 sm:grid-cols-2">
      <L l="Fournisseur *"><select aria-label="Fournisseur" className={sel} value={form.supplier_id} onChange={(e) => { up("supplier_id", e.target.value); up("linked_bill_id", ""); }}><option value="">— Choisir —</option>{sups.filter((s) => !s.archived || s.id === form.supplier_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></L>
      <L l="Numéro de la note *"><Input aria-label="Numéro de la note" value={form.reference} onChange={(e) => up("reference", e.target.value)} /></L>
      <L l="Date du document *"><Input aria-label="Date de la note" type="date" value={form.doc_date} onChange={(e) => up("doc_date", e.target.value)} /></L>
      <L l="Facture liée (facultatif)"><select aria-label="Facture liée" className={sel} value={form.linked_bill_id} onChange={(e) => up("linked_bill_id", e.target.value)}><option value="">Aucune</option>{bills.map((b) => <option key={b.id} value={b.id}>{b.reference ?? "—"} · {money(b.total)}</option>)}</select></L>
      <L l="Description" className="sm:col-span-2"><Textarea rows={2} value={form.description} onChange={(e) => up("description", e.target.value)} /></L>
      <L l="Avant taxes"><Input aria-label="Crédit avant taxes" inputMode="decimal" value={form.subtotal} onChange={(e) => up("subtotal", e.target.value)} /></L>
      <L l="TPS"><Input aria-label="Crédit TPS" inputMode="decimal" value={form.gst} onChange={(e) => up("gst", e.target.value)} /></L>
      <L l="TVQ"><Input aria-label="Crédit TVQ" inputMode="decimal" value={form.qst} onChange={(e) => up("qst", e.target.value)} /></L>
      <L l="Total du crédit *"><Input aria-label="Total du crédit" inputMode="decimal" value={form.total} onChange={(e) => up("total", e.target.value)} /></L>
    </fieldset>
    {[form.subtotal, form.gst, form.qst].some((x) => x.trim() === "") && <p className="text-xs text-amber-700">Ventilation fiscale à compléter : aucune taxe n'est supposée nulle.</p>}
    <div className="space-y-1 text-sm"><span className="text-xs font-semibold text-muted-foreground">Justificatif (stockage privé)</span>
      {form.file_id ? <p>{form.file_name || "pièce jointe"} <Button size="sm" variant="link" onClick={() => P.openFile(form.file_id).then((u) => window.open(u, "_blank", "noopener")).catch((e) => toast({ title: e.message, variant: "destructive" }))}>Ouvrir</Button></p>
        : editable && <Input aria-label="Joindre un justificatif de crédit" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" className="max-w-xs" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setBusy(true); try { const r = await P.uploadProof(companyId, f); setDirty(true); setForm((x) => ({ ...x, file_id: r.id, file_sha256: r.sha, file_name: r.name })); } catch (er: any) { toast({ title: "Pièce non jointe", description: er.message, variant: "destructive" }); } finally { setBusy(false); } }} />}
    </div>
    {err && <p role="alert" className="text-sm text-destructive">Opération refusée : {err}{editable ? " Votre saisie est conservée." : ""}</p>}
    <div className="flex flex-wrap items-end gap-2">
      {editable && <Button size="sm" onClick={save} disabled={busy}>Enregistrer le brouillon</Button>}
      {editable && id && !dirty && <><L l="Motif d'exception si doublon (facultatif)"><Input aria-label="Motif doublon crédit" value={dupReason} onChange={(e) => setDupReason(e.target.value)} className="h-9" /></L><Button size="sm" variant="outline" disabled={busy} onClick={confirmIt}>Confirmer la note de crédit</Button></>}
    </div>
    {c?.status === "confirmed" && <div className="space-y-2 rounded-md bg-muted/40 p-2 text-sm">
      <p>Montant {money(Number(c.total))} · affecté {fmtMoney(Number(c.total) - (avail ?? Number(c.total)))} · <strong data-testid="credit-avail">disponible {money(avail)}</strong></p>
      {canWrite && (avail ?? 0) > 0 && <div className="flex flex-wrap items-end gap-2">
        <L l="Affecter à une facture confirmée"><select aria-label="Facture à créditer" className={sel} value={target} onChange={(e) => setTarget(e.target.value)}><option value="">— Choisir —</option>{open.map((b) => <option key={b.id} value={b.id}>{b.reference ?? "—"} · reste {money(b.rest)}</option>)}</select></L>
        <L l="Montant (vide = maximum possible)"><Input aria-label="Montant à affecter" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} className="h-10 w-36" /></L>
        <Button size="sm" disabled={!target || busy} onClick={allocate}>Affecter</Button>
        {target && <span className="text-xs text-muted-foreground">Maximum : {money(Math.min(avail ?? 0, open.find((b) => b.id === target)?.rest ?? 0))}</span>}
      </div>}
      {!open.length && (avail ?? 0) > 0 && <p className="text-xs text-muted-foreground">Aucune facture confirmée avec un reste à payer pour ce fournisseur : le crédit reste disponible.</p>}
      {allocs.length > 0 && <ul className="text-xs">{allocs.map((a) => <li key={a.id}>{P.fmtStamp(a.created_at)} · <button className="underline" onClick={() => onOpenBill(a.bill_id)}>{a.bill?.reference ?? "facture"}</button> · {fmtMoney(Number(a.amount))}{a.reversed_at ? ` · annulée ${P.fmtStamp(a.reversed_at)} (${a.reverse_reason})` : ""}
        {!a.reversed_at && canCorrect && <Button size="sm" variant="link" disabled={!reason.trim() || busy} onClick={() => run(async () => { await P.voidAlloc(a.id, reason); setReason(""); toast({ title: "Affectation annulée", description: "Soldes rétablis; historique conservé." }); await load(); })}>Annuler</Button>}</li>)}</ul>}
      {canCorrect && <div className="flex flex-wrap items-end gap-2"><L l="Motif (annulation d'affectation ou de la note)"><Input aria-label="Motif crédit" value={reason} onChange={(e) => setReason(e.target.value)} className="h-9" /></L>
        <Button size="sm" variant="outline" disabled={!reason.trim() || busy || allocs.some((a) => !a.reversed_at)} onClick={() => run(async () => { await P.voidCredit(c.id, c.rev, reason); setReason(""); toast({ title: "Note de crédit annulée" }); await load(); })}>Annuler la note</Button></div>}
    </div>}
    {events.length > 0 && <details className="text-xs"><summary>Historique</summary><ul>{events.map((e, i) => <li key={i}>{P.fmtStamp(e.created_at)} — {P.EVENT_LABEL[e.action] ?? e.action}{e.detail?.amount != null ? ` · ${fmtMoney(Number(e.detail.amount))}` : ""}{e.reason ? ` · ${e.reason}` : ""}</li>)}</ul></details>}
  </section>;
}
