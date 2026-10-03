// FIN-15 — Âge des comptes fournisseurs : lecture seule, soldes issus de fin_supplier_balances (aucun nouveau calcul de montant).
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/finances/period";

type T = { rest: number; not_due: number; b1_30: number; b31_60: number; b61_90: number; b90: number; unknown: number; available: number };
type Row = T & { supplier_id: string; name: string };
const COLS: [keyof T, string][] = [["rest", "Reste à payer"], ["not_due", "Non échu"], ["b1_30", "1–30 j"], ["b31_60", "31–60 j"], ["b61_90", "61–90 j"], ["b90", "90 j +"], ["unknown", "Échéance inconnue"], ["available", "Disponibles (séparés)"]];
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

export default function SupplierAging({ companyId }: { companyId: string }) {
  const [on, setOn] = useState(today());
  const [d, setD] = useState<{ rows: Row[]; totals: T } | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return;
    let live = true; setErr(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("fin_ap_aging", { _company: companyId, _on: on }).then(({ data, error }: any) => {
      if (!live) return; if (error) { setD(null); setErr(error.message); } else setD(data);
    });
    return () => { live = false; };
  }, [companyId, on]);
  return <details className="rounded border border-border p-2 text-sm" data-testid="ap-aging">
    <summary className="font-semibold">Âge des comptes fournisseurs</summary>
    <div className="mt-2 space-y-2">
      <label className="block text-xs">Date de référence<Input type="date" value={on} onChange={(e) => setOn(e.target.value)} className="w-40" /></label>
      <p className="text-xs text-muted-foreground">Soldes actuels (CAD) classés selon l'échéance par rapport à la date choisie. Les trop-payés et notes de crédit disponibles restent séparés et ne réduisent pas le reste à payer.</p>
      {err && <p role="alert" className="text-destructive">{err}</p>}
      {!d && !err && <p className="text-muted-foreground">Chargement…</p>}
      {d && <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-xs">
        <thead><tr className="text-left text-muted-foreground"><th className="p-1">Fournisseur</th>{COLS.map(([k, l]) => <th key={k} className="p-1 text-right">{l}</th>)}</tr></thead>
        <tbody>{d.rows.map((r) => <tr key={r.supplier_id} className="border-t border-border"><td className="p-1">{r.name}</td>{COLS.map(([k]) => <td key={k} className="p-1 text-right">{fmtMoney(Number(r[k]))}</td>)}</tr>)}
          {!d.rows.length && <tr><td colSpan={9} className="p-1 text-muted-foreground">Aucun solde fournisseur.</td></tr>}</tbody>
        <tfoot><tr className="border-t border-border font-semibold"><td className="p-1">Total</td>{COLS.map(([k]) => <td key={k} className="p-1 text-right">{fmtMoney(Number(d.totals[k]))}</td>)}</tr></tfoot>
      </table></div>}
    </div>
  </details>;
}
