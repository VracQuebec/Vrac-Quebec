// Mesure Core Web Vitals via l'API publique PageSpeed Insights (aucune clé requise).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function measure(url: string, strategy: "mobile" | "desktop") {
  const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance`;
  const r = await fetch(api, { signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`PageSpeed ${r.status}`);
  const data = await r.json();
  const lh = data.lighthouseResult ?? {};
  const audits = lh.audits ?? {};
  const perfScore = Math.round((lh.categories?.performance?.score ?? 0) * 100);
  return {
    url, strategy,
    performance_score: perfScore,
    lcp_ms: Math.round(audits["largest-contentful-paint"]?.numericValue ?? 0),
    cls: Number((audits["cumulative-layout-shift"]?.numericValue ?? 0).toFixed(3)),
    inp_ms: Math.round(audits["interaction-to-next-paint"]?.numericValue ?? 0),
    fcp_ms: Math.round(audits["first-contentful-paint"]?.numericValue ?? 0),
    ttfb_ms: Math.round(audits["server-response-time"]?.numericValue ?? 0),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const isCron = req.headers.get("Lovable-Context") === "cron";
    if (!isCron) {
      const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
      const { data: u } = await supabase.auth.getUser(jwt);
      if (!u?.user?.id) return json({ error: "Non autorisé" }, 401);
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
      if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const targetUrl: string | undefined = body?.url;
    const strategy: "mobile" | "desktop" = body?.strategy ?? "mobile";

    const urls: string[] = targetUrl ? [targetUrl] : ["https://vracquebec.ca/"];
    // If no URL provided, also add top 5 published SEO pages
    if (!targetUrl) {
      const { data: pages } = await supabase.from("seo_pages")
        .select("slug").eq("status", "published").order("view_count", { ascending: false }).limit(5);
      for (const p of pages ?? []) urls.push(`https://vracquebec.ca/${p.slug}`);
    }

    const rows: Array<Record<string, unknown>> = [];
    for (const u of urls) {
      try {
        const res = await measure(u, strategy);
        const { data: pg } = await supabase.from("seo_pages").select("id").eq("slug", u.replace(/^https?:\/\/[^/]+\//, "")).maybeSingle();
        rows.push({ ...res, page_id: pg?.id ?? null });
      } catch (e) {
        console.error("pagespeed fail", u, e);
      }
    }
    if (rows.length > 0) await supabase.from("seo_pagespeed_snapshots").insert(rows);
    return json({ ok: true, measured: rows.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});