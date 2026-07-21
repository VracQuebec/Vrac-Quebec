import { supabase } from "@/integrations/supabase/client";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";

export class SeoApiError extends Error {
  constructor(public status: number, public payload: unknown, message: string) {
    super(message);
  }
}

/**
 * Central wrapper for all SEO edge-function calls.
 * Handles: fresh JWT, retry x2 on network errors, clean error body parsing.
 */
export async function invokeSeo<T = unknown>(
  fnName: string,
  body: Record<string, unknown> = {},
  opts: { retries?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data, error } = await invokeWithFreshSession<Record<string, unknown>, T>(fnName, body);
      if (error) {
        const status = (error as { status?: number }).status ?? 0;
        const msg = (error as Error)?.message ?? "Load failed";
        // Only retry on transient/network errors
        if (status === 0 || status >= 500) { lastErr = error; continue; }
        throw new SeoApiError(status, error, msg);
      }
      return data as T;
    } catch (e) {
      lastErr = e;
      if (e instanceof SeoApiError) throw e;
      // network error, retry
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : "Erreur réseau";
  throw new SeoApiError(0, lastErr, msg);
}

export type SeoStats = {
  computed_at: string;
  cities_total: number; materials_total: number; services_total: number;
  pages_total: number; pages_published: number; pages_draft: number; pages_needs_fix: number;
  cities_covered: number; materials_covered: number; services_covered: number;
  combinations_possible: number; combinations_created: number;
  qa_avg: number; seo_avg: number;
  gsc_impressions: number; gsc_clicks: number; gsc_position: number;
  coverage_cities_pct: number; coverage_materials_pct: number;
  coverage_services_pct: number; coverage_combinations_pct: number;
  waves: Array<{ code: string; name: string; priority: number; total: number; published: number; draft: number }>;
};

export async function fetchSeoStats(): Promise<SeoStats> {
  const { data, error } = await supabase.rpc("seo_dashboard_stats");
  if (error) throw new SeoApiError(0, error, error.message);
  return data as unknown as SeoStats;
}