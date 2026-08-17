// ============================================================
// TARIFICATION DU TRANSPORT — source unique de vérité côté client
// ------------------------------------------------------------
// Aucun tarif n'est codé en dur : les tarifs par voyage et les
// taux de taxes proviennent de l'administration
// (`transport_truck_rates`, `transport_tax_rates`).
// Le même calcul est refait côté serveur avant l'enregistrement :
// l'affichage n'est jamais la source de vérité.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TruckRate {
  code: string;
  label: string;
  price_per_trip: number;
}

export interface TaxRates {
  /** Taux TPS (ex. 0.05). */
  tps: number;
  /** Taux TVQ (ex. 0.09975). */
  tvq: number;
}

export interface TransportPricing {
  truckCode: string;
  truckLabel: string;
  pricePerTrip: number;
  trips: number;
  /** Transport avant taxes = voyages × tarif du camion. */
  subtotal: number;
  tpsRate: number;
  tvqRate: number;
  tpsAmount: number;
  tvqAmount: number;
  /** Transport taxes incluses. */
  total: number;
}

export type PricingError = { error: string };

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Calcul du prix du transport. Le tarif est TOUJOURS par voyage. */
export function computeTransportPricing(
  rate: TruckRate | null | undefined,
  tripsInput: number | string | null | undefined,
  taxes: TaxRates,
): TransportPricing | PricingError {
  if (!rate) return { error: "Sélectionnez un type de camion." };
  if (!Number.isFinite(rate.price_per_trip) || rate.price_per_trip < 0) {
    return { error: "Le tarif de ce camion est introuvable. Contactez Vrac Québec." };
  }
  const trips = Number(String(tripsInput ?? "").replace(",", ".").trim());
  if (!Number.isFinite(trips) || trips <= 0) {
    return { error: "Indiquez un nombre de voyages supérieur à 0." };
  }
  if (!Number.isInteger(trips)) {
    return { error: "Le nombre de voyages doit être un nombre entier." };
  }
  const subtotal = round2(trips * rate.price_per_trip);
  const tpsAmount = round2(subtotal * taxes.tps);
  const tvqAmount = round2(subtotal * taxes.tvq);
  return {
    truckCode: rate.code,
    truckLabel: rate.label,
    pricePerTrip: rate.price_per_trip,
    trips,
    subtotal,
    tpsRate: taxes.tps,
    tvqRate: taxes.tvq,
    tpsAmount,
    tvqAmount,
    total: round2(subtotal + tpsAmount + tvqAmount),
  };
}

/** Total d'une demande : matériau (optionnel, déjà calculé ailleurs) + transport. */
export function computeRequestTotal(pricing: TransportPricing, materialSubtotal: number | null) {
  const material = materialSubtotal != null && Number.isFinite(materialSubtotal) ? round2(materialSubtotal) : 0;
  const subtotal = round2(material + pricing.subtotal);
  const tpsAmount = round2(subtotal * pricing.tpsRate);
  const tvqAmount = round2(subtotal * pricing.tvqRate);
  return {
    material,
    transport: pricing.subtotal,
    subtotal,
    tpsAmount,
    tvqAmount,
    total: round2(subtotal + tpsAmount + tvqAmount),
  };
}

const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });
export const formatCad = (v: number) => money.format(v);
export const formatRatePercent = (rate: number) =>
  `${(rate * 100).toLocaleString("fr-CA", { maximumFractionDigits: 3 })} %`;

/** Chargement des tarifs et des taxes administrés. */
export function useTransportRates() {
  const [rates, setRates] = useState<TruckRate[]>([]);
  const [taxes, setTaxes] = useState<TaxRates | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rateRows }, { data: taxRows }] = await Promise.all([
      supabase
        .from("transport_truck_rates")
        .select("code,label,price_per_trip")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("transport_tax_rates").select("code,rate").eq("is_active", true),
    ]);
    setRates((rateRows ?? []).map((r) => ({ ...r, price_per_trip: Number(r.price_per_trip) })));
    const byCode = new Map((taxRows ?? []).map((t) => [t.code, Number(t.rate)]));
    setTaxes(
      byCode.has("tps") || byCode.has("tvq")
        ? { tps: byCode.get("tps") ?? 0, tvq: byCode.get("tvq") ?? 0 }
        : null,
    );
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { rates, taxes, loading, reload: load };
}
