// ============================================================
// CRM-01 — Catalogue commercial Vrac Québec (fonctions pures).
// Aucun prix n'est codé ici : un prix absent signifie « À définir ».
// ============================================================

export type PlanStatus = "draft" | "active" | "archived";
export type SubscriptionStatus = "draft" | "trialing" | "active" | "past_due" | "canceled";

export interface PlatformPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  billing_interval: "month" | "year";
  currency: string;
  price_cents: number | null;
  features: string[];
  audience: "entreprise" | "demandeur";
  status: PlanStatus;
  notes: string | null;
  updated_at?: string | null;
}

export interface PlatformSubscription {
  id: string;
  company_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  amount_cents: number | null;
  currency: string;
  current_period_end: string | null;
  last_payment_failed_at: string | null;
  is_test: boolean;
  /** CRM-02 — suivi du cycle mensuel chez le prestataire. */
  environment?: string;
  plan_version?: number | null;
  cancel_at_period_end?: boolean;
  last_synced_at?: string | null;
  last_error?: string | null;
  provider_subscription_id?: string | null;
}

/** État d'une source de données : jamais de faux zéro. */
export type SourceState = "loading" | "error" | "not_configured" | "ready";

export interface Metric {
  state: SourceState;
  value: number | null;
  detail?: string;
}

export const metricLabel = (m: Metric): string => {
  if (m.state === "loading") return "…";
  if (m.state === "error") return "Erreur";
  if (m.state === "not_configured") return "À configurer";
  return m.value === null ? "À configurer" : String(m.value);
};

/* ----------------------------- Forfaits ----------------------------- */

/** Fonctionnalités réellement disponibles dans la plateforme. */
export const PLATFORM_FEATURES: { key: string; label: string; available: boolean }[] = [
  { key: "crm_demandes", label: "Demandes et suivi CRM", available: true },
  { key: "carte_dompes", label: "Carte des dompes", available: true },
  { key: "annuaire_reseau", label: "Annuaire et réseau", available: true },
  { key: "exports", label: "Exports CSV", available: true },
  { key: "facturation", label: "Facturation et paiements", available: true },
  { key: "flotte", label: "Gestion de la flotte", available: true },
  { key: "jumelage_remblai", label: "Jumelage remblai (interne)", available: false },
  { key: "assistant_materiaux", label: "Assistant matériaux (interne)", available: false },
  { key: "abonnements_paiement", label: "Paiement d'abonnement en ligne", available: false },
];

export interface FeatureMatrixRow {
  key: string;
  label: string;
  /** Existe réellement dans le produit. */
  available: boolean;
  /** Activée en ce moment (drapeau / configuration). */
  enabled: boolean;
  /** Incluse dans le forfait examiné. */
  included: boolean;
}

export function featureMatrix(
  plan: Pick<PlatformPlan, "features"> | null,
  enabled: (key: string) => boolean,
): FeatureMatrixRow[] {
  const included = new Set(plan?.features ?? []);
  return PLATFORM_FEATURES.map((f) => ({
    key: f.key,
    label: f.label,
    available: f.available,
    enabled: f.available && enabled(f.key),
    included: included.has(f.key),
  }));
}

export interface PlanCompleteness {
  missing: string[];
  canActivate: boolean;
}

/** Un forfait incomplet ne peut pas être activé (même règle que le serveur). */
export function planCompleteness(plan: Partial<PlatformPlan>): PlanCompleteness {
  const missing: string[] = [];
  if (!plan.name?.trim()) missing.push("Nom");
  if (!plan.description?.trim()) missing.push("Description");
  if (plan.price_cents === null || plan.price_cents === undefined) missing.push("Prix");
  if (!plan.features || plan.features.length === 0) missing.push("Fonctionnalités incluses");
  return { missing, canActivate: missing.length === 0 };
}

const cad = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });

/** Un prix absent n'est jamais affiché comme 0 $. */
export function formatPrice(priceCents: number | null | undefined, currency = "CAD"): string {
  if (priceCents === null || priceCents === undefined) return "À définir";
  const value = priceCents / 100;
  return currency === "CAD"
    ? cad.format(value)
    : new Intl.NumberFormat("fr-CA", { style: "currency", currency }).format(value);
}

export const intervalLabel = (i: PlatformPlan["billing_interval"]) =>
  i === "year" ? "par année" : "par mois";

/* --------------------------- Abonnements --------------------------- */

export interface SubscriptionMetrics {
  /** Abonnés payants actifs (hors brouillon, essai et test). */
  payingActive: number;
  /** Revenu mensuel récurrent, en cents (année ÷ 12). Null si aucun montant connu. */
  mrrCents: number | null;
  /** Prochaines échéances triées. */
  nextDueDates: { companyId: string; date: string }[];
  /** Paiements en échec. */
  failedPayments: number;
}

export function subscriptionMetrics(
  subs: PlatformSubscription[],
  plans: Pick<PlatformPlan, "id" | "price_cents" | "billing_interval">[] = [],
): SubscriptionMetrics {
  const byPlan = new Map(plans.map((p) => [p.id, p]));
  const paying = subs.filter((s) => !s.is_test && (s.status === "active" || s.status === "past_due"));
  let mrr: number | null = null;
  for (const s of paying) {
    const plan = byPlan.get(s.plan_id);
    const amount = s.amount_cents ?? plan?.price_cents ?? null;
    if (amount === null) continue;
    const monthly = (plan?.billing_interval ?? "month") === "year" ? Math.round(amount / 12) : amount;
    mrr = (mrr ?? 0) + monthly;
  }
  const nextDueDates = paying
    .filter((s) => !!s.current_period_end)
    .map((s) => ({ companyId: s.company_id, date: s.current_period_end as string }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    payingActive: paying.filter((s) => s.status === "active").length,
    mrrCents: mrr,
    nextDueDates,
    failedPayments: subs.filter((s) => !s.is_test && s.last_payment_failed_at).length,
  };
}

/* ----------------------------- Périodes ----------------------------- */

export const BUSINESS_TZ = "America/Toronto";

/** Date métier (America/Toronto) au format AAAA-MM-JJ. */
export function businessDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function formatBusinessDateTime(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: BUSINESS_TZ, dateStyle: "short", timeStyle: "short",
  }).format(date);
}
