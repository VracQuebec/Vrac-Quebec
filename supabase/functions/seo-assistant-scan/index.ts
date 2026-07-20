// Assistant SEO — scanne pages/blog/GSC/entités et génère des recommandations
// actionnables dans public.seo_recommendations. Admin-only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

type Reco = {
  reco_type: string; entity_type: string; entity_id?: string | null;
  page_id?: string | null; blog_post_id?: string | null; entity_slug?: string | null;
  priority: number; impact_estimate: number; effort_estimate: number;
  title: string; rationale: string; action_type: string; payload?: Record<string, unknown>;
};

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

    const recos: Reco[] = [];

    // Load core datasets
    const [pagesRes, blogRes, gscRes, citiesRes, materialsRes, servicesRes] = await Promise.all([
      supabase.from("seo_pages").select("id,slug,title,city_slug,material_slug,service_slug,word_count,seo_score,internal_link_count,status,google_index_status,updated_at").limit(2000),
      supabase.from("blog_posts").select("id,slug,title,updated_at,view_count,status").eq("status", "published").limit(1000),
      supabase.from("seo_gsc_metrics").select("page_id,clicks,impressions,ctr,position,period").eq("period", "28d").limit(5000),
      supabase.from("seo_cities").select("slug,name,population,active"),
      supabase.from("seo_materials").select("slug,name,active"),
      supabase.from("seo_services").select("slug,name,active"),
    ]);

    const pages = pagesRes.data ?? [];
    const blogs = blogRes.data ?? [];
    const gsc = new Map<string, { clicks: number; impressions: number; ctr: number; position: number }>();
    for (const g of gscRes.data ?? []) gsc.set(g.page_id, g);
    const cities = (citiesRes.data ?? []).filter((c) => c.active);
    const materials = (materialsRes.data ?? []).filter((m) => m.active);
    const services = (servicesRes.data ?? []).filter((s) => s.active);

    // 1) Thin content
    for (const p of pages) {
      if ((p.word_count ?? 0) < 500 && p.status === "published") {
        recos.push({
          reco_type: "thin_content", entity_type: "page", page_id: p.id, entity_slug: p.slug,
          priority: 4, impact_estimate: 70, effort_estimate: 30,
          title: `Enrichir "${p.title}" (contenu trop court)`,
          rationale: `Seulement ${p.word_count ?? 0} mots — objectif 800+ pour ranker localement.`,
          action_type: "improve",
        });
      }
    }

    // 2) Quick win GSC (pos 8-20)
    for (const p of pages) {
      const g = gsc.get(p.id);
      if (g && g.position >= 8 && g.position <= 20 && g.impressions > 20) {
        recos.push({
          reco_type: "quick_win_gsc", entity_type: "page", page_id: p.id, entity_slug: p.slug,
          priority: 5, impact_estimate: 90, effort_estimate: 25,
          title: `Quick win : "${p.title}" est en position ${g.position.toFixed(1)}`,
          rationale: `${g.impressions} impressions / 28 j — améliorer méta et FAQ peut la propulser en première page.`,
          action_type: "improve",
          payload: { position: g.position, impressions: g.impressions },
        });
      }
    }

    // 3) Low CTR (impressions > 100, ctr < 0.02, pos <= 15)
    for (const p of pages) {
      const g = gsc.get(p.id);
      if (g && g.impressions > 100 && g.ctr < 0.02 && g.position <= 15) {
        recos.push({
          reco_type: "low_ctr", entity_type: "page", page_id: p.id, entity_slug: p.slug,
          priority: 4, impact_estimate: 60, effort_estimate: 15,
          title: `CTR faible sur "${p.title}"`,
          rationale: `${(g.ctr * 100).toFixed(2)}% de CTR pour ${g.impressions} impressions — réécrire le meta title.`,
          action_type: "update_meta",
        });
      }
    }

    // 4) Missing internal links
    for (const p of pages) {
      if ((p.internal_link_count ?? 0) < 3 && p.status === "published") {
        recos.push({
          reco_type: "missing_internal_links", entity_type: "page", page_id: p.id, entity_slug: p.slug,
          priority: 3, impact_estimate: 40, effort_estimate: 10,
          title: `Ajouter des liens internes à "${p.title}"`,
          rationale: `Seulement ${p.internal_link_count ?? 0} liens — vise 5+ liens vers pages/articles connexes.`,
          action_type: "attach_links",
        });
      }
    }

    // 5) Not indexed (published depuis 30j+ sans impressions)
    const monthAgo = Date.now() - 30 * 86400 * 1000;
    for (const p of pages) {
      if (p.status === "published" && new Date(p.updated_at).getTime() < monthAgo) {
        const g = gsc.get(p.id);
        if (!g || g.impressions === 0) {
          recos.push({
            reco_type: "not_indexed", entity_type: "page", page_id: p.id, entity_slug: p.slug,
            priority: 4, impact_estimate: 65, effort_estimate: 20,
            title: `"${p.title}" n'est pas indexée`,
            rationale: `Publiée depuis 30 j sans impression Google — améliorer contenu et liens entrants.`,
            action_type: "improve",
          });
        }
      }
    }

    // 6) Missing city pages
    const existingCombos = new Set(pages.map((p) => `${p.city_slug}|${p.material_slug ?? ""}`));
    const topMaterials = materials.slice(0, 5);
    for (const c of cities.slice(0, 15)) {
      for (const m of topMaterials) {
        if (!existingCombos.has(`${c.slug}|${m.slug}`)) {
          recos.push({
            reco_type: "missing_city_page", entity_type: "city", entity_slug: c.slug,
            priority: c.population && c.population > 20000 ? 4 : 3,
            impact_estimate: 55, effort_estimate: 20,
            title: `Créer la page ${m.name} × ${c.name}`,
            rationale: `Combinaison ciblée absente — population ${(c.population ?? 0).toLocaleString()}.`,
            action_type: "create",
            payload: { city_slug: c.slug, material_slug: m.slug },
          });
        }
      }
    }

    // 7) Stale blog posts (> 180 j)
    const staleThreshold = Date.now() - 180 * 86400 * 1000;
    for (const b of blogs) {
      if (new Date(b.updated_at).getTime() < staleThreshold) {
        recos.push({
          reco_type: "stale_blog", entity_type: "blog", blog_post_id: b.id, entity_slug: b.slug,
          priority: (b.view_count ?? 0) > 100 ? 4 : 2,
          impact_estimate: 50, effort_estimate: 30,
          title: `Mettre à jour l'article "${b.title}"`,
          rationale: `Dernière mise à jour il y a plus de 6 mois — Google favorise le contenu frais.`,
          action_type: "update_blog",
        });
      }
    }

    // 8) Services sans page (au moins 1 page par service)
    const servicesInPages = new Set(pages.map((p) => p.service_slug).filter(Boolean));
    for (const s of services) {
      if (!servicesInPages.has(s.slug)) {
        recos.push({
          reco_type: "missing_service_content", entity_type: "service", entity_slug: s.slug,
          priority: 3, impact_estimate: 45, effort_estimate: 25,
          title: `Créer du contenu pour le service ${s.name}`,
          rationale: `Aucune page SEO ne cible ce service — opportunité de couverture.`,
          action_type: "create",
          payload: { service_slug: s.slug },
        });
      }
    }

    // Purger les recos "open" existantes (on repart d'un scan frais) et insérer
    await supabase.from("seo_recommendations").delete().eq("status", "open");
    if (recos.length > 0) {
      const chunkSize = 200;
      for (let i = 0; i < recos.length; i += chunkSize) {
        await supabase.from("seo_recommendations").insert(recos.slice(i, i + chunkSize));
      }
    }

    // Recalcul priorité pages
    for (const p of pages) {
      const { data: sc } = await supabase.rpc("seo_priority_score", { _page_id: p.id });
      if (sc && typeof sc === "number") {
        await supabase.from("seo_pages").update({ priority: sc }).eq("id", p.id).eq("priority_locked", false);
      }
    }

    return json({ ok: true, count: recos.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});