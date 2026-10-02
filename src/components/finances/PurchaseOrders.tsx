// FIN-12B — Commandes fournisseurs : brouillon → confirmation (engagement prévu) → réceptions → rapprochement des factures → clôture.
// Une réception ne crée ni dette ni règlement; une facture rapprochée remplace seulement la portion correspondante de l'engagement.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import * as O from "@/lib/finances/orders";
import * as P from "@/lib/finances/purchases";
import * as api from "@/lib/finances/api";
import { fmtDate, fmtMoney } from "@/lib/finances/period";

const sel = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";
const L = ({ l, children, className = "" }: { l: string; children: React.ReactNode; className?: string }) => <label className={`block text-sm ${className}`}><span className="mb-1 block text-xs font-semibold text-muted-foreground">{l}</span>{children}</label>;
const money = (n: number | null | undefined) => (n == null ? "inconnu" : fmtMoney(n));
const qty = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("fr-CA", { maximumFractionDigits: 3 }));
type Sup = { id: string; name: string; archived: boolean };

export default function PurchaseOrders({ companyId, sups, canWrite, canCorrect, onOpenBill }: { companyId: string; sups: Sup[] | null; canWrite: boolean; canCorrect: boolean; onOpenBill: (id: string) => void }) {
  const [open, setOpen] = useState<string | null | undefined>(undefined);
  const [rev, setRev] = useState(0);
  if (open !== undefined) return <OrderEditor key={open ?? "new"} companyId={companyId} id={open} sups={sups ?? []} canWrite={canWrite} canCorrect={canCorrect} onOpen={setOpen} onOpenBill={onOpenBill} onBack={() => { setOpen(undefined); setRev((r) => r + 1); }} />;
  return <OrderList companyId={companyId} sups={sups} rev={rev} canWrite={canWrite} onOpen={setOpen} />;
}

function OrderList({ companyId, sups, rev, canWrite, onOpen }: { companyId: string; sups: Sup[] | null; rev: number; canWrite: boolean; onOpen: (id: string | null) => void }) {
  const [f, setF] = useState({ supplier_id: "", status: "active", q: "" });
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Awaited<ReturnType<typeof O.overview>> | null>(null);
  const [bills, setBills] = useState<Awaited<ReturnType<typeof P.overview>>["totals"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current; setError(null); setData(null); setBills(null);
    Promise.all([O.overview(companyId, f, 25, page * 25), P.overview(companyId, { supplier_id: f.supplier_id }, 1, 0)])
      .then(([o, b]) => { if (my === seq.current) { setData(o); setBills(b.totals); } })
      .catch((e) => { if (my === seq.current) setError(e.message); });
  }, [companyId, f, page, rev]);
  const t = data?.totals;
  return <section className="space-y-3" data-testid="fin12b-orders">
    {canWrite && <Button size="sm" onClick={() => onOpen(null)} disabled={!sups?.length}>Nouvelle commande fournisseur</Button>}
    <div className="grid gap-2 sm:grid-cols-3">
      <select aria-label="Fournisseur des commandes" className={sel} value={f.supplier_id} onChange={(e) => { setPage(0); setF({ ...f, supplier_id: e.target.value }); }}><option value="">Tous les fournisseurs</option>{sups?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select aria-label="Statut des commandes" className={sel} value={f.status} onChange={(e) => { setPage(0); setF({ ...f, status: e.target.value }); }}><option value="active">Brouillons, ouvertes et clôturées</option><option value="draft">Brouillons</option><option value="confirmed">Ouvertes</option><option value="closed">Clôturées</option><option value="void">Annulées</option><option value="all">Toutes</option></select>
      <Input aria-label="Recherche commande" placeholder="Fournisseur ou numéro" value={f.q} onChange={(e) => { setPage(0); setF({ ...f, q: e.target.value }); }} />
    </div>
    {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">Impossible de charger les commandes : {error}. Aucun total n'est affiché.</p>
      : !data || !bills ? <p className="text-sm text-muted-foreground">Chargement…</p>
      : <>
        <div className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-3" aria-label="Totaux des commandes">
          <div><div className="text-xs text-muted-foreground">Engagements non facturés (prévus)</div><strong data-testid="engagement-open">{fmtMoney(t!.engagement_open)}</strong>{t!.engagement_unknown_count > 0 && <div className="text-xs text-amber-700">+ {t!.engagement_unknown_count} commande(s) au montant inconnu</div>}{t!.engagement_due_unknown > 0 && <div className="text-xs text-muted-foreground">dont date inconnue {fmtMoney(t!.engagement_due_unknown)}</div>}</div>
          <div><div className="text-xs text-muted-foreground">Factures à payer (dettes)</div><strong data-testid="bills-rest">{fmtMoney(bills.rest)}</strong></div>
          <div><div className="text-xs text-muted-foreground">Sorties restantes prévues</div><strong data-testid="outflows">{fmtMoney(t!.engagement_open + bills.rest)}</strong>{t!.engagement_unknown_count > 0 && <div className="text-xs text-amber-700">incomplet : montants inconnus exclus</div>}</div>
          <p className="text-[11px] text-muted-foreground sm:col-span-3">Totaux sur les {t!.count} commandes filtrées (toutes pages). Brouillons ({t!.drafts}) sans effet financier. Un engagement n'est pas une dette facturée.</p>
        </div>
        <ul className="divide-y rounded-md border">{data.rows.map((r) => <li key={r.id}><button className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted/40" onClick={() => onOpen(r.id)}>
          <span><strong>{r.number}</strong> · {r.supplier} <span className="text-xs text-muted-foreground">({O.ORDER_STATUS[r.status]})</span><br />
            <span className="text-xs text-muted-foreground">Commande {r.order_date ? fmtDate(r.order_date) : "—"} · réception : {O.receptionLabel(r)} · facturation : {O.billingLabel(r)}</span></span>
          <span className="text-right text-xs">Total {money(r.total)}{r.status === "confirmed" && <><br />engagement restant {r.engagement_unknown ? "inconnu" : money(r.engagement)}</>}</span>
        </button></li>)}{!data.rows.length && <li className="p-3 text-sm text-muted-foreground">Aucune commande.</li>}</ul>
        {data.total > 25 && <div className="flex items-center gap-2 text-sm"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</Button>Page {page + 1} / {Math.ceil(data.total / 25)}<Button size="sm" variant="outline" disabled={(page + 1) * 25 >= data.total} onClick={() => setPage(page + 1)}>Suivant</Button></div>}
      </>}
  </section>;
}

