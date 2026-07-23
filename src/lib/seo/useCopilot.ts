import { useCallback, useEffect, useState } from "react";
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

export type Opportunity = {
  id: string;
  type: string;
  title: string;
  rationale: string;
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
};

export type ExecutiveDashboard = {
  computed_at: string;
  kpi: ExecutiveKpi;
  top_gains_30d: GscDelta[];
  top_losses_30d: GscDelta[];
  top_opportunities: Opportunity[];
};

export function useCopilot() {
  const [data, setData] = useState<ExecutiveDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: d, error: e } = await supabase.rpc("seo_executive_dashboard");
    if (e) setError(e.message);
    else setData(d as unknown as ExecutiveDashboard);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rescan = useCallback(async () => {
    setScanning(true);
    try {
      await invokeWithFreshSession("seo-assistant-scan", {});
      toast.success("Analyse terminée");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setScanning(false);
    }
  }, [load]);

  const dismissOpportunity = useCallback(async (id: string) => {
    const { error: e } = await supabase.from("seo_opportunities")
      .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
      .eq("id", id);
    if (e) { toast.error(e.message); return; }
    await load();
  }, [load]);

  return { data, loading, scanning, error, reload: load, rescan, dismissOpportunity };
}