// FIN-17 — Rentabilité par chantier : facturé ≠ encaissé ≠ coûts connus ≠ coûts estimés, jamais additionnés entre eux.
// Lecture seule depuis fin_project_profitability (factures émises, achats confirmés, notes de frais approuvées).
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, todayIn } from "@/lib/finances/period";
import { download, toCsv } from "@/lib/finances/query";

type Row = { project_id: string | null; name: string; billed_ht: number; credits: number; collected: number; costs_known: number; costs_estimated: number; costs_missing: number; margin_known: number };

export default function Profitability({ companyId }: { companyId: string }) {
  const [from, setFrom] = useState(todayIn().slice(0, 5) + "01-01"); const [to, setTo] = useState(todayIn());
  const [rows, setRows] = useState<Row[] | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!from || !to) return; let live = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("fin_project_profitability", { _company: companyId, _from: from, _to: to }).then(({ data, error }: any) => { if (!live) return; setErr(error?.message ?? null); setRows(error ? null : data.rows); });
    return () => { live = false; }; }, [companyId, from, to]);
  const csv = () => rows && download(`rentabilite-${from}-${to}.csv`, toCsv([["Chantier", "Facturé HT", "Notes de crédit", "Encaissé", "Coûts connus HT", "Coûts estimés", "Coûts sans montant", "Marge sur coûts connus"], ...rows.map((r) => [r.name, r.billed_ht, r.credits, r.collected, r.costs_known, r.costs_estimated, r.costs_missing, r.margin_known])]));
  return <section className="space-y-3 text-sm" data-testid="profitability">
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs">Du<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></label>
      <label className="text-xs">Au<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></label>
      {rows && rows.length > 0 && <button className="text-xs underline" onClick={csv}>Exporter CSV</button>}
    </div>
    <p className="text-xs text-muted-foreground">Facturé = factures émises HT (avant notes de crédit, montrées à part). Coûts connus = achats fournisseurs confirmés HT + notes de frais approuvées hors taxes. Coûts estimés = brouillons et notes non approuvées, jamais inclus dans la marge. La paie, l'amortissement et les voyages non facturés ne sont pas encore répartis par chantier.</p>
    {err && <p role="alert" className="text-destructive">{err}</p>}
    {rows && rows.length === 0 && <p className="text-muted-foreground">Aucune opération sur la période.</p>}
    {rows && rows.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[720px]">
      <thead><tr className="text-left text-xs text-muted-foreground"><th>Chantier</th><th className="text-right">Facturé HT</th><th className="text-right">Crédits</th><th className="text-right">Encaissé</th><th className="text-right">Coûts connus</th><th className="text-right">Coûts estimés</th><th className="text-right">Marge (coûts connus)</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.project_id ?? "none"} className="border-t border-border">
        <td>{r.name}{r.costs_missing > 0 && <span className="ml-1 text-xs text-destructive">({r.costs_missing} achat(s) sans montant — à compléter)</span>}</td>
        <td className="text-right">{fmtMoney(r.billed_ht)}</td><td className="text-right">{fmtMoney(r.credits)}</td><td className="text-right">{fmtMoney(r.collected)}</td>
        <td className="text-right">{fmtMoney(r.costs_known)}</td><td className="text-right text-muted-foreground">{fmtMoney(r.costs_estimated)}</td>
        <td className={`text-right font-semibold ${r.margin_known < 0 ? "text-destructive" : ""}`}>{fmtMoney(r.margin_known)}</td></tr>)}</tbody>
    </table></div>}
  </section>;
}
