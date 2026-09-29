// FIN-01 — Finances : obligations à payer et calendrier.
// Une obligation prévoit un montant ; ce n'est pas un paiement bancaire.
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { PERIOD_LABELS, QUALITY_LABEL, addDays, addMonths, daysInMonth, fmtDate, fmtMoney, parse, periodBounds, previewMonthly, todayIn, ymd, type Occ, type PeriodKind } from "@/lib/finances/period";

type Tab = "apercu" | "calendrier" | "apayer" | "parametres";
const TABS: { v: Tab; l: string }[] = [{ v: "apercu", l: "Vue d'ensemble" }, { v: "calendrier", l: "Calendrier" }, { v: "apayer", l: "À payer" }, { v: "parametres", l: "Paramètres" }];
const sel = "h-10 rounded-md border border-input bg-background px-2 text-sm";
const TZ = "America/Toronto";
const NATURES = [["charge", "Charge à prévoir"], ["dette", "Dette"], ["taxe", "Taxe"], ["actif", "Actif"], ["depot", "Dépôt"], ["transfert", "Transfert"]];
const ACTIONS: Record<string, string> = { create: "Création", update: "Modification", amount_this: "Montant modifié (cette échéance)", amount_following: "Montant modifié (échéances suivantes)", reschedule: "Date planifiée déplacée", cancel: "Échéance annulée", archive: "Série archivée" };

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
            <Finance key={companyId} companyId={companyId} companyName={company?.name ?? ""} tab={tab} canWrite={canWrite} />
          </>}
      </div>
    </EntrepreneurAppShell>
  );
}

function Finance({ companyId, companyName, tab, canWrite }: { companyId: string; companyName: string; tab: Tab; canWrite: boolean }) {
  const [rev, setRev] = useState(0);
  const [form, setForm] = useState<{ id: string | null; init?: any } | null>(null);
  const [occ, setOcc] = useState<Occ | null>(null);
  const [cats, setCats] = useState<Awaited<ReturnType<typeof api.categories>>>([]);
  const refresh = useCallback(() => setRev((r) => r + 1), []);
  useEffect(() => { api.categories(companyId).then(setCats); }, [companyId, rev]);
  const add = canWrite ? <Button onClick={() => setForm({ id: null })}><Plus className="mr-1 h-4 w-4" />Ajouter une obligation</Button> : null;
  return <>
    {tab === "apercu" && <Overview companyId={companyId} rev={rev} add={add} onOpen={setOcc} />}
    {tab === "calendrier" && <Browse companyId={companyId} rev={rev} cats={cats} mode="calendar" add={add} onOpen={setOcc} />}
    {tab === "apayer" && <Browse companyId={companyId} rev={rev} cats={cats} mode="table" add={add} onOpen={setOcc} />}
    {tab === "parametres" && <Settings companyId={companyId} cats={cats} canWrite={canWrite} onChange={refresh} />}
    {form && <ObligationForm companyId={companyId} companyName={companyName} id={form.id} init={form.init} cats={cats.filter((c) => !c.archived_at)} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
    {occ && <OccurrenceDialog occ={occ} canWrite={canWrite} onClose={() => setOcc(null)} onChanged={refresh}
      onEdit={(id) => { setOcc(null); setForm({ id }); }} onDuplicate={(init) => { setOcc(null); setForm({ id: null, init }); }} />}
  </>;
}

function TotalsCards({ t }: { t: api.Totals | null }) {
  if (!t) return <p className="text-sm text-muted-foreground">Calcul…</p>;
  const c = [["Total confirmé", fmtMoney(t.confirmed)], ["Total estimé", fmtMoney(t.estimated)], ["Total connu", fmtMoney(t.known)], ["Montants à compléter", String(t.unknown_count)], ["Échéances retenues", String(t.count)]];
  return <div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{c.map(([l, v]) => <div key={l} className="rounded-md border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="font-display text-lg font-bold" data-testid={`tot-${l}`}>{v}</p></div>)}</div>
    <p className="mt-1 text-xs text-muted-foreground">Du {fmtDate(t.from)} au {fmtDate(t.to)} inclus · base : {t.base === "planned" ? "date de paiement planifiée" : "date d'échéance"} · fuseau {TZ}. Montants prévus : ni bénéfice, ni charge comptable, ni preuve de paiement.</p>
  </div>;
}

function OccRow({ o, onOpen }: { o: Occ; onOpen: (o: Occ) => void }) {
  return <button onClick={() => onOpen(o)} className={`flex w-full items-center justify-between gap-3 rounded-md border border-border bg-card p-3 text-left hover:bg-secondary/50 ${o.status === "cancelled" ? "opacity-60" : ""}`}>
    <div className="min-w-0"><p className="truncate font-display text-sm font-semibold">{o.label}{o.status === "cancelled" && " — annulée"}</p>
      <p className="truncate text-xs text-muted-foreground">{fmtDate(o.ref_date)}{o.payee ? ` · ${o.payee}` : ""}{o.category ? ` · ${o.category}` : ""}{o.frequency === "monthly" ? " · mensuelle" : ""}{o.planned_override ? ` · planifiée le ${fmtDate(o.planned_date)}` : ""}</p></div>
    <div className="text-right"><p className="font-display text-sm font-bold">{fmtMoney(o.amount)}</p><p className="text-[11px] text-muted-foreground">{QUALITY_LABEL[o.amount_quality]}</p></div>
  </button>;
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
      {card("Échéances passées (24 derniers mois)", d.past, "Le règlement n'est pas suivi dans ce module : ces montants ne sont pas forcément impayés.")}
      {card("7 prochains jours", d.w)}
      {card("30 prochains jours", d.m)}
    </div>
    <section><h2 className="mb-2 font-display font-bold">Prochaines échéances</h2>
      {!d.next ? <p className="text-sm text-muted-foreground">Chargement…</p> : d.next.length === 0 ? <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Aucune obligation à venir. Ajoutez votre première obligation (assurance, logiciel, location…) avec « Ajouter une obligation » : elle apparaîtra ici et dans le calendrier.</p>
        : <div className="space-y-2">{d.next.map((o) => <OccRow key={o.id} o={o} onOpen={onOpen} />)}</div>}
    </section>
  </div>;
}

function Browse({ companyId, rev, cats, mode, add, onOpen }: { companyId: string; rev: number; cats: { id: string; name: string }[]; mode: "calendar" | "table"; add: React.ReactNode; onOpen: (o: Occ) => void }) {
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
      <select aria-label="Fréquence" className={sel} value={f.frequency ?? ""} onChange={(e) => setF({ ...f, frequency: e.target.value || undefined })}><option value="">Ponctuelle ou mensuelle</option><option value="once">Ponctuelle</option><option value="monthly">Mensuelle</option></select>
      <Button variant="ghost" onClick={() => setF({})}>Effacer les filtres</Button>
    </div>}
    {b.to < b.from ? <p className="text-sm text-destructive">La date de fin doit suivre la date de début.</p> : <TotalsCards t={tot} />}
    {!data ? <p className="text-sm text-muted-foreground">Chargement…</p> : data.total === 0 ? <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Aucune échéance pour cette période et ces filtres.</p> : <>
      {mode === "calendar" && data.total > data.rows.length && <p className="text-xs text-amber-700">Affichage limité aux {data.rows.length} premières échéances sur {data.total} ; les totaux ci-dessus couvrent toute la sélection. Réduisez la période pour tout voir.</p>}
      {mode === "calendar" && view === "month" ? <MonthGrid from={b.from} to={b.to} byDay={byDay} onDay={setDay} />
        : mode === "calendar" ? <div className="space-y-3">{[...byDay.entries()].map(([dte, list]) => <div key={dte}><p className="mb-1 font-display text-sm font-bold">{fmtDate(dte)}</p><div className="space-y-2">{list.map((o) => <OccRow key={o.id} o={o} onOpen={onOpen} />)}</div></div>)}</div>
        : <div className="space-y-2">{data.rows.map((o) => <OccRow key={o.id} o={o} onOpen={onOpen} />)}
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

function ObligationForm({ companyId, companyName, id, init, cats, onClose, onSaved }: { companyId: string; companyName: string; id: string | null; init?: any; cats: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState<any>(init ?? { frequency: "once", amount_quality: "confirmed", nature: "charge" });
  const [status, setStatus] = useState<string>(init ? "draft" : "active");
  const [adv, setAdv] = useState(false);
  const [lk, setLk] = useState<Awaited<ReturnType<typeof api.lookups>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState<string | null>(null);
  useEffect(() => { api.lookups(companyId).then(setLk); if (id) api.obligation(id).then(async (o) => { const v = await api.versions(id); const last: any = v[v.length - 1]; setStatus(o.status); setP({ ...o, amount: last?.amount ?? "", amount_quality: last?.amount_quality ?? "unknown" }); }); }, [companyId, id]);
  const locked = !!id && status !== "draft";
  const up = (k: string, v: unknown) => setP((x: any) => ({ ...x, [k]: v === "" ? null : v }));
  const preview = p.frequency === "monthly" && p.anchor_date ? previewMonthly(p.anchor_date, Number(p.month_day || parse(p.anchor_date).d), 4, p.end_date) : [];
  const save = async (force = false) => {
    if (!p.label?.trim()) return toast({ title: "Libellé requis", variant: "destructive" });
    if (!p.anchor_date) return toast({ title: "Date d'échéance requise", variant: "destructive" });
    if (p.amount_quality !== "unknown" && (p.amount === null || p.amount === undefined || p.amount === "")) return toast({ title: "Montant requis", description: "Saisissez un montant ou choisissez « À compléter ». Un montant manquant n'est pas zéro.", variant: "destructive" });
    if (Number(p.amount) < 0) return toast({ title: "Montant négatif refusé", variant: "destructive" });
    if (!id && !force) {
      const payee = p.payee_label || lk?.clients.find((c) => c.id === p.payee_client_id)?.name;
      const { rows } = await api.listOcc(companyId, addDays(p.anchor_date, -45), addDays(p.anchor_date, 45), "due", { q: p.label.trim() }, "date_asc", 20);
      const hit = rows.find((r) => r.label.toLowerCase() === p.label.trim().toLowerCase() && (!payee || r.payee === payee));
      if (hit) return setDup(`Une obligation « ${hit.label} » existe déjà près de cette date (${fmtDate(hit.due_date)}, ${fmtMoney(hit.amount)}). Deux contrats du même fournisseur restent possibles.`);
    }
    setBusy(true);
    try {
      const body = { ...p, amount: p.amount_quality === "unknown" ? null : Number(p.amount), status: status === "draft" && !init ? "active" : status === "draft" ? "draft" : "active" };
      if (id && status === "draft") body.status = "active";
      await api.saveObligation(companyId, id, body);
      toast({ title: id ? "Obligation modifiée" : "Obligation enregistrée" }); onSaved();
    } catch (e: any) { toast({ title: "Non enregistré", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  };
  const L = ({ l, children }: { l: string; children: React.ReactNode }) => <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">{l}</span>{children}</label>;
  return <Dialog open onOpenChange={onClose}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>{id ? "Modifier l'obligation" : init ? "Dupliquer (nouvelle date requise)" : "Ajouter une obligation"}</DialogTitle></DialogHeader>
    <p className="text-sm">Entreprise : <strong>{companyName}</strong></p>
    <div className="grid gap-3 sm:grid-cols-2">
      <L l="Libellé *"><Input value={p.label ?? ""} onChange={(e) => up("label", e.target.value)} /></L>
      <L l="Fournisseur / bénéficiaire"><select className={`${sel} w-full`} value={p.payee_client_id ?? ""} onChange={(e) => up("payee_client_id", e.target.value)}><option value="">Saisie libre ci-dessous</option>{lk?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {!p.payee_client_id && <Input className="mt-1" placeholder="Nom (sans créer de fiche CRM)" value={p.payee_label ?? ""} onChange={(e) => up("payee_label", e.target.value)} />}</L>
      <L l="Catégorie"><select className={`${sel} w-full`} value={p.category_id ?? ""} onChange={(e) => up("category_id", e.target.value)}><option value="">Aucune</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
      <L l="Qualité du montant"><select className={`${sel} w-full`} disabled={locked} value={p.amount_quality} onChange={(e) => up("amount_quality", e.target.value)}><option value="confirmed">Confirmé</option><option value="estimated">Estimé</option><option value="unknown">À compléter</option></select></L>
      {p.amount_quality !== "unknown" && <L l="Montant total prévu (CAD) *"><Input type="number" min="0" step="0.01" inputMode="decimal" disabled={locked} value={p.amount ?? ""} onChange={(e) => up("amount", e.target.value)} /></L>}
      <L l="Fréquence"><select className={`${sel} w-full`} disabled={locked} value={p.frequency} onChange={(e) => up("frequency", e.target.value)}><option value="once">Ponctuelle</option><option value="monthly">Mensuelle</option></select></L>
      <L l={p.frequency === "monthly" ? "Première échéance *" : "Date d'échéance *"}><Input type="date" disabled={locked} value={p.anchor_date ?? ""} onChange={(e) => up("anchor_date", e.target.value)} /></L>
      {p.frequency === "monthly" && <>
        <L l="Jour du mois"><Input type="number" min="1" max="31" disabled={locked} value={p.month_day ?? (p.anchor_date ? parse(p.anchor_date).d : "")} onChange={(e) => up("month_day", e.target.value)} /></L>
        <L l="Dernière échéance (incluse)"><Input type="date" value={p.end_date ?? ""} onChange={(e) => up("end_date", e.target.value)} /></L>
        <L l="ou nombre d'échéances"><Input type="number" min="1" value={p.max_count ?? ""} onChange={(e) => up("max_count", e.target.value)} /></L>
      </>}
    </div>
    {locked && <p className="text-xs text-muted-foreground">Montant et règle de récurrence : modifiez-les depuis une échéance (« cette échéance » ou « celle-ci et les suivantes ») pour conserver l'historique.</p>}
    {preview.length > 0 && <p className="text-xs">Prochaines dates : {preview.map(fmtDate).join(" · ")} <span className="text-muted-foreground">(mois trop court : dernier jour du mois)</span></p>}
    <p className="text-xs text-muted-foreground">Montant de trésorerie saisi tel quel : la ventilation TPS/TVQ n'est pas effectuée dans ce module.</p>
    <button type="button" className="text-left text-sm font-semibold text-primary" onClick={() => setAdv(!adv)}>{adv ? "Masquer" : "Afficher"} les champs avancés</button>
    {adv && <div className="grid gap-3 sm:grid-cols-2">
      {p.frequency === "once" && <L l="Date de paiement planifiée"><Input type="date" disabled={locked} value={p.first_planned_date ?? ""} onChange={(e) => up("first_planned_date", e.target.value)} /></L>}
      <L l="Nature"><select className={`${sel} w-full`} value={p.nature} onChange={(e) => up("nature", e.target.value)}>{NATURES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></L>
      <L l="Contrat / référence fournisseur"><Input value={p.contract_ref ?? ""} onChange={(e) => up("contract_ref", e.target.value)} /></L>
      <L l="Moyen envisagé"><Input value={p.payment_method ?? ""} onChange={(e) => up("payment_method", e.target.value)} /></L>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={!!p.autopay_declared} onChange={(e) => up("autopay_declared", e.target.checked)} />Prélèvement déjà organisé chez le fournisseur</label>
      <L l="Début de service"><Input type="date" value={p.service_start ?? ""} onChange={(e) => up("service_start", e.target.value)} /></L>
      <L l="Fin de service"><Input type="date" value={p.service_end ?? ""} onChange={(e) => up("service_end", e.target.value)} /></L>
      <L l="Renouvellement"><Input type="date" value={p.renewal_date ?? ""} onChange={(e) => up("renewal_date", e.target.value)} /></L>
      <L l="Préavis"><Input type="date" value={p.notice_date ?? ""} onChange={(e) => up("notice_date", e.target.value)} /></L>
      <L l="Camion"><select className={`${sel} w-full`} value={p.truck_id ?? ""} onChange={(e) => up("truck_id", e.target.value)}><option value="">Aucun</option>{lk?.trucks.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
      <L l="Chantier"><select className={`${sel} w-full`} value={p.project_id ?? ""} onChange={(e) => up("project_id", e.target.value)}><option value="">Aucun</option>{lk?.projects.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
      <div className="sm:col-span-2"><L l="Notes privées"><Textarea value={p.notes ?? ""} onChange={(e) => up("notes", e.target.value)} /></L></div>
    </div>}
    {dup && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm">{dup}<div className="mt-2 flex gap-2"><Button size="sm" onClick={() => { setDup(null); save(true); }}>Enregistrer quand même</Button><Button size="sm" variant="outline" onClick={() => setDup(null)}>Revoir</Button></div></div>}
    <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Annuler</Button><Button disabled={busy} onClick={() => save()}>{busy ? "Enregistrement…" : "Enregistrer"}</Button></div>
  </DialogContent></Dialog>;
}

function OccurrenceDialog({ occ, canWrite, onClose, onChanged, onEdit, onDuplicate }: { occ: Occ; canWrite: boolean; onClose: () => void; onChanged: () => void; onEdit: (id: string) => void; onDuplicate: (init: any) => void }) {
  const [o, setO] = useState(occ);
  const [hist, setHist] = useState<any[]>([]);
  const [vers, setVers] = useState<any[]>([]);
  const [mode, setMode] = useState<null | "amount" | "planned" | "cancel" | "archive">(null);
  const [scope, setScope] = useState<"this" | "following">("this");
  const [amt, setAmt] = useState<string>(occ.amount?.toString() ?? "");
  const [ql, setQl] = useState<string>(occ.amount_quality);
  const [impact, setImpact] = useState<{ count: number; dates?: string[] } | null>(null);
  const [planned, setPlanned] = useState(occ.planned_date);
  const [reason, setReason] = useState("");
  const [eff, setEff] = useState(todayIn(TZ));
  const [busy, setBusy] = useState(false);
  const load = () => { api.history(o.obligation_id).then(setHist); api.versions(o.obligation_id).then(setVers); };
  useEffect(load, [o.obligation_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode === "amount" && canWrite) api.editAmount(o.id, scope, ql === "unknown" ? null : Number(amt || 0), ql, true).then(setImpact).catch(() => setImpact(null)); }, [mode, scope, amt, ql, o.id, canWrite]);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); toast({ title: msg }); setMode(null); onChanged(); onClose(); } catch (e: any) { toast({ title: "Non enregistré", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={onClose}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
    <DialogHeader><DialogTitle>{o.label}</DialogTitle></DialogHeader>
    <dl className="grid grid-cols-2 gap-1 text-sm">
      <dt className="text-muted-foreground">Échéance contractuelle</dt><dd>{fmtDate(o.due_date)}</dd>
      <dt className="text-muted-foreground">Paiement planifié</dt><dd>{fmtDate(o.planned_date)}</dd>
      <dt className="text-muted-foreground">Montant</dt><dd>{fmtMoney(o.amount)} ({QUALITY_LABEL[o.amount_quality]})</dd>
      <dt className="text-muted-foreground">Fréquence</dt><dd>{o.frequency === "monthly" ? "Mensuelle" : "Ponctuelle"}</dd>
      {o.payee && <><dt className="text-muted-foreground">Bénéficiaire</dt><dd>{o.payee}</dd></>}
      {o.category && <><dt className="text-muted-foreground">Catégorie</dt><dd>{o.category}</dd></>}
      <dt className="text-muted-foreground">Statut</dt><dd>{o.status === "cancelled" ? `Annulée — ${o.cancel_reason}` : "Active"}</dd>
    </dl>
    <p className="text-xs text-muted-foreground">Échéance prévue, pas un paiement. Règlement non suivi dans ce module. Ventilation TPS/TVQ non effectuée.</p>
    {canWrite && o.status === "active" && !mode && <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => setMode("amount")}>Modifier le montant</Button>
      <Button size="sm" variant="outline" onClick={() => setMode("planned")}>Déplacer la date planifiée</Button>
      <Button size="sm" variant="outline" onClick={() => setMode("cancel")}>Annuler cette échéance</Button>
    </div>}
    {canWrite && !mode && <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="ghost" onClick={() => onEdit(o.obligation_id)}>Modifier l'obligation</Button>
      <Button size="sm" variant="ghost" onClick={async () => { const ob = await api.obligation(o.obligation_id); const { id, business_event_ref, created_at, updated_at, created_by, status, archived_effective, anchor_date, first_planned_date, ...rest } = ob; onDuplicate({ ...rest, amount: o.amount ?? "", amount_quality: o.amount_quality, anchor_date: null }); }}>Dupliquer</Button>
      {o.frequency === "monthly" && <Button size="sm" variant="ghost" onClick={() => setMode("archive")}>Archiver la série</Button>}
    </div>}
    {mode === "amount" && <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex gap-3 text-sm"><label><input type="radio" checked={scope === "this"} onChange={() => setScope("this")} /> Cette échéance seulement</label>{o.frequency === "monthly" && <label><input type="radio" checked={scope === "following"} onChange={() => setScope("following")} /> Celle-ci et les suivantes</label>}</div>
      <div className="flex gap-2"><select className={sel} value={ql} onChange={(e) => setQl(e.target.value)}><option value="confirmed">Confirmé</option><option value="estimated">Estimé</option><option value="unknown">À compléter</option></select>{ql !== "unknown" && <Input type="number" min="0" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} />}</div>
      {impact && <p className="text-xs">Impact : {impact.count} échéance(s){impact.dates?.length ? ` — ${impact.dates.slice(0, 6).map(fmtDate).join(", ")}${impact.dates.length > 6 ? "…" : ""}` : ""}. Les échéances passées déjà ajustées individuellement ne changent pas ; l'ancienne version est conservée.</p>}
      <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => { if (ql !== "unknown" && (amt === "" || Number(amt) < 0)) return toast({ title: "Montant invalide", variant: "destructive" }); run(() => api.editAmount(o.id, scope, ql === "unknown" ? null : Number(amt), ql), "Montant mis à jour"); }}>Confirmer</Button><Button size="sm" variant="outline" onClick={() => setMode(null)}>Retour</Button></div>
    </div>}
    {mode === "planned" && <div className="space-y-2 rounded-md border border-border p-3"><p className="text-xs">L'échéance contractuelle ({fmtDate(o.due_date)}) reste inchangée.</p><Input type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} /><div className="flex gap-2"><Button size="sm" disabled={busy || !planned} onClick={() => run(() => api.reschedule(o.id, planned), "Date planifiée déplacée")}>Confirmer</Button><Button size="sm" variant="outline" onClick={() => setMode(null)}>Retour</Button></div></div>}
    {mode === "cancel" && <div className="space-y-2 rounded-md border border-border p-3"><Textarea placeholder="Motif de l'annulation (obligatoire)" value={reason} onChange={(e) => setReason(e.target.value)} /><div className="flex gap-2"><Button size="sm" variant="destructive" disabled={busy || !reason.trim()} onClick={() => run(() => api.cancelOcc(o.id, reason), "Échéance annulée (conservée dans l'historique)")}>Annuler l'échéance</Button><Button size="sm" variant="outline" onClick={() => setMode(null)}>Retour</Button></div></div>}
    {mode === "archive" && <div className="space-y-2 rounded-md border border-border p-3"><p className="text-xs">Arrête les échéances à partir de cette date. Les échéances antérieures sont conservées.</p><Input type="date" value={eff} onChange={(e) => setEff(e.target.value)} /><div className="flex gap-2"><Button size="sm" variant="destructive" disabled={busy || !eff} onClick={() => run(() => api.archiveObligation(o.obligation_id, eff), "Série archivée")}>Archiver</Button><Button size="sm" variant="outline" onClick={() => setMode(null)}>Retour</Button></div></div>}
    {vers.length > 1 && <div><p className="font-display text-sm font-bold">Versions du montant</p><ul className="text-xs">{vers.map((v, i) => <li key={i}>À partir du {fmtDate(v.effective_from)} : {fmtMoney(v.amount == null ? null : Number(v.amount))} ({QUALITY_LABEL[v.amount_quality as "confirmed"]})</li>)}</ul></div>}
    <div><p className="font-display text-sm font-bold">Historique</p><ul className="space-y-1 text-xs">{hist.map((h, i) => <li key={i}>{new Date(h.created_at).toLocaleString("fr-CA", { timeZone: TZ })} — {ACTIONS[h.action] ?? h.action}{h.reason ? ` : ${h.reason}` : ""}{h.is_support ? " (assistance Vrac Québec)" : ""}</li>)}</ul></div>
  </DialogContent></Dialog>;
}

function Settings({ companyId, cats, canWrite, onChange }: { companyId: string; cats: Awaited<ReturnType<typeof api.categories>>; canWrite: boolean; onChange: () => void }) {
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const db = (api as any) && (window as any);
  void db;
  const call = async (fn: () => Promise<any>, msg: string) => { try { const r = await fn(); if (r?.error) throw r.error; toast({ title: msg }); onChange(); } catch (e: any) { toast({ title: "Non enregistré", description: e.message?.includes("duplicate") ? "Cette catégorie existe déjà." : e.message, variant: "destructive" }); } };
  const { supabase } = require_supabase();
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

import { supabase as _sb } from "@/integrations/supabase/client";
function require_supabase() { return { supabase: _sb as any }; }
