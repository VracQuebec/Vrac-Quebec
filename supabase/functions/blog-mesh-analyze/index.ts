// Blog ↔ SEO auto-mesh analyzer.
// Deterministic scoring (city + material + service + keyword overlap) between
// published blog posts and published SEO landing pages.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type SeoPage = {
  id: string; slug: string; title: string; meta_description: string | null;
  city_slug: string; material_slug: string | null; service_slug: string | null;
};
type Post = {
  id: string; slug: string; title: string; excerpt: string | null;
  content: string | null; category_id: string | null;
};

function unaccent(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTerm(haystack: string, term: string): boolean {
  if (!term) return false;
  const t = unaccent(term).replace(/-/g, " ");
  if (!t) return false;
  return new RegExp(`(^|\\s)${t.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(\\s|$)`).test(haystack);
}

function scorePair(post: { text: string; title: string }, page: SeoPage, cityName: string, materialName: string, serviceName: string) {
  let score = 0;
  const reasons: Record<string, unknown> = {};
  const inTitle = (t: string) => hasTerm(post.title, t);

  if (page.city_slug) {
    const cityHit = hasTerm(post.text, cityName) || hasTerm(post.text, page.city_slug);
    if (cityHit) {
      score += 40 + (inTitle(cityName) ? 10 : 0);
      reasons.city = cityName;
    }
  }
  if (page.material_slug && materialName) {
    const matHit = hasTerm(post.text, materialName) || hasTerm(post.text, page.material_slug);
    if (matHit) {
      score += 30 + (inTitle(materialName) ? 10 : 0);
      reasons.material = materialName;
    }
  }
  if (page.service_slug && serviceName) {
    const svcHit = hasTerm(post.text, serviceName) || hasTerm(post.text, page.service_slug);
    if (svcHit) {
      score += 20 + (inTitle(serviceName) ? 5 : 0);
      reasons.service = serviceName;
    }
  }
  return { score, reasons };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    // Auth: require admin JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return respond({ error: "Missing token" }, 401);

    const authClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await authClient.auth.getUser(jwt);
    const user = userData?.user;
    if (!user) return respond({ error: "Invalid session" }, 401);
    const { data: isAdmin } = await authClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return respond({ error: "Admin only" }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = (await req.json().catch(() => ({}))) as { mode?: string; post_ids?: string[] };
    const mode = body.mode ?? "all";

    // Create run row
    const { data: run, error: runErr } = await admin
      .from("blog_mesh_runs")
      .insert({ status: "running", mode })
      .select("id")
      .single();
    if (runErr) return respond({ error: runErr.message }, 500);
    const runId = run!.id as string;

    // Load reference data
    const [{ data: cities }, { data: materials }, { data: services }, { data: seoPages }] = await Promise.all([
      admin.from("seo_cities").select("slug,name").eq("active", true),
      admin.from("seo_materials").select("slug,name,keywords").eq("active", true),
      admin.from("seo_services").select("slug,name").eq("active", true),
      admin.from("seo_pages").select("id,slug,title,meta_description,city_slug,material_slug,service_slug").eq("status", "published"),
    ]);
    const cityByS = new Map((cities ?? []).map((c: any) => [c.slug, c.name as string]));
    const matByS = new Map((materials ?? []).map((m: any) => [m.slug, m.name as string]));
    const svcByS = new Map((services ?? []).map((s: any) => [s.slug, s.name as string]));

    let postsQ = admin.from("blog_posts").select("id,slug,title,excerpt,content,category_id").eq("status", "published");
    if (mode === "single" && body.post_ids?.length) postsQ = postsQ.in("id", body.post_ids);
    if (mode === "orphans") {
      const { data: linkedRows } = await admin.from("blog_seo_links").select("blog_post_id");
      const linkedIds = (linkedRows ?? []).map((r: any) => r.blog_post_id);
      if (linkedIds.length) postsQ = postsQ.not("id", "in", `(${linkedIds.join(",")})`);
    }
    const { data: posts, error: postsErr } = await postsQ;
    if (postsErr) {
      await admin.from("blog_mesh_runs").update({ status: "failed", error: postsErr.message, finished_at: new Date().toISOString() }).eq("id", runId);
      return respond({ error: postsErr.message }, 500);
    }

    const THRESHOLD = 45;
    const MAX_LINKS_PER_POST = 5;

    let analyzed = 0;
    let linksCreated = 0;
    const orphanIds: string[] = [];
    const linkedPostIds = new Set<string>();

    // Fetch existing auto links once per post to know which to prune
    for (const post of (posts ?? []) as Post[]) {
      analyzed++;
      const text = unaccent(`${post.title} ${post.excerpt ?? ""} ${post.content ?? ""}`);
      const titleText = unaccent(post.title);

      const scored: Array<{ page: SeoPage; score: number; reasons: Record<string, unknown> }> = [];
      for (const page of (seoPages ?? []) as SeoPage[]) {
        const cityName = cityByS.get(page.city_slug) ?? page.city_slug;
        const materialName = page.material_slug ? (matByS.get(page.material_slug) ?? page.material_slug) : "";
        const serviceName = page.service_slug ? (svcByS.get(page.service_slug) ?? page.service_slug) : "";
        const { score, reasons } = scorePair(
          { text, title: titleText },
          page,
          cityName,
          materialName,
          serviceName,
        );
        if (score >= THRESHOLD) scored.push({ page, score, reasons });
      }
      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, MAX_LINKS_PER_POST);

      // Prune auto-generated links no longer matching
      const keepIds = new Set(top.map((t) => t.page.id));
      const { data: existing } = await admin
        .from("blog_seo_links")
        .select("seo_page_id, auto_generated, confirmed_by_admin")
        .eq("blog_post_id", post.id);
      const toDelete = (existing ?? [])
        .filter((e: any) => e.auto_generated && !e.confirmed_by_admin && !keepIds.has(e.seo_page_id))
        .map((e: any) => e.seo_page_id);
      if (toDelete.length) {
        await admin.from("blog_seo_links").delete().eq("blog_post_id", post.id).in("seo_page_id", toDelete);
      }

      if (top.length) {
        const rows = top.map((t) => ({
          blog_post_id: post.id,
          seo_page_id: t.page.id,
          relevance_score: t.score,
          match_reasons: t.reasons,
          auto_generated: true,
        }));
        const { error: upErr } = await admin
          .from("blog_seo_links")
          .upsert(rows, { onConflict: "blog_post_id,seo_page_id", ignoreDuplicates: false });
        if (!upErr) {
          linksCreated += top.length;
          linkedPostIds.add(post.id);
        }
      } else {
        orphanIds.push(post.id);
      }

      const meshScore = top.length ? Math.min(100, Math.round(top[0].score)) : 0;
      await admin.from("blog_posts").update({
        mesh_analyzed_at: new Date().toISOString(),
        mesh_score: meshScore,
      }).eq("id", post.id);
    }

    // Opportunities: SEO pages with no linked article
    const { data: uncoveredPages } = await admin
      .from("seo_pages")
      .select("id,slug,title,city_slug,material_slug,service_slug,status")
      .eq("status", "published");
    const { data: linkedSeoRows } = await admin.from("blog_seo_links").select("seo_page_id");
    const coveredSeoIds = new Set((linkedSeoRows ?? []).map((r: any) => r.seo_page_id));
    const uncovered = (uncoveredPages ?? []).filter((p: any) => !coveredSeoIds.has(p.id));
    const opportunities = [
      ...uncovered.slice(0, 50).map((p: any) => ({
        type: "seo_page_without_article",
        seo_page_id: p.id, slug: p.slug, title: p.title,
        suggestion: `Créer un article de blogue autour de « ${p.title} »`,
      })),
      ...orphanIds.slice(0, 50).map((id) => ({
        type: "orphan_article",
        blog_post_id: id,
        suggestion: "Aucune page SEO pertinente détectée — envisager une nouvelle page ville/matériau ou enrichir le contenu de l'article.",
      })),
    ];

    const stats = {
      analyzed,
      linked: linkedPostIds.size,
      orphans: orphanIds.length,
      links_created: linksCreated,
      opportunities_count: opportunities.length,
      seo_pages_uncovered: uncovered.length,
    };

    await admin.from("blog_mesh_runs").update({
      status: "completed",
      stats,
      orphan_post_ids: orphanIds,
      opportunities,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);

    return respond({ ok: true, run_id: runId, stats, opportunities: opportunities.slice(0, 20) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return respond({ error: msg }, 500);
  }
});