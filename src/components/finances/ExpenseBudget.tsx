// FIN-BUD — « Budget et échéances » : répond à « quoi payer, combien, quand », « payé / reste »
// et « dépassement du budget ». Lecture seule des obligations (fin_list) et budgets existants.
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import * as api from "@/lib/finances/api";
import * as ta from "@/lib/finances/treasuryApi";
import { addDays, addMonths, fmtDate, fmtMoney, parse, periodBounds, todayIn, ymd, type Occ } from "@/lib/finances/period";
import { PAY_STATUS_LABEL, budgetGap, byMonth, payStatus, summarize, type PayStatus } from "@/lib/finances/budgetSchedule";

const sel = "h-10 rounded-md border border-input bg-background px-2 text-sm";
const TZ = "America/Toronto";
const TONE: Record<PayStatus, string> = { a_venir: "bg-secondary text-secondary-foreground", a_payer: "bg-primary/15 text-foreground", paye: "bg-primary text-primary-foreground", en_retard: "bg-destructive text-destructive-foreground", annule: "bg-muted text-muted-foreground line-through" };

async function loadAll(c: string, from: string, to: string, f: api.Filters) {
  const rows: Occ[] = [];
  for (let off = 0; off < 5000; off += 500) { const r = await api.listOcc(c, from, to, "planned", f, "date_asc", 500, off); rows.push(...r.rows); if (rows.length >= r.total || !r.rows.length) break; }
  return rows;
}

