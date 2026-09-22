// Orchestre les scans SEO (scan assistant + link check + suggestions) et
// génère un rapport stratégique agrégé dans public.strategic_reports.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function callFn(fn: string, authHeader: string, body: unknown = {}) {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify(body),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const isCron = req.headers.get("Lovable-Context") === "cron";
    let uid: string | null = null;
    if (!isCron) {
      const { data: u } = await supabase.auth.getUser(jwt);
      uid = u?.user?.id ?? null;
      if (!uid) return json({ error: "Non autorisé" }, 401);
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);
    }

    // Chain scans in parallel (they are idempotent and independent).
    const svcAuth = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    const scanResults = await Promise.all([
      callFn("seo-assistant-scan", isCron ? svcAuth : authHeader),
      callFn("seo-linkcheck", svcAuth).catch(() => ({ ok: false, status: 0 })),
      callFn("seo-suggest-pages", isCron ? svcAuth : authHeader).catch(() => ({ ok: false, status: 0 })),
    ]);

    // Load current SEO state.
    // Pagination complète : PostgREST plafonne chaque requête à 1 000 lignes.
    // Le rapport doit couvrir TOUTES les pages, jamais un échantillon.
    const PAGE_SIZE = 1000;
    type PageRow = {
      id: string; slug: string; title: string; status: string; word_count: number | null;
      seo_score: number | null; qa_last_score: number | null; internal_link_count: number | null;
      google_index_status: string | null; last_generated_at: string | null; noindex: boolean | null;
    };
    async function loadAllPages(): Promise<PageRow[]> {
      const out: PageRow[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data } = await supabase
          .from("seo_pages")
          .select("id,slug,title,status,word_count,seo_score,qa_last_score,internal_link_count,google_index_status,last_generated_at,noindex")
          .order("slug", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        const batch = (data ?? []) as PageRow[];
        out.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }
      return out;
    }

    const [allPages, recosRes, gscRes, blogRes, blogDraftRes, brokenRes] = await Promise.all([
      loadAllPages(),
      supabase.from("seo_recommendations").select("id,reco_type,priority,impact_estimate,effort_estimate,title").eq("status", "open").order("priority", { ascending: false }).limit(500),
      supabase.from("seo_gsc_metrics").select("page_id,impressions,clicks,ctr,position").eq("period", "28d").limit(5000),
      supabase.from("blog_posts").select("id,title,status,updated_at").eq("status", "published"),
      // Articles réellement à publier : brouillons et articles planifiés (jamais une formule).
      supabase.from("blog_posts").select("id", { count: "exact", head: true }).in("status", ["draft", "scheduled"]),
      supabase.from("seo_broken_links").select("id", { count: "exact", head: true }),
    ]);

    const pages = allPages;
    const recos = recosRes.data ?? [];
    const gsc = gscRes.data ?? [];
    const blogs = blogRes.data ?? [];
    const broken = brokenRes.count ?? 0;

    // Active job snapshot — feed live progress into the strategic report
    const { data: activeJob } = await supabase
      .from("seo_generation_jobs")
      .select("id,mode,wave,total,done,succeeded,failed,pages_per_minute,eta_seconds,current_step,started_at")
      .eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const staleThreshold = Date.now() - 60 * 86400 * 1000;
    const pagesToRefresh = pages.filter((p) =>
      p.status === "published" && p.last_generated_at && new Date(p.last_generated_at).getTime() < staleThreshold
    );
    const qaToFix = pages.filter((p) => (p.qa_last_score ?? 100) < 80 && p.status === "published");
    const linksToAdd = pages.filter((p) => p.status === "published" && (p.internal_link_count ?? 0) < 5)
      .reduce((sum, p) => sum + Math.max(0, 5 - (p.internal_link_count ?? 0)), 0);
    const pagesToCreate = recos.filter((r) => r.reco_type === "missing_city_page" || r.reco_type === "missing_service_content").length;
    const staleBlog = blogs.filter((b) => new Date(b.updated_at).getTime() < staleThreshold).length;

    // Rough projected gains: sum quick-win impressions × 0.02 CTR uplift.
    let projImpressionsGain = 0;
    let projClicksGain = 0;
    for (const g of gsc) {
      if (g.position >= 8 && g.position <= 20) {
        projImpressionsGain += Math.round((g.impressions ?? 0) * 0.15);
        projClicksGain += Math.round((g.impressions ?? 0) * 0.02);
      }
    }

    const totalImpr = gsc.reduce((s, g) => s + (g.impressions ?? 0), 0);
    const totalClicks = gsc.reduce((s, g) => s + (g.clicks ?? 0), 0);

    const payload = {
      generated_at: new Date().toISOString(),
      scans: scanResults,
      in_progress: activeJob ? {
        job_id: activeJob.id,
        mode: activeJob.mode,
        wave: activeJob.wave,
        total: activeJob.total,
        done: activeJob.done,
        succeeded: activeJob.succeeded,
        failed: activeJob.failed,
        pages_per_minute: activeJob.pages_per_minute,
        eta_seconds: activeJob.eta_seconds,
        current_step: activeJob.current_step,
        percent: activeJob.total ? Math.round((activeJob.done / activeJob.total) * 100) : 0,
      } : null,
      totals: {
        pages: pages.length,
        published: pages.filter((p) => p.status === "published").length + (activeJob?.succeeded ?? 0),
        drafts: pages.filter((p) => p.status === "draft").length,
        indexed: pages.filter((p) => p.google_index_status === "indexed").length,
        blog_posts: blogs.length,
        broken_links: broken,
        gsc_impressions_28d: totalImpr,
        gsc_clicks_28d: totalClicks,
      },
      actions: {
        pages_to_create: Math.max(0, pagesToCreate - (activeJob?.done ?? 0)),
        pages_to_refresh: pagesToRefresh.length,
        links_to_add: linksToAdd,
        qa_to_fix: qaToFix.length,
        blog_to_publish: Math.min(2, Math.max(0, Math.round((pagesToCreate + qaToFix.length) / 10))),
        stale_blog: staleBlog,
        pages_generating: activeJob?.done ?? 0,
      },
      projections: {
        impressions_gain_pct: totalImpr > 0 ? Math.round((projImpressionsGain / totalImpr) * 100) : 0,
        clicks_gain_pct: totalClicks > 0 ? Math.round((projClicksGain / Math.max(1, totalClicks)) * 100) : 0,
        impressions_gain_abs: projImpressionsGain,
        clicks_gain_abs: projClicksGain,
      },
      top_recommendations: recos.slice(0, 10),
    };

    const summaryLines = [
      `${payload.actions.pages_to_create} nouvelles pages recommandées`,
      `${payload.actions.pages_to_refresh} pages à rafraîchir`,
      `${payload.actions.links_to_add} liens internes à ajouter`,
      `${payload.actions.qa_to_fix} pages QA < 80 à corriger`,
      `Gain projeté : +${payload.projections.impressions_gain_pct}% impressions / +${payload.projections.clicks_gain_pct}% clics`,
    ];

    const { data: report, error: rErr } = await supabase.from("strategic_reports").insert({
      created_by: uid,
      payload,
      summary: summaryLines.join(" · "),
    }).select("id").single();
    if (rErr) return json({ error: rErr.message }, 500);

    return json({ ok: true, report_id: report?.id, payload, summary: summaryLines });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});