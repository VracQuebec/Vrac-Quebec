// FIN-04 — « Moyennes et équivalents » : répartit un budget, ne crée aucune échéance ni écriture.
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import * as api from "@/lib/finances/api";
import { addDays, fmtDate, fmtMoney, todayIn } from "@/lib/finances/period";
import { annualEquivalents, freeAverages } from "@/lib/finances/query";

const TZ = "America/Toronto";
const sel = "h-10 rounded-md border border-input bg-background px-2 text-sm";
const NATURES: [string, string][] = [["charge", "Charge à prévoir"], ["dette", "Dette (remboursement)"], ["taxe", "Taxe"], ["actif", "Actif"], ["depot", "Dépôt"], ["transfert", "Transfert"]];

export default function Averages({ companyId, cats }: { companyId: string; cats: { id: string; name: string }[] }) {
  const today = todayIn(TZ);
  const [mode, setMode] = useState<"A" | "B">("A");
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [range, setRange] = useState({ from: today, to: addDays(today, 29) });
  const [natures, setNatures] = useState<string[]>(["charge"]);
  const [catIds, setCatIds] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [t, setT] = useState<api.Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const from = mode === "A" ? `${year}-01-01` : range.from;
  const to = mode === "A" ? `${year}-12-31` : range.to;
  useEffect(() => {
    if (to < from) return;
    setT(null); setError(null);
    const f: Record<string, unknown> = { natures };
    if (catIds.length) f.category_ids = catIds;
    if (q.trim()) f.q = q.trim();
    const h = setTimeout(() => api.periodTotals(companyId, from, to, "due", f as any).then(setT).catch((e) => setError(e.message)), 250);
    return () => clearTimeout(h);
  }, [companyId, from, to, JSON.stringify(natures), JSON.stringify(catIds), q]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = t ? { confirmed: t.confirmed, estimated: t.estimated, unknown_count: t.unknown_count, count: t.count } : null;
  const A = input && mode === "A" ? annualEquivalents(year, input) : null;
  const B = input && mode === "B" ? freeAverages(from, to, input) : null;
  const R = A ?? B;
  const tog = (l: string[], v: string, set: (x: string[]) => void) => set(l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  const row = (l: string, v: number, id: string) => <div key={id} className="flex items-center justify-between border-b border-border py-1.5 text-sm last:border-0"><span>{l}</span><strong className="font-display" data-testid={`avg-${id}`}>{R?.allUnknown ? "Inconnu" : fmtMoney(v)}</strong></div>;

  return <div className="space-y-4">
    <div className="rounded-md border border-border bg-card p-3 text-sm">
      <p className="font-display font-bold">Moyenne des montants planifiés</p>
      <p className="text-xs text-muted-foreground">Ce calcul répartit un budget ; il ne déplace pas les échéances et ne crée aucun paiement ni écriture comptable. Ce n'est ni un bénéfice, ni une charge comptable exacte. Un contrat couvrant une autre période de service demande une méthode d'étalement distincte, non fournie ici.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <button onClick={() => setMode("A")} aria-pressed={mode === "A"} className={`rounded-md border px-3 py-2 text-sm ${mode === "A" ? "border-primary bg-primary/10 font-semibold" : "border-border"}`}>A — Budget d'une année civile</button>
      <button onClick={() => setMode("B")} aria-pressed={mode === "B"} className={`rounded-md border px-3 py-2 text-sm ${mode === "B" ? "border-primary bg-primary/10 font-semibold" : "border-border"}`}>B — Moyenne sur une période libre</button>
    </div>
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {mode === "A" ? <label className="flex items-center gap-2">Année <Input type="number" aria-label="Année" className="w-28" min={2000} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value) || year)} /></label>
        : <>Du <Input type="date" aria-label="Du" className="w-40" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /> au <Input type="date" aria-label="Au" className="w-40" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></>}
      <Input placeholder="Filtrer par libellé ou fournisseur" aria-label="Recherche" className="w-60" value={q} onChange={(e) => setQ(e.target.value)} />
    </div>
    <div><p className="mb-1 text-xs font-semibold">Natures incluses</p><div className="flex flex-wrap gap-1">{NATURES.map(([v, l]) => <button key={v} aria-pressed={natures.includes(v)} onClick={() => tog(natures, v, setNatures)} className={`rounded-full border px-2 py-0.5 text-xs ${natures.includes(v) ? "border-primary bg-primary/15" : "border-border"}`}>{l}</button>)}</div>
      <p className="mt-1 text-[11px] text-muted-foreground">Remboursements de capital, actifs, taxes et transferts ne sont pas tous des charges : incluez-les seulement si c'est voulu.</p></div>
    {cats.length > 0 && <div><p className="mb-1 text-xs font-semibold">Catégories (aucune choisie = toutes)</p><div className="flex flex-wrap gap-1">{cats.map((c) => <button key={c.id} aria-pressed={catIds.includes(c.id)} onClick={() => tog(catIds, c.id, setCatIds)} className={`rounded-full border px-2 py-0.5 text-xs ${catIds.includes(c.id) ? "border-primary bg-primary/15" : "border-border"}`}>{c.name}</button>)}</div></div>}
    {to < from ? <p className="text-sm text-destructive">La date de fin doit suivre la date de début.</p> : error ? <p className="text-sm text-destructive">{error}</p> : !t || !R ? <p className="text-sm text-muted-foreground">Calcul…</p> : <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-md border border-border bg-card p-3 text-sm">
        <p className="text-xs text-muted-foreground">Base : échéances contractuelles du {fmtDate(from)} au {fmtDate(to)} inclus — {R.D} jours</p>
        <p className="mt-1">Total planifié connu (T) : <strong data-testid="avg-total">{fmtMoney(R.T)}</strong></p>
        <p className="text-xs">dont confirmé {fmtMoney(t.confirmed)} · estimé {fmtMoney(t.estimated)}</p>
        <p className="text-xs">{t.count} échéance(s) retenue(s) · <strong>{t.unknown_count}</strong> montant(s) inconnu(s), exclus de T</p>
        {R.allUnknown && <p className="mt-1 text-xs text-destructive">Tous les montants sont inconnus : le résultat n'est pas un coût nul.</p>}
        {t.count === 0 && <p className="mt-1 text-xs text-muted-foreground">Aucune échéance dans cette sélection.</p>}
      </div>
      <div className="rounded-md border border-border bg-card p-3">
        {row("Par jour (T ÷ D)", R.day, "day")}
        {row("Par semaine (T × 7 ÷ D)", R.week, "week")}
        {row("Par deux semaines (T × 14 ÷ D)", R.two_weeks, "two_weeks")}
        {A && <>{row("Par mois (T ÷ 12)", A.month, "month")}{row("Par trimestre (T ÷ 4)", A.quarter, "quarter")}{row("Par six mois (T ÷ 2)", A.half, "half")}{row("Par année (T)", A.year, "year")}</>}
        <p className="mt-2 text-[11px] text-muted-foreground">{A ? "Équivalents de répartition, pas les sommes dues dans chaque vraie semaine ou chaque vrai mois : consultez le calendrier pour les périodes réelles." : "Aucune extrapolation annuelle : les équivalents mensuels, trimestriels et annuels sont dans le mode A."}</p>
      </div>
    </div>}
  </div>;
}