export default function ExpenseBudget({ companyId, cats, rev, onOpen, canWrite = false }: { companyId: string; cats: { id: string; name: string }[]; rev: number; onOpen: (o: Occ) => void; canWrite?: boolean }) {
  const today = todayIn(TZ);
  // Saisie d'un budget mensuel par catégorie : même table fin_budgets que Trésorerie › Budgets (aucun doublon).
  const [nb, setNb] = useState({ cat: "", month: today.slice(0, 7), amount: "" });
  const [saving, setSaving] = useState(false);
  const [brev, setBrev] = useState(0);
  const addBudget = async () => {
    if (saving) return; setSaving(true);
    try {
      const [yy, mm] = nb.month.split("-").map(Number); const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
      await ta.insert("fin_budgets", { company_id: companyId, category_id: nb.cat || null, period_from: `${nb.month}-01`, period_to: `${nb.month}-${String(last).padStart(2, "0")}`, amount: Number(nb.amount) });
      toast({ title: "Budget enregistré" }); setNb({ ...nb, amount: "" }); setBrev((r) => r + 1);
    } catch (e: any) { toast({ title: "Refusé", description: e.message, variant: "destructive" }); } finally { setSaving(false); }
  };
  const [kind, setKind] = useState<"week" | "month" | "year">("month");
  const [ref, setRef] = useState(today);
  const [cat, setCat] = useState(""); const [payee, setPayee] = useState(""); const [stat, setStat] = useState<PayStatus | "">("");
  const [rows, setRows] = useState<Occ[] | null>(null);
  const [year, setYear] = useState<Occ[]>([]);
  const [ahead, setAhead] = useState<Occ[]>([]);
  const [buds, setBuds] = useState<{ b: ta.Budget; a: { paidC: number; remainC: number } }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const b = periodBounds(kind, ref);
  const f: api.Filters = { category_id: cat || undefined, q: payee || undefined, status: "all" };
  const y = parse(ref).y;
  const end6 = (() => { const t = parse(today); const e = addMonths(t.y, t.m, 6); return ymd(e.y, e.m, 1); })();

  useEffect(() => {
    let live = true; setRows(null); setError(null);
    Promise.all([loadAll(companyId, b.from, b.to, f), loadAll(companyId, ymd(y, 1, 1), ymd(y, 12, 31), f), loadAll(companyId, addDays(today, -365), addDays(end6, -1), f), ta.budgets(companyId)])
      .then(async ([r, yr, ah, bs]) => {
        if (!live) return;
        setRows(r); setYear(yr); setAhead(ah);
        const overl = bs.filter((x) => x.period_from <= b.to && x.period_to >= b.from && (!cat || x.category_id === cat));
        // Payé / reste rattachés aux ÉCHÉANCES de la période du budget (même base que le résumé) :
        // un règlement anticipé daté d'un autre mois n'est ni perdu ni compté deux fois.
        const withA = await Promise.all(overl.map(async (x) => { const occ = await loadAll(companyId, x.period_from, x.period_to, { category_id: x.category_id || undefined, status: "all" }); const sm = summarize(occ, today); return { b: x, a: { paidC: Math.round(sm.paid * 100), remainC: Math.round(sm.remaining * 100) } }; }));
        if (live) setBuds(withA);
      }).catch((e) => live && (setError(e.message), setRows([])));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, b.from, b.to, cat, payee, rev, brev, y]);

  const shown = useMemo(() => (rows ?? []).filter((r) => !stat || payStatus(r, today) === stat), [rows, stat, today]);
  const s = useMemo(() => summarize(rows ?? [], today), [rows, today]);
  const sy = useMemo(() => summarize(year, today), [year, today]);
  const open = ahead.filter((r) => r.status === "active" && payStatus(r, today) !== "paye");
  const late = open.filter((r) => payStatus(r, today) === "en_retard");
  const in7 = open.filter((r) => (r.ref_date || r.due_date) >= today && (r.ref_date || r.due_date) <= addDays(today, 7));
  const in30 = open.filter((r) => (r.ref_date || r.due_date) >= today && (r.ref_date || r.due_date) <= addDays(today, 30));
  const fc = byMonth(ahead.filter((r) => (r.ref_date || r.due_date) >= today.slice(0, 7) + "-01"));
  const budTotal = buds.reduce((t, x) => t + x.b.amount, 0);
  const budPaid = buds.reduce((t, x) => t + x.a.paidC / 100, 0);
  const budRemain = buds.reduce((t, x) => t + x.a.remainC / 100, 0);
  const gap = budgetGap(budTotal, budPaid, budRemain);
  const step = (d: number) => { const p = parse(ref); if (kind === "week") setRef(addDays(ref, 7 * d)); else if (kind === "month") { const m = addMonths(p.y, p.m, d); setRef(ymd(m.y, m.m, 1)); } else setRef(ymd(p.y + d, 1, 1)); };
  const sumOpen = (l: Occ[]) => l.reduce((t, r) => t + Math.max(0, r.balance ?? r.amount ?? 0), 0);

  const Card = ({ t, v, sub, warn }: { t: string; v: string; sub?: string; warn?: boolean }) => <div className={`rounded-md border p-3 ${warn ? "border-destructive" : "border-border"} bg-card`}><p className="text-xs text-muted-foreground">{t}</p><p className="font-display text-lg font-bold">{v}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div>;

  return <div className="space-y-4">
    <p className="text-xs text-muted-foreground">Prévision et suivi seulement : aucun paiement bancaire n'est déclenché. Une échéance n'est « payée » qu'après un règlement confirmé, même en prélèvement automatique.</p>
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-md border border-border" role="group" aria-label="Vue">{([["week", "Semaine"], ["month", "Mois"], ["year", "Année"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)} className={`px-3 py-2 text-sm ${kind === v ? "bg-primary text-primary-foreground" : ""}`}>{l}</button>)}</div>
      <div className="flex items-center gap-2">
        <button type="button" className={sel} aria-label="Période précédente" onClick={() => step(-1)}>‹</button>
        <span className="whitespace-nowrap text-sm font-semibold">{fmtDate(b.from)} – {fmtDate(b.to)}</span>
        <button type="button" className={sel} aria-label="Période suivante" onClick={() => step(1)}>›</button>
      </div>
    </div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <select aria-label="Catégorie" className={sel} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Toutes catégories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <Input aria-label="Fournisseur" placeholder="Fournisseur ou nom" value={payee} onChange={(e) => setPayee(e.target.value)} />
      <select aria-label="Statut" className={sel} value={stat} onChange={(e) => setStat(e.target.value as PayStatus | "")}><option value="">Tous statuts</option>{Object.entries(PAY_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    </div>
    {canWrite && <form className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3" onSubmit={(e) => { e.preventDefault(); addBudget(); }}>
      <p className="w-full text-sm font-semibold">Budget mensuel par catégorie</p>
      <select aria-label="Catégorie du budget mensuel" className={sel} value={nb.cat} onChange={(e) => setNb({ ...nb, cat: e.target.value })}><option value="">Toutes catégories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <Input aria-label="Mois du budget" type="month" className="w-40" value={nb.month} onChange={(e) => setNb({ ...nb, month: e.target.value })} />
      <Input aria-label="Montant du budget mensuel" type="number" inputMode="decimal" step="0.01" min="0" className="w-32" placeholder="Montant" value={nb.amount} onChange={(e) => setNb({ ...nb, amount: e.target.value })} />
      <Button type="submit" disabled={saving || !/^\d{4}-\d{2}$/.test(nb.month) || nb.amount === "" || !(Number(nb.amount) >= 0)}>{saving ? "Enregistrement…" : "Ajouter"}</Button>
    </form>}
    {error && <p className="text-sm text-destructive">{error}</p>}

    <section aria-label="Résumé" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Card t="Prévu sur la période" v={fmtMoney(s.planned)} sub={`Confirmé ${fmtMoney(s.confirmed)} · Estimé ${fmtMoney(s.estimated)}${s.unknown ? ` · ${s.unknown} à compléter` : ""}`} />
      <Card t="Payé (confirmé)" v={fmtMoney(s.paid)} />
      <Card t="Reste à payer" v={fmtMoney(s.remaining)} />
      <Card t="En retard (12 derniers mois)" v={fmtMoney(late.length ? sumOpen(late) : 0)} sub={`${late.length} échéance(s), toutes périodes confondues`} warn={late.length > 0} />
      <Card t={`Prévu ${y}`} v={fmtMoney(sy.planned)} sub={`Payé ${fmtMoney(sy.paid)} · Reste ${fmtMoney(sy.remaining)}`} />
      <Card t="7 prochains jours" v={fmtMoney(sumOpen(in7))} sub={`${in7.length} échéance(s)`} />
      <Card t="30 prochains jours" v={fmtMoney(sumOpen(in30))} sub={`${in30.length} échéance(s)`} />
      <Card t="Budget de la période" v={buds.length ? fmtMoney(budTotal) : "Aucun budget"} sub={buds.length ? (gap < 0 ? `Dépassement de ${fmtMoney(-gap)}` : `Marge ${fmtMoney(gap)}`) : canWrite ? "Ajoutez-en ci-dessus" : "Aucun budget saisi"} warn={buds.length > 0 && gap < 0} />
    </section>

    {buds.length > 0 && <section><h3 className="mb-1 font-display font-bold">Budget prévu, payé et écart</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="p-2">Catégorie</th><th className="p-2">Budget</th><th className="p-2">Payé (échéances)</th><th className="p-2">Reste prévu</th><th className="p-2">Écart</th></tr></thead><tbody>
      {buds.map(({ b: x, a }) => { const g = budgetGap(x.amount, a.paidC / 100, a.remainC / 100); return <tr key={x.id} className="border-t border-border"><td className="p-2">{cats.find((c) => c.id === x.category_id)?.name ?? "Toutes"}<span className="block text-xs text-muted-foreground">{fmtDate(x.period_from)} – {fmtDate(x.period_to)}</span></td><td className="p-2">{fmtMoney(x.amount)}</td><td className="p-2">{fmtMoney(a.paidC / 100)}</td><td className="p-2">{fmtMoney(a.remainC / 100)}</td><td className={`p-2 font-semibold ${g < 0 ? "text-destructive" : ""}`}>{g < 0 ? `−${fmtMoney(-g)}` : fmtMoney(g)}</td></tr>; })}
    </tbody></table></div></section>}

    <section><h3 className="mb-1 font-display font-bold">Échéances de la période</h3>
      {rows === null ? <p className="text-sm text-muted-foreground">Chargement…</p> : !shown.length ? <p className="text-sm text-muted-foreground">Aucune échéance.</p> :
        <ul className="space-y-2">{shown.map((o) => { const st = payStatus(o, today); return <li key={o.id}><button type="button" onClick={() => onOpen(o)} className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3 text-left">
          <span className="w-24 shrink-0 text-sm font-semibold">{fmtDate(o.ref_date || o.due_date)}</span>
          <span className="min-w-0 flex-1"><span className="block break-words font-medium">{o.label}</span><span className="block text-xs text-muted-foreground">{[o.payee, o.category, o.amount_quality === "estimated" ? "Estimé" : o.amount_quality === "unknown" ? "À compléter" : "Confirmé"].filter(Boolean).join(" · ")}</span></span>
          <span className="text-sm font-semibold">{fmtMoney(o.amount)}</span>
          <span className={`rounded px-2 py-0.5 text-xs ${TONE[st]}`}>{PAY_STATUS_LABEL[st]}</span>
        </button></li>; })}</ul>}
    </section>

    <section><h3 className="mb-1 font-display font-bold">Prévision des prochains mois</h3><ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {Object.keys(fc).sort().slice(0, 6).map((k) => { const m = summarize(fc[k], today); return <li key={k} className="rounded-md border border-border p-2 text-sm"><span className="block font-semibold capitalize">{new Date(k + "-15T12:00").toLocaleDateString("fr-CA", { month: "long", year: "numeric" })}</span>{fmtMoney(m.planned)}<span className="block text-xs text-muted-foreground">Reste {fmtMoney(m.remaining)}</span></li>; })}
    </ul></section>
  </div>;
}
