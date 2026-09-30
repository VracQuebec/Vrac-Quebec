// FIN-01 — Finances : obligations à payer et calendrier.
// Une obligation prévoit un montant ; ce n'est pas un paiement bancaire.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDraft } from "@/lib/drafts/useDraft";
import DraftStatusBar from "@/components/drafts/DraftStatusBar";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, LifeBuoy, List, Plus, SlidersHorizontal } from "lucide-react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import * as api from "@/lib/finances/api";
import { supabase as _sb } from "@/integrations/supabase/client";
const sb = _sb as any;
import { PERIOD_LABELS, QUALITY_LABEL, addDays, addMonths, daysInMonth, fmtDate, fmtMoney, parse, periodBounds, todayIn, ymd, type Occ, type PeriodKind } from "@/lib/finances/period";
import { COLLISION_LABEL, DAYS, FEB29_LABEL, FREQ_FILTERS, PRESETS, RENEWAL_LABEL, SHIFT_LABEL, freqLabel, policies, presetRule, sentence, toPreset, type Preset } from "@/lib/finances/recurrence";
import * as st from "@/lib/finances/settlement";
import { PaymentDetail, PaymentDialog, type PayTarget } from "@/components/finances/Settlements";
import FinanceSearch from "@/components/finances/FinanceSearch";
import Averages from "@/components/finances/Averages";

type Tab = "apercu" | "calendrier" | "apayer" | "reglements" | "moyennes" | "parametres";
const TABS: { v: Tab; l: string }[] = [{ v: "apercu", l: "Vue d'ensemble" }, { v: "calendrier", l: "Calendrier" }, { v: "apayer", l: "À payer" }, { v: "reglements", l: "Règlements" }, { v: "moyennes", l: "Moyennes et équivalents" }, { v: "parametres", l: "Paramètres" }];
const monthFr = (ym: string) => new Date(`${ym}-01T12:00:00Z`).toLocaleDateString("fr-CA", { timeZone: "UTC", month: "long", year: "numeric" });
const SettleBadge = ({ o }: { o: Occ }) => o.settle ? <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${st.SETTLE_TONE[o.settle] ?? ""}`}>{st.SETTLE_LABEL[o.settle]}{o.late ? " · en retard" : ""}</span> : null;
/** Fréquence de la version qui a produit l'échéance (jamais réécrite par une règle ultérieure). */
const occFreq = (o: Occ) => o.rule_known === false ? "fréquence d'origine non récupérable" : freqLabel(o.rule_frequency ?? o.frequency, o.rule_interval ?? o.interval_n);
const sel = "h-10 rounded-md border border-input bg-background px-2 text-sm";
const TZ = "America/Toronto";
const NATURES = [["charge", "Charge à prévoir"], ["dette", "Dette"], ["taxe", "Taxe"], ["actif", "Actif"], ["depot", "Dépôt"], ["transfert", "Transfert"]];
const ACTIONS: Record<string, string> = { create: "Création", update: "Modification", amount_this: "Montant modifié (cette échéance)", amount_following: "Montant modifié (échéances suivantes)", reschedule: "Date planifiée déplacée", cancel: "Échéance annulée", archive: "Série archivée", rule_change: "Règle de récurrence changée", pause: "Suspension future", pause_lift: "Suspension levée" };

export default function EntrepreneurFinances({ admin = false }: { admin?: boolean }) {
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading } = useUserRoles(user, isReady);
  const [params, setParams] = useSearchParams();
  const [companies, setCompanies] = useState<{ id: string; name: string }[] | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const tab = (params.get("tab") as Tab) || "apercu";
  const support = admin && isAdmin;

  useEffect(() => {
    if (!isReady || loading || !user) return;
    api.myFinanceCompanies(support).then((list) => {
      setCompanies(list);
      const pref = params.get("company") || (!support ? localStorage.getItem(`vq.fin.company.${user.id}`) : null);
      if (pref && list.some((c) => c.id === pref)) setCompanyId(pref);
      else if (list.length === 1 && !support) setCompanyId(list[0].id); // une seule entreprise : aucun choix ambigu
    });
  }, [isReady, loading, user, support]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!companyId || !user) return;
    setRole(undefined);
    if (!support) localStorage.setItem(`vq.fin.company.${user.id}`, companyId);
    api.role(companyId).then(setRole);
  }, [companyId, user, support]);

  const company = companies?.find((c) => c.id === companyId);
  const canRead = ["support", "proprietaire", "gestionnaire", "comptabilite", "lecture"].includes(role ?? "");
  const canWrite = ["support", "proprietaire", "gestionnaire", "comptabilite"].includes(role ?? "");
  const canCorrect = ["support", "proprietaire", "comptabilite"].includes(role ?? "");
  const go = (t: Tab) => { const p = new URLSearchParams(params); p.set("tab", t); if (companyId) p.set("company", companyId); setParams(p); };

  return (
    <EntrepreneurAppShell title="Finances" subtitle={company?.name ?? ""} backTo={admin ? "/admin" : null} allowCompanyMembers>
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        {support && company && <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm"><LifeBuoy className="h-4 w-4" /><strong>Assistance Vrac Québec — {company.name}</strong><span className="text-muted-foreground">· vos modifications sont journalisées à votre nom</span></div>}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Entreprise :</span>
          {companies && (companies.length > 1 || support) ? (
            <select aria-label="Entreprise" className={sel} value={companyId ?? ""} onChange={(e) => { setCompanyId(e.target.value || null); const p = new URLSearchParams(params); p.set("company", e.target.value); setParams(p); }}>
              <option value="">— Choisir une entreprise —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : <strong className="font-display">{company?.name ?? (companies ? "Aucune entreprise" : "…")}</strong>}
        </div>

        {!companies ? <p className="text-muted-foreground">Chargement…</p>
          : !companyId ? <p className="text-muted-foreground">{companies.length ? "Choisissez l'entreprise dont vous voulez consulter les finances." : "Aucune entreprise ne vous donne accès aux finances."}</p>
          : role === undefined ? <p className="text-muted-foreground">Vérification des droits…</p>
          : !canRead ? <p className="text-muted-foreground">Votre rôle dans « {company?.name} » ne donne pas accès aux finances.</p>
          : <>
            <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border" aria-label="Sections Finances">
              {TABS.map((t) => <button key={t.v} onClick={() => go(t.v)} className={`whitespace-nowrap px-3 py-2 text-sm font-display font-semibold ${tab === t.v ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}>{t.l}</button>)}
            </nav>
            {!canWrite && <p className="mb-3 rounded-md bg-secondary p-2 text-xs">Accès en lecture seule.</p>}
            <Finance key={companyId} companyId={companyId} companyName={company?.name ?? ""} tab={tab} canWrite={canWrite} canCorrect={canCorrect} />
          </>}
      </div>
    </EntrepreneurAppShell>
  );
}

function Finance({ companyId, companyName, tab, canWrite, canCorrect }: { companyId: string; companyName: string; tab: Tab; canWrite: boolean; canCorrect: boolean }) {
  const [rev, setRev] = useState(0);
  const [form, setForm] = useState<{ id: string | null; init?: any; ruleChange?: { effective: string } } | null>(null);
  const [occ, setOcc] = useState<Occ | null>(null);
  const [pay, setPay] = useState<PayTarget[] | null>(null);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [cats, setCats] = useState<Awaited<ReturnType<typeof api.categories>>>([]);
  const refresh = useCallback(() => setRev((r) => r + 1), []);
  useEffect(() => { api.categories(companyId).then(setCats); }, [companyId, rev]);
  const add = canWrite ? <Button onClick={() => setForm({ id: null })}><Plus className="mr-1 h-4 w-4" />Ajouter une obligation</Button> : null;
  const onPayMany = canWrite ? (list: Occ[]) => setPay(list.map((o) => ({ id: o.id, label: o.label, due_date: o.due_date, balance: o.balance, amount_quality: o.amount_quality, payee: o.payee, payee_key: o.payee_key }))) : undefined;
  return <>
    {tab === "apercu" && <Overview companyId={companyId} rev={rev} add={add} onOpen={setOcc} />}
    {tab === "calendrier" && <Browse companyId={companyId} rev={rev} cats={cats} mode="calendar" add={add} onOpen={setOcc} />}
    {tab === "apayer" && <FinanceSearch key="occ" companyId={companyId} companyName={companyName} ctx="occ" rev={rev} canWrite={canWrite} canCorrect={canCorrect} add={add} onPayMany={onPayMany} onOpenPayment={setPayOpen} renderOcc={(o, pick) => <OccRow o={o} onOpen={setOcc} pick={pick} />} />}
    {tab === "reglements" && <FinanceSearch key="pay" companyId={companyId} companyName={companyName} ctx="pay" rev={rev} canWrite={canWrite} canCorrect={canCorrect} onOpenPayment={setPayOpen} renderOcc={(o) => <OccRow o={o} onOpen={setOcc} />} />}
    {tab === "moyennes" && <Averages companyId={companyId} cats={cats.filter((c) => !c.archived_at)} />}
    {tab === "parametres" && <Settings companyId={companyId} cats={cats} canWrite={canWrite} onChange={refresh} />}
    {form && <ObligationForm companyId={companyId} companyName={companyName} id={form.id} init={form.init} ruleChange={form.ruleChange} cats={cats.filter((c) => !c.archived_at)} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
    {occ && <OccurrenceDialog occ={occ} canWrite={canWrite} onClose={() => setOcc(null)} onChanged={refresh}
      onPay={(o) => { setOcc(null); onPayMany?.([o]); }} onOpenPayment={(id) => { setOcc(null); setPayOpen(id); }}
      onEdit={(id) => { setOcc(null); setForm({ id }); }} onRuleChange={(id, effective) => { setOcc(null); setForm({ id, ruleChange: { effective } }); }} onDuplicate={(init) => { setOcc(null); setForm({ id: null, init }); }} />}
    {pay && <PaymentDialog companyId={companyId} companyName={companyName} targets={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); refresh(); }} />}
    {payOpen && <PaymentDetail id={payOpen} companyId={companyId} canWrite={canWrite} canCorrect={canCorrect} onClose={() => setPayOpen(null)} onChanged={refresh} />}
  </>;
}

