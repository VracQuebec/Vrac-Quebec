// Estimation du transport affichée à l'entrepreneur avant l'envoi.
// Purement présentationnel : tous les montants viennent de
// `computeTransportPricing` (tarifs administrés) — jamais saisis.
import { AlertTriangle, Truck } from "lucide-react";
import {
  formatCad, formatRatePercent, computeRequestTotal,
  type PricingError, type TransportPricing,
} from "@/lib/transport/pricing";

const Line = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`flex items-baseline justify-between gap-3 ${strong ? "font-display font-bold text-base" : "text-sm"}`}>
    <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
    <span className="tabular-nums whitespace-nowrap">{value}</span>
  </div>
);

export default function TransportEstimate({
  pricing, materialSubtotal = null,
}: {
  pricing: TransportPricing | PricingError | null;
  materialSubtotal?: number | null;
}) {
  if (!pricing || "error" in pricing) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-4 sm:p-5">
        <p className="text-[10px] font-display font-bold uppercase tracking-wide text-muted-foreground mb-2">
          Estimation du transport
        </p>
        <p className="flex items-start gap-2 text-sm font-body text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
          {pricing?.error ?? "Sélectionnez un type de camion et un nombre de voyages."}
        </p>
      </div>
    );
  }

  const withMaterial = materialSubtotal != null && materialSubtotal > 0;
  const totals = computeRequestTotal(pricing, materialSubtotal);

  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-card p-4 sm:p-5 shadow-md">
      <p className="mb-3 flex items-center gap-2 text-[10px] font-display font-bold uppercase tracking-wide text-muted-foreground">
        <Truck className="h-4 w-4 text-primary" /> Estimation du transport
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-display font-bold text-foreground">
          {pricing.truckLabel}
        </span>
        <span className="rounded-full border border-border px-3 py-1 text-sm font-body">
          {pricing.trips} voyage{pricing.trips > 1 ? "s" : ""}
        </span>
        <span className="rounded-full border border-border px-3 py-1 text-sm font-body">
          {formatCad(pricing.pricePerTrip)} / voyage
        </span>
      </div>

      <div className="space-y-1.5">
        {withMaterial && <Line label="Matériau" value={formatCad(totals.material)} />}
        <Line label="Transport avant taxes" value={formatCad(pricing.subtotal)} />
        {withMaterial && <Line label="Sous-total" value={formatCad(totals.subtotal)} />}
        <Line label={`TPS (${formatRatePercent(pricing.tpsRate)})`} value={formatCad(withMaterial ? totals.tpsAmount : pricing.tpsAmount)} />
        <Line label={`TVQ (${formatRatePercent(pricing.tvqRate)})`} value={formatCad(withMaterial ? totals.tvqAmount : pricing.tvqAmount)} />
        <div className="mt-2 border-t border-border pt-2">
          <Line
            label={withMaterial ? "TOTAL ESTIMÉ" : "Transport total (taxes incluses)"}
            value={formatCad(withMaterial ? totals.total : pricing.total)}
            strong
          />
        </div>
      </div>

      <p className="mt-3 text-[11px] font-body text-muted-foreground">
        Estimation calculée et validée par Vrac Québec selon les tarifs en vigueur au moment de la demande.
      </p>
    </div>
  );
}
