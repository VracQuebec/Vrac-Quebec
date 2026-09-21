import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";
import { toast } from "sonner";
import type { HiddenOpportunity } from "@/lib/seo/counters";

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
  signals_detected: number;
  signals_rejected: number;
  resolved_count: number;
  rules: RuleDiagnostic[];
  group_insights?: GroupInsight[];
  comparison?: RunComparison | null;
  top_opportunities?: Array<Record<string, unknown>>;
};

export type GroupInsight = {
  kind: "group_service" | "group_territory";
  key: string; pages: number; impressions: number; clicks: number;
  ctr: number; position_avg: number | null; conversions: number; site_ctr: number;
};

export type RunComparison = {
  run_precedent: string; opportunites_precedentes: number; opportunites_actuelles: number;
  nouvelles: number; toujours_ouvertes: number; resolues: number; obsoletes: number; aggravees: number;
};

export type CopilotState = {
  computed_at: string;
  opportunities: Opportunity[];
  last_run: OpportunityRun | null;
  history: Array<Pick<OpportunityRun, "id" | "started_at" | "finished_at" | "duration_ms" | "status" | "pages_analyzed" | "gsc_rows_analyzed" | "conversions_analyzed" | "opportunities_detected" | "new_count" | "updated_count" | "stale_count"> & { signals_detected?: number; signals_rejected?: number; resolved_count?: number; comparison?: RunComparison | null }>;
  counts: Record<string, number>;
  facets: { cities: string[]; services: string[]; categories: string[] };
  hidden?: HiddenOpportunity[];
};

export type SeoActionPageMetric = {
  page_id: string | null;
  slug: string | null;
  url: string | null;
  title: string | null;
  city: string | null;
  service: string | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  position: number | null;
  conversions: number | null;
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
  const [actionPageMetrics, setActionPageMetrics] = useState<SeoActionPageMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [step, setStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const fetchAll = async <T,>(
      build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    ): Promise<T[]> => {
      const out: T[] = [];
      const size = 1000;
      for (let from = 0; from < 20000; from += size) {
        const { data: rows, error: pageError } = await build(from, from + size - 1);
        if (pageError) throw new Error(pageError.message);
        const batch = rows ?? [];
        out.push(...batch);
        if (batch.length < size) break;
      }
      return out;
    };

    const [dash, state, pages, gscRows, conversions] = await Promise.all([
      supabase.rpc("seo_executive_dashboard"),
      supabase.rpc("seo_copilot_state"),
      fetchAll<{ id: string; slug: string; title: string | null; city_slug: string | null; service_slug: string | null }>((from, to) =>
        supabase.from("seo_pages").select("id,slug,title,city_slug,service_slug").order("id", { ascending: true }).range(from, to),
      ),
      fetchAll<{ page_id: string; clicks: number; impressions: number; ctr: number; position: number; fetched_at: string }>((from, to) =>
        supabase.from("seo_gsc_metrics").select("page_id,clicks,impressions,ctr,position,fetched_at").eq("period", "28d").order("fetched_at", { ascending: false }).range(from, to),
      ),
      fetchAll<{ page_slug: string | null; conversions: number | null }>((from, to) =>
        supabase.from("seo_page_conversions_30d").select("page_slug,conversions").order("page_slug", { ascending: true }).range(from, to),
      ),
    ]);
    if (dash.error) setError(dash.error.message);
    else setData(dash.data as unknown as ExecutiveDashboard);
    if (state.error) setError(state.error.message);
    else setCopilot(state.data as unknown as CopilotState);
    const gsc = new Map<string, { clicks: number; impressions: number; ctr: number; position: number }>();
    for (const row of gscRows) if (!gsc.has(row.page_id)) gsc.set(row.page_id, row);
    const conv = new Map<string, number | null>();
    for (const row of conversions) if (row.page_slug) conv.set(row.page_slug, row.conversions);
    setActionPageMetrics(pages.map((page) => {
      const g = gsc.get(page.id);
      return {
        page_id: page.id,
        slug: page.slug,
        url: `/${page.slug}`,
        title: page.title,
        city: page.city_slug,
        service: page.service_slug,
        impressions: g?.impressions ?? null,
        clicks: g?.clicks ?? null,
        ctr: g?.ctr ?? null,
        position: g?.position ?? null,
        conversions: conv.get(page.slug) ?? null,
      };
    }));
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

  const setOpportunityStatus = useCallback(async (
    id: string,
    status: "dismissed" | "in_progress" | "completed" | "open" | "error",
    extra?: { error?: string | null; reason?: string | null },
  ) => {
    const now = new Date().toISOString();
    const patch = {
      status,
      updated_at: now,
      ...(status === "dismissed" ? { dismissed_at: now, dismiss_reason: extra?.reason ?? null } : {}),
      ...(status === "completed" ? { applied_at: now, resolved_at: now, last_error: null } : {}),
      ...(status === "in_progress" ? { work_started_at: now, last_error: null } : {}),
      ...(status === "error" ? { last_error: extra?.error ?? "Erreur inconnue" } : {}),
      ...(status === "open" ? { dismissed_at: null, last_error: null } : {}),
    };
    const { error: e } = await supabase.from("seo_opportunities").update(patch).eq("id", id);
    if (e) { toast.error(e.message); return; }
    await load();
  }, [load]);

  const dismissOpportunity = useCallback((id: string) => setOpportunityStatus(id, "dismissed"), [setOpportunityStatus]);

  return { data, copilot, actionPageMetrics, loading, scanning, step, error, reload: load, rescan, dismissOpportunity, setOpportunityStatus };
}
