// Deno edge function — Sync Google Search Console metrics for all published
// SEO pages via the Lovable connector gateway. Admin-only (or cron with the
// service-role key).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SITE_URL = "https://vracquebec.ca";
const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function isoDaysAgo(days: number): string {
  const d = new Date(); d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function callGsc(path: string, method: "GET" | "POST", body?: unknown) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gscKey = Deno.env.get("GOOGLE_SEARCH_CONSOLE_API_KEY");
  if (!lovableKey || !gscKey) throw new Error("Connecteur Google Search Console non configuré");
  const resp = await fetch(`${GATEWAY}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gscKey,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GSC ${resp.status}: ${text.slice(0, 300)}`);
  }
  return resp.json();
}

async function fetchPageMetrics(siteUrlEncoded: string, siteUrl: string, days: number) {
  const data = await callGsc(
    `/webmasters/v3/sites/${siteUrlEncoded}/searchAnalytics/query`,
    "POST",
    {
      startDate: isoDaysAgo(days),
      endDate: isoDaysAgo(1),
      dimensions: ["page"],
      rowLimit: 5000,
    },
  );
  const map = new Map<string, { clicks: number; impressions: number; ctr: number; position: number }>();
  for (const row of data.rows ?? []) {
    const url = row.keys?.[0] as string | undefined;
    if (!url) continue;
    map.set(url, {
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    });
  }
  return map;
}

async function fetchTopQueriesForPage(siteUrlEncoded: string, pageUrl: string, days: number) {
  try {
    const data = await callGsc(
      `/webmasters/v3/sites/${siteUrlEncoded}/searchAnalytics/query`,
      "POST",
      {
        startDate: isoDaysAgo(days),
        endDate: isoDaysAgo(1),
        dimensions: ["query"],
        dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "equals", expression: pageUrl }] }],
        rowLimit: 10,
      },
    );
    return (data.rows ?? []).map((r: { keys?: string[]; clicks?: number; impressions?: number; position?: number }) => ({
      query: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      position: r.position ?? 0,
    }));
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Admin-only via user JWT when called from the browser
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const isCron = req.headers.get("Lovable-Context") === "cron";
    if (!isCron) {
      if (!jwt) return json({ error: "Non autorisé" }, 401);
      const { data: userData } = await supabase.auth.getUser(jwt);
      const uid = userData?.user?.id;
      if (!uid) return json({ error: "Session invalide" }, 401);
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);
    }

    // Verify the site exists in the connected GSC account, and pick the exact siteUrl
    let siteUrl = `${SITE_URL}/`;
    try {
      const sites = await callGsc("/webmasters/v3/sites", "GET");
      const entries: Array<{ siteUrl: string }> = sites.siteEntry ?? [];
      const match = entries.find((e) => e.siteUrl === `${SITE_URL}/` || e.siteUrl === `sc-domain:${SITE_URL.replace(/^https?:\/\//, "")}`);
      if (!match) {
        return json({ error: "Domaine non vérifié dans Google Search Console.", available: entries.map((e) => e.siteUrl) }, 400);
      }
      siteUrl = match.siteUrl;
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
    const siteUrlEncoded = encodeURIComponent(siteUrl);

    // Load all published pages
    const { data: pages, error: pErr } = await supabase
      .from("seo_pages").select("id, slug").eq("status", "published").limit(2000);
    if (pErr) return json({ error: pErr.message }, 500);

    const periods: Array<{ key: "7d" | "28d" | "90d"; days: number }> = [
      { key: "7d", days: 7 }, { key: "28d", days: 28 }, { key: "90d", days: 90 },
    ];

    let upserts = 0;
    for (const period of periods) {
      const metricsMap = await fetchPageMetrics(siteUrlEncoded, siteUrl, period.days);
      for (const p of pages ?? []) {
        const pageUrl = `${SITE_URL}/${p.slug}`;
        const m = metricsMap.get(pageUrl) ?? metricsMap.get(pageUrl + "/") ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
        // Only fetch top queries for the shortest window (7d) to save quota
        const topQueries = period.key === "28d" && m.impressions > 0
          ? await fetchTopQueriesForPage(siteUrlEncoded, pageUrl, period.days)
          : [];
        const indexStatus = m.impressions > 0 ? "indexed" : "unknown";
        await supabase.from("seo_gsc_metrics").upsert({
          page_id: p.id,
          period: period.key,
          clicks: Math.round(m.clicks),
          impressions: Math.round(m.impressions),
          ctr: Number((m.ctr ?? 0).toFixed(4)),
          position: Number((m.position ?? 0).toFixed(2)),
          top_queries: topQueries,
          index_status: indexStatus,
          fetched_at: new Date().toISOString(),
        }, { onConflict: "page_id,period" });
        // Propagate the freshest index hint onto seo_pages (from 28d window)
        if (period.key === "28d") {
          await supabase.from("seo_pages").update({
            google_index_status: indexStatus,
            google_last_checked_at: new Date().toISOString(),
          }).eq("id", p.id);
        }
        upserts++;
      }
    }

    return json({ ok: true, pages: pages?.length ?? 0, upserts, siteUrl });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});