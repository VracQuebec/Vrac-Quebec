// ============================================================
// CRM-02 — Abonnement mensuel (mode test).
// Fonctions pures côté navigateur : affichage uniquement.
// Les droits réels sont toujours décidés côté serveur.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { paymentsEnvironment } from "@/lib/stripe";

export type SubscriptionState =
  | "none" | "incomplete" | "trialing" | "active" | "past_due" | "canceled" | "ended";

export interface SubscriptionRow {
  id: string;
  status: string;
  billing_status: string | null;
  amount_cents: number | null;
  currency: string;
  environment: string;
  price_ref: string | null;
  plan_version: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  ended_at: string | null;
  last_payment_failed_at: string | null;
  last_synced_at: string | null;
  provider_subscription_id: string | null;
  platform_plans?: { name: string; slug: string; features: string[]; billing_interval: string; version?: number } | null;
}

export interface SubscriptionOffer {
  id: string; name: string; slug: string; version: number;
  price_cents: number | null; currency: string;
  billing_interval: "month" | "year"; features: string[];
  is_test: boolean; tax_note: string | null;
}

export interface SubscriptionInvoice {
  id: string; status: string | null; amount_paid: number; currency: string;
  created: string | null; hosted_invoice_url: string | null; pdf_url: string | null; tax: number | null;
}

export interface SubscriptionStatusResponse {
  source: "ready" | "not_connected";
  reason?: string;
  company?: { id: string; name: string | null; role: string; canBill: boolean };
  environment?: string;
  offer?: SubscriptionOffer | null;
  subscription?: SubscriptionRow | null;
  invoices?: SubscriptionInvoice[];
}

/** État affichable, déduit sans jamais transformer une absence en zéro. */
export function subscriptionState(sub: SubscriptionRow | null | undefined, now = new Date()): SubscriptionState {
  if (!sub) return "none";
  const end = sub.current_period_end ? new Date(sub.current_period_end) : null;
  const expired = !!end && end.getTime() <= now.getTime();
  if (sub.status === "incomplete" || sub.status === "incomplete_expired") return "incomplete";
  if (sub.status === "canceled") return expired ? "ended" : "canceled";
  if (expired) return "ended";
  if (sub.status === "past_due" || sub.status === "unpaid") return "past_due";
  if (sub.status === "trialing") return "trialing";
  if (sub.status === "active") return "active";
  return "ended";
}

/** Un retour de page de paiement ne suffit jamais : seul l'état serveur accorde l'accès. */
export function hasPaidAccess(sub: SubscriptionRow | null | undefined, now = new Date()): boolean {
  const state = subscriptionState(sub, now);
  return state === "active" || state === "trialing" || state === "past_due" || state === "canceled";
}

export const STATE_LABELS: Record<SubscriptionState, string> = {
  none: "Aucun abonnement",
  incomplete: "Paiement initial incomplet",
  trialing: "Période d'essai",
  active: "Actif",
  past_due: "Paiement en retard",
  canceled: "Annulation programmée",
  ended: "Terminé",
};

export const STATE_TONES: Record<SubscriptionState, string> = {
  none: "bg-muted text-muted-foreground border-border",
  incomplete: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  trialing: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  active: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  past_due: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  canceled: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30",
  ended: "bg-zinc-200 text-zinc-700 border-zinc-300",
};

/** Message d'action attendu pour chaque état. */
export function stateGuidance(state: SubscriptionState): string {
  switch (state) {
    case "none": return "Aucun service payant n'est activé pour cette entreprise.";
    case "incomplete": return "Le premier paiement n'est pas confirmé : aucun nouveau service n'est encore ouvert.";
    case "past_due": return "Le dernier paiement a échoué. Mettez à jour le moyen de paiement pour régulariser.";
    case "canceled": return "L'abonnement prend fin à la date indiquée. Les services restent disponibles jusque-là.";
    case "ended": return "La période payée est terminée. Les factures et les fonctions gratuites restent accessibles.";
    case "trialing": return "Période d'essai en cours (désactivée commercialement).";
    default: return "Les services inclus sont disponibles pour les membres de l'entreprise.";
  }
}

const cad = (currency: string) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: currency || "CAD" });

/** Un montant absent n'est jamais affiché comme 0 $. */
export function formatAmount(cents: number | null | undefined, currency = "CAD"): string {
  if (cents === null || cents === undefined) return "À définir";
  return cad(currency).format(cents / 100);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "America/Toronto", dateStyle: "long",
  }).format(new Date(value));
}

/* --------------------------- Appels serveur --------------------------- */

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("platform-subscription", {
    body: { action, environment: paymentsEnvironment(), ...extra },
  });
  if (error) throw new Error(error.message);
  if (data && typeof data === "object" && "error" in data) throw new Error(String((data as { error: string }).error));
  return data as T;
}

export const fetchSubscriptionStatus = () => call<SubscriptionStatusResponse>("status");
export const startCheckout = (returnUrl: string) => call<{ clientSecret: string }>("checkout", { returnUrl });
export const openBillingPortal = (returnUrl: string) => call<{ url: string }>("portal", { returnUrl });
export const resyncSubscription = (subscriptionId?: string) => call<{ synced: number }>("sync", { subscriptionId });
