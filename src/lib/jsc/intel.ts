// Vrac Québec OS — accès client aux moteurs d'intelligence commerciale.
import { supabase } from "@/integrations/supabase/client";

export type ExecDashboard = {
  generated_at: string;
  revenue: { today: number; month: number; year: number; outstanding: number };
  profit: { revenue: number; cost: number; profit: number; margin_pct: number };
  conversion: { requests: number; quotes: number; orders: number; rate_pct: number };
  top_clients: Entity[];
  top_carriers: Entity[];
  top_suppliers: Entity[];
  top_reps: Entity[];
  deliveries_today: Record<string, unknown>[];
  late_orders: Record<string, unknown>[];
  capacity: { trucks_total: number; drivers_total: number; trucks_busy: number; drivers_busy: number };
  delays: { avg_request_to_quote_hours: number; avg_quote_to_order_hours: number };
  pipeline: { status: string; count: number }[];
  hot_leads: HotLead[];
  forecast: ForecastRow[];
  insights: Insight[];
  automation: { runs_24h: number; errors_24h: number };
};

export type Entity = { name: string; orders: number; revenue: number };
export type HotLead = {
  id: string; request_number: string | null; city: string | null; stars: number; priority: string;
  potential_revenue: number; win_probability: number; client_type: string | null;
  project_type: string | null; recommended_rep_name: string | null;
};
export type ForecastRow = {
  metric: string; period_month: string; predicted: number; low: number | null; high: number | null; confidence: number | null;
};
export type Insight = {
  id: string; kind: string; severity: string; title: string; body: string | null;
  impact_amount: number | null; created_at: string;
};
export type AutomationRun = {
  id: string; rule_code: string; entity_type: string; entity_id: string | null;
  status: string; detail: string | null; executed_at: string;
};

/** Appelle une fonction serveur d'intelligence avec la session courante. */
export async function invokeIntel<T>(name: string, body: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    // supabase.functions.invoke masque le corps de l'erreur : on le récupère.
    const ctx = (error as unknown as { context?: Response }).context;
    let detail = error.message;
    if (ctx && typeof ctx.text === "function") {
      const text = await ctx.text().catch(() => "");
      try { detail = (JSON.parse(text) as { error?: string }).error ?? text ?? detail; }
      catch { detail = text || detail; }
    }
    throw new Error(detail);
  }
  return data as T;
}

export const CAD = (n: number | null | undefined) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })
    .format(Number(n ?? 0));

export const stars = (n: number) => "★".repeat(Math.max(0, Math.min(5, n))) + "☆".repeat(Math.max(0, 5 - n));

export const METRIC_LABELS: Record<string, string> = {
  sales: "Ventes ($)",
  volume: "Volume livré",
  deliveries: "Livraisons",
  trucks_needed: "Camions requis",
  drivers_needed: "Chauffeurs requis",
};

export const RULE_LABELS: Record<string, string> = {
  score_new_requests: "Notation IA des nouvelles demandes",
  notify_rep: "Notification du représentant",
  relance_24h: "Relance 24 h",
  relance_72h: "Relance 72 h",
  quote_to_order: "Soumission acceptée → commande",
  order_to_deliveries: "Commande → livraisons",
  auto_assign_driver: "Assignation chauffeur / camion",
  notify_client_delivered: "Notification client livraison",
  order_to_invoice: "Commande terminée → facture",
};