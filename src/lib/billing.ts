export const PAYMENT_STATUSES = [
  { value: "non_facture", label: "Non facturé", color: "bg-slate-200 text-slate-800 border-slate-300" },
  { value: "facture", label: "Facturé", color: "bg-sky-500/15 text-sky-700 border-sky-500/30" },
  { value: "paye_partiel", label: "Payé partiellement", color: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  { value: "paye", label: "Payé", color: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  { value: "en_retard", label: "En retard", color: "bg-rose-500/15 text-rose-700 border-rose-500/30" },
  { value: "annule", label: "Annulé", color: "bg-zinc-300 text-zinc-700 border-zinc-400" },
] as const;

export const PAYMENT_METHODS = [
  "Virement Interac",
  "Chèque",
  "Comptant",
  "Carte de crédit",
  "Virement bancaire",
  "Autre",
] as const;

export type PaymentStatusValue = typeof PAYMENT_STATUSES[number]["value"];

export interface LeadTrip {
  id: string;
  submission_id: string;
  entrepreneur_id: string | null;
  material: string;
  trip_type: string;
  trips_count: number;
  price_per_trip: number;
  total_price: number;
  delivery_date: string | null;
  invoice_number: string;
  payment_status: string;
  payment_date: string | null;
  payment_method: string;
  notes: string;
  created_at: string;
  updated_at: string;
  taxable?: boolean;
  tps_rate?: number;
  tvq_rate?: number;
  tps_amount?: number;
  tvq_amount?: number;
  total_with_tax?: number;
  due_date?: string | null;
  due_days?: number;
}

// Quebec sales tax rates
export const TPS_RATE = 0.05;
export const TVQ_RATE = 0.09975;

// Materials that are non-taxable (remblai / remplissage)
const NON_TAXABLE_KEYWORDS = ["remblai", "remplissage"];

export const isMaterialTaxableByDefault = (material: string | null | undefined): boolean => {
  const m = (material || "").toLowerCase().trim();
  if (!m) return false;
  return !NON_TAXABLE_KEYWORDS.some((kw) => m.includes(kw));
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface TaxBreakdown {
  subtotal: number;
  tps: number;
  tvq: number;
  total: number;
  taxable: boolean;
}

export const computeTaxes = (
  subtotal: number,
  taxable: boolean,
  tpsRate: number = TPS_RATE,
  tvqRate: number = TVQ_RATE,
): TaxBreakdown => {
  const sub = round2(subtotal || 0);
  if (!taxable) return { subtotal: sub, tps: 0, tvq: 0, total: sub, taxable: false };
  const tps = round2(sub * tpsRate);
  const tvq = round2(sub * tvqRate);
  return { subtotal: sub, tps, tvq, total: round2(sub + tps + tvq), taxable: true };
};

export const findPaymentStatus = (v: string) =>
  PAYMENT_STATUSES.find((s) => s.value === v) || PAYMENT_STATUSES[0];

/**
 * Returns overdue bucket label (7/14/28+) for an unpaid invoiced trip, or null.
 * Uses delivery_date when invoice_number is empty, otherwise uses created_at as fallback.
 */
export const overdueBucket = (trip: LeadTrip): { days: number; bucket: 7 | 14 | 28 } | null => {
  if (["paye", "annule"].includes(trip.payment_status)) return null;
  if (trip.payment_status === "non_facture") return null;
  // Prefer due_date when available, otherwise fall back to delivery_date / created_at
  const ref = trip.due_date || trip.delivery_date || trip.created_at;
  if (!ref) return null;
  const diffMs = Date.now() - new Date(ref).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days >= 28) return { days, bucket: 28 };
  if (days >= 14) return { days, bucket: 14 };
  if (days >= 7) return { days, bucket: 7 };
  return null;
};
