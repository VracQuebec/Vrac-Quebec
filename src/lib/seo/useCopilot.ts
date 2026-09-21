import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";
import { toast } from "sonner";

export type ExecutiveKpi = {
  pages_total: number;
  pages_published: number;
  pages_indexed: number;
  pages_pending: number;
  qa_avg: number;
  seo_avg: number;
  gsc_clicks_28d: number;
  gsc_impressions_28d: number;
  gsc_position_avg: number;
  submissions_30d: number;
  phone_30d: number;
  whatsapp_30d: number;
  email_30d: number;
  conversions_30d: number;
};

export type GscDelta = {
  slug: string; title: string;
  clicks: number; impressions: number; position: number;
  clicks_delta: number; position_gain: number;
};

export type OpportunityPriority = "critical" | "high" | "medium" | "low";

export type ScoreFactor = { label: string; points: number };

export type OpportunityCategory =
  | "ctr" | "position" | "conversion" | "indexation"
  | "technique" | "cannibalisation" | "territoire_service" | "groupe";

export type Opportunity = {
  id: string;
  type: string;
  category: OpportunityCategory | null;
  title: string;
  rationale: string;
  reason: string | null;
  recommended_action: string | null;
  expected_impact: string | null;
  score_factors: ScoreFactor[];
  data_quality: string | null;
  source: string | null;
  url: string | null;
  priority: OpportunityPriority;
  score: number;
  data: Record<string, unknown>;
  suggested_action: "create" | "optimize" | "merge" | "delete" | "ignore";
  impact_score: number;
  effort_score: number;
  potential_searches: number | null;
  potential_clicks: number | null;
  potential_leads: number | null;
  entity_slug: string | null;
  target_city_slug: string | null;
  target_material_slug: string | null;
  target_service_slug: string | null;
  page_id: string | null;
  status: string;
  detected_at: string;
  last_seen_at: string;
};

export type RuleDiagnostic = { code: string; label: string; candidates: number; retained: number; note?: string };

export type OpportunityRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: string;
  error: string | null;
  period: string;
  pages_analyzed: number;
  published_analyzed: number;
  indexed_analyzed: number;
  gsc_rows_analyzed: number;
  impressions_analyzed: number;
  conversions_analyzed: number;
  cities_analyzed: number;
  services_analyzed: number;
  opportunities_detected: number;
  new_count: number;
  updated_count: number;
  stale_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  rules: RuleDiagnostic[];
};

export type CopilotState = {
  computed_at: string;
  opportunities: Opportunity[];
  last_run: OpportunityRun | null;
  history: Array<Pick<OpportunityRun, "id" | "started_at" | "finished_at" | "duration_ms" | "status" | "pages_analyzed" | "gsc_rows_analyzed" | "conversions_analyzed" | "opportunities_detected" | "new_count" | "updated_count" | "stale_count">>;
  counts: Record<string, number>;
};

export type ExecutiveDashboard = {
  computed_at: string;
  kpi: ExecutiveKpi;
  top_gains_30d: GscDelta[];
  top_losses_30d: GscDelta[];
  top_opportunities: Opportunity[];
};

export const SCAN_STEPS = [
  "Analyse des données Search Console",
  "Analyse des pages",
  "Analyse des conversions",
  "Analyse de l'indexation",
  "Analyse des territoires",
  "Analyse des services",
  "Détection des opportunités",
  "Priorisation",
  "Enregistrement des opportunités",
];

export function useCopilot() {
  const [data, setData] = useState<ExecutiveDashboard | null>(null);
  const [copilot, setCopilot] = useState<CopilotState | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [step, setStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [dash, state] = await Promise.all([
      supabase.rpc("seo_executive_dashboard"),
      supabase.rpc("seo_copilot_state"),
    ]);
    if (dash.error) setError(dash.error.message);
    else setData(dash.data as unknown as ExecutiveDashboard);
    if (state.error) setError(state.error.message);
    else setCopilot(state.data as unknown as CopilotState);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const rescan = useCallback(async () => {
    setScanning(true);
    setStep(0);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setStep((s) => (s < SCAN_STEPS.length - 2 ? s + 1 : s));
    }, 1200);
    try {
      const { data: res, error: e } = await invokeWithFreshSession<Record<string, never>, { opportunities_detected?: number; error?: string }>("seo-assistant-scan", {});
      if (e) throw e;
      if (res?.error) throw new Error(res.error);
      setStep(SCAN_STEPS.length - 1);
      toast.success(`Analyse terminée — ${res?.opportunities_detected ?? 0} opportunité(s) détectée(s)`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      if (timer.current) clearInterval(timer.current);
      setScanning(false);
      setTimeout(() => setStep(-1), 1500);
    }
  }, [load]);

  const setOpportunityStatus = useCallback(async (id: string, status: "dismissed" | "in_progress" | "completed" | "open") => {
    const now = new Date().toISOString();
    const patch = {
      status,
      updated_at: now,
      ...(status === "dismissed" ? { dismissed_at: now } : {}),
      ...(status === "completed" ? { applied_at: now } : {}),
    };
    const { error: e } = await supabase.from("seo_opportunities").update(patch).eq("id", id);
    if (e) { toast.error(e.message); return; }
    await load();
  }, [load]);

  const dismissOpportunity = useCallback((id: string) => setOpportunityStatus(id, "dismissed"), [setOpportunityStatus]);

  return { data, copilot, loading, scanning, step, error, reload: load, rescan, dismissOpportunity, setOpportunityStatus };
}
