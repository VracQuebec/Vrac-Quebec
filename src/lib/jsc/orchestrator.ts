// Vrac Québec OS — Sprint 7 : accès client à l'Orchestrateur Global.
// Toutes les valeurs proviennent des moteurs serveur (aucune donnée simulée).
import { supabase } from "@/integrations/supabase/client";

export type OrchKpis = {
  generated_at: string;
  revenue_today: number; revenue_month: number; revenue_90d: number; profit_90d: number;
  avg_margin_pct: number; open_orders: number; requests_90d: number; conversion_pct: number;
  tonnes_90d: number; cost_per_tonne: number; km_90d: number; cost_per_km: number;
  cost_per_delivery: number; deliveries_90d: number; deliveries_late: number;
  outstanding: number; capacity_used_pct: number; ai_decisions_7d: number;
  ai_savings: number; ai_pending: number; satisfaction_pct: number | null;
};

export type OrchEvent = {
  id: string; event_type: string; label: string | null; severity: string;
  entity_type: string | null; created_at: string;
};

export type RiskRow = {
  id: string; code: string; category: string; title: string; detail: string | null;
  level: string; score: number; entity_type: string | null; entity_id: string | null;
  metrics: Record<string, unknown>; detected_at: string; status?: string;
};

export type OrchControl = {
  generated_at: string;
  health_score: number;
  kpis: OrchKpis;
  risks: { open: number; critical: number; high: number };
  rules: { active: number; fired_24h: number };
  events_24h: number;
  pending_decisions: number;
  strategies_pending: number;
  recent_events: OrchEvent[];
  top_risks: RiskRow[];
};

export type TwinData = {
  generated_at: string;
  counts: Record<string, number>;
  trucks: { id: string; name: string; truck_type: string | null; capacity_tonnes: number | null; availability: string | null; operational_status: string | null; today_deliveries: number }[];
  drivers: { id: string; name: string; status: string | null; today_deliveries: number }[];
  suppliers: { id: string; name: string; city: string | null; orders_90d: number }[];
  materials: { id: string; name: string; unit: string | null; availability: string | null; selling_price: number | null; orders_90d: number }[];
  deliveries: { id: string; delivery_number: string | null; status: string; city: string | null; scheduled_date: string | null; latitude: number | null; longitude: number | null }[];
};

export type GeoPoint = { id: string; name?: string; city?: string | null; latitude: number; longitude: number };
export type MapData = {
  generated_at: string;
  deliveries: (GeoPoint & { delivery_number: string | null; status: string; scheduled_date: string | null; truck_name: string | null })[];
  pickups: (GeoPoint & { supplier_name: string | null })[];
  suppliers: GeoPoint[];
  clients: GeoPoint[];
  projects: (GeoPoint & { status: string | null })[];
  incidents: (GeoPoint & { incident_type: string; severity: string; status: string })[];
  city_stats: { city: string; orders: number; revenue: number; margin: number; margin_pct: number }[];
  shortage_cities: { city: string; requests: number }[];
};

export type SimulationRow = {
  id: string; name: string; scenario_type: string; created_at: string;
  inputs: Record<string, number>;
  baseline: Record<string, number>;
  projection: Record<string, number>;
  delta: Record<string, number>;
};

export type StrategyRow = {
  id: string; kind: string; title: string; rationale: string | null;
  evidence: Record<string, unknown>; impact_estimate: number; confidence: number;
  horizon: string; status: string; created_at: string;
};

export type OrchRule = {
  id: string; code: string; label: string; description: string | null;
  metric: string; operator: string; threshold: number; action_type: string;
  action_config: Record<string, unknown>; severity: string; is_active: boolean;
  cooldown_minutes: number; trigger_count: number; last_triggered_at: string | null;
  last_value: number | null; sort_order: number;
};

export const RISK_LEVELS: Record<string, { label: string; className: string }> = {
  critical: { label: "Critique", className: "bg-destructive/15 text-destructive border-destructive/40" },
  high: { label: "Élevé", className: "bg-orange-500/15 text-orange-600 border-orange-500/40" },
  medium: { label: "Moyen", className: "bg-yellow-500/15 text-yellow-700 border-yellow-500/40" },
  low: { label: "Faible", className: "bg-muted text-muted-foreground border-border" },
};

