// FIN-04 — Recherche commune : Échéances et Règlements, filtres combinables, vues enregistrées, totaux et export CSV.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Save, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import * as api from "@/lib/finances/api";
import { QUALITY_LABEL, fmtDate, fmtMoney, todayIn, type Occ } from "@/lib/finances/period";
import { FREQ_FILTERS } from "@/lib/finances/recurrence";
import * as st from "@/lib/finances/settlement";
import { DEFAULT_QUERY, REL_LABELS, activeCount, download, resolvePeriod, sanitizeView, serverFilters, toCsv, type Ctx, type FinQuery, type RelKind } from "@/lib/finances/query";
import * as fs from "@/lib/finances/search";

const TZ = "America/Toronto";
const sel = "h-10 rounded-md border border-input bg-background px-2 text-sm";
const SIZE = 25;
const NATURES: Record<string, string> = { charge: "Charge à prévoir", dette: "Dette", taxe: "Taxe", actif: "Actif", depot: "Dépôt", transfert: "Transfert" };
const SETTLES: [string, string][] = [["a_confirmer", "Règlement à confirmer"], ["non_reglee", "Non réglée"], ["partielle", "Partiellement réglée"], ["reglee", "Réglée"], ["a_completer", "Montant à compléter"], ["aucun", "Aucun montant"]];
const OCC_SORTS: [string, string][] = [["date_asc", "Échéance la plus ancienne"], ["date_desc", "Échéance la plus récente"], ["planned_asc", "Date planifiée"], ["amount_desc", "Montant décroissant"], ["amount_asc", "Montant croissant"], ["balance_desc", "Solde restant décroissant"], ["payee_asc", "Fournisseur (A → Z)"], ["late_first", "En retard d'abord"]];
const PAY_SORTS: [string, string][] = [["paid_desc", "Versement le plus récent"], ["paid_asc", "Versement le plus ancien"], ["entered_desc", "Saisie la plus récente"], ["amount_desc", "Montant décroissant"], ["amount_asc", "Montant croissant"], ["available_desc", "Reliquat décroissant"], ["payee_asc", "Bénéficiaire (A → Z)"]];
const stateKey = (c: string, ctx: Ctx) => `vq.fin.search.${c}.${ctx}`;

type Lk = { cats: { id: string; name: string }[]; trucks: { id: string; name: string }[]; projects: { id: string; name: string }[] };

export default function FinanceSearch({ companyId, companyName, ctx, rev, canWrite, canCorrect, renderOcc, onOpenPayment, onPayMany, add }: {
  companyId: string; companyName: string; ctx: Ctx; rev: number; canWrite: boolean; canCorrect: boolean;
  renderOcc: (o: Occ, pick?: { on: boolean; toggle: () => void }) => React.ReactNode; onOpenPayment: (id: string) => void; onPayMany?: (l: Occ[]) => void; add?: React.ReactNode;
}) {
  const today = todayIn(TZ);
  const [qy, setQy] = useState<FinQuery>(() => { try { return sanitizeView(JSON.parse(sessionStorage.getItem(stateKey(companyId, ctx)) ?? "null"), ctx) ?? DEFAULT_QUERY(ctx); } catch { return DEFAULT_QUERY(ctx); } });
  const [page, setPage] = useState(() => Number(sessionStorage.getItem(stateKey(companyId, ctx) + ".page") ?? 0) || 0);
  const [showF, setShowF] = useState(false);
  const [lk, setLk] = useState<Lk>({ cats: [], trucks: [], projects: [] });
  const [occ, setOcc] = useState<{ rows: Occ[]; total: number } | null>(null);
  const [ot, setOt] = useState<api.Totals | null>(null);
  const [pay, setPay] = useState<Awaited<ReturnType<typeof fs.searchPayments>> | null>(null);
  const [views, setViews] = useState<fs.SavedView[]>([]);
  const [viewId, setViewId] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [saveDlg, setSaveDlg] = useState<null | { id?: string; name: string; shared: boolean; fixed: boolean }>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [picked, setPicked] = useState<Occ[]>([]);
  const b = resolvePeriod(qy.period, today);
  const f = serverFilters(qy);
  const fKey = JSON.stringify([qy.ctx, f, qy.period, qy.base, qy.sort]);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null)); }, []);
  useEffect(() => {
    Promise.all([api.categories(companyId), api.lookups(companyId)]).then(([c, l]) => setLk({ cats: c, trucks: l.trucks, projects: l.projects })).catch(() => undefined);
  }, [companyId]);
  const loadViews = useCallback(() => fs.listViews(companyId, ctx).then(setViews).catch(() => setViews([])), [companyId, ctx]);
  // Vue par défaut : seulement si aucun état en cours n'est mémorisé pour cette entreprise.
  useEffect(() => {
    fs.listViews(companyId, ctx).then((v) => {
      setViews(v);
      if (!sessionStorage.getItem(stateKey(companyId, ctx))) { const d = v.find((x) => x.is_default); const s = d && sanitizeView(d.params, ctx); if (s) { setQy(s); setViewId(d!.id); } }
    }).catch(() => setViews([]));
  }, [companyId, ctx]);
  useEffect(() => { sessionStorage.setItem(stateKey(companyId, ctx), JSON.stringify(qy)); }, [qy, companyId, ctx]);
  useEffect(() => { sessionStorage.setItem(stateKey(companyId, ctx) + ".page", String(page)); }, [page, companyId, ctx]);

  const [first, setFirst] = useState(true);
  useEffect(() => { if (first) { setFirst(false); return; } setPage(0); }, [fKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (b.to < b.from) return;
    const t = setTimeout(() => {
      if (ctx === "occ") { setOcc(null); setOt(null); Promise.all([fs.occTotals(companyId, b.from, b.to, qy), fs.searchOcc(companyId, b.from, b.to, qy, SIZE, page * SIZE)]).then(([t, l]) => { setOt(t); setOcc(l); }).catch((e) => toast({ title: "Erreur", description: e.message, variant: "destructive" })); }
      else { setPay(null); fs.searchPayments(companyId, b.from, b.to, qy, SIZE, page * SIZE).then(setPay).catch((e) => toast({ title: "Erreur", description: e.message, variant: "destructive" })); }
    }, 250);
    return () => clearTimeout(t);
  }, [companyId, fKey, page, rev, b.from, b.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const setF = (patch: Record<string, unknown>) => setQy((q) => ctx === "occ" ? { ...q, occ: { ...q.occ, ...patch } } : { ...q, pay: { ...q.pay, ...patch } });
  const F = (ctx === "occ" ? qy.occ : qy.pay) as Record<string, any>;
  const toggleIn = (k: string, v: string) => { const cur: string[] = F[k] ?? []; setF({ [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] }); };
  const reset = () => { setQy({ ...DEFAULT_QUERY(ctx), period: qy.period }); setViewId(null); };
  const nameOf = (list: { id: string; name: string }[], id: string) => id === "none" ? "Sans catégorie" : list.find((x) => x.id === id)?.name ?? "élément inaccessible";

  // Pastilles supprimables
  const chips: { l: string; clear: () => void }[] = [];
  if (qy.q.trim()) chips.push({ l: `« ${qy.q.trim()} »`, clear: () => setQy({ ...qy, q: "" }) });
  Object.entries(F).forEach(([k, v]) => {
    if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) return;
    if (Array.isArray(v)) v.forEach((x: string) => chips.push({ l: k === "category_ids" ? nameOf(lk.cats, x) : k === "natures" ? NATURES[x] : k === "settles" ? SETTLES.find((s) => s[0] === x)?.[1] ?? x : st.METHOD_LABEL[x] ?? x, clear: () => toggleIn(k, x) }));
    else chips.push({ l: chipLabel(k, String(v), lk), clear: () => setF({ [k]: undefined }) });
  });

  // ---------- Vues ----------
  const applyView = (id: string) => {
    if (!id) { setViewId(null); return; }
    const v = views.find((x) => x.id === id); const s = v && sanitizeView(v.params, ctx);
    if (!v || !s) { toast({ title: "Vue inutilisable", description: "Cette vue n'existe plus ou n'est plus valide. Retour à la vue par défaut.", variant: "destructive" }); setQy(DEFAULT_QUERY(ctx)); setViewId(null); loadViews(); return; }
    setQy(s); setViewId(id);
  };
  const shortcut = (k: string) => {
    const base = { ...DEFAULT_QUERY(ctx), period: qy.period, base: qy.base };
    if (k === "late") setQy({ ...base, occ: { late: "1" } });
    if (k === "nofile") setQy(ctx === "occ" ? { ...base, occ: { pay_file: "0" } } : { ...base, pay: { has_file: "0", pstatus: "validated" } });
    if (k === "unknown") setQy({ ...base, occ: { quality: "unknown" } });
    if (k === "unalloc") setQy({ ...base, pay: { unallocated: "1", pstatus: "validated" } });
    const ins = lk.cats.find((c) => /assurance/i.test(c.name));
    if (k === "ins" && ins) setQy({ ...base, occ: { category_ids: [ins.id] }, pay: { category_ids: [ins.id] } });
    setViewId(null);
  };
  const cur = views.find((v) => v.id === viewId);
  const mine = cur && cur.user_id === uid;
  const saveView = async () => {
    if (!saveDlg) return;
    const params: FinQuery = saveDlg.fixed ? { ...qy, period: { kind: "fixed", from: b.from, to: b.to } } : qy;
    try {
      if (saveDlg.id) { await fs.updateView(saveDlg.id, { name: saveDlg.name, shared: saveDlg.shared, params }); toast({ title: "Vue mise à jour" }); }
      else { const id = await fs.createView(companyId, ctx, saveDlg.name, params, saveDlg.shared); setViewId(id); toast({ title: "Vue enregistrée" }); }
      setSaveDlg(null); loadViews();
    } catch (e: any) { toast({ title: "Vue non enregistrée", description: /row-level|policy|permission/i.test(e.message) ? "Votre rôle ne permet pas d'enregistrer cette vue." : e.message, variant: "destructive" }); }
  };
  const viewAct = async (a: "rename" | "dup" | "default" | "undefault" | "delete") => {
    if (!cur) return;
    try {
      if (a === "rename") setSaveDlg({ id: cur.id, name: cur.name, shared: cur.shared, fixed: (cur.params as any)?.period?.kind === "fixed" });
      if (a === "dup") { const s = sanitizeView(cur.params, ctx); if (s) { const id = await fs.createView(companyId, ctx, `${cur.name} (copie)`.slice(0, 80), s, false); setViewId(id); toast({ title: "Vue dupliquée" }); } }
      if (a === "default" && uid) { await fs.setDefaultView(companyId, ctx, uid, cur.id); toast({ title: "Vue par défaut définie" }); }
      if (a === "undefault" && uid) { await fs.setDefaultView(companyId, ctx, uid, null); toast({ title: "Vue par défaut retirée" }); }
      if (a === "delete") { if (!confirm(`Supprimer la vue « ${cur.name} » ? Aucune donnée financière n'est supprimée.`)) return; await fs.deleteView(cur.id); setViewId(null); toast({ title: "Vue supprimée" }); }
      loadViews();
    } catch (e: any) { toast({ title: "Action refusée", description: e.message, variant: "destructive" }); }
  };

  // ---------- Export CSV (toute la sélection) ----------
  const summary = (n: number, extra: [string, unknown][]): [string, unknown][] => [
    ["Entreprise", companyName], ["Contexte", ctx === "occ" ? "Échéances" : "Règlements"], ["Période", `${b.from} au ${b.to} (inclus) · ${REL_LABELS[qy.period.kind]}`],
    ["Base de dates", ctx === "occ" ? (qy.base === "planned" ? "Date planifiée" : "Date contractuelle (échéance)") : (qy.pay.date_base === "entered" ? "Date de saisie" : "Date déclarée du versement")],
    ["Recherche et filtres", chips.map((c) => c.l).join(" | ") || "Aucun"], ["Généré le", new Date().toLocaleString("fr-CA", { timeZone: TZ }) + ` (${TZ})`], ["Lignes", n], ...extra,
    ["Avertissement", "Règlements déclarés, non rapprochés avec la banque. Montant inconnu = cellule vide et qualité « À compléter »."],
  ];
  const exportCsv = async (kind: "main" | "alloc") => {
    setExporting("Préparation…");
    try {
      const stamp = today;
      if (ctx === "occ") {
        const t = await fs.occTotals(companyId, b.from, b.to, qy); const rows: Occ[] = [];
        for (let off = 0; off < 20000; off += 500) { const r = await fs.searchOcc(companyId, b.from, b.to, qy, 500, off); rows.push(...r.rows); setExporting(`${rows.length} / ${r.total}`); if (rows.length >= r.total || !r.rows.length) break; }
        const refs = await fs.contractRefs([...new Set(rows.map((r) => r.obligation_id))]);
        const csv = toCsv(summary(rows.length, [["Montant initial connu", t.known], ["dont confirmé", t.confirmed], ["dont estimé", t.estimated], ["Affecté net", t.paid_on_these ?? 0], ["Solde restant connu (à la date de consultation)", t.remaining ?? 0], ["Montants inconnus (nombre)", t.unknown_count]]),
          ["id_echeance", "id_obligation", "entreprise", "obligation", "beneficiaire", "categorie", "nature", "date_contractuelle", "date_planifiee", "devise", "montant_initial", "qualite_montant", "montant_inconnu", "affecte", "reste", "etat_reglement", "en_retard", "statut_echeance", "reference_contrat"],
          rows.map((o) => [o.id, o.obligation_id, companyName, o.label, o.payee ?? "", o.category ?? "", NATURES[refs[o.obligation_id]?.nature ?? ""] ?? "", o.due_date, o.planned_date, "CAD", o.amount_quality === "unknown" ? null : o.amount, QUALITY_LABEL[o.amount_quality], o.amount_quality === "unknown" ? "oui" : "non", o.paid ?? 0, o.balance ?? null, st.SETTLE_LABEL[o.settle ?? ""] ?? "", o.late ? "oui" : "non", o.status === "cancelled" ? "annulée" : "active", refs[o.obligation_id]?.contract_ref ?? ""]));
        download(`finances-echeances-${stamp}.csv`, csv); toast({ title: "Export prêt", description: `${rows.length} ligne(s) — totaux identiques à l'écran.` });
      } else if (kind === "main") {
        const rows: fs.PayRow[] = []; let totals: fs.PayTotals | null = null;
        for (let off = 0; off < 20000; off += 500) { const r = await fs.searchPayments(companyId, b.from, b.to, qy, 500, off); totals = r.totals; rows.push(...r.rows); setExporting(`${rows.length} / ${r.total}`); if (rows.length >= r.total || !r.rows.length) break; }
        const t = totals!;
        const csv = toCsv(summary(rows.length, [["Versements déclarés valides", t.declared], ...(t.scoped ? [["Montant affecté à la sélection", t.selected] as [string, unknown]] : []), ["Remboursements reçus (sur ces versements)", t.refunds], ["Net déclaré (versements − remboursements)", t.net], ["Retours / refus (hors net)", t.returned], ["Reliquats non affectés", t.unallocated]]),
          ["id_reglement", "entreprise", "beneficiaire", "date_versement", "date_saisie", "moyen", "compte_declare", "reference", "devise", "montant_global", ...(t.scoped ? ["montant_affecte_selection"] : []), "affecte_total", "reliquat", "rembourse", "etat", "pieces"],
          rows.map((r) => [r.id, companyName, r.payee_name, r.paid_on, r.entered_on, st.METHOD_LABEL[r.method] ?? r.method, r.source_label ?? "", r.reference ?? "", "CAD", r.amount, ...(t.scoped ? [r.selected] : []), r.allocated, r.available, r.refunded, st.PAY_STATUS[r.status] ?? r.status, r.files]));
        download(`finances-reglements-${stamp}.csv`, csv); toast({ title: "Export prêt", description: `${rows.length} règlement(s).` });
      } else {
        const rows: Awaited<ReturnType<typeof fs.allocationsPage>> = [];
        for (let off = 0; off < 20000; off += 500) { const r = await fs.allocationsPage(companyId, b.from, b.to, qy, 500, off); rows.push(...r); setExporting(`${rows.length}`); if (r.length < 500) break; }
        const inSel = rows.filter((r) => r.in_selection).reduce((s, r) => s + r.amount, 0);
        const csv = toCsv(summary(rows.length, [["Format", "Détail des affectations : une ligne = un montant affecté. Ne pas additionner avec l'export des règlements."], ["Total affecté (toutes lignes)", rows.reduce((s, r) => s + r.amount, 0)], ["Total affecté à la sélection", inSel]]),
          ["id_affectation", "id_reglement", "date_versement", "beneficiaire", "id_echeance", "id_obligation", "obligation", "categorie", "date_contractuelle", "devise", "montant_affecte", "dans_la_selection"],
          rows.map((r) => [r.allocation_id, r.payment_id, r.paid_on, r.payee_name, r.occurrence_id, r.obligation_id, r.label, r.category ?? "", r.due_date, "CAD", r.amount, r.in_selection ? "oui" : "non"]));
        download(`finances-affectations-${stamp}.csv`, csv); toast({ title: "Export prêt", description: `${rows.length} affectation(s).` });
      }
    } catch (e: any) { toast({ title: "Export impossible", description: e.message, variant: "destructive" }); } finally { setExporting(null); }
  };

  const pickErr = new Set(picked.map((o) => o.payee_key)).size > 1 ? "Bénéficiaires différents : préparez des règlements distincts." : null;
  const box = (l: string, v: string, note?: string, id?: string) => <div key={l} className="rounded-md border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="font-display text-lg font-bold" data-testid={id}>{v}</p>{note && <p className="text-[11px] text-muted-foreground">{note}</p>}</div>;

  return <div className="space-y-3">
    {/* Barre principale */}
    <div className="flex flex-wrap items-center gap-2">
      <Input placeholder={ctx === "occ" ? "Rechercher : libellé, fournisseur, contrat, note, référence, pièce" : "Rechercher : bénéficiaire, référence, note, pièce, obligation"} aria-label="Recherche" className="min-w-0 flex-1 sm:max-w-md" value={qy.q} onChange={(e) => setQy({ ...qy, q: e.target.value })} />
      <select aria-label="Période" className={sel} value={qy.period.kind} onChange={(e) => { const k = e.target.value as RelKind; setQy({ ...qy, period: k === "fixed" ? { kind: k, from: b.from, to: b.to } : { kind: k } }); }}>{Object.entries(REL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <Button variant="outline" onClick={() => setShowF(!showF)}><SlidersHorizontal className="mr-1 h-4 w-4" />Filtres ({activeCount(qy)})</Button>
      {add && <div className="ml-auto">{add}</div>}
    </div>
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {qy.period.kind === "fixed" && <><Input type="date" aria-label="Du" className="w-40" value={qy.period.from ?? ""} onChange={(e) => setQy({ ...qy, period: { ...qy.period, from: e.target.value } })} /><Input type="date" aria-label="Au" className="w-40" value={qy.period.to ?? ""} onChange={(e) => setQy({ ...qy, period: { ...qy.period, to: e.target.value } })} /></>}
      <span className="text-xs text-muted-foreground" data-testid="period-dates">Du {fmtDate(b.from)} au {fmtDate(b.to)} inclus</span>
      {ctx === "occ" ? <select aria-label="Base de dates" className={sel} value={qy.base} onChange={(e) => setQy({ ...qy, base: e.target.value as "due" })}><option value="due">Date contractuelle</option><option value="planned">Date planifiée</option></select>
        : <select aria-label="Base de dates" className={sel} value={qy.pay.date_base ?? "paid"} onChange={(e) => setF({ date_base: e.target.value === "paid" ? undefined : e.target.value })}><option value="paid">Date déclarée du versement</option><option value="entered">Date de saisie</option></select>}
      <select aria-label="Tri" className={sel} value={qy.sort} onChange={(e) => setQy({ ...qy, sort: e.target.value })}>{(ctx === "occ" ? OCC_SORTS : PAY_SORTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </div>

    {/* Vues */}
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select aria-label="Vue enregistrée" className={sel} value={viewId ?? ""} onChange={(e) => applyView(e.target.value)}>
        <option value="">— Vue non enregistrée —</option>
        {views.map((v) => <option key={v.id} value={v.id}>{v.name}{v.shared ? " (équipe)" : ""}{v.is_default ? " ★" : ""}</option>)}
      </select>
      {canWrite ? <Button size="sm" variant="outline" onClick={() => setSaveDlg({ name: "", shared: false, fixed: qy.period.kind === "fixed" })}><Save className="mr-1 h-4 w-4" />Enregistrer la vue</Button>
        : <span className="text-xs text-muted-foreground">Lecture seule : filtres utilisables, enregistrement de vues réservé aux rôles qui modifient.</span>}
      {cur && mine && canWrite && <>
        <Button size="sm" variant="ghost" onClick={() => viewAct("rename")}>Renommer / modifier</Button>
        <Button size="sm" variant="ghost" onClick={() => viewAct(cur.is_default ? "undefault" : "default")}>{cur.is_default ? "Retirer par défaut" : "Par défaut"}</Button>
        <Button size="sm" variant="ghost" onClick={() => viewAct("delete")}>Supprimer</Button>
      </>}
      {cur && canWrite && <Button size="sm" variant="ghost" onClick={() => viewAct("dup")}>Dupliquer</Button>}
      <span className="text-xs text-muted-foreground">Raccourcis :</span>
      {ctx === "occ" && <><Button size="sm" variant="secondary" onClick={() => shortcut("late")}>En retard</Button><Button size="sm" variant="secondary" onClick={() => shortcut("unknown")}>À compléter</Button></>}
      {ctx === "pay" && <Button size="sm" variant="secondary" onClick={() => shortcut("unalloc")}>Reliquats</Button>}
      <Button size="sm" variant="secondary" onClick={() => shortcut("nofile")}>Sans justificatif</Button>
      {lk.cats.some((c) => /assurance/i.test(c.name)) && <Button size="sm" variant="secondary" onClick={() => shortcut("ins")}>Assurances</Button>}
    </div>

    {/* Pastilles */}
    {chips.length > 0 && <div className="flex flex-wrap items-center gap-1">{chips.map((c, i) => <button key={i} onClick={c.clear} className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs" aria-label={`Retirer le filtre ${c.l}`}>{c.l}<X className="h-3 w-3" /></button>)}
      <Button size="sm" variant="ghost" onClick={reset}>Réinitialiser</Button></div>}

    {showF && <div className="space-y-3 rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">Plusieurs choix dans une même liste = <strong>l'un ou l'autre</strong>. Entre listes différentes = <strong>tous les critères</strong>.</p>
      <Multi label="Catégories" opts={[...lk.cats.map((c) => [c.id, c.name + (c.archived_at ? " (archivée)" : "")] as [string, string]), ["none", "Sans catégorie"]]} val={F.category_ids ?? []} toggle={(v) => toggleIn("category_ids", v)} />
      {ctx === "occ" ? <>
        <Multi label="État du règlement" opts={SETTLES} val={F.settles ?? []} toggle={(v) => toggleIn("settles", v)} />
        <Multi label="Nature" opts={Object.entries(NATURES)} val={F.natures ?? []} toggle={(v) => toggleIn("natures", v)} />
        <div className="grid gap-2 sm:grid-cols-3">
          <Input placeholder="Fournisseur / bénéficiaire" value={F.payee ?? ""} onChange={(e) => setF({ payee: e.target.value || undefined })} />
          <S l="En retard" v={F.late} set={(v) => setF({ late: v })} o={[["1", "En retard seulement"], ["0", "Pas en retard"]]} all="Retard : tous" />
          <S l="Qualité du montant" v={F.quality} set={(v) => setF({ quality: v })} o={[["confirmed", "Confirmé"], ["estimated", "Estimé"], ["unknown", "Inconnu (à compléter)"], ["zero", "Zéro volontaire"]]} all="Toutes qualités" />
          <S l="Fréquence" v={F.frequency} set={(v) => setF({ frequency: v })} o={FREQ_FILTERS.map((x) => [x.v, x.l])} all="Toutes fréquences" />
          <S l="Ponctuel / récurrent" v={F.recurring} set={(v) => setF({ recurring: v })} o={[["0", "Ponctuel"], ["1", "Récurrent"]]} all="Ponctuel ou récurrent" />
          <S l="Saison" v={F.seasonal} set={(v) => setF({ seasonal: v })} o={[["1", "Saisonnières"], ["0", "Sans saison"]]} all="Avec ou sans saison" />
          <S l="Série" v={F.series} set={(v) => setF({ series: v })} o={[["active", "Série active"], ["archived", "Série archivée"]]} all="Séries actives et archivées" />
          <S l="Échéance" v={F.status} set={(v) => setF({ status: v })} o={[["cancelled", "Annulées (historique)"], ["all", "Actives et annulées"]]} all="Actives" />
          <S l="Justificatif du règlement" v={F.pay_file} set={(v) => setF({ pay_file: v })} o={[["1", "Règlement lié avec pièce"], ["0", "Règlement lié sans pièce"]]} all="Pièce de règlement : indifférent" />
          <S l="Moyen de règlement" v={F.method} set={(v) => setF({ method: v })} o={Object.entries(st.METHOD_LABEL)} all="Tous moyens" />
          <S l="Véhicule" v={F.truck_id} set={(v) => setF({ truck_id: v })} o={lk.trucks.map((t) => [t.id, t.name])} all="Tous véhicules" />
          <S l="Chantier" v={F.project_id} set={(v) => setF({ project_id: v })} o={lk.projects.map((t) => [t.id, t.name])} all="Tous chantiers" />
          <Range l="Montant initial ($)" a={F.amount_min} b={F.amount_max} set={(a, b2) => setF({ amount_min: a, amount_max: b2 })} />
          <Range l="Solde restant ($)" a={F.balance_min} b={F.balance_max} set={(a, b2) => setF({ balance_min: a, balance_max: b2 })} />
        </div>
      </> : <>
        <Multi label="Moyen" opts={Object.entries(st.METHOD_LABEL)} val={F.methods ?? []} toggle={(v) => toggleIn("methods", v)} />
        <div className="grid gap-2 sm:grid-cols-3">
          <Input placeholder="Bénéficiaire" value={F.payee ?? ""} onChange={(e) => setF({ payee: e.target.value || undefined })} />
          <Input placeholder="Référence de règlement" value={F.reference ?? ""} onChange={(e) => setF({ reference: e.target.value || undefined })} />
          <Input placeholder="Compte déclaré" value={F.account ?? ""} onChange={(e) => setF({ account: e.target.value || undefined })} />
          <S l="État" v={F.pstatus} set={(v) => setF({ pstatus: v })} o={[["validated", "Valide"], ["voided", "Saisie annulée"], ["returned", "Retourné / refusé"], ["refunded", "Avec remboursement"], ["draft", "Brouillon"]]} all="Tous états" />
          <S l="Justificatif" v={F.has_file} set={(v) => setF({ has_file: v })} o={[["1", "Avec pièce"], ["0", "Sans pièce"]]} all="Pièce : indifférent" />
          <S l="Reliquat" v={F.unallocated} set={(v) => setF({ unallocated: v })} o={[["1", "Avec reliquat disponible"], ["0", "Sans reliquat"]]} all="Reliquat : indifférent" />
          <S l="Véhicule" v={F.truck_id} set={(v) => setF({ truck_id: v })} o={lk.trucks.map((t) => [t.id, t.name])} all="Tous véhicules" />
          <S l="Chantier" v={F.project_id} set={(v) => setF({ project_id: v })} o={lk.projects.map((t) => [t.id, t.name])} all="Tous chantiers" />
          <Range l="Montant global ($)" a={F.amount_min} b={F.amount_max} set={(a, b2) => setF({ amount_min: a, amount_max: b2 })} />
        </div>
      </>}
      <p className="text-[11px] text-muted-foreground">Pas encore disponibles faute de données reliées : responsable, équipement, étiquettes, sous-catégories et pièces rattachées à l'obligation. La recherche ne lit pas le contenu des PDF.</p>
    </div>}

    {/* Totaux */}
    {b.to < b.from ? <p className="text-sm text-destructive">La date de fin doit suivre la date de début.</p> : ctx === "occ" ? (!ot ? <p className="text-sm text-muted-foreground">Calcul…</p> : <div className="space-y-1">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {box("Montant initial connu", fmtMoney(ot.known), `confirmé ${fmtMoney(ot.confirmed)} · estimé ${fmtMoney(ot.estimated)}`, "occ-known")}
        {box("Affecté net", fmtMoney(ot.paid_on_these ?? 0), "règlements valides affectés à ces échéances", "occ-paid")}
        {box("Solde restant connu, à ce jour", fmtMoney(ot.remaining ?? 0), `${ot.late_count ?? 0} en retard (${fmtMoney(ot.late_amount ?? 0)})`, "occ-rest")}
        {box("Échéances", String(ot.count), `${ot.unknown_count} montant(s) inconnu(s) — non comptés comme 0 $`, "occ-count")}
      </div>
      <p className="text-[11px] text-muted-foreground">Le solde est calculé à la date de consultation ({fmtDate(today)}), même pour des échéances anciennes. Échéances annulées exclues des montants.</p>
    </div>) : (!pay ? <p className="text-sm text-muted-foreground">Calcul…</p> : <div className="space-y-1">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {box("Versements déclarés valides", fmtMoney(pay.totals.declared), `${pay.totals.declared_count} versement(s), chacun compté une fois`, "pay-declared")}
        {pay.totals.scoped ? box("Montant affecté à la sélection", fmtMoney(pay.totals.selected), "part des versements affectée aux catégories / chantier / véhicule filtrés", "pay-selected") : box("Net déclaré", fmtMoney(pay.totals.net), `versements − remboursements reçus (${fmtMoney(pay.totals.refunds)})`, "pay-net")}
        {box("Retours / refus déclarés", fmtMoney(pay.totals.returned), `${pay.totals.returned_count} retour(s) · ${pay.totals.voided_count} saisie(s) annulée(s), jamais comptées comme entrée d'argent`)}
        {box("Reliquats non affectés", fmtMoney(pay.totals.unallocated), `${pay.totals.unallocated_count} versement(s) · jamais répartis sur un chantier`, "pay-unalloc")}
      </div>
      <p className="text-[11px] text-muted-foreground">Règlements déclarés, non rapprochés avec la banque. Remboursements rattachés à leur versement d'origine.</p>
    </div>)}

    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={!!exporting} onClick={() => exportCsv("main")}><Download className="mr-1 h-4 w-4" />Exporter toute la sélection (CSV)</Button>
      {ctx === "pay" && <Button size="sm" variant="outline" disabled={!!exporting} onClick={() => exportCsv("alloc")}><Download className="mr-1 h-4 w-4" />Exporter le détail des affectations (CSV)</Button>}
      {exporting && <span className="text-xs text-muted-foreground" role="status">Export en cours : {exporting}</span>}
    </div>

    {/* Résultats */}
    {ctx === "occ" ? (!occ ? <p className="text-sm text-muted-foreground">Chargement…</p> : occ.total === 0 ? <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Aucune échéance pour cette période et ces filtres.</p> : <div className="space-y-2">
      {onPayMany && <div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">Sélection groupée (même bénéficiaire) : {picked.length}</span>{pickErr && <span className="text-destructive">{pickErr}</span>}
        <Button size="sm" disabled={!picked.length || !!pickErr} onClick={() => { onPayMany(picked); setPicked([]); }}>Préparer un règlement groupé</Button></div>}
      {occ.rows.map((o) => <div key={o.id}>{renderOcc(o, onPayMany ? { on: picked.some((x) => x.id === o.id), toggle: () => setPicked((l) => l.some((x) => x.id === o.id) ? l.filter((x) => x.id !== o.id) : [...l, o]) } : undefined)}</div>)}
      <Pager page={page} total={occ.total} set={setPage} />
    </div>) : (!pay ? <p className="text-sm text-muted-foreground">Chargement…</p> : pay.total === 0 ? <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Aucun règlement pour ces critères.</p> : <div className="space-y-2">
      {pay.rows.map((r) => <button key={r.id} onClick={() => onOpenPayment(r.id)} className={`flex w-full items-center justify-between gap-3 rounded-md border border-border bg-card p-3 text-left hover:bg-secondary/50 ${["voided", "returned"].includes(r.status) ? "opacity-60" : ""}`}>
        <div className="min-w-0"><p className="truncate font-display text-sm font-semibold">{r.payee_name}</p><p className="truncate text-xs text-muted-foreground">{fmtDate(r.paid_on)} · {st.METHOD_LABEL[r.method]}{r.reference ? ` · ${r.reference}` : ""} · {st.PAY_STATUS[r.status]}{Number(r.files) === 0 ? " · pièce manquante" : ""}</p></div>
        <div className="shrink-0 text-right"><p className="font-display text-sm font-bold">{fmtMoney(r.amount)}</p>{r.scoped && <p className="text-[11px]">affecté sélection {fmtMoney(r.selected)}</p>}{r.available > 0 && <p className="text-[11px] text-amber-700">Reliquat {fmtMoney(r.available)}</p>}{r.refunded > 0 && <p className="text-[11px]">Remboursé {fmtMoney(r.refunded)}</p>}</div>
      </button>)}
      <Pager page={page} total={pay.total} set={setPage} />
    </div>)}

    {saveDlg && <Dialog open onOpenChange={() => setSaveDlg(null)}><DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md">
      <DialogHeader><DialogTitle>{saveDlg.id ? "Modifier la vue" : "Enregistrer la vue"}</DialogTitle></DialogHeader>
      <Input aria-label="Nom de la vue" placeholder="Nom (ex. Assurances à payer)" value={saveDlg.name} maxLength={80} onChange={(e) => setSaveDlg({ ...saveDlg, name: e.target.value })} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveDlg.fixed} onChange={(e) => setSaveDlg({ ...saveDlg, fixed: e.target.checked })} />Garder les dates fixes ({fmtDate(b.from)} – {fmtDate(b.to)})</label>
      <p className="text-xs text-muted-foreground">{saveDlg.fixed ? "La vue gardera toujours ces dates." : `La vue se recalcule : « ${REL_LABELS[qy.period.kind]} ».`}</p>
      {canCorrect && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveDlg.shared} onChange={(e) => setSaveDlg({ ...saveDlg, shared: e.target.checked })} />Partager avec l'équipe (chacun voit les résultats selon ses propres droits)</label>}
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setSaveDlg(null)}>Annuler</Button><Button disabled={!saveDlg.name.trim()} onClick={saveView}>Enregistrer</Button></div>
    </DialogContent></Dialog>}
  </div>;
}

function chipLabel(k: string, v: string, lk: Lk) {
  const m: Record<string, string> = {
    late: v === "1" ? "En retard" : "Pas en retard", quality: ({ confirmed: "Confirmé", estimated: "Estimé", unknown: "Montant inconnu", zero: "Zéro volontaire" } as any)[v] ?? v,
    recurring: v === "1" ? "Récurrent" : "Ponctuel", seasonal: v === "1" ? "Saisonnières" : "Sans saison", series: v === "archived" ? "Série archivée" : "Série active",
    status: v === "cancelled" ? "Annulées" : "Actives et annulées", pay_file: v === "1" ? "Règlement avec pièce" : "Règlement sans pièce", has_file: v === "1" ? "Avec pièce" : "Sans pièce",
    unallocated: v === "1" ? "Avec reliquat" : "Sans reliquat", pstatus: ({ validated: "Valide", voided: "Saisie annulée", returned: "Retourné", refunded: "Remboursé", draft: "Brouillon" } as any)[v] ?? v,
    date_base: "Par date de saisie", method: st.METHOD_LABEL[v] ?? v, frequency: FREQ_FILTERS.find((x) => x.v === v)?.l ?? v,
    truck_id: `Véhicule : ${lk.trucks.find((x) => x.id === v)?.name ?? "inaccessible"}`, project_id: `Chantier : ${lk.projects.find((x) => x.id === v)?.name ?? "inaccessible"}`,
  };
  const pre: Record<string, string> = { payee: "Bénéficiaire", reference: "Réf.", account: "Compte", amount_min: "Montant ≥", amount_max: "Montant ≤", balance_min: "Solde ≥", balance_max: "Solde ≤", paid_from: "Réglée depuis", paid_to: "Réglée jusqu'au" };
  return m[k] ?? `${pre[k] ?? k} ${v}`;
}
function S({ l, v, set, o, all }: { l: string; v?: string; set: (v?: string) => void; o: [string, string][] | string[][]; all: string }) {
  return <select aria-label={l} className={sel} value={v ?? ""} onChange={(e) => set(e.target.value || undefined)}><option value="">{all}</option>{o.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>;
}
function Multi({ label, opts, val, toggle }: { label: string; opts: [string, string][]; val: string[]; toggle: (v: string) => void }) {
  if (!opts.length) return null;
  return <div><p className="mb-1 text-xs font-semibold">{label}</p><div className="flex flex-wrap gap-1">{opts.map(([v, l]) => <button key={v} type="button" aria-pressed={val.includes(v)} onClick={() => toggle(v)} className={`rounded-full border px-2 py-0.5 text-xs ${val.includes(v) ? "border-primary bg-primary/15" : "border-border"}`}>{l}</button>)}</div></div>;
}
function Range({ l, a, b, set }: { l: string; a?: string; b?: string; set: (a?: string, b?: string) => void }) {
  return <div className="flex items-center gap-1 text-xs"><span className="whitespace-nowrap">{l}</span><Input type="number" min="0" step="0.01" aria-label={`${l} minimum`} placeholder="min" className="h-9" value={a ?? ""} onChange={(e) => set(e.target.value || undefined, b)} /><Input type="number" min="0" step="0.01" aria-label={`${l} maximum`} placeholder="max" className="h-9" value={b ?? ""} onChange={(e) => set(a, e.target.value || undefined)} /></div>;
}
function Pager({ page, total, set }: { page: number; total: number; set: (n: number) => void }) {
  return <div className="flex items-center justify-between pt-2 text-sm"><span>{page * SIZE + 1}–{Math.min((page + 1) * SIZE, total)} sur {total}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => set(page - 1)}>Précédent</Button><Button variant="outline" size="sm" disabled={(page + 1) * SIZE >= total} onClick={() => set(page + 1)}>Suivant</Button></div></div>;
}
