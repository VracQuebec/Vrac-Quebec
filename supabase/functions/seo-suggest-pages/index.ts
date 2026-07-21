// Génère des suggestions de nouvelles pages SEO (combinaisons ville×matériau,
// ville×service) validées: pas de doublon, pas de cannibalisation, avec
// scores de potentiel, difficulté, temps et priorité. Écrit dans seo_recommendations.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function trigrams(s: string): Set<string> {
  const norm = s.toLowerCase().replace(/[^a-z0-9à-ÿ ]+/g, " ").replace(/\s+/g, " ").trim();
  const out = new Set<string>();
  for (let i = 0; i < norm.length - 2; i++) out.add(norm.slice(i, i + 3));
  return out;
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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

    const [citiesRes, materialsRes, servicesRes, pagesRes, gscRes] = await Promise.all([
      supabase.from("seo_cities").select("slug,name,population,region,active").eq("active", true),
      supabase.from("seo_materials").select("slug,name,active").eq("active", true),
      supabase.from("seo_services").select("slug,name,active").eq("active", true),
      supabase.from("seo_pages").select("id,slug,title,city_slug,material_slug,service_slug,status"),
      supabase.from("seo_gsc_metrics").select("page_id,impressions,position").eq("period", "28d"),
    ]);

    const cities = citiesRes.data ?? [];
    const materials = materialsRes.data ?? [];
    const services = servicesRes.data ?? [];
    const pages = pagesRes.data ?? [];
    const gsc = new Map<string, { impressions: number; position: number }>();
    for (const g of gscRes.data ?? []) gsc.set(g.page_id, g);

    const existingMat = new Set<string>();
    const existingSvc = new Set<string>();
    for (const p of pages) {
      if (p.material_slug) existingMat.add(`${p.city_slug}|${p.material_slug}`);
      if (p.service_slug) existingSvc.add(`${p.city_slug}|${p.service_slug}`);
    }
    const titleIndex = pages
      .filter((p) => p.status === "published")
      .map((p) => ({ slug: p.slug, tri: trigrams(String(p.title || "")) }));

    const cityDifficulty = new Map<string, number>();
    for (const p of pages) {
      const g = gsc.get(p.id);
      if (!g) continue;
      cityDifficulty.set(p.city_slug, (cityDifficulty.get(p.city_slug) ?? 0) + g.position);
    }

    const materialBoost: Record<string, number> = {
      "terre-vegetale": 1.4, "sable": 1.2, "gravier": 1.3, "pierre-concassee": 1.35,
      "remblai": 1.5, "criblure": 0.9, "asphalte": 1.1, "beton": 1.15,
    };

    type Suggestion = {
      reco_type: string; entity_type: string; entity_slug: string;
      priority: number; impact_estimate: number; effort_estimate: number;
      title: string; rationale: string; action_type: string;
      payload: Record<string, unknown>;
    };
    const suggestions: Suggestion[] = [];

    for (const c of cities) {
      const pop = c.population ?? 5000;
      for (const m of materials) {
        const key = `${c.slug}|${m.slug}`;
        if (existingMat.has(key)) continue;
        const candidateTitle = `${m.name} à ${c.name}`;
        const candTri = trigrams(candidateTitle);
        let maxSim = 0;
        for (const t of titleIndex) {
          const sim = jaccard(candTri, t.tri);
          if (sim > maxSim) maxSim = sim;
          if (maxSim >= 0.75) break;
        }
        if (maxSim >= 0.75) continue;

        const boost = materialBoost[m.slug] ?? 1;
        const potential = Math.min(100, Math.round((pop / 3000) * 30 * boost));
        const trafficEstimate = Math.round((pop / 1000) * 4 * boost);
        const diffSample = cityDifficulty.get(c.slug);
        const difficulty = diffSample && diffSample > 0 ? Math.min(100, Math.round(diffSample / 3)) : 45;
        const priority = potential >= 60 ? 5 : potential >= 40 ? 4 : potential >= 20 ? 3 : 2;

        suggestions.push({
          reco_type: "smart_new_page", entity_type: "city", entity_slug: c.slug,
          priority, impact_estimate: potential, effort_estimate: 25,
          title: `Créer « ${candidateTitle} »`,
          rationale: `Population ${pop.toLocaleString("fr-CA")} · Potentiel ${potential}/100 · Trafic ~${trafficEstimate}/mois · Difficulté ${difficulty}/100`,
          action_type: "create",
          payload: {
            city_slug: c.slug, material_slug: m.slug,
            potential, traffic_estimate_monthly: trafficEstimate,
            difficulty, estimated_time_minutes: 15,
            cannibalization_risk: Math.round(maxSim * 100),
            reason: `${m.name} × ${c.name} non couvert. Population et demande favorables.`,
          },
        });
      }

      for (const s of services) {
        const key = `${c.slug}|${s.slug}`;
        if (existingSvc.has(key)) continue;
        const potential = Math.min(80, Math.round((pop / 4000) * 25));
        suggestions.push({
          reco_type: "smart_new_service_page", entity_type: "city", entity_slug: c.slug,
          priority: potential >= 40 ? 4 : 2, impact_estimate: potential, effort_estimate: 20,
          title: `Créer « ${s.name} à ${c.name} »`,
          rationale: `Service ${s.name} non couvert à ${c.name} · Potentiel ${potential}/100`,
          action_type: "create",
          payload: {
            city_slug: c.slug, service_slug: s.slug,
            potential, traffic_estimate_monthly: Math.round((pop / 1500) * 2),
            difficulty: 40, estimated_time_minutes: 15,
            reason: `${s.name} × ${c.name} non couvert.`,
          },
        });
      }
    }

    suggestions.sort((a, b) => b.impact_estimate - a.impact_estimate);
    const top = suggestions.slice(0, 200);

    await supabase.from("seo_recommendations").delete()
      .in("reco_type", ["smart_new_page", "smart_new_service_page"])
      .eq("status", "open");
    if (top.length > 0) {
      const chunk = 200;
      for (let i = 0; i < top.length; i += chunk) {
        await supabase.from("seo_recommendations").insert(top.slice(i, i + chunk));
      }
    }

    return json({ ok: true, count: top.length, total_candidates: suggestions.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});