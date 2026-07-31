// Vrac Québec OS — Sprint 6 : accès client à l'Intelligence Centrale.
// Toutes les valeurs proviennent des moteurs serveur (aucune donnée simulée).
import { supabase } from "@/integrations/supabase/client";

export type IntelDashboard = {
  generated_at: string;
  learning: { rows: number; topics: number; avg_confidence: number; last_run: string | null };
  learning_topics: { topic: string; rows: number; confidence: number; samples: number }[];
  scores: { entity_type: string; count: number; avg_score: number }[];
  top_scores: ScoreRow[];
  weak_scores: ScoreRow[];
  anomalies: { open: number; high: number; impact: number };
  optimizations: { pending: number; applied: number; potential_gain: number; realized_gain: number };
  predictions: PredictionRow[];
  memory: { entries: number; avg_performance: number };
  last_report: { report_date: string; summary: string | null; created_at: string } | null;
};

export type ScoreRow = {
  entity_type: string; entity_id: string; label: string | null;
  score: number; grade: string | null; factors: Record<string, unknown>;
};
export type PredictionRow = {
  metric: string; period_month: string; predicted: number;
  low: number | null; high: number | null; confidence: number; method: string;
};
export type AnomalyRow = {
  id: string; code: string; severity: string; title: string; detail: string | null;
  entity_type: string | null; entity_id: string | null; impact_amount: number | null;
  status: string; created_at: string; metrics: Record<string, unknown>;
};
export type OptimizationRow = {
  id: string; kind: string; title: string; rationale: string | null;
  current_state: Record<string, unknown>; proposed_state: Record<string, unknown>;
  estimated_saving: number; confidence: number; status: string; created_at: string;
  applied_at: string | null; result: Record<string, unknown> | null;
};
export type MemoryRow = {
  id: string; kind: string; title: string; outcome: string | null;
  performance: number | null; lesson: string | null; created_at: string;
};
export type CommercialSuggestion = {
  type: string; titre: string; cible?: string; argumentaire?: string;
  impact_estime?: number; confiance?: number; preuves?: string[];
};

export const ENTITY_LABELS: Record<string, string> = {
  client: "Clients", supplier: "Fournisseurs", carrier: "Transporteurs",
  truck: "Camions", driver: "Chauffeurs", material: "Matériaux", project: "Projets",
};

export const METRIC_LABELS: Record<string, string> = {
  revenue: "Chiffre d'affaires", volume: "Volume livré", orders: "Commandes",
  margin: "Marge brute", cash_in: "Encaissements prévus",
};

export const ANOMALY_LABELS: Record<string, string> = {
  price_outlier: "Prix inhabituel", low_margin: "Marge trop faible",
  abnormal_delay: "Délai anormal", data_error: "Erreur de saisie",
  duplicate_request: "Doublon", inactive_supplier: "Fournisseur inactif",
  underused_carrier: "Transporteur sous-utilisé",
};

export const OPTIM_LABELS: Record<string, string> = {
  cheaper_supplier: "Fournisseur moins cher", material_price: "Ajustement de prix",
  consolidation: "Regroupement de trajets", idle_truck: "Camion inutilisé",
};

export const CAD = (n: number | null | undefined) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })
    .format(Number(n ?? 0));

/** Appel d'une fonction serveur d'intelligence avec remontée du message d'erreur réel. */
export async function invokeIntelligence<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<T>("vqos-intelligence", { body });
  if (error) {
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

export async function fetchIntelDashboard(companyId: string | null) {
  const { data, error } = await supabase.rpc("jsc_intel_dashboard", { _company_id: companyId });
  if (error) throw new Error(error.message);
  return data as unknown as IntelDashboard;
}