export const METRIC_OPTIONS: { value: string; label: string }[] = [
  { value: "avg_margin_pct", label: "Marge moyenne (%)" },
  { value: "revenue_today", label: "Chiffre d'affaires du jour ($)" },
  { value: "revenue_month", label: "Chiffre d'affaires du mois ($)" },
  { value: "profit_90d", label: "Bénéfice 90 jours ($)" },
  { value: "open_orders", label: "Commandes ouvertes" },
  { value: "conversion_pct", label: "Taux de conversion (%)" },
  { value: "cost_per_tonne", label: "Coût moyen par tonne ($)" },
  { value: "cost_per_km", label: "Coût moyen par km ($)" },
  { value: "cost_per_delivery", label: "Coût moyen par livraison ($)" },
  { value: "deliveries_late", label: "Livraisons en retard" },
  { value: "capacity_used_pct", label: "Capacité utilisée (%)" },
  { value: "outstanding", label: "Comptes à recevoir ($)" },
  { value: "ai_pending", label: "Optimisations IA en attente" },
];

export const OPERATOR_OPTIONS: { value: string; label: string }[] = [
  { value: "lt", label: "est inférieur à" },
  { value: "lte", label: "est inférieur ou égal à" },
  { value: "gt", label: "est supérieur à" },
  { value: "gte", label: "est supérieur ou égal à" },
  { value: "eq", label: "est égal à" },
  { value: "neq", label: "est différent de" },
];

export const SCENARIOS: { value: string; label: string; hint: string; defaults: Record<string, number> }[] = [
  { value: "price_up", label: "Hausse des prix de vente", hint: "Applique une hausse en % sur le prix de vente, avec effet sur le volume.", defaults: { selling_price_pct: 10 } },
  { value: "price_down", label: "Baisse des prix de vente", hint: "Applique une baisse en % sur le prix de vente, avec effet sur le volume.", defaults: { selling_price_pct: -10 } },
  { value: "supplier_add", label: "Ajout d'un fournisseur", hint: "Réduction du coût matériaux grâce à une source additionnelle.", defaults: { material_cost_pct: -5, volume_pct: 5 } },
  { value: "supplier_remove", label: "Retrait d'un fournisseur", hint: "Exclut les commandes du fournisseur choisi de la base de calcul.", defaults: { material_cost_pct: 4 } },
  { value: "truck_add", label: "Ajout d'un camion", hint: "Capacité additionnelle : hausse de volume et coût fixe.", defaults: { volume_pct: 8, fixed_cost: 45000 } },
  { value: "new_region", label: "Nouvelle région", hint: "Volume additionnel avec transport plus long.", defaults: { volume_pct: 12, transport_cost_pct: 8 } },
  { value: "new_material", label: "Nouveau matériau", hint: "Volume additionnel sur une nouvelle gamme.", defaults: { volume_pct: 6 } },
  { value: "new_branch", label: "Ouverture d'une succursale", hint: "Volume additionnel avec coûts fixes d'exploitation.", defaults: { volume_pct: 20, fixed_cost: 150000, transport_cost_pct: -5 } },
];

export const SIM_FIELDS: { key: string; label: string; suffix: string }[] = [
  { key: "selling_price_pct", label: "Variation du prix de vente", suffix: "%" },
  { key: "material_cost_pct", label: "Variation du coût matériaux", suffix: "%" },
  { key: "transport_cost_pct", label: "Variation du coût de transport", suffix: "%" },
  { key: "volume_pct", label: "Variation du volume", suffix: "%" },
  { key: "fixed_cost", label: "Coût fixe additionnel (180 j)", suffix: "$" },
  { key: "price_elasticity", label: "Élasticité prix/volume", suffix: "" },
];

export const CAD = (n: number | null | undefined) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(Number(n ?? 0));
export const NUM = (n: number | null | undefined, d = 0) =>
  new Intl.NumberFormat("fr-CA", { maximumFractionDigits: d }).format(Number(n ?? 0));

/** Appel de l'orchestrateur avec remontée du message d'erreur réel. */
export async function invokeOrchestrator<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<T>("vqos-orchestrator", { body });
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

async function rpc<T>(fn: "jsc_orch_control" | "jsc_orch_twin" | "jsc_orch_map", companyId: string | null) {
  const { data, error } = await supabase.rpc(fn, { _company_id: companyId });
  if (error) throw new Error(error.message);
  return data as unknown as T;
}

export const fetchControl = (companyId: string | null) => rpc<OrchControl>("jsc_orch_control", companyId);
export const fetchTwin = (companyId: string | null) => rpc<TwinData>("jsc_orch_twin", companyId);
export const fetchMap = (companyId: string | null) => rpc<MapData>("jsc_orch_map", companyId);
