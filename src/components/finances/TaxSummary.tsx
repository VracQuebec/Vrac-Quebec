// FIN-07 — Rendu commun des montants fiscaux (saisie, aperçu, PDF, page client).
import type { TaxResult } from "@/lib/finances/tax";

const money = (n?: number | null) => n == null ? "À déterminer" : n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
const pct = (r?: number | null) => r == null ? "" : ` (${(r * 100).toLocaleString("fr-CA", { maximumFractionDigits: 3 })} %)`;

export default function TaxSummary({ r, gstNumber, qstNumber, className = "" }: { r: Partial<TaxResult> & { final?: boolean }; gstNumber?: string | null; qstNumber?: string | null; className?: string }) {
  const row = (l: string, v: string, strong = false) => <p className={`flex justify-between gap-3 ${strong ? "font-bold" : ""}`}><span>{l}</span><span>{v}</span></p>;
  return <div className={`space-y-0.5 text-sm ${className}`}>
    {row(r.prices_include_tax ? "Sous-total (prix taxes incluses)" : "Sous-total", money(r.subtotal))}
    {!!r.discount && row("Rabais", `− ${money(r.discount)}`)}
    {row("Base taxable", money(r.taxable_base))}
    {!!r.zero_rated_base && row("Détaxé (0 %)", money(r.zero_rated_base))}
    {!!r.exempt_base && row("Exonéré", money(r.exempt_base))}
    {!!r.undetermined && row("Traitement à déterminer", money(r.undetermined))}
    {row(`TPS${pct(r.gst_rate)}${gstNumber ? ` — n° ${gstNumber}` : ""}`, r.resolved && r.gst_status === "non_inscrit" ? "Non inscrit" : money(r.gst))}
    {row(`TVQ${pct(r.qst_rate)}${qstNumber ? ` — n° ${qstNumber}` : ""}`, r.resolved && r.qst_status === "non_inscrit" ? "Non inscrit" : money(r.qst))}
    {row("Total", money(r.total), true)}
    {!r.resolved && <p role="alert" className="text-xs text-destructive">Taxes à déterminer : {(r.reasons ?? []).join(" ; ")}. Brouillon permis, remise bloquée.</p>}
  </div>;
}