function TotalsCards({ t }: { t: api.Totals | null }) {
  if (!t) return <p className="text-sm text-muted-foreground">Calcul…</p>;
  const c = [["Total confirmé", fmtMoney(t.confirmed)], ["Total estimé", fmtMoney(t.estimated)], ["Total connu", fmtMoney(t.known)], ["Montants à compléter", String(t.unknown_count)], ["Échéances retenues", String(t.count)]];
  const m = Object.entries(t.declared_by_method ?? {}).map(([k, v]) => `${st.METHOD_LABEL[k] ?? k} ${fmtMoney(Number(v))}`).join(" · ");
  const box = (l: string, v: string, note?: string, id?: string) => <div key={l} className="rounded-md border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="font-display text-lg font-bold" data-testid={id ? `tot-${id}` : undefined}>{v}</p>{note && <p className="text-[11px] text-muted-foreground">{note}</p>}</div>;
  return <div className="space-y-2">
    <p className="text-xs font-semibold">Montants exigibles dans la période ({t.base === "planned" ? "par date de paiement planifiée" : "par date d'échéance"})</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{c.map(([l, v]) => <div key={l} className="rounded-md border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="font-display text-lg font-bold" data-testid={`tot-${l}`}>{v}</p></div>)}</div>
    {t.remaining !== undefined && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {box("Reste à payer sur ces échéances, à ce jour", fmtMoney(t.remaining), `${t.late_count ?? 0} en retard (${fmtMoney(t.late_amount ?? 0)})${t.remaining_estimated ? ` · dont basé sur estimation ${fmtMoney(t.remaining_estimated)}` : ""}${t.to_confirm_amount ? ` · dont règlement à confirmer ${fmtMoney(t.to_confirm_amount)}` : ""}`, "reste")}
      {box("Versements déclarés dans la période (date du versement)", fmtMoney(t.declared ?? 0), m || "Aucun", "declare")}
      {box("Reliquats non affectés (toutes dates)", fmtMoney(t.unallocated ?? 0), `${t.unallocated_count ?? 0} versement(s) avec avance / trop-payé`, "reliquat")}
      {box("Remboursements reçus dans la période", fmtMoney(t.refunds ?? 0), `${t.unknown_count} montant(s) à compléter · ${t.drafts ?? 0} brouillon(s)`)}
    </div>}
    <p className="text-xs text-muted-foreground">Du {fmtDate(t.from)} au {fmtDate(t.to)} inclus · fuseau {TZ}. Les versements sont des règlements déclarés, non rapprochés avec la banque ; un paiement par carte ne prouve pas une sortie du compte bancaire. Ni bénéfice, ni charge comptable.</p>
  </div>;
}

function OccRow({ o, onOpen, pick }: { o: Occ; onOpen: (o: Occ) => void; pick?: { on: boolean; toggle: () => void } }) {
  return <div className="flex items-center gap-2">
    {pick && <input type="checkbox" aria-label={`Sélectionner ${o.label} du ${fmtDate(o.due_date)}`} checked={pick.on} onChange={pick.toggle} disabled={!["non_reglee", "partielle", "a_confirmer"].includes(o.settle ?? "")} />}
    <button onClick={() => onOpen(o)} className={`flex w-full items-center justify-between gap-3 rounded-md border border-border bg-card p-3 text-left hover:bg-secondary/50 ${o.status === "cancelled" ? "opacity-60" : ""}`}>
    <div className="min-w-0"><p className="truncate font-display text-sm font-semibold">{o.label}{o.status === "cancelled" && " — annulée"}</p>
      <p className="truncate text-xs text-muted-foreground">{fmtDate(o.ref_date)}{o.payee ? ` · ${o.payee}` : ""}{o.category ? ` · ${o.category}` : ""}{(o.rule_frequency ?? o.frequency) !== "once" ? ` · ${occFreq(o)}` : ""}{o.seasonal ? " · saisonnière" : ""}{o.planned_override ? ` · planifiée le ${fmtDate(o.planned_date)}` : ""}</p>
      {o.status === "active" && <div className="mt-1"><SettleBadge o={o} /></div>}</div>
    <div className="text-right"><p className="font-display text-sm font-bold">{fmtMoney(o.amount)}</p><p className="text-[11px] text-muted-foreground">{QUALITY_LABEL[o.amount_quality]}</p>
      {o.status === "active" && (o.paid ?? 0) > 0 && <p className="text-[11px]">Reste {fmtMoney(o.balance ?? null)}</p>}</div>
  </button></div>;
}

function Overview({ companyId, rev, add, onOpen }: { companyId: string; rev: number; add: React.ReactNode; onOpen: (o: Occ) => void }) {
  const today = todayIn(TZ);
  const [d, setD] = useState<{ today?: api.Totals; past?: api.Totals; w?: api.Totals; m?: api.Totals; next?: Occ[] }>({});
  useEffect(() => {
    Promise.all([
      api.periodTotals(companyId, today, today, "due"),
      api.periodTotals(companyId, addDays(today, -730), addDays(today, -1), "due"),
      api.periodTotals(companyId, addDays(today, 1), addDays(today, 7), "due"),
      api.periodTotals(companyId, addDays(today, 1), addDays(today, 30), "due"),
      api.listOcc(companyId, today, addDays(today, 365), "due", {}, "date_asc", 8),
    ]).then(([a, b, c, e, n]) => setD({ today: a, past: b, w: c, m: e, next: n.rows })).catch((e) => toast({ title: "Erreur", description: e.message, variant: "destructive" }));
  }, [companyId, rev, today]);
  const card = (l: string, t?: api.Totals, note?: string) => <div className="rounded-md border border-border bg-card p-3">
    <p className="text-xs text-muted-foreground">{l}</p>
    {t ? <><p className="font-display text-lg font-bold">{fmtMoney(t.known)}</p><p className="text-xs text-muted-foreground">{t.count} échéance(s) · dont estimé {fmtMoney(t.estimated)} · {t.unknown_count} à compléter</p></> : <p className="text-sm">…</p>}
    {note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}
  </div>;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">Aujourd'hui : {fmtDate(today)} ({TZ})</p>{add}</div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {card("Dû aujourd'hui", d.today)}
      {card("Échéances passées (24 derniers mois)", d.past, d.past ? `Reste à payer à ce jour : ${fmtMoney(d.past.remaining ?? 0)} · dont « règlement à confirmer » (antérieur au suivi) : ${fmtMoney(d.past.to_confirm_amount ?? 0)}.` : undefined)}
      {card("7 prochains jours", d.w)}
      {card("30 prochains jours", d.m)}
    </div>
    <section><h2 className="mb-2 font-display font-bold">Prochaines échéances</h2>
      {!d.next ? <p className="text-sm text-muted-foreground">Chargement…</p> : d.next.length === 0 ? <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Aucune obligation à venir. Ajoutez votre première obligation (assurance, logiciel, location…) avec « Ajouter une obligation » : elle apparaîtra ici et dans le calendrier.</p>
        : <div className="space-y-2">{d.next.map((o) => <OccRow key={o.id} o={o} onOpen={onOpen} />)}</div>}
    </section>
  </div>;
}

function Browse({ companyId, rev, cats, mode, add, onOpen, onPayMany }: { companyId: string; rev: number; cats: { id: string; name: string }[]; mode: "calendar" | "table"; add: React.ReactNode; onOpen: (o: Occ) => void; onPayMany?: (l: Occ[]) => void }) {
  const today = todayIn(TZ);
  const [kind, setKind] = useState<PeriodKind>("month");
  const [ref, setRef] = useState(today);
  const [custom, setCustom] = useState({ from: today, to: addDays(today, 30) });
  const [base, setBase] = useState<api.Base>("due");
  const [f, setF] = useState<api.Filters>({});
  const [q, setQ] = useState("");
  const [showF, setShowF] = useState(false);
  const [view, setView] = useState<"agenda" | "month">(typeof window !== "undefined" && window.innerWidth >= 768 ? "month" : "agenda");
  const [sort, setSort] = useState("date_asc");
  const [page, setPage] = useState(0);
  const [tot, setTot] = useState<api.Totals | null>(null);
  const [data, setData] = useState<{ rows: Occ[]; total: number } | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const b = periodBounds(kind, ref, custom);
  const filters = useMemo(() => ({ ...f, q: q.trim() || undefined }), [f, q]);
  const nActive = Object.values(f).filter(Boolean).length;
  const size = mode === "table" ? 25 : 500;
  useEffect(() => { setPage(0); }, [kind, ref, custom.from, custom.to, base, filters, sort]);
  useEffect(() => {
    if (b.to < b.from) return;
    setTot(null); setData(null);
    const t = setTimeout(() => {
      Promise.all([api.periodTotals(companyId, b.from, b.to, base, filters), api.listOcc(companyId, b.from, b.to, base, filters, sort, size, page * size)])
        .then(([t, l]) => { setTot(t); setData(l); }).catch((e) => toast({ title: "Erreur", description: e.message, variant: "destructive" }));
    }, 200);
    return () => clearTimeout(t);
  }, [companyId, rev, b.from, b.to, base, filters, sort, page, size]); // eslint-disable-line react-hooks/exhaustive-deps
  const shift = (dir: number) => {
    const { y, m } = parse(ref);
    if (kind === "day") setRef(addDays(ref, dir)); else if (kind === "week") setRef(addDays(ref, 7 * dir));
    else { const step = { month: 1, quarter: 3, half: 6, year: 12 }[kind as "month"] ?? 1; const n = addMonths(y, m, step * dir); setRef(ymd(n.y, n.m, 1)); }
  };
  const byDay = useMemo(() => { const g = new Map<string, Occ[]>(); (data?.rows ?? []).forEach((o) => g.set(o.ref_date, [...(g.get(o.ref_date) ?? []), o])); return g; }, [data]);
  const [picked, setPicked] = useState<Occ[]>([]);
  const pickErr = new Set(picked.map((o) => o.payee_key)).size > 1 ? "Bénéficiaires différents : préparez des règlements distincts." : null;

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Période" className={sel} value={kind} onChange={(e) => setKind(e.target.value as PeriodKind)}>{Object.entries(PERIOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      {kind === "custom" ? <><Input type="date" aria-label="Du" className="w-40" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /><Input type="date" aria-label="Au" className="w-40" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></>
        : <><Button variant="outline" size="icon" aria-label="Période précédente" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button><Input type="date" aria-label="Date de référence" className="w-40" value={ref} onChange={(e) => e.target.value && setRef(e.target.value)} /><Button variant="outline" size="icon" aria-label="Période suivante" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button></>}
      <select aria-label="Base de calcul" className={sel} value={base} onChange={(e) => setBase(e.target.value as api.Base)}><option value="due">Par date d'échéance</option><option value="planned">Par date de paiement planifiée</option></select>
      <div className="ml-auto">{add}</div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Input placeholder="Rechercher (libellé, bénéficiaire, contrat)" aria-label="Recherche" className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
      <Button variant="outline" onClick={() => setShowF(!showF)}><SlidersHorizontal className="mr-1 h-4 w-4" />Filtres ({nActive})</Button>
      {mode === "calendar" ? <div className="flex gap-1"><Button variant={view === "agenda" ? "default" : "outline"} size="sm" onClick={() => setView("agenda")}><List className="mr-1 h-4 w-4" />Agenda</Button><Button variant={view === "month" ? "default" : "outline"} size="sm" onClick={() => setView("month")}><CalendarDays className="mr-1 h-4 w-4" />Mois</Button></div>
        : <select aria-label="Tri" className={sel} value={sort} onChange={(e) => setSort(e.target.value)}><option value="date_asc">Date croissante</option><option value="date_desc">Date décroissante</option><option value="amount_desc">Montant décroissant</option><option value="amount_asc">Montant croissant</option></select>}
    </div>
    {showF && <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-3">
      <Input placeholder="Fournisseur / bénéficiaire" value={f.payee ?? ""} onChange={(e) => setF({ ...f, payee: e.target.value || undefined })} />
      <select aria-label="Catégorie" className={sel} value={f.category_id ?? ""} onChange={(e) => setF({ ...f, category_id: e.target.value || undefined })}><option value="">Toutes catégories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select aria-label="Statut" className={sel} value={f.status ?? ""} onChange={(e) => setF({ ...f, status: (e.target.value || undefined) as any })}><option value="">Actives</option><option value="cancelled">Annulées</option><option value="all">Actives et annulées</option></select>
      <select aria-label="Qualité du montant" className={sel} value={f.quality ?? ""} onChange={(e) => setF({ ...f, quality: e.target.value || undefined })}><option value="">Confirmé, estimé ou à compléter</option><option value="confirmed">Confirmé</option><option value="estimated">Estimé</option><option value="unknown">À compléter</option></select>
      <select aria-label="Fréquence" className={sel} value={f.frequency ?? ""} onChange={(e) => setF({ ...f, frequency: e.target.value || undefined })}><option value="">Toutes les fréquences</option>{FREQ_FILTERS.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}</select>
      <select aria-label="Saison" className={sel} value={f.seasonal ?? ""} onChange={(e) => setF({ ...f, seasonal: e.target.value || undefined })}><option value="">Avec ou sans saison</option><option value="1">Saisonnières seulement</option><option value="0">Sans saison</option></select>
      <select aria-label="État du règlement" className={sel} value={f.settle ?? ""} onChange={(e) => setF({ ...f, settle: e.target.value || undefined })}><option value="">Tous états de règlement</option><option value="a_confirmer">Règlement à confirmer</option><option value="non_reglee">Non réglée</option><option value="partielle">Partiellement réglée</option><option value="reglee">Réglée</option><option value="late">En retard</option><option value="a_completer">À compléter</option></select>
      <select aria-label="Moyen de règlement" className={sel} value={f.method ?? ""} onChange={(e) => setF({ ...f, method: e.target.value || undefined })}><option value="">Tous moyens de règlement</option>{Object.entries(st.METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <div className="flex items-center gap-1 text-xs">Réglée du <Input type="date" aria-label="Règlement du" className="h-9" value={f.paid_from ?? ""} onChange={(e) => setF({ ...f, paid_from: e.target.value || undefined })} /> au <Input type="date" aria-label="Règlement au" className="h-9" value={f.paid_to ?? ""} onChange={(e) => setF({ ...f, paid_to: e.target.value || undefined })} /></div>
      <Button variant="ghost" onClick={() => setF({})}>Effacer les filtres</Button>
    </div>}
    {b.to < b.from ? <p className="text-sm text-destructive">La date de fin doit suivre la date de début.</p> : <TotalsCards t={tot} />}
    {!data ? <p className="text-sm text-muted-foreground">Chargement…</p> : data.total === 0 ? <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Aucune échéance pour cette période et ces filtres.</p> : <>
      {mode === "calendar" && data.total > data.rows.length && <p className="text-xs text-amber-700">Affichage limité aux {data.rows.length} premières échéances sur {data.total} ; les totaux ci-dessus couvrent toute la sélection. Réduisez la période pour tout voir.</p>}
      {mode === "calendar" && view === "month" ? <MonthGrid from={b.from} to={b.to} byDay={byDay} onDay={setDay} />
        : mode === "calendar" ? <div className="space-y-3">{[...byDay.entries()].map(([dte, list]) => <div key={dte}><p className="mb-1 font-display text-sm font-bold">{fmtDate(dte)}</p><div className="space-y-2">{list.map((o) => <OccRow key={o.id} o={o} onOpen={onOpen} />)}</div></div>)}</div>
        : <div className="space-y-2">
          {onPayMany && <div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">Sélection groupée (même bénéficiaire) : {picked.length} échéance(s)</span>
            {pickErr && <span className="text-destructive">{pickErr}</span>}
            <Button size="sm" disabled={!picked.length || !!pickErr} onClick={() => onPayMany(picked)}>Préparer un règlement groupé</Button>{picked.length > 0 && <Button size="sm" variant="ghost" onClick={() => setPicked([])}>Vider</Button>}</div>}
          {data.rows.map((o) => <OccRow key={o.id} o={o} onOpen={onOpen} pick={onPayMany ? { on: picked.some((x) => x.id === o.id), toggle: () => setPicked((l) => l.some((x) => x.id === o.id) ? l.filter((x) => x.id !== o.id) : [...l, o]) } : undefined} />)}
          <div className="flex items-center justify-between pt-2 text-sm"><span>{page * size + 1}–{Math.min((page + 1) * size, data.total)} sur {data.total}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</Button><Button variant="outline" size="sm" disabled={(page + 1) * size >= data.total} onClick={() => setPage(page + 1)}>Suivant</Button></div></div></div>}
    </>}
    {day && <Dialog open onOpenChange={() => setDay(null)}><DialogContent><DialogHeader><DialogTitle>{fmtDate(day)}</DialogTitle></DialogHeader><div className="space-y-2">{(byDay.get(day) ?? []).map((o) => <OccRow key={o.id} o={o} onOpen={(x) => { setDay(null); onOpen(x); }} />)}{!(byDay.get(day) ?? []).length && <p className="text-sm text-muted-foreground">Aucune échéance ce jour-là.</p>}</div></DialogContent></Dialog>}
  </div>;
}

function MonthGrid({ from, to, byDay, onDay }: { from: string; to: string; byDay: Map<string, Occ[]>; onDay: (d: string) => void }) {
  const months: { y: number; m: number }[] = [];
  let c = parse(from); const e = parse(to);
  for (let i = 0; i < 13 && (c.y * 12 + c.m <= e.y * 12 + e.m); i++) { months.push({ y: c.y, m: c.m }); const n = addMonths(c.y, c.m, 1); c = { ...n, d: 1 }; }
  return <div className="space-y-4">{months.map(({ y, m }) => {
    const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; const n = daysInMonth(y, m);
    return <div key={`${y}-${m}`}><p className="mb-1 font-display font-bold capitalize">{new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-CA", { timeZone: "UTC", month: "long", year: "numeric" })}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">{["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">{Array.from({ length: first }).map((_, i) => <span key={`e${i}`} />)}{Array.from({ length: n }).map((_, i) => {
        const d = ymd(y, m, i + 1); const list = (byDay.get(d) ?? []).filter((o) => o.status === "active"); const inR = d >= from && d <= to;
        const sum = list.reduce((s, o) => s + (o.amount ?? 0), 0); const unk = list.some((o) => o.amount_quality === "unknown");
        return <button key={d} disabled={!inR} onClick={() => onDay(d)} aria-label={`${fmtDate(d)} : ${list.length} échéance(s)`} className={`min-h-14 rounded border p-1 text-left text-[11px] ${inR ? "border-border bg-card hover:bg-secondary/50" : "border-transparent opacity-30"} ${list.length ? "ring-1 ring-primary/50" : ""}`}>
          <span className="block font-semibold">{i + 1}</span>{list.length > 0 && <span className="block truncate font-display font-bold">{sum ? fmtMoney(sum).replace(/\s?\$/, " $") : ""}{unk ? " +?" : ""}</span>}
        </button>;
      })}</div></div>;
  })}</div>;
}

const L = ({ l, children, className = "" }: { l: string; children: React.ReactNode; className?: string }) => <label className={`block text-sm ${className}`}><span className="mb-1 block text-xs text-muted-foreground">{l}</span>{children}</label>;
const RULE_KEYS = ["frequency", "interval_n", "weekdays", "month_day", "month_day2", "collision_policy", "feb29_policy", "short_month_policy", "seasons", "planned_shift", "schedule", "anchor_date", "end_date", "max_count", "amount", "amount_quality", "first_planned_date"];

/** Formulaire d'obligation (création, brouillon, modification) ou changement de règle d'une série active à partir d'une date. */
const DEFAULT_OBLIGATION = { frequency: "once", interval_n: 1, amount_quality: "confirmed", nature: "charge", planned_shift: "none", short_month_policy: "last_day", seasons: [] };
function ObligationForm({ companyId, companyName, id, init, cats, ruleChange, onClose, onSaved }: { companyId: string; companyName: string; id: string | null; init?: any; cats: { id: string; name: string }[]; ruleChange?: { effective: string }; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState<any>(init ?? DEFAULT_OBLIGATION);
  const [preset, setPreset] = useState<Preset>(toPreset(p.frequency, p.interval_n));
  const [unit, setUnit] = useState<"days" | "weeks" | "months">("days");
  const [status, setStatus] = useState<string>(init ? "draft" : "active");
  const [adv, setAdv] = useState(false);
  const [lk, setLk] = useState<Awaited<ReturnType<typeof api.lookups>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [eff, setEff] = useState(ruleChange?.effective ?? todayIn(TZ));
  const [pv, setPv] = useState<api.Preview | null>(null);
  const [pvErr, setPvErr] = useState<string | null>(null);
  const [seasonSmp, setSeasonSmp] = useState<{ start: string; end: string; dates: string[] }[]>([]);
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [impact, setImpact] = useState<Awaited<ReturnType<typeof api.changeRule>> | null>(null);
  // NAV-01 : brouillon d'une NOUVELLE obligation (compte + entreprise). Fermer la fenêtre le garde;
  // seul « Abandonner le brouillon » l'efface. Un brouillon ne crée aucune échéance ni paiement.
  const { user: me } = useAuthReady();
  const draftable = !id && !ruleChange && !init;
  const store = useDraft({
    id: draftable && me ? { module: "finances", form: "obligation", owner: me.id, company: companyId } : null,
    data: { p, preset, unit, adv },
    isEmpty: (d) => !d.p.label && (d.p.amount == null || d.p.amount === "") && !d.p.anchor_date && !d.p.payee_label && !d.p.notes,
    onRestore: (d) => { setP(d.p); setPreset(d.preset); setUnit(d.unit); setAdv(d.adv); },
  });
  const abandon = () => { store.discard(); setP(DEFAULT_OBLIGATION); setPreset(toPreset("once", 1)); setUnit("days"); setAdv(false); };
  const load = useCallback(() => {
    if (!id) return;
    api.obligation(id).then(async (o) => {
      const v = await api.versions(id); const last: any = v[v.length - 1]; setStatus(o.status);
      const x = { ...o, amount: last?.amount ?? "", amount_quality: last?.amount_quality ?? "unknown", seasons: o.seasons ?? [] };
      if (ruleChange) { x.amount_quality = "keep"; x.anchor_date = eff; }
      setP(x); setPreset(toPreset(o.frequency, o.interval_n)); if (o.frequency === "weekly" && ![1, 2, 4].includes(o.interval_n)) setUnit("weeks"); if (o.frequency === "monthly" && ![1, 2, 3, 4, 6].includes(o.interval_n)) setUnit("months");
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.lookups(companyId).then(setLk); load(); }, [companyId, load]);
  const locked = !!id && status !== "draft" && !ruleChange;
  const up = (k: string, v: unknown) => setP((x: any) => ({ ...x, [k]: v === "" ? null : v }));
  const setPr = (v: Preset, n = Number(p.interval_n || 2), u = unit) => { setPreset(v); setP((x: any) => ({ ...x, ...presetRule(v, n, u) })); };
  const rulePayload = useMemo(() => { const r: any = {}; RULE_KEYS.forEach((k) => (r[k] = p[k])); if (r.frequency === "once" || r.frequency === "schedule") { r.end_date = null; r.max_count = null; } return r; }, [p]);
  const anchor = p.frequency === "schedule" ? [...(p.schedule ?? [])].map((l: any) => l.date).filter(Boolean).sort()[0] : p.anchor_date;
  const per = period ?? (anchor ? { from: anchor, to: addDays(anchor, 364) } : null);

  // Aperçu serveur (même moteur que le calendrier et les totaux)
  useEffect(() => {
    if (locked || !per) { setPv(null); return; }
    const t = setTimeout(() => {
      const body = { ...rulePayload, amount_quality: rulePayload.amount_quality === "keep" ? "unknown" : rulePayload.amount_quality };
      api.preview(companyId, body, per.from, per.to).then((r) => { setPv(r); setPvErr(null); }).catch((e) => { setPv(null); setPvErr(e.message); });
      if ((body.seasons ?? []).length && body.anchor_date) st.seasonSample(companyId, body).then(setSeasonSmp).catch(() => setSeasonSmp([])); else setSeasonSmp([]);
      if (ruleChange && id) api.changeRule(id, p.rev ?? null, rulePayload, eff, true).then(setImpact).catch((e) => { setImpact(null); setPvErr(e.message); });
    }, 350);
    return () => clearTimeout(t);
  }, [JSON.stringify(rulePayload), per?.from, per?.to, eff, locked]); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (e: any) => { if (String(e.message).startsWith("Conflit")) setConflict(e.message); else toast({ title: "Non enregistré", description: e.message, variant: "destructive" }); };
  const save = async (force = false) => {
    if (!p.label?.trim()) return toast({ title: "Libellé requis", variant: "destructive" });
    if (p.frequency !== "schedule" && !p.anchor_date) return toast({ title: "Date d'échéance requise", variant: "destructive" });
    if (p.frequency !== "schedule" && !["unknown", "keep"].includes(p.amount_quality) && (p.amount === null || p.amount === undefined || p.amount === "")) return toast({ title: "Montant requis", description: "Saisissez un montant ou choisissez « À compléter ». Un montant manquant n'est pas zéro.", variant: "destructive" });
    if (Number(p.amount) < 0 || (p.schedule ?? []).some((l: any) => Number(l.amount) < 0)) return toast({ title: "Montant négatif refusé", variant: "destructive" });
    if (!locked && pvErr) return toast({ title: "Règle invalide", description: pvErr, variant: "destructive" });
    if (!id && !force && p.frequency !== "schedule") {
      const payee = p.payee_label || lk?.clients.find((c) => c.id === p.payee_client_id)?.name;
      const { rows } = await api.listOcc(companyId, addDays(p.anchor_date, -45), addDays(p.anchor_date, 45), "due", { q: p.label.trim() }, "date_asc", 20);
      const hit = rows.find((r) => r.label.toLowerCase() === p.label.trim().toLowerCase() && (!payee || r.payee === payee));
      if (hit) return setDup(`Une obligation « ${hit.label} » existe déjà près de cette date (${fmtDate(hit.due_date)}, ${fmtMoney(hit.amount)}). Deux contrats du même fournisseur restent possibles.`);
    }
    setBusy(true);
    try {
      if (ruleChange && id) {
        await api.changeRule(id, p.rev ?? null, rulePayload, eff, false);
        toast({ title: "Nouvelle règle appliquée", description: `À partir du ${fmtDate(eff)} ; les échéances antérieures sont conservées.` }); onSaved(); return;
      }
      const body = { ...p, amount: p.amount_quality === "unknown" ? null : Number(p.amount), status: status === "draft" && !init ? "active" : status === "draft" ? "draft" : "active" };
      if (id && status === "draft") body.status = "active";
      await api.saveObligation(companyId, id, body);
      if (draftable) store.finalize();
      toast({ title: id ? "Obligation modifiée" : "Obligation enregistrée" }); onSaved();
    } catch (e: any) { fail(e); } finally { setBusy(false); }
  };
  const lines: any[] = p.schedule ?? [];
  const setLine = (i: number, k: string, v: unknown) => up("schedule", lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const seasons: { from: string; to: string; restart?: boolean }[] = p.seasons ?? [];
  const showEnd = !["once", "schedule"].includes(p.frequency);
  const dis = locked;

  return <Dialog open onOpenChange={onClose}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>{ruleChange ? "Changer la règle à partir d'une date" : id ? "Modifier l'obligation" : init ? "Dupliquer (nouvelle date requise)" : "Ajouter une obligation"}</DialogTitle></DialogHeader>
    <p className="text-sm">Entreprise : <strong>{companyName}</strong></p>
    {draftable && <DraftStatusBar status={store.status} savedAt={store.savedAt} restored={!!store.restoredMeta} onDiscard={abandon} sync={store.sync} synced={store.synced} conflict={store.conflict} onUseServer={store.useServerVersion} onKeepLocal={store.keepLocalVersion} />}
    {conflict && <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm">{conflict}<div className="mt-2"><Button size="sm" variant="outline" onClick={() => { setConflict(null); load(); }}>Recharger l'état actuel</Button></div></div>}
    {ruleChange && <L l="La nouvelle règle s'applique à partir du (inclus)"><Input type="date" value={eff} onChange={(e) => { setEff(e.target.value); up("anchor_date", e.target.value); }} /></L>}
    <div className="grid gap-3 sm:grid-cols-2">
      {!ruleChange && <>
        <L l="Libellé *"><Input value={p.label ?? ""} onChange={(e) => up("label", e.target.value)} /></L>
        <L l="Fournisseur / bénéficiaire"><select className={`${sel} w-full`} value={p.payee_client_id ?? ""} onChange={(e) => up("payee_client_id", e.target.value)}><option value="">Saisie libre ci-dessous</option>{lk?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          {!p.payee_client_id && <Input className="mt-1" placeholder="Nom (sans créer de fiche CRM)" value={p.payee_label ?? ""} onChange={(e) => up("payee_label", e.target.value)} />}</L>
        <L l="Catégorie"><select className={`${sel} w-full`} value={p.category_id ?? ""} onChange={(e) => up("category_id", e.target.value)}><option value="">Aucune</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
      </>}
      <L l="Fréquence de paiement"><select aria-label="Fréquence de paiement" className={`${sel} w-full`} disabled={dis} value={preset} onChange={(e) => setPr(e.target.value as Preset, ["every_n_days", "every_n_years", "custom"].includes(e.target.value) ? Number(p.interval_n) > 1 ? Number(p.interval_n) : 2 : 1)}>{PRESETS.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}</select></L>
      {["every_n_days", "every_n_years", "custom"].includes(preset) && <L l={preset === "every_n_days" ? "Nombre de jours" : preset === "every_n_years" ? "Nombre d'années" : "Intervalle"}>
        <div className="flex gap-2"><Input type="number" min="1" disabled={dis} value={p.interval_n ?? ""} onChange={(e) => setPr(preset, Number(e.target.value))} />
          {preset === "custom" && <select aria-label="Unité" className={sel} disabled={dis} value={unit} onChange={(e) => { const u = e.target.value as "days"; setUnit(u); setPr(preset, Number(p.interval_n || 2), u); }}><option value="days">jours</option><option value="weeks">semaines</option><option value="months">mois</option></select>}</div></L>}
      {p.frequency !== "schedule" && <>
        {!["keep"].includes(p.amount_quality) || ruleChange ? <L l="Qualité du montant"><select aria-label="Qualité du montant" className={`${sel} w-full`} disabled={dis} value={p.amount_quality} onChange={(e) => up("amount_quality", e.target.value)}>{ruleChange && <option value="keep">Conserver les montants actuels</option>}<option value="confirmed">Confirmé</option><option value="estimated">Estimé</option><option value="unknown">À compléter</option></select></L> : null}
        {!["unknown", "keep"].includes(p.amount_quality) && <L l="Montant de chaque versement (CAD) *"><Input aria-label="Montant" type="number" min="0" step="0.01" inputMode="decimal" disabled={dis} value={p.amount ?? ""} onChange={(e) => up("amount", e.target.value)} /></L>}
        {!ruleChange && <L l={p.frequency === "once" ? "Date d'échéance *" : "Première échéance (ancrage) *"}><Input aria-label="Date d'échéance" type="date" disabled={dis} value={p.anchor_date ?? ""} onChange={(e) => up("anchor_date", e.target.value)} /></L>}
      </>}
      {p.frequency === "weekdays" && <div className="sm:col-span-2 text-sm"><span className="mb-1 block text-xs text-muted-foreground">Jours</span>
        <div className="flex flex-wrap gap-2">{DAYS.map((d, i) => <label key={d} className="flex items-center gap-1"><input type="checkbox" disabled={dis} checked={(p.weekdays ?? []).includes(i + 1)} onChange={(e) => up("weekdays", e.target.checked ? [...(p.weekdays ?? []), i + 1].sort() : (p.weekdays ?? []).filter((x: number) => x !== i + 1))} />{d}</label>)}
          <Button type="button" size="sm" variant="outline" disabled={dis} onClick={() => up("weekdays", [1, 2, 3, 4, 5])}>Lundi à vendredi</Button></div></div>}
      {p.frequency === "monthly" && <>
        <L l="Jour du mois (31 = dernier jour)"><Input type="number" min="1" max="31" disabled={dis} value={p.month_day ?? (p.anchor_date ? parse(p.anchor_date).d : "")} onChange={(e) => up("month_day", e.target.value)} /></L>
        <L l="Si le mois n'a pas ce jour"><select className={`${sel} w-full`} disabled={dis} value={p.short_month_policy ?? "last_day"} onChange={(e) => up("short_month_policy", e.target.value)}><option value="last_day">Dernier jour disponible</option><option value="skip">Sauter le mois sans ce jour</option></select></L>
      </>}
      {p.frequency === "twice_monthly" && <>
        <L l="Premier jour"><Input aria-label="Premier jour" type="number" min="1" max="31" disabled={dis} value={p.month_day ?? ""} onChange={(e) => up("month_day", e.target.value)} /></L>
        <L l="Second jour (31 = dernier jour du mois)"><Input aria-label="Second jour" type="number" min="1" max="31" disabled={dis} value={p.month_day2 ?? ""} onChange={(e) => up("month_day2", e.target.value)} /></L>
        {Math.min(Number(p.month_day || 0), Number(p.month_day2 || 0)) >= 29 && <L l="Si les deux jours tombent le même jour (mois court) *" className="sm:col-span-2"><select className={`${sel} w-full`} disabled={dis} value={p.collision_policy ?? ""} onChange={(e) => up("collision_policy", e.target.value)}><option value="">— Choisir —</option>{Object.entries(COLLISION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></L>}
      </>}
      {p.frequency === "yearly" && p.anchor_date?.slice(5) === "02-29" && <L l="Anniversaire du 29 février *" className="sm:col-span-2"><select className={`${sel} w-full`} disabled={dis} value={p.feb29_policy ?? ""} onChange={(e) => up("feb29_policy", e.target.value)}><option value="">— Choisir —</option>{Object.entries(FEB29_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></L>}
      {showEnd && <>
        <L l="Dernière échéance possible (incluse)"><Input aria-label="Date de fin" type="date" disabled={dis && false} value={p.end_date ?? ""} onChange={(e) => up("end_date", e.target.value)} /></L>
        <L l="ou nombre maximal de versements"><Input type="number" min="1" value={p.max_count ?? ""} onChange={(e) => up("max_count", e.target.value)} /></L>
      </>}
      {p.frequency !== "schedule" && <L l="Date de paiement planifiée"><select aria-label="Report de date planifiée" className={`${sel} w-full`} disabled={dis} value={p.planned_shift ?? "none"} onChange={(e) => up("planned_shift", e.target.value)}>{Object.entries(SHIFT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></L>}
    </div>
    {p.frequency === "schedule" && <div className="space-y-2 rounded-md border border-border p-2">
      <p className="text-xs text-muted-foreground">Chaque ligne est un versement distinct. Un montant variable reste estimé jusqu'à confirmation ; aucune indexation n'est ajoutée.</p>
      {lines.map((l, i) => <div key={l.id ?? i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1">
        <Input type="date" aria-label={`Date du versement ${i + 1}`} disabled={dis} value={l.date ?? ""} onChange={(e) => setLine(i, "date", e.target.value)} />
        <select className={sel} disabled={dis} value={l.quality ?? "confirmed"} onChange={(e) => setLine(i, "quality", e.target.value)}><option value="confirmed">Confirmé</option><option value="estimated">Estimé</option><option value="unknown">À compléter</option></select>
        {l.quality === "unknown" ? <span className="self-center text-xs text-muted-foreground">À compléter</span> : <Input type="number" min="0" step="0.01" aria-label={`Montant du versement ${i + 1}`} disabled={dis} value={l.amount ?? ""} onChange={(e) => setLine(i, "amount", e.target.value)} />}
        <Button type="button" size="sm" variant="ghost" disabled={dis} onClick={() => up("schedule", lines.filter((_, j) => j !== i))}>Retirer</Button>
      </div>)}
      <Button type="button" size="sm" variant="outline" disabled={dis} onClick={() => up("schedule", [...lines, { date: "", amount: "", quality: "confirmed" }])}>Ajouter un versement</Button>
    </div>}
    {!["once", "schedule"].includes(p.frequency) && <div className="space-y-1 rounded-md border border-border p-2 text-sm">
      <p className="text-xs text-muted-foreground">Saison(s) active(s) — facultatif. Hors saison, aucune échéance n'est générée. Une saison peut traverser le 31 décembre.</p>
      {seasons.length > 0 && <div className="space-y-1 text-xs">
        <label className="flex items-start gap-2"><input type="radio" disabled={dis} checked={!seasons.some((s) => s.restart)} onChange={() => up("seasons", seasons.map((s) => ({ from: s.from, to: s.to })))} /><span>Rythme continu : la cadence d'origine se poursuit, les dates hors saison sont exclues.</span></label>
        {["daily", "weekly", "monthly"].includes(p.frequency) && <label className="flex items-start gap-2"><input type="radio" disabled={dis} checked={seasons.some((s) => s.restart)} onChange={() => up("seasons", seasons.map((s) => ({ ...s, restart: true })))} /><span>Recommencer le rythme au début de chaque saison (le nombre maximal de versements porte sur toute la série).</span></label>}
      </div>}
      {seasons.map((s, i) => <div key={i} className="flex flex-wrap items-center gap-1">Du <Input className="w-24" placeholder="MM-JJ" aria-label="Début de saison" disabled={dis} value={s.from} onChange={(e) => up("seasons", seasons.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} /> au <Input className="w-24" placeholder="MM-JJ" aria-label="Fin de saison" disabled={dis} value={s.to} onChange={(e) => up("seasons", seasons.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} /><Button type="button" size="sm" variant="ghost" disabled={dis} onClick={() => up("seasons", seasons.filter((_, j) => j !== i))}>Retirer</Button></div>)}
      <Button type="button" size="sm" variant="outline" disabled={dis} onClick={() => up("seasons", [...seasons, { from: "11-01", to: "04-30" }])}>Ajouter une saison</Button>
    </div>}
    {locked && <p className="text-xs text-muted-foreground">Montant et règle de récurrence d'une série active : utilisez « Changer la règle à partir d'une date » ou « Suspendre » depuis une échéance, pour conserver l'historique.</p>}

    {!locked && (pv || pvErr) && <section aria-label="Aperçu" className="space-y-1 rounded-md border border-primary/40 bg-primary/5 p-2 text-sm">
      <p className="font-display font-bold">Aperçu avant enregistrement</p>
      {pvErr ? <p className="text-destructive" role="alert">{pvErr}</p> : pv && <>
        <p data-testid="phrase">{sentence(p)}</p>
        <ul className="text-xs text-muted-foreground">{policies(p).map((x) => <li key={x}>· {x}</li>)}</ul>
        <p className="text-xs">Prochaines échéances : {pv.next.length ? pv.next.map((d) => `${fmtDate(d.due)}${d.planned !== d.due ? ` (planifiée ${fmtDate(d.planned)})` : ""}`).join(" · ") : "aucune"}</p>
        {pv.collisions.length > 0 && <p className="text-xs text-amber-700">Les deux jours tombent le même jour dans ces mois : {[...pv.collisions].sort().map(monthFr).join(", ")} — choix retenu : {p.collision_policy ? COLLISION_LABEL[p.collision_policy] : "à choisir"}. Deux échéances distinctes gardent deux identités.</p>}
        {seasonSmp.length > 0 && <p className="text-xs" data-testid="saisons-apercu">Premières dates de deux saisons consécutives : {seasonSmp.map((s) => `${fmtDate(s.start)} → ${s.dates.map(fmtDate).join(", ") || "aucune"}`).join(" | ")}</p>}
        <div className="flex flex-wrap items-center gap-1 text-xs">Période de l'aperçu : <Input type="date" className="h-8 w-36" value={per?.from ?? ""} onChange={(e) => setPeriod({ from: e.target.value, to: per?.to ?? e.target.value })} /> au <Input type="date" className="h-8 w-36" value={per?.to ?? ""} onChange={(e) => setPeriod({ from: per?.from ?? e.target.value, to: e.target.value })} /> inclus</div>
        <p className="text-xs" data-testid="apercu-totaux"><strong>{pv.count} versement(s)</strong> · confirmé {fmtMoney(pv.confirmed)} · estimé {fmtMoney(pv.estimated)} · {pv.unknown_count} montant(s) à compléter</p>
        {ruleChange && impact && <div className="text-xs" data-testid="avant-apres"><p><strong>Avant / après au {fmtDate(eff)}</strong> — conservées (antérieures) : {impact.kept} · annulées de façon traçable : {Array.isArray(impact.cancelled) ? impact.cancelled.length : impact.cancelled}{impact.exceptions ? ` (dont ${impact.exceptions} exception(s) individuelle(s))` : ""} · nouvelles (12 mois) : {impact.new.length}</p>
          {Array.isArray(impact.cancelled) && impact.cancelled.length > 0 && <p>Annulées : {impact.cancelled.slice(0, 8).map((c: any) => fmtDate(c.due)).join(", ")}{impact.cancelled.length > 8 ? "…" : ""}</p>}
          <p>Nouvelles : {impact.new.slice(0, 8).map((c) => fmtDate(c.due)).join(", ")}{impact.new.length > 8 ? "…" : ""}</p></div>}
      </>}
    </section>}
    <p className="text-xs text-muted-foreground">Montant de trésorerie saisi tel quel : la ventilation TPS/TVQ n'est pas effectuée dans ce module. Montants prévus, pas des paiements effectués.</p>
    {!ruleChange && <button type="button" className="text-left text-sm font-semibold text-primary" onClick={() => setAdv(!adv)}>{adv ? "Masquer" : "Afficher"} les champs avancés</button>}
    {adv && !ruleChange && <div className="grid gap-3 sm:grid-cols-2">
      {p.frequency === "once" && <L l="Date de paiement planifiée (précise)"><Input type="date" disabled={locked} value={p.first_planned_date ?? ""} onChange={(e) => up("first_planned_date", e.target.value)} /></L>}
      <L l="Nature"><select className={`${sel} w-full`} value={p.nature} onChange={(e) => up("nature", e.target.value)}>{NATURES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></L>
      <L l="Contrat / référence fournisseur"><Input value={p.contract_ref ?? ""} onChange={(e) => up("contract_ref", e.target.value)} /></L>
      <L l="Moyen envisagé"><Input value={p.payment_method ?? ""} onChange={(e) => up("payment_method", e.target.value)} /></L>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={!!p.autopay_declared} onChange={(e) => up("autopay_declared", e.target.checked)} />Prélèvement déjà organisé chez le fournisseur</label>
      <L l="Début de service"><Input type="date" value={p.service_start ?? ""} onChange={(e) => up("service_start", e.target.value)} /></L>
      <L l="Fin de service"><Input type="date" value={p.service_end ?? ""} onChange={(e) => up("service_end", e.target.value)} /></L>
      <L l="Renouvellement du contrat (date)"><Input type="date" value={p.renewal_date ?? ""} onChange={(e) => up("renewal_date", e.target.value)} /></L>
      <L l="Fréquence de renouvellement (information seulement)"><select className={`${sel} w-full`} value={p.renewal_frequency ?? ""} onChange={(e) => up("renewal_frequency", e.target.value)}><option value="">Non précisée</option>{Object.entries(RENEWAL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></L>
      <p className="text-xs text-muted-foreground sm:col-span-2">Le renouvellement est distinct de la fréquence de paiement : il ne crée aucune nouvelle année de dette.</p>
      <L l="Préavis"><Input type="date" value={p.notice_date ?? ""} onChange={(e) => up("notice_date", e.target.value)} /></L>
      <L l="Camion"><select className={`${sel} w-full`} value={p.truck_id ?? ""} onChange={(e) => up("truck_id", e.target.value)}><option value="">Aucun</option>{lk?.trucks.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
      <L l="Chantier"><select className={`${sel} w-full`} value={p.project_id ?? ""} onChange={(e) => up("project_id", e.target.value)}><option value="">Aucun</option>{lk?.projects.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
      <div className="sm:col-span-2"><L l="Notes privées"><Textarea value={p.notes ?? ""} onChange={(e) => up("notes", e.target.value)} /></L></div>
    </div>}
    {dup && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm">{dup}<div className="mt-2 flex gap-2"><Button size="sm" onClick={() => { setDup(null); save(true); }}>Enregistrer quand même</Button><Button size="sm" variant="outline" onClick={() => setDup(null)}>Revoir</Button></div></div>}
    <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Annuler</Button><Button disabled={busy} onClick={() => save()}>{busy ? "Enregistrement…" : ruleChange ? "Appliquer la nouvelle règle" : "Enregistrer"}</Button></div>
  </DialogContent></Dialog>;
}

function OccurrenceDialog({ occ, canWrite, onClose, onChanged, onEdit, onRuleChange, onDuplicate, onPay, onOpenPayment }: { occ: Occ; canWrite: boolean; onClose: () => void; onChanged: () => void; onEdit: (id: string) => void; onRuleChange: (id: string, effective: string) => void; onDuplicate: (init: any) => void; onPay: (o: Occ) => void; onOpenPayment: (id: string) => void }) {
  const [o, setO] = useState(occ);
  const [hist, setHist] = useState<any[]>([]);
  const [vers, setVers] = useState<any[]>([]);
  const [mode, setMode] = useState<null | "amount" | "planned" | "cancel" | "archive" | "pause">(null);
  const [pz, setPz] = useState({ start: "", end: "", reason: "" });
  const [pzImpact, setPzImpact] = useState<{ due: string; amount: number | null }[] | null>(null);
  const [pzs, setPzs] = useState<Awaited<ReturnType<typeof api.pauses>>>([]);
  const [scope, setScope] = useState<"this" | "following">("this");
  const [amt, setAmt] = useState<string>(occ.amount?.toString() ?? "");
  const [ql, setQl] = useState<string>(occ.amount_quality);
  const [impact, setImpact] = useState<{ count: number; dates?: string[] } | null>(null);
  const [planned, setPlanned] = useState(occ.planned_date);
  const [reason, setReason] = useState("");
  const [eff, setEff] = useState(todayIn(TZ));
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [lift, setLift] = useState<{ id: string; eff: string; reason: string } | null>(null);
  const [liftPv, setLiftPv] = useState<Awaited<ReturnType<typeof st.liftPause>> | null>(null);
  const load = () => {
    api.history(o.obligation_id).then(setHist); api.versions(o.obligation_id).then(setVers); api.pauses(o.obligation_id).then(setPzs);
    st.occDetail(o.id).then((d) => { setDetail(d); if (d?.occ) setO((x) => ({ ...x, ...d.occ })); }).catch(() => setDetail(null));
  };
  useEffect(() => { setPzImpact(null); if (mode === "pause" && pz.start && pz.end && pz.reason.trim()) api.addPause(o.obligation_id, pz.start, pz.end, pz.reason, true).then((r) => setPzImpact(r.affected)).catch((e) => toast({ title: "Suspension impossible", description: e.message, variant: "destructive" })); }, [mode, pz.start, pz.end, pz.reason, o.obligation_id]);
  useEffect(load, [o.obligation_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode === "amount" && canWrite) api.editAmount(o.id, scope, ql === "unknown" ? null : Number(amt || 0), ql, true).then(setImpact).catch(() => setImpact(null)); }, [mode, scope, amt, ql, o.id, canWrite]);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); toast({ title: msg }); setMode(null); onChanged(); onClose(); } catch (e: any) { toast({ title: "Non enregistré", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={onClose}><DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] overflow-y-auto overflow-x-hidden sm:max-w-lg [&>*]:min-w-0">
    <DialogHeader><DialogTitle>{o.label}</DialogTitle></DialogHeader>
    <dl className="grid grid-cols-2 gap-1 text-sm">
      <dt className="text-muted-foreground">Échéance contractuelle</dt><dd>{fmtDate(o.due_date)}</dd>
      <dt className="text-muted-foreground">Paiement planifié</dt><dd>{fmtDate(o.planned_date)}{o.planned_reason ? ` — ${o.planned_reason}` : ""}</dd>
      <dt className="text-muted-foreground">Montant</dt><dd>{fmtMoney(o.amount)} ({QUALITY_LABEL[o.amount_quality]})</dd>
      <dt className="text-muted-foreground">Fréquence (version d'origine)</dt><dd className="first-letter:uppercase">{occFreq(o)}{o.seasonal ? " (saisonnière)" : ""}{o.rule_frequency && o.rule_frequency !== o.frequency ? ` — règle actuelle : ${freqLabel(o.frequency, o.interval_n)}` : ""}</dd>
      {o.payee && <><dt className="text-muted-foreground">Bénéficiaire</dt><dd>{o.payee}</dd></>}
      {o.category && <><dt className="text-muted-foreground">Catégorie</dt><dd>{o.category}</dd></>}
      <dt className="text-muted-foreground">Statut</dt><dd>{o.status === "cancelled" ? `Annulée — ${o.cancel_reason}` : "Active"}</dd>
    </dl>
    {o.status === "active" && <section aria-label="Règlement" className="space-y-1 rounded-md border border-border p-2 text-sm">
      <div className="flex items-center justify-between"><p className="font-display font-bold">Règlement</p><SettleBadge o={o} /></div>
      <p>Montant initial {fmtMoney(o.amount)} · déclaré réglé {fmtMoney(o.paid ?? 0)} · <strong>solde {o.settle === "aucun" ? "—" : fmtMoney(o.balance ?? null)}</strong></p>
      {o.settle === "aucun" && <p className="text-xs">Aucun montant à régler.</p>}
      {o.settle === "a_completer" && <p className="text-xs">Montant à compléter : renseignez-le (« Modifier le montant ») avant d'enregistrer un règlement.</p>}
      {o.amount_quality === "estimated" && (o.paid ?? 0) > 0 && <p className="text-xs text-amber-700">Solde basé sur une estimation ; le versement ne confirme pas le coût final.</p>}
      {o.settle === "a_confirmer" && <p className="text-xs">Échéance antérieure à l'activation du suivi : son règlement extérieur est inconnu. Enregistrez le règlement s'il a eu lieu, ou confirmez qu'elle reste à payer.</p>}
      {detail?.allocations?.length > 0 && <ul className="text-xs">{detail.allocations.map((a: any) => <li key={a.id} className={a.reversed_at || a.pay_status !== "validated" ? "text-muted-foreground line-through" : ""}>
        <button className="text-primary underline" onClick={() => onOpenPayment(a.payment_id)}>{fmtDate(a.paid_on)} · {st.METHOD_LABEL[a.method]}</button> : {fmtMoney(Number(a.amount))}{a.reference ? ` · ${a.reference}` : ""}{Number(a.files) === 0 ? " · pièce manquante" : ""}{a.reversed_reason ? ` — ${a.reversed_reason}` : a.pay_status !== "validated" ? ` — ${st.PAY_STATUS[a.pay_status]}` : ""}</li>)}</ul>}
      {canWrite && !mode && <div className="flex flex-wrap gap-2">
        {["non_reglee", "partielle", "a_confirmer"].includes(o.settle ?? "") && <Button size="sm" onClick={() => onPay(o)}>Enregistrer un règlement</Button>}
        {o.settle === "a_confirmer" && <Button size="sm" variant="outline" onClick={() => run(() => st.confirmUnsettled(o.id), "Confirmée : reste à payer")}>Confirmer : toujours à payer</Button>}
      </div>}
      <p className="text-[11px] text-muted-foreground">Règlements déclarés — non rapprochés avec la banque. Ventilation TPS/TVQ non effectuée.</p>
    </section>}
    {canWrite && o.status === "active" && !mode && <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => setMode("amount")}>Modifier le montant</Button>
      <Button size="sm" variant="outline" onClick={() => setMode("planned")}>Déplacer la date planifiée</Button>
      <Button size="sm" variant="outline" onClick={() => setMode("cancel")}>Annuler cette échéance</Button>
    </div>}
    {canWrite && !mode && <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="ghost" onClick={() => onEdit(o.obligation_id)}>Modifier l'obligation</Button>
      <Button size="sm" variant="ghost" onClick={async () => { const ob = await api.obligation(o.obligation_id); const { id, business_event_ref, created_at, updated_at, created_by, status, archived_effective, anchor_date, first_planned_date, ...rest } = ob; onDuplicate({ ...rest, amount: o.amount ?? "", amount_quality: o.amount_quality, anchor_date: null }); }}>Dupliquer</Button>
      {o.frequency !== "once" && <>
        <Button size="sm" variant="ghost" onClick={() => onRuleChange(o.obligation_id, o.due_date >= todayIn(TZ) ? o.due_date : todayIn(TZ))}>Changer la règle à partir d'une date</Button>
        <Button size="sm" variant="ghost" onClick={() => setMode("pause")}>Suspendre une période future</Button>
        <Button size="sm" variant="ghost" onClick={() => setMode("archive")}>Archiver la série</Button></>}
    </div>}
    {mode === "amount" && <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex gap-3 text-sm"><label><input type="radio" checked={scope === "this"} onChange={() => setScope("this")} /> Cette échéance seulement</label>{o.frequency !== "once" && <label><input type="radio" checked={scope === "following"} onChange={() => setScope("following")} /> Celle-ci et les suivantes</label>}</div>
      <div className="flex gap-2"><select className={sel} value={ql} onChange={(e) => setQl(e.target.value)}><option value="confirmed">Confirmé</option><option value="estimated">Estimé</option><option value="unknown">À compléter</option></select>{ql !== "unknown" && <Input type="number" min="0" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} />}</div>
      {impact && <p className="text-xs">Impact : {impact.count} échéance(s){impact.dates?.length ? ` — ${impact.dates.slice(0, 6).map(fmtDate).join(", ")}${impact.dates.length > 6 ? "…" : ""}` : ""}. Les échéances passées déjà ajustées individuellement ne changent pas ; l'ancienne version est conservée.</p>}
      <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => { if (ql !== "unknown" && (amt === "" || Number(amt) < 0)) return toast({ title: "Montant invalide", variant: "destructive" }); run(() => api.editAmount(o.id, scope, ql === "unknown" ? null : Number(amt), ql), "Montant mis à jour"); }}>Confirmer</Button><Button size="sm" variant="outline" onClick={() => setMode(null)}>Retour</Button></div>
    </div>}
    {mode === "planned" && <div className="space-y-2 rounded-md border border-border p-3"><p className="text-xs">L'échéance contractuelle ({fmtDate(o.due_date)}) reste inchangée.</p><Input type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} /><div className="flex gap-2"><Button size="sm" disabled={busy || !planned} onClick={() => run(() => api.reschedule(o.id, planned), "Date planifiée déplacée")}>Confirmer</Button><Button size="sm" variant="outline" onClick={() => setMode(null)}>Retour</Button></div></div>}
    {mode === "cancel" && <div className="space-y-2 rounded-md border border-border p-3"><Textarea placeholder="Motif de l'annulation (obligatoire)" value={reason} onChange={(e) => setReason(e.target.value)} /><div className="flex gap-2"><Button size="sm" variant="destructive" disabled={busy || !reason.trim()} onClick={() => run(() => api.cancelOcc(o.id, reason), "Échéance annulée (conservée dans l'historique)")}>Annuler l'échéance</Button><Button size="sm" variant="outline" onClick={() => setMode(null)}>Retour</Button></div></div>}
    {mode === "archive" && <div className="space-y-2 rounded-md border border-border p-3"><p className="text-xs">Arrête les échéances à partir de cette date. Les échéances antérieures sont conservées.</p><Input type="date" value={eff} onChange={(e) => setEff(e.target.value)} /><div className="flex gap-2"><Button size="sm" variant="destructive" disabled={busy || !eff} onClick={() => run(() => api.archiveObligation(o.obligation_id, eff), "Série archivée")}>Archiver</Button><Button size="sm" variant="outline" onClick={() => setMode(null)}>Retour</Button></div></div>}
    {mode === "pause" && <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <p className="text-xs">Les échéances passées restent dues ; celles qui ont un règlement déclaré sont conservées. Pendant la suspension, aucune échéance n'est générée ; à la reprise, l'ancrage d'origine est conservé et rien n'est rattrapé automatiquement.</p>
      <div className="grid grid-cols-2 gap-2"><Input type="date" aria-label="Début de suspension" value={pz.start} onChange={(e) => setPz({ ...pz, start: e.target.value })} /><Input type="date" aria-label="Fin de suspension" value={pz.end} onChange={(e) => setPz({ ...pz, end: e.target.value })} /></div>
      <Textarea placeholder="Motif (obligatoire)" value={pz.reason} onChange={(e) => setPz({ ...pz, reason: e.target.value })} />
      {pzImpact && <p className="text-xs" data-testid="pause-impact">Échéances touchées (conservées, annulées avec motif) : {pzImpact.length ? pzImpact.map((a) => `${fmtDate(a.due)} (${fmtMoney(a.amount)})`).join(", ") : "aucune"}</p>}
      <div className="flex gap-2"><Button size="sm" disabled={busy || !pzImpact} onClick={() => run(() => api.addPause(o.obligation_id, pz.start, pz.end, pz.reason, false), "Suspension enregistrée")}>Confirmer la suspension</Button><Button size="sm" variant="outline" onClick={() => setMode(null)}>Retour</Button></div>
    </div>}
    {pzs.length > 0 && <div><p className="font-display text-sm font-bold">Suspensions</p><ul className="space-y-1 text-xs">{pzs.map((z) => <li key={z.id}>Du {fmtDate(z.start_date)} au {fmtDate(z.end_date)} : {z.reason}{z.lifted_from ? ` — levée à partir du ${fmtDate(z.lifted_from)}${z.lift_reason ? ` (${z.lift_reason})` : ""}` : ""}
      {canWrite && !z.lifted_from && z.end_date >= todayIn(TZ) && <Button size="sm" variant="ghost" onClick={() => { setLift({ id: z.id, eff: todayIn(TZ) > z.start_date ? todayIn(TZ) : z.start_date, reason: "" }); setLiftPv(null); }}>Lever la suspension</Button>}</li>)}</ul></div>}
    {lift && <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <p className="text-xs">Seules les échéances supprimées par cette suspension, encore prévues par la règle applicable, sont restaurées. Annulations manuelles, changements de règle et autres suspensions restent en place. Aucun rattrapage des dates passées.</p>
      <Input type="date" aria-label="Reprise à partir du" value={lift.eff} onChange={(e) => setLift({ ...lift, eff: e.target.value })} />
      <Textarea placeholder="Motif (obligatoire)" value={lift.reason} onChange={(e) => setLift({ ...lift, reason: e.target.value })} />
      {liftPv && <p className="text-xs" data-testid="levee-apercu">Restaurées : {liftPv.restore.length ? liftPv.restore.map((r) => fmtDate(r.due)).join(", ") : "aucune"} · autres annulations conservées : {liftPv.kept_other}{liftPv.not_applicable.length ? ` · non restaurées (règle remplacée) : ${liftPv.not_applicable.map((r) => fmtDate(r.due)).join(", ")}` : ""}</p>}
      <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!lift.reason.trim()} onClick={() => st.liftPause(lift.id, lift.eff, lift.reason, true).then(setLiftPv).catch((e) => toast({ title: "Impossible", description: e.message, variant: "destructive" }))}>Aperçu</Button>
        <Button size="sm" disabled={busy || !liftPv} onClick={() => run(() => st.liftPause(lift.id, lift.eff, lift.reason, false), "Suspension levée")}>Confirmer la reprise</Button><Button size="sm" variant="ghost" onClick={() => setLift(null)}>Retour</Button></div>
    </div>}
    {vers.length > 1 && <div><p className="font-display text-sm font-bold">Versions du montant</p><ul className="text-xs">{vers.map((v, i) => <li key={i}>À partir du {fmtDate(v.effective_from)} : {fmtMoney(v.amount == null ? null : Number(v.amount))} ({QUALITY_LABEL[v.amount_quality as "confirmed"]})</li>)}</ul></div>}
    <div><p className="font-display text-sm font-bold">Historique</p><ul className="space-y-1 text-xs">{hist.map((h, i) => <li key={i}>{new Date(h.created_at).toLocaleString("fr-CA", { timeZone: TZ })} — {ACTIONS[h.action] ?? st.EVENT_LABEL[h.action] ?? h.action}{h.reason ? ` : ${h.reason}` : ""}{h.is_support ? " (assistance Vrac Québec)" : ""}</li>)}</ul></div>
  </DialogContent></Dialog>;
}

function Settings({ companyId, cats, canWrite, onChange }: { companyId: string; cats: Awaited<ReturnType<typeof api.categories>>; canWrite: boolean; onChange: () => void }) {
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const call = async (fn: () => Promise<any>, msg: string) => { try { const r = await fn(); if (r?.error) throw r.error; toast({ title: msg }); onChange(); } catch (e: any) { toast({ title: "Non enregistré", description: e.message?.includes("duplicate") ? "Cette catégorie existe déjà." : e.message, variant: "destructive" }); } };
  const supabase = sb;
  return <div className="space-y-4">
    <section className="rounded-md border border-border p-3 text-sm"><p className="font-display font-bold">Paramètres de l'entreprise</p><p>Devise : CAD · Fuseau : {TZ}</p><p className="text-xs text-muted-foreground">Seule la devise canadienne est prise en charge dans ce premier lot.</p></section>
    <section className="space-y-2"><p className="font-display font-bold">Catégories</p>
      {canWrite && <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Nouvelle catégorie" value={name} onChange={(e) => setName(e.target.value)} />
        <Button disabled={!name.trim()} onClick={() => call(() => supabase.from("fin_categories").insert({ company_id: companyId, name: name.trim() }), "Catégorie ajoutée").then(() => setName(""))}>Ajouter</Button>
        <Button variant="outline" onClick={() => call(() => api.seedCategories(companyId).then((n) => ({ n })), "Catégories suggérées ajoutées (sans doublon)")}>Ajouter les catégories suggérées</Button>
      </div>}
      {cats.length === 0 ? <p className="text-sm text-muted-foreground">Aucune catégorie. Ajoutez les vôtres ou les catégories suggérées (sans montant ni taux de taxe).</p> :
        <ul className="divide-y divide-border rounded-md border border-border">{cats.map((c) => <li key={c.id} className="flex items-center justify-between gap-2 p-2 text-sm">
          {edit?.id === c.id ? <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /> : <span className={c.archived_at ? "text-muted-foreground line-through" : ""}>{c.name}{c.is_suggested ? " · suggérée" : ""}</span>}
          {canWrite && <div className="flex gap-1">
            {edit?.id === c.id ? <Button size="sm" onClick={() => call(() => supabase.from("fin_categories").update({ name: edit.name.trim(), updated_at: new Date().toISOString() }).eq("id", c.id), "Catégorie renommée").then(() => setEdit(null))}>OK</Button> : <Button size="sm" variant="ghost" onClick={() => setEdit({ id: c.id, name: c.name })}>Renommer</Button>}
            <Button size="sm" variant="ghost" onClick={() => call(() => supabase.from("fin_categories").update({ archived_at: c.archived_at ? null : new Date().toISOString() }).eq("id", c.id), c.archived_at ? "Catégorie réactivée" : "Catégorie archivée")}>{c.archived_at ? "Réactiver" : "Archiver"}</Button>
          </div>}
        </li>)}</ul>}
    </section>
  </div>;
}