function LinesEditor({ lines, onChange, disabled }: { lines: O.LineForm[]; onChange: (l: O.LineForm[]) => void; disabled?: boolean }) {
  const set = (i: number, k: keyof O.LineForm, v: string) => onChange(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return <div className="space-y-2">
    {lines.map((l, i) => <div key={i} className="grid gap-2 rounded border p-2 sm:grid-cols-8" data-testid="po-line">
      <L l={`Ligne ${l.no ?? "nouvelle"} — description`} className="sm:col-span-3"><Input aria-label="Description de la ligne" value={l.description} disabled={disabled} onChange={(e) => set(i, "description", e.target.value)} /></L>
      <L l="Quantité"><Input aria-label="Quantité" inputMode="decimal" value={l.qty} disabled={disabled} onChange={(e) => set(i, "qty", e.target.value)} /></L>
      <L l="Unité"><select aria-label="Unité" className={sel} value={l.unit} disabled={disabled} onChange={(e) => set(i, "unit", e.target.value)}>{O.UNITS.map((u) => <option key={u.v} value={u.v}>{u.l}</option>)}</select></L>
      <L l="Prix unitaire"><Input aria-label="Prix unitaire" inputMode="decimal" value={l.unit_price} disabled={disabled} onChange={(e) => set(i, "unit_price", e.target.value)} /></L>
      <L l="TPS"><Input aria-label="TPS de la ligne" inputMode="decimal" value={l.gst} disabled={disabled} onChange={(e) => set(i, "gst", e.target.value)} /></L>
      <L l="TVQ"><Input aria-label="TVQ de la ligne" inputMode="decimal" value={l.qst} disabled={disabled} onChange={(e) => set(i, "qst", e.target.value)} /></L>
      <L l="Montant HT (si différent)" className="sm:col-span-2"><Input aria-label="Montant de la ligne" inputMode="decimal" placeholder="quantité × prix" value={l.amount} disabled={disabled} onChange={(e) => set(i, "amount", e.target.value)} /></L>
      {!disabled && l.no == null && lines.length > 1 && <Button size="sm" variant="link" className="self-end" onClick={() => onChange(lines.filter((_, j) => j !== i))}>Retirer</Button>}
    </div>)}
    {!disabled && <Button size="sm" variant="outline" onClick={() => onChange([...lines, O.emptyLine()])}>Ajouter une ligne</Button>}
    <p className="text-[11px] text-muted-foreground">Aucune conversion entre unités. Taxes vides = inconnues (jamais 0) : l'engagement reste alors « inconnu ».</p>
  </div>;
}

function OrderEditor({ companyId, id, sups, canWrite, canCorrect, onOpen, onOpenBill, onBack }: { companyId: string; id: string | null; sups: Sup[]; canWrite: boolean; canCorrect: boolean; onOpen: (id: string) => void; onOpenBill: (id: string) => void; onBack: () => void }) {
  const lk = `vq.fin12b.order.${companyId}.${id ?? "new"}`;
  const stored = (() => { try { return JSON.parse(localStorage.getItem(lk) || "null"); } catch { return null; } })();
  const [o, setO] = useState<any>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [form, setForm] = useState<O.OrderForm>(stored?.form ?? O.emptyOrder(sups.length === 1 ? sups[0].id : ""));
  const [createKey] = useState<string>(stored?.createKey ?? crypto.randomUUID());
  const [dirty, setDirty] = useState(!!stored);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lk2, setLk2] = useState<Awaited<ReturnType<typeof api.lookups>> | null>(null);
  const [cands, setCands] = useState<Awaited<ReturnType<typeof P.candidates>>>([]);
  const alive = useRef(true); useEffect(() => () => { alive.current = false; }, []);
  const load = useCallback(async () => {
    if (!id) return;
    try { const x = await O.detail(id); if (!alive.current) return; setO(x);
      if (!stored) setForm({ supplier_id: x.supplier_id, number: x.number ?? "", supplier_ref: x.supplier_ref ?? "", order_date: x.order_date ?? "", expected_date: x.expected_date ?? "", site: x.site ?? "", project_id: x.project_id ?? "",
        notes: x.notes ?? "", estimate_occ_id: x.estimate_occ_id ?? "", file_id: x.file_id ?? "", file_name: x.file_id ? "pièce jointe" : "", lines: (x.lines as any[]).map(O.toLineForm) });
    } catch (e: any) { if (alive.current) setLoadErr(e.message); }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); api.lookups(companyId).then(setLk2).catch(() => {}); }, [load, companyId]);
  useEffect(() => { if (!form.supplier_id) return; Promise.all([P.candidates(companyId, form.supplier_id), O.engagedOccurrences(companyId)]).then(([c, used]) => { if (alive.current) setCands(c.filter((x) => !used.has(x.id))); }).catch(() => {}); }, [companyId, form.supplier_id]);
  useEffect(() => { if (!dirty) return; try { localStorage.setItem(lk, JSON.stringify({ form, createKey })); } catch { /* indisponible */ } }, [form, dirty, lk, createKey]);
  const up = (patch: Partial<O.OrderForm>) => { setDirty(true); setForm((f) => ({ ...f, ...patch })); };
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const editable = canWrite && (!id || o?.status === "draft");
  const save = () => run(async () => { const r = await O.save(companyId, id, form, o?.rev ?? null, id ? null : createKey); try { localStorage.removeItem(lk); } catch { /* */ } setDirty(false);
    toast({ title: r.replay ? "Brouillon déjà enregistré (repris)" : `Brouillon ${r.number} enregistré`, description: "Aucun effet financier tant que la commande n'est pas confirmée." }); if (!id) onOpen(r.id); else await load(); });
  const confirmIt = () => run(async () => { const k = `vq.fin12b.confirm.${id}`; const r = await O.confirm(id!, o.rev, O.stickyKey(k)); O.dropKey(k);
    toast({ title: r.replay ? "Déjà confirmée (même demande)" : "Commande confirmée", description: "Engagement prévu inscrit une seule fois; aucune dette n'est créée." }); await load(); });

  if (loadErr) return <section className="space-y-2"><p role="alert" className="text-sm text-destructive">{loadErr}</p><Button size="sm" variant="outline" onClick={onBack}>Retour aux commandes</Button></section>;
  if (id && !o) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  return <section className="space-y-3 rounded-md border p-3" data-testid="po-editor">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display font-semibold">{id ? `Commande ${o.number} — ${O.ORDER_STATUS[o.status]}` : "Nouvelle commande fournisseur (brouillon)"}</h3><Button size="sm" variant="outline" onClick={onBack}>Retour aux commandes</Button></div>
    {id && <p className="text-xs text-muted-foreground">Créée {P.fmtStamp(o.created_at)} · modifiée {P.fmtStamp(o.updated_at)}{o.confirmed_at ? ` · confirmée ${P.fmtStamp(o.confirmed_at)}` : ""}{o.closed_at ? ` · clôturée ${P.fmtStamp(o.closed_at)}` : ""}{o.voided_at ? ` · annulée ${P.fmtStamp(o.voided_at)} (${o.void_reason})` : ""} (heure de Toronto)</p>}
    {dirty && editable && <p className="text-xs text-amber-700">Saisie conservée sur cet appareil jusqu'à l'enregistrement.</p>}
    {editable ? <>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <L l="Fournisseur *"><select aria-label="Fournisseur de la commande" className={sel} value={form.supplier_id} onChange={(e) => up({ supplier_id: e.target.value, estimate_occ_id: "" })}><option value="">— Choisir —</option>{sups.filter((s) => !s.archived || s.id === form.supplier_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></L>
        <L l="Numéro interne (vide = attribué automatiquement)"><Input aria-label="Numéro interne" value={form.number} onChange={(e) => up({ number: e.target.value })} /></L>
        <L l="Référence fournisseur (facultatif)"><Input aria-label="Référence fournisseur" value={form.supplier_ref} onChange={(e) => up({ supplier_ref: e.target.value })} /></L>
        <L l="Date de commande *"><Input aria-label="Date de commande" type="date" value={form.order_date} onChange={(e) => up({ order_date: e.target.value })} /></L>
        <L l="Livraison prévue (vide = inconnue)"><Input aria-label="Livraison prévue" type="date" value={form.expected_date} onChange={(e) => up({ expected_date: e.target.value })} /></L>
        <L l="Chantier (facultatif)"><select className={sel} value={form.project_id} onChange={(e) => up({ project_id: e.target.value })}><option value="">Aucun</option>{lk2?.projects.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
        <L l="Adresse de livraison / chantier" className="sm:col-span-2"><Input aria-label="Adresse de livraison" value={form.site} onChange={(e) => up({ site: e.target.value })} /></L>
        <L l="Dépense prévue existante à réutiliser (facultatif)" className="sm:col-span-2"><select aria-label="Dépense prévue liée" className={sel} value={form.estimate_occ_id} onChange={(e) => up({ estimate_occ_id: e.target.value })}><option value="">Aucune — créer l'engagement à la confirmation</option>{cands.map((c) => <option key={c.id} value={c.id}>{c.label} · {fmtDate(c.due_date)} · {money(c.amount)}</option>)}{form.estimate_occ_id && !cands.some((c) => c.id === form.estimate_occ_id) && <option value={form.estimate_occ_id}>Dépense prévue choisie</option>}</select></L>
        <L l="Notes" className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={(e) => up({ notes: e.target.value })} /></L>
      </fieldset>
      <LinesEditor lines={form.lines} onChange={(lines) => up({ lines })} disabled={busy} />
      <div className="text-sm"><span className="text-xs font-semibold text-muted-foreground">Justificatif (stockage privé)</span>
        {form.file_id ? <p>{form.file_name} <Button size="sm" variant="link" onClick={() => up({ file_id: "", file_name: "" })}>Retirer</Button></p>
          : <Input aria-label="Joindre un justificatif de commande" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" className="max-w-xs" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setBusy(true); try { const r = await P.uploadProof(companyId, f); up({ file_id: r.id, file_name: r.name }); } catch (er: any) { toast({ title: "Pièce non jointe", description: er.message, variant: "destructive" }); } finally { setBusy(false); } }} />}
      </div>
      {err && <p role="alert" className="text-sm text-destructive">Opération refusée : {err} Votre saisie est conservée.</p>}
      <div className="flex flex-wrap gap-2"><Button size="sm" onClick={save} disabled={busy}>Enregistrer le brouillon</Button>
        {id && !dirty && <Button size="sm" variant="outline" disabled={busy} onClick={confirmIt}>Confirmer la commande</Button>}</div>
    </> : <OrderDetail companyId={companyId} o={o} canWrite={canWrite} canCorrect={canCorrect} reload={load} onOpenBill={onOpenBill} />}
    {err && !editable && <p role="alert" className="text-sm text-destructive">Opération refusée : {err}</p>}
  </section>;
}

function OrderDetail({ companyId, o, canWrite, canCorrect, reload, onOpenBill }: { companyId: string; o: any; canWrite: boolean; canCorrect: boolean; reload: () => Promise<void>; onOpenBill: (id: string) => void }) {
  const stats: O.Stat[] = o.stats;
  const lineOf = (no: number) => (o.lines as any[]).find((l) => l.no === no);
  const isOpen = o.status === "confirmed";
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMsg(null); try { await fn(); await reload(); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } };
  const [reason, setReason] = useState("");
  const eng = o.engagement;
  const activeMatches = (o.matches as any[]).filter((m) => !m.reversed_at);
  const billIds = Array.from(new Set(activeMatches.map((m) => m.bill_id as string)));
  return <div className="space-y-3 text-sm">
    <p className="text-xs text-muted-foreground">{o.supplier}{o.supplier_ref ? ` · réf. fournisseur ${o.supplier_ref}` : ""} · commande {o.order_date ? fmtDate(o.order_date) : "—"} · livraison prévue {o.expected_date ? fmtDate(o.expected_date) : "inconnue"}{o.site ? ` · ${o.site}` : ""}</p>
    {eng && <dl className="grid grid-cols-2 gap-1 rounded-md bg-muted/40 p-2 sm:grid-cols-4" aria-label="Engagement">
      <div><dt className="text-xs text-muted-foreground">Engagement initial</dt><dd>{money(eng.base)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Remplacé par des factures</dt><dd>{fmtMoney(stats.reduce((s, x) => s + x.portion, 0))}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Engagement restant (prévu)</dt><dd data-testid="po-engagement"><strong>{eng.status !== "active" ? "annulé" : eng.quality === "unknown" ? "inconnu" : money(eng.remaining)}</strong></dd></div>
      <div><dt className="text-xs text-muted-foreground">Date</dt><dd>{eng.due_unknown ? "inconnue" : eng.due_date ? fmtDate(eng.due_date) : "—"}</dd></div>
      {!o.engagement_created && <p className="col-span-full text-xs text-muted-foreground">Réutilise la dépense prévue existante (estimation d'origine {money(o.estimate_amount == null ? null : Number(o.estimate_amount))}).</p>}
    </dl>}
    <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-xs" aria-label="Lignes de la commande"><thead><tr className="text-left text-muted-foreground"><th className="p-1">Ligne</th><th>Commandé</th><th>Accepté</th><th>Refusé</th><th>Restant</th><th>Facturé</th><th>Montant ligne</th><th>Portion remplacée</th><th>Montant facturé</th><th>État</th></tr></thead>
      <tbody>{stats.map((s) => { const l = lineOf(s.line_no); const u = O.unitLabel(l?.unit); const stt = O.lineState(s); return <tr key={s.line_no} className="border-t" data-testid={`po-stat-${s.line_no}`}>
        <td className="p-1">{s.line_no}. {l?.description}</td><td>{qty(s.qty)} {u}</td><td>{qty(s.accepted)}</td><td>{qty(s.refused)}</td><td data-testid={`po-remaining-${s.line_no}`}>{qty(s.qty == null ? null : Math.max(s.qty - s.accepted, 0))}</td>
        <td>{qty(s.billed)}</td><td>{money(s.line_total)}</td><td>{fmtMoney(s.portion)}</td><td>{s.billed ? money(s.bill_amount) : "—"}</td>
        <td className={stt.tone === "ok" ? "text-primary" : stt.tone === "warn" ? "text-amber-700" : "text-muted-foreground"}>{stt.label}</td></tr>; })}</tbody></table></div>
    {msg && <p role="alert" className="text-destructive">Opération refusée : {msg}</p>}
    {isOpen && canWrite && <ReceiptForm companyId={companyId} o={o} busy={busy} run={run} canCorrect={canCorrect} />}
    {(o.receipts as any[]).length > 0 && <div><p className="text-xs font-semibold text-muted-foreground">Réceptions</p><ul className="divide-y rounded border text-xs">{(o.receipts as any[]).map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
      <span>Livrée le {fmtDate(r.received_on)} · saisie {P.fmtStamp(r.created_at)}{r.delivery_ref ? ` · bon ${r.delivery_ref}` : ""} · {(r.lines as any[]).map((x) => `L${x.no} : ${qty(Number(x.accepted))} acceptée(s)${Number(x.refused) ? `, ${qty(Number(x.refused))} refusée(s)` : ""}`).join(" ; ")}{r.over_reason ? ` · excédent : ${r.over_reason}` : ""}{r.notes ? ` · ${r.notes}` : ""}{r.status === "void" ? ` · ANNULÉE ${P.fmtStamp(r.voided_at)} (${r.void_reason})` : ""}</span>
      {r.status === "active" && canCorrect && o.status !== "void" && <Button size="sm" variant="link" disabled={busy || !reason.trim()} onClick={() => run(async () => { await O.voidReceipt(r.id, reason); setReason(""); toast({ title: "Réception annulée", description: "Quantités recalculées; historique conservé." }); })}>Annuler (motif ci-dessous)</Button>}
    </li>)}</ul></div>}
    {isOpen && canWrite && <MatchForm companyId={companyId} o={o} busy={busy} run={run} />}
    {billIds.length > 0 && <div><p className="text-xs font-semibold text-muted-foreground">Factures rapprochées</p><ul className="divide-y rounded border text-xs">{billIds.map((bid) => { const ms = activeMatches.filter((m) => m.bill_id === bid); return <li key={bid} className="flex flex-wrap items-center justify-between gap-2 p-2">
      <span><Button size="sm" variant="link" className="h-auto p-0" onClick={() => onOpenBill(bid)}>{ms[0].reference ?? "facture"}</Button> ({P.STATUS_LABEL[ms[0].bill_status]}, total {money(Number(ms[0].bill_total))}) · {ms.map((m) => `L${m.line_no} : ${qty(Number(m.qty))} · portion ${fmtMoney(Number(m.portion))}${m.bill_amount == null ? " · montant à vérifier" : ` · facturé ${fmtMoney(Number(m.bill_amount))}`}${m.before_receipt ? " · avant réception" : ""}${m.portion_basis === "manuelle" ? " · portion saisie (rapprochement incomplet)" : ""}${m.exception_reason ? ` · exception : ${m.exception_reason}` : ""}`).join(" ; ")}</span>
      {canCorrect && isOpen && <Button size="sm" variant="link" disabled={busy || !reason.trim()} onClick={() => run(async () => { await O.voidMatch(o.id, bid, reason); setReason(""); toast({ title: "Rapprochement annulé", description: "Engagement rétabli; facture et règlements intacts." }); })}>Annuler le rapprochement (motif)</Button>}
    </li>; })}</ul></div>}
    {(o.matches as any[]).some((m) => m.before_receipt && !m.reversed_at) && <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs">Avertissement : une partie facturée n'est pas encore reçue (facture avant réception).</p>}
    {canWrite && o.status !== "void" && <div className="space-y-2 rounded border p-2">
      <L l="Motif (requis pour annuler, rouvrir ou modifier)"><Input aria-label="Motif commande" value={reason} onChange={(e) => setReason(e.target.value)} /></L>
      <div className="flex flex-wrap gap-2">
        {isOpen && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { await O.close(o.id, o.rev, reason); toast({ title: "Commande clôturée", description: "L'engagement restant non facturé est retiré des prévisions." }); })}>Clôturer</Button>}
        {o.status === "closed" && <Button size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => run(async () => { await O.close(o.id, o.rev, reason, true); toast({ title: "Commande rouverte" }); })}>Rouvrir</Button>}
        {canCorrect && <Button size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => run(async () => { await O.voidOrder(o.id, o.rev, reason); toast({ title: "Commande annulée", description: "Historique conservé." }); })}>Annuler la commande</Button>}
      </div>
      {isOpen && <AmendForm o={o} reason={reason} busy={busy} run={run} />}
    </div>}
    <details className="text-xs"><summary>Historique ({(o.events as any[]).length})</summary><ul>{(o.events as any[]).map((e, i) => <li key={i}>{P.fmtStamp(e.created_at)} — {O.ORDER_EVENT[e.action] ?? e.action}{e.reason ? ` · ${e.reason}` : ""}</li>)}</ul></details>
    {o.confirmed_lines && <details className="text-xs"><summary>Instantané des lignes à la confirmation</summary><ul>{(o.confirmed_lines as any[]).map((l) => <li key={l.no}>{l.no}. {l.description} · {qty(Number(l.qty))} {O.unitLabel(l.unit)} · {money(l.line_total == null ? null : Number(l.line_total))}</li>)}</ul></details>}
  </div>;
}

function ReceiptForm({ companyId, o, busy, run, canCorrect }: { companyId: string; o: any; busy: boolean; run: (fn: () => Promise<void>) => Promise<void>; canCorrect: boolean }) {
  const dk = `vq.fin12b.receipt.${companyId}.${o.id}`;
  const init = (() => { try { return JSON.parse(localStorage.getItem(dk) || "null"); } catch { return null; } })();
  const [f, setF] = useState<{ received_on: string; delivery_ref: string; notes: string; file_id: string; file_name: string; q: Record<number, { a: string; r: string }>; confirm_over: boolean; over_reason: string }>(init ?? { received_on: "", delivery_ref: "", notes: "", file_id: "", file_name: "", q: {}, confirm_over: false, over_reason: "" });
  useEffect(() => { try { localStorage.setItem(dk, JSON.stringify(f)); } catch { /* */ } }, [f, dk]);
  const over = (o.stats as O.Stat[]).some((s) => s.qty != null && s.accepted + Number((f.q[s.line_no]?.a || "0").replace(",", ".")) > s.qty);
  const submit = () => run(async () => {
    const kk = `vq.fin12b.rkey.${o.id}`;
    const r = await O.receive(o.id, { received_on: f.received_on || null, delivery_ref: f.delivery_ref, notes: f.notes, file_id: f.file_id || null, confirm_over: f.confirm_over, over_reason: f.over_reason,
      lines: Object.entries(f.q).map(([no, v]) => ({ no: Number(no), accepted: v.a.trim() === "" ? 0 : Number(v.a.replace(",", ".")), refused: v.r.trim() === "" ? 0 : Number(v.r.replace(",", ".")) })) }, O.stickyKey(kk));
    O.dropKey(kk); try { localStorage.removeItem(dk); } catch { /* */ }
    setF({ received_on: "", delivery_ref: "", notes: "", file_id: "", file_name: "", q: {}, confirm_over: false, over_reason: "" });
    toast({ title: r.replay ? "Réception déjà enregistrée (même demande)" : "Réception enregistrée", description: "Aucune dette, aucun règlement, aucun inventaire modifié." });
  });
  return <details className="rounded border p-2" open={!!init}><summary className="cursor-pointer font-semibold">Enregistrer une réception</summary>
    <div className="mt-2 grid gap-2 sm:grid-cols-3">
      <L l="Date effective de livraison *"><Input aria-label="Date de livraison" type="date" value={f.received_on} onChange={(e) => setF({ ...f, received_on: e.target.value })} /></L>
      <L l="N° de bon (facultatif)"><Input aria-label="Numéro de bon" value={f.delivery_ref} onChange={(e) => setF({ ...f, delivery_ref: e.target.value })} /></L>
      <L l="Observations"><Input aria-label="Observations" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></L>
      {(o.stats as O.Stat[]).map((s) => { const l = (o.lines as any[]).find((x) => x.no === s.line_no); return <div key={s.line_no} className="grid grid-cols-2 gap-2 sm:col-span-3 sm:grid-cols-4">
        <span className="col-span-2 self-center text-xs">L{s.line_no} {l?.description} — restant {qty(s.qty == null ? null : Math.max(s.qty - s.accepted, 0))} {O.unitLabel(l?.unit)}</span>
        <Input aria-label={`Acceptée ligne ${s.line_no}`} placeholder="Acceptée" inputMode="decimal" value={f.q[s.line_no]?.a ?? ""} onChange={(e) => setF({ ...f, q: { ...f.q, [s.line_no]: { a: e.target.value, r: f.q[s.line_no]?.r ?? "" } } })} />
        <Input aria-label={`Refusée ligne ${s.line_no}`} placeholder="Refusée" inputMode="decimal" value={f.q[s.line_no]?.r ?? ""} onChange={(e) => setF({ ...f, q: { ...f.q, [s.line_no]: { r: e.target.value, a: f.q[s.line_no]?.a ?? "" } } })} />
      </div>; })}
      <div className="sm:col-span-3">{f.file_id ? <p className="text-xs">Justificatif : {f.file_name}</p> : <Input aria-label="Justificatif de réception" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" className="max-w-xs" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const r = await P.uploadProof(companyId, file); setF((x) => ({ ...x, file_id: r.id, file_name: r.name })); } catch (er: any) { toast({ title: "Pièce non jointe", description: er.message, variant: "destructive" }); } }} />}</div>
      {over && <div className="space-y-1 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs sm:col-span-3"><p>Quantité acceptée supérieure au restant commandé.{!canCorrect && " Votre rôle ne permet pas d'enregistrer un excédent."}</p>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.confirm_over} onChange={(e) => setF({ ...f, confirm_over: e.target.checked })} /> Je confirme la réception excédentaire</label>
        <Input aria-label="Motif de l'excédent" placeholder="Motif (requis)" value={f.over_reason} onChange={(e) => setF({ ...f, over_reason: e.target.value })} /></div>}
    </div>
    <Button size="sm" className="mt-2" disabled={busy} onClick={submit}>Enregistrer la réception</Button>
  </details>;
}

function MatchForm({ companyId, o, busy, run }: { companyId: string; o: any; busy: boolean; run: (fn: () => Promise<void>) => Promise<void> }) {
  const [bills, setBills] = useState<P.BillRow[] | null>(null);
  const [bill, setBill] = useState("");
  const [q, setQ] = useState<Record<number, { qty: string; amount: string; portion: string }>>({});
  const [exc, setExc] = useState("");
  useEffect(() => { P.overview(companyId, { supplier_id: o.supplier_id }, 200, 0).then((d) => setBills(d.rows.filter((b) => b.occurrence_id !== o.occurrence_id))).catch(() => setBills([])); }, [companyId, o.supplier_id, o.occurrence_id, o.rev]);
  const chosen = bills?.find((b) => b.id === bill);
  const stats = o.stats as O.Stat[];
  const before = stats.some((s) => s.billed + Number((q[s.line_no]?.qty || "0").replace(",", ".")) > s.accepted);
  const submit = () => run(async () => {
    if (!chosen) throw new Error("Choisissez une facture");
    const lines = Object.entries(q).filter(([, v]) => v.qty.trim() !== "").map(([no, v]) => ({ no: Number(no), qty: Number(v.qty.replace(",", ".")), bill_amount: v.amount.trim() === "" ? null : Number(v.amount.replace(",", ".")), portion: v.portion.trim() === "" ? null : Number(v.portion.replace(",", ".")) }));
    const kk = `vq.fin12b.mkey.${o.id}.${bill}`; const bk = `vq.fin12b.bkey.${bill}`;
    let billRev: number | null = null;
    if (chosen.status === "draft") { const b = await P.bill(bill); billRev = b?.rev ?? null; }
    const r = await O.match(o.id, bill, lines, O.stickyKey(kk), billRev, chosen.status === "draft" ? O.stickyKey(bk) : null, exc.trim() || null);
    O.dropKey(kk); O.dropKey(bk); setQ({}); setBill(""); setExc("");
    toast({ title: r.replay ? "Rapprochement déjà enregistré (même demande)" : "Facture rapprochée", description: "Seule la portion correspondante de l'engagement est remplacée. Aucun crédit ni règlement modifié." });
  });
  return <details className="rounded border p-2"><summary className="cursor-pointer font-semibold">Rapprocher une facture</summary>
    <div className="mt-2 space-y-2">
      <L l="Facture du même fournisseur (une facture en brouillon sera confirmée dans la même opération)"><select aria-label="Facture à rapprocher" className={sel} value={bill} onChange={(e) => setBill(e.target.value)}><option value="">— Choisir —</option>
        {bills?.filter((b) => b.status !== "void").map((b) => <option key={b.id} value={b.id}>{b.reference ?? "sans référence"} · {P.STATUS_LABEL[b.status]} · {b.total == null ? "total inconnu" : fmtMoney(b.total)}</option>)}</select></L>
      <p className="text-xs text-muted-foreground">Nouvelle facture ? Saisissez-la dans l'onglet Factures (brouillon), puis revenez la rapprocher ici.</p>
      {stats.map((s) => { const l = (o.lines as any[]).find((x) => x.no === s.line_no); return <div key={s.line_no} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <span className="col-span-2 self-center text-xs sm:col-span-1">L{s.line_no} {l?.description} — non facturé {qty(s.qty == null ? null : Math.max(s.qty - s.billed, 0))} {O.unitLabel(l?.unit)}</span>
        <Input aria-label={`Quantité facturée ligne ${s.line_no}`} placeholder="Quantité facturée" inputMode="decimal" value={q[s.line_no]?.qty ?? ""} onChange={(e) => setQ({ ...q, [s.line_no]: { ...(q[s.line_no] ?? { amount: "", portion: "" }), qty: e.target.value } })} />
        <Input aria-label={`Montant facturé ligne ${s.line_no}`} placeholder="Montant sur la facture" inputMode="decimal" value={q[s.line_no]?.amount ?? ""} onChange={(e) => setQ({ ...q, [s.line_no]: { ...(q[s.line_no] ?? { qty: "", portion: "" }), amount: e.target.value } })} />
        {s.line_total == null ? <Input aria-label={`Portion d'engagement ligne ${s.line_no}`} placeholder="Portion d'engagement à remplacer *" inputMode="decimal" value={q[s.line_no]?.portion ?? ""} onChange={(e) => setQ({ ...q, [s.line_no]: { ...(q[s.line_no] ?? { qty: "", amount: "" }), portion: e.target.value } })} /> : <span className="self-center text-[11px] text-muted-foreground">portion calculée par la ligne</span>}
      </div>; })}
      {before && <p className="text-xs text-amber-700">Avertissement : quantité facturée supérieure à la quantité reçue (facture avant réception).</p>}
      <L l="Motif d'exception (requis seulement si la quantité facturée dépasse la quantité commandée)"><Input aria-label="Motif d'exception de rapprochement" value={exc} onChange={(e) => setExc(e.target.value)} /></L>
      <Button size="sm" disabled={busy || !bill} onClick={submit}>Rapprocher</Button>
    </div>
  </details>;
}

function AmendForm({ o, reason, busy, run }: { o: any; reason: string; busy: boolean; run: (fn: () => Promise<void>) => Promise<void> }) {
  const [lines, setLines] = useState<O.LineForm[] | null>(null);
  if (!lines) return <Button size="sm" variant="link" className="px-0" onClick={() => setLines((o.lines as any[]).map(O.toLineForm))}>Modifier les lignes (motif requis)…</Button>;
  return <div className="space-y-2"><LinesEditor lines={lines} onChange={setLines} disabled={busy} />
    <div className="flex gap-2"><Button size="sm" disabled={busy || !reason.trim()} onClick={() => run(async () => { await O.amend(o.id, o.rev, lines, reason); setLines(null); toast({ title: "Lignes modifiées", description: "Modification tracée; l'instantané de confirmation est conservé." }); })}>Enregistrer la modification</Button>
      <Button size="sm" variant="outline" onClick={() => setLines(null)}>Annuler</Button></div></div>;
}
