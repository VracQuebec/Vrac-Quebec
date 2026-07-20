import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

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

    const { data: goals } = await supabase.from("seo_goals").select("*").eq("active", true);
    if (!goals) return json({ ok: true, updated: 0 });
    const monthAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString();

    for (const g of goals) {
      let value = 0;
      switch (g.metric_type) {
        case "indexed_pages": {
          const { count } = await supabase.from("seo_pages").select("*", { count: "exact", head: true }).eq("google_index_status", "indexed");
          value = count ?? 0; break;
        }
        case "total_pages": {
          const { count } = await supabase.from("seo_pages").select("*", { count: "exact", head: true }).eq("status", "published");
          value = count ?? 0; break;
        }
        case "organic_clicks_month": {
          const { data } = await supabase.from("seo_gsc_metrics").select("clicks").eq("period", "28d");
          value = (data ?? []).reduce((s, r) => s + (r.clicks ?? 0), 0); break;
        }
        case "avg_ctr": {
          const { data } = await supabase.from("seo_gsc_metrics").select("ctr,impressions").eq("period", "28d");
          const rows = (data ?? []).filter((r) => (r.impressions ?? 0) > 0);
          value = rows.length ? rows.reduce((s, r) => s + (r.ctr ?? 0), 0) / rows.length : 0; break;
        }
        case "submissions_month": {
          const { count } = await supabase.from("submissions").select("*", { count: "exact", head: true }).gte("created_at", monthAgo);
          value = count ?? 0; break;
        }
        case "avg_seo_score": {
          const { data } = await supabase.from("seo_pages").select("seo_score").eq("status", "published").not("seo_score", "is", null);
          const scores = (data ?? []).map((r) => r.seo_score ?? 0);
          value = scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : 0; break;
        }
        case "keyword_rank": {
          if (!g.keyword) break;
          const { data } = await supabase.from("seo_gsc_metrics").select("top_queries").eq("period", "28d");
          let best = 100;
          for (const row of data ?? []) {
            const q = (row.top_queries as Array<{ query: string; position: number }> | null) ?? [];
            for (const item of q) {
              if (item.query?.toLowerCase().includes(g.keyword.toLowerCase()) && (item.position ?? 100) < best) best = item.position;
            }
          }
          value = best; break;
        }
      }
      await supabase.from("seo_goals").update({ current_value: value, last_refreshed_at: new Date().toISOString() }).eq("id", g.id);
    }
    return json({ ok: true, updated: goals.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});