// Copilote SEO — moteur de priorisation déterministe (admin-only).
// Architecture : DONNÉES RÉELLES → SIGNAUX → FILTRE DE PERTINENCE → SCORING EXPLICABLE → OPPORTUNITÉS → TOP 10.
// Lecture seule sur les pages SEO : aucune page n'est créée, modifiée, publiée ou supprimée.
// Aucune donnée inventée : une valeur absente reste « donnée insuffisante ».
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  CATEGORY_OF, evaluateRelevance, expectedImpact, priorityOf, scoreSignal,
  servicePriority, topOpportunities,
  type ScoreFactor, type SignalContext, type SignalType,
} from "../_shared/copilot-scoring.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

type Page = {
  id: string; slug: string; title: string | null;
  city_slug: string | null; material_slug: string | null; service_slug: string | null;
  status: string | null; published_at: string | null; updated_at: string;
  word_count: number | null; internal_link_count: number | null;
  seo_score: number | null; qa_last_score: number | null;
  google_index_status: string | null; indexed_at: string | null; noindex: boolean | null;
  meta_title: string | null; meta_description: string | null;
};
type Gsc = { page_id: string; clicks: number; impressions: number; ctr: number; position: number };
type Conv = {
  page_slug: string; views: number | null; phone_clicks: number | null; whatsapp_clicks: number | null;
  email_clicks: number | null; submissions: number | null; cta_clicks: number | null; conversions: number | null;
};

type RawSignal = {
  signal_key: string;
  type: SignalType;
  page_id?: string | null;
  entity_type: string;
  entity_slug?: string | null;
  target_city_slug?: string | null;
  target_service_slug?: string | null;
  target_material_slug?: string | null;
  url?: string | null;
  title: string;
  reason: string;
  recommended_action: string;
  suggested_action: "create" | "optimize" | "merge" | "delete" | "ignore";
  effort_score: number;
  data: Record<string, unknown>;
  source: string;
  potential_searches?: number | null;
  ctx: SignalContext;
};

const pct = (n: number) => `${(n * 100).toFixed(2)} %`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const t0 = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let runId: string | null = null;
  try {
    const isCron = req.headers.get("Lovable-Context") === "cron";
    if (!isCron) {
      const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
      const { data: u } = await supabase.auth.getUser(jwt);
      if (!u?.user?.id) return json({ error: "Non autorisé" }, 401);
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
      if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);
    }

    const { data: prevRun } = await supabase.from("seo_opportunity_runs")
      .select("id,started_at,opportunities_detected").eq("status", "success")
      .order("started_at", { ascending: false }).limit(1).maybeSingle();

    const { data: runRow, error: runErr } = await supabase
      .from("seo_opportunity_runs").insert({ status: "running", period: "28d" }).select("id").single();
    if (runErr) return json({ error: `Impossible de démarrer l'analyse : ${runErr.message}` }, 500);
    runId = runRow!.id as string;

    // ---------- Données réelles (lectures groupées, PostgREST plafonne à 1 000 lignes) ----------
    const fetchAll = async <T>(
      build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
      label: string,
    ): Promise<T[]> => {
      const out: T[] = [];
      const size = 1000;
      for (let from = 0; from < 20000; from += size) {
        const { data, error } = await build(from, from + size - 1);
        if (error) throw new Error(`${label} : ${error.message}`);
        const rows = data ?? [];
        out.push(...rows);
        if (rows.length < size) break;
      }
      return out;
    };

    const [pages, gscRows, convRows] = await Promise.all([
      fetchAll<Page>((from, to) => supabase.from("seo_pages")
        .select("id,slug,title,city_slug,material_slug,service_slug,status,published_at,updated_at,word_count,internal_link_count,seo_score,qa_last_score,google_index_status,indexed_at,noindex,meta_title,meta_description")
        .order("id", { ascending: true }).range(from, to), "seo_pages"),
      fetchAll<Gsc & { fetched_at: string }>((from, to) => supabase.from("seo_gsc_metrics")
        .select("page_id,clicks,impressions,ctr,position,fetched_at").eq("period", "28d")
        .order("fetched_at", { ascending: false }).range(from, to), "seo_gsc_metrics"),
      fetchAll<Conv>((from, to) => supabase.from("seo_page_conversions_30d")
        .select("page_slug,views,phone_clicks,whatsapp_clicks,email_clicks,submissions,cta_clicks,conversions")
        .order("page_slug", { ascending: true }).range(from, to), "conversions"),
    ]);

    const gsc = new Map<string, Gsc>();
    let impressionsAnalyzed = 0;
    for (const g of gscRows) {
      if (!gsc.has(g.page_id)) { gsc.set(g.page_id, g); impressionsAnalyzed += g.impressions ?? 0; }
    }
    const conv = new Map<string, Conv>();
    let conversionsAnalyzed = 0;
    for (const c of convRows) { conv.set(c.page_slug, c); conversionsAnalyzed += c.conversions ?? 0; }

    const published = pages.filter((p) => p.status === "published" || p.published_at);
    const indexed = pages.filter((p) => p.google_index_status === "indexed" || p.indexed_at);
    const pageById = new Map(pages.map((p) => [p.id, p]));

    const raw: RawSignal[] = [];
    const rules: Array<{ code: string; label: string; candidates: number; retained: number; note?: string }> = [];
    const add = (code: string, label: string, candidates: number, retained: number, note?: string) =>
      rules.push({ code, label, candidates, retained, note });

    const urlOf = (p: Page) => `https://vracquebec.ca/${p.slug}`;
    const nameOf = (p: Page) => p.title || p.slug;
    const isIndexed = (p: Page) => p.google_index_status === "indexed" || !!p.indexed_at;

    // Pages « sœurs » ciblant la même intention (territoire × service × matériau).
    const siblings = new Map<string, number>();
    for (const p of published) {
      if (!p.city_slug || !p.service_slug) continue;
      const k = `${p.city_slug}|${p.service_slug}|${p.material_slug ?? "-"}`;
      siblings.set(k, (siblings.get(k) ?? 0) + 1);
    }
    const siblingsOf = (p: Page) =>
      p.city_slug && p.service_slug ? siblings.get(`${p.city_slug}|${p.service_slug}|${p.material_slug ?? "-"}`) ?? 1 : 1;

    const ctxOf = (p: Page, type: SignalType, extra: Partial<SignalContext> = {}): SignalContext => {
      const g = gsc.get(p.id);
      const c = conv.get(p.slug);
      return {
        type,
        impressions: g ? g.impressions : null,
        clicks: g ? g.clicks : null,
        ctr: g ? g.ctr : null,
        position: g ? g.position : null,
        conversions: c ? c.conversions ?? 0 : 0,
        qa: p.qa_last_score,
        indexed: isIndexed(p),
        noindex: p.noindex,
        wordCount: p.word_count,
        internalLinks: p.internal_link_count,
        serviceSlug: p.service_slug,
        citySlug: p.city_slug,
        siblingPages: siblingsOf(p),
        ...extra,
      };
    };

    // ---------- A. Impressions élevées, clics faibles ----------
    {
      let cand = 0, kept = 0;
      for (const p of published) {
        const g = gsc.get(p.id);
        if (!g || g.impressions < 100) continue;
        cand++;
        if (g.ctr >= 0.02) continue;
        raw.push({
          signal_key: `high_impr_low_ctr:${p.id}`, type: "high_impr_low_ctr", page_id: p.id,
          entity_type: "page", entity_slug: p.slug, url: urlOf(p),
          target_city_slug: p.city_slug, target_service_slug: p.service_slug, target_material_slug: p.material_slug,
          title: `Optimiser le title et la meta — ${nameOf(p)}`,
          reason: `${g.impressions} impressions sur 28 j mais seulement ${g.clicks} clic(s) (CTR ${pct(g.ctr)}) en position ${g.position.toFixed(1)}. La visibilité existe déjà, c'est le clic qui manque.`,
          recommended_action: "Réécrire le title (requête + territoire + bénéfice) et la meta description, puis suivre le CTR sur la prochaine période.",
          suggested_action: "optimize", effort_score: 15,
          data: { impressions: g.impressions, clicks: g.clicks, ctr: g.ctr, position: g.position, conversions: conv.get(p.slug)?.conversions ?? 0, meta_title: p.meta_title, meta_description: p.meta_description },
          source: "Search Console (28 j) + pages SEO",
          potential_searches: g.impressions,
          ctx: ctxOf(p, "high_impr_low_ctr"),
        });
        kept++;
      }
      add("high_impr_low_ctr", "Impressions élevées / clics faibles", cand, kept, "≥ 100 impressions et CTR < 2 %");
    }

    // ---------- B. Position 3-10 mais CTR faible ----------
    {
      let cand = 0, kept = 0;
      for (const p of published) {
        const g = gsc.get(p.id);
        if (!g || g.impressions < 30 || g.position < 3 || g.position > 10) continue;
        cand++;
        if (g.ctr >= 0.05) continue;
        if (raw.some((s) => s.page_id === p.id)) continue;
        raw.push({
          signal_key: `ctr_top10:${p.id}`, type: "ctr_top10", page_id: p.id,
          entity_type: "page", entity_slug: p.slug, url: urlOf(p),
          target_city_slug: p.city_slug, target_service_slug: p.service_slug, target_material_slug: p.material_slug,
          title: `Améliorer le CTR en page 1 — ${nameOf(p)}`,
          reason: `Position moyenne ${g.position.toFixed(1)} avec ${g.impressions} impressions, mais ${g.clicks} clic(s) seulement (CTR ${pct(g.ctr)}).`,
          recommended_action: "Réécrire le title pour coller à la requête et ajouter un bénéfice concret (zone desservie, délai, type de camion) dans la meta description.",
          suggested_action: "optimize", effort_score: 15,
          data: { impressions: g.impressions, clicks: g.clicks, ctr: g.ctr, position: g.position, conversions: conv.get(p.slug)?.conversions ?? 0 },
          source: "Search Console (28 j)",
          potential_searches: g.impressions,
          ctx: ctxOf(p, "ctr_top10"),
        });
        kept++;
      }
      add("ctr_top10", "Position 3-10 avec CTR faible", cand, kept, "position 3-10, ≥ 30 impressions, CTR < 5 %");
    }

    // ---------- C. Visibilité réelle, position 11-30 ----------
    {
      let cand = 0, kept = 0;
      for (const p of published) {
        const g = gsc.get(p.id);
        if (!g || g.impressions < 30 || g.position <= 10) continue;
        cand++;
        if (raw.some((s) => s.page_id === p.id)) continue;
        raw.push({
          signal_key: `position_gain:${p.id}`, type: "position_gain", page_id: p.id,
          entity_type: "page", entity_slug: p.slug, url: urlOf(p),
          target_city_slug: p.city_slug, target_service_slug: p.service_slug, target_material_slug: p.material_slug,
          title: `Enrichir le contenu pour viser la page 1 — ${nameOf(p)}`,
          reason: `${g.impressions} impressions sur 28 j en position moyenne ${g.position.toFixed(1)} (${g.clicks} clic(s)). Aucun gain de position n'est garanti.`,
          recommended_action: "Enrichir le contenu sur l'intention principale, ajouter une FAQ locale et pointer 2-3 liens internes depuis les pages du même territoire.",
          suggested_action: "optimize", effort_score: 35,
          data: { impressions: g.impressions, clicks: g.clicks, ctr: g.ctr, position: g.position, conversions: conv.get(p.slug)?.conversions ?? 0, word_count: p.word_count, internal_link_count: p.internal_link_count },
          source: "Search Console (28 j) + contenu de la page",
          potential_searches: g.impressions,
          ctx: ctxOf(p, "position_gain"),
        });
        kept++;
      }
      add("position_gain", "Visibilité réelle, position au-delà de 10", cand, kept, "≥ 30 impressions, position > 10");
    }

    // ---------- D. Publiées mais non indexées ----------
    {
      let cand = 0, kept = 0;
      const cutoff = Date.now() - 21 * 86400 * 1000;
      const bulk: string[] = [];
      for (const p of published) {
        if (new Date(p.published_at ?? p.updated_at).getTime() > cutoff) continue;
        if (isIndexed(p)) continue;
        cand++;
        const g = gsc.get(p.id);
        const c = conv.get(p.slug);
        const important = !!p.noindex || (g?.impressions ?? 0) > 0 || (c?.conversions ?? 0) > 0;
        if (!important) { bulk.push(p.slug); continue; }
        const issues: string[] = [];
        if (p.noindex) issues.push("balise noindex active");
        if ((p.word_count ?? 0) < 400) issues.push(`contenu court (${p.word_count ?? 0} mots)`);
        if ((p.internal_link_count ?? 0) < 3) issues.push(`peu de liens internes (${p.internal_link_count ?? 0})`);
        raw.push({
          signal_key: `not_indexed:${p.id}`, type: "not_indexed", page_id: p.id,
          entity_type: "page", entity_slug: p.slug, url: urlOf(p),
          target_city_slug: p.city_slug, target_service_slug: p.service_slug, target_material_slug: p.material_slug,
          title: p.noindex ? `Corriger l'indexation (noindex) — ${nameOf(p)}` : `Corriger l'indexation — ${nameOf(p)}`,
          reason: `Publiée depuis plus de 21 jours sans statut « indexée », alors qu'elle reçoit ${g?.impressions ?? 0} impression(s) et ${c?.conversions ?? 0} conversion(s).${issues.length ? ` Problèmes détectables : ${issues.join(", ")}.` : ""}`,
          recommended_action: p.noindex
            ? "Retirer la balise noindex si la page doit être indexée, puis vérifier l'URL dans Search Console."
            : "Vérifier l'URL dans Search Console, renforcer le contenu et ajouter des liens internes vers cette page.",
          suggested_action: "optimize", effort_score: 25,
          data: {
            published_at: p.published_at, google_index_status: p.google_index_status ?? "inconnu",
            impressions: g?.impressions ?? 0, conversions: c?.conversions ?? 0,
            word_count: p.word_count, internal_link_count: p.internal_link_count, noindex: !!p.noindex, issues,
          },
          source: "Pages SEO + Search Console (28 j) + conversions (30 j)",
          ctx: ctxOf(p, "not_indexed"),
        });
        kept++;
      }
      if (bulk.length > 0) {
        raw.push({
          signal_key: "not_indexed_bulk", type: "not_indexed_bulk", entity_type: "group",
          title: `${bulk.length} pages publiées sans statut d'indexation`,
          reason: `${bulk.length} pages publiées depuis plus de 21 jours n'ont aucun statut « indexée » ni impression Search Console. Statut Search Console inconnu : la cause exacte n'est pas déterminable avec les données disponibles.`,
          recommended_action: "Vérifier la couverture dans Search Console (sitemap soumis, pages découvertes), puis renforcer le maillage interne vers les territoires stratégiques. Aucune page n'est modifiée automatiquement.",
          suggested_action: "optimize", effort_score: 50,
          data: { pages_concernees: bulk.length, exemples: bulk.slice(0, 20), donnee: "statut Search Console inconnu" },
          source: "Pages SEO + Search Console (28 j)",
          ctx: {
            type: "not_indexed_bulk", impressions: 0, clicks: 0, ctr: null, position: null,
            conversions: 0, qa: null, indexed: false, groupPages: bulk.length,
          },
        });
        kept++;
      }
      add("not_indexed", "Publiées non indexées", cand, kept, "publiées > 21 j sans statut indexée (regroupées si aucun signal)");
    }

    // ---------- E. Pages qui convertissent ----------
    {
      let cand = 0, kept = 0;
      for (const p of published) {
        const c = conv.get(p.slug);
        const conversions = c?.conversions ?? 0;
        if (conversions <= 0) continue;
        cand++;
        const g = gsc.get(p.id);
        const weak: string[] = [];
        if ((p.qa_last_score ?? 100) < 85) weak.push(`QA ${p.qa_last_score}/100`);
        if (g && g.position > 5) weak.push(`position ${g.position.toFixed(1)}`);
        if (g && g.impressions >= 30 && g.ctr < 0.05) weak.push(`CTR ${pct(g.ctr)}`);
        if ((p.internal_link_count ?? 0) < 5) weak.push(`${p.internal_link_count ?? 0} liens internes`);
        if (!weak.length) continue;
        raw.push({
          signal_key: `converting_page:${p.id}`, type: "converting_page", page_id: p.id,
          entity_type: "page", entity_slug: p.slug, url: urlOf(p),
          target_city_slug: p.city_slug, target_service_slug: p.service_slug, target_material_slug: p.material_slug,
          title: `Renforcer une page qui convertit — ${nameOf(p)}`,
          reason: `Cette page a déjà généré ${conversions} conversion(s) sur 30 j (téléphone ${c?.phone_clicks ?? 0}, WhatsApp ${c?.whatsapp_clicks ?? 0}, courriel ${c?.email_clicks ?? 0}, demandes ${c?.submissions ?? 0}). Points améliorables : ${weak.join(", ")}.`,
          recommended_action: "Traiter en priorité : corriger les faiblesses détectées, soigner le CTA et pointer davantage de liens internes vers cette page.",
          suggested_action: "optimize", effort_score: 25,
          data: {
            conversions, phone: c?.phone_clicks ?? 0, whatsapp: c?.whatsapp_clicks ?? 0,
            email: c?.email_clicks ?? 0, submissions: c?.submissions ?? 0, views: c?.views ?? 0,
            qa: p.qa_last_score, position: g?.position ?? null, impressions: g?.impressions ?? 0,
            clicks: g?.clicks ?? 0, weaknesses: weak,
          },
          source: "Conversions (30 j) + Search Console + QA",
          ctx: ctxOf(p, "converting_page"),
        });
        kept++;
      }
      add("converting_page", "Pages avec conversions", cand, kept, "≥ 1 conversion et faiblesse détectée");
    }

    // ---------- F. Territoire × service ----------
    type Agg = { impressions: number; clicks: number; conversions: number; posSum: number; n: number; pages: string[] };
    const comboAgg = new Map<string, Agg & { city: string; service: string }>();
    for (const p of published) {
      if (!p.city_slug || !p.service_slug) continue;
      const g = gsc.get(p.id); const c = conv.get(p.slug);
      const key = `${p.city_slug}|${p.service_slug}`;
      const a = comboAgg.get(key) ?? { impressions: 0, clicks: 0, conversions: 0, posSum: 0, n: 0, pages: [], city: p.city_slug, service: p.service_slug };
      a.impressions += g?.impressions ?? 0; a.clicks += g?.clicks ?? 0; a.conversions += c?.conversions ?? 0;
      if (g) { a.posSum += g.position; a.n++; }
      a.pages.push(p.slug);
      comboAgg.set(key, a);
    }
    {
      let cand = 0, kept = 0;
      for (const [key, a] of comboAgg) {
        if (a.impressions < 50) continue;
        cand++;
        const avgPos = a.n ? a.posSum / a.n : null;
        const ctr = a.impressions ? a.clicks / a.impressions : 0;
        if (!(ctr < 0.03 || (avgPos != null && avgPos > 8))) continue;
        raw.push({
          signal_key: `local_potential:${key}`, type: "local_potential",
          entity_type: "combo", entity_slug: key,
          target_city_slug: a.city, target_service_slug: a.service,
          title: `Renforcer ${a.service} à ${a.city}`,
          reason: `${a.pages.length} page(s) publiée(s) sur ce couple territoire/service cumulent ${a.impressions} impressions, ${a.clicks} clic(s), position moyenne ${avgPos != null ? avgPos.toFixed(1) : "donnée insuffisante"} et ${a.conversions} conversion(s).`,
          recommended_action: "Renforcer d'abord les pages existantes de ce couple (contenu, maillage territorial, meta). Ne créer une nouvelle page que si les données le justifient — aucune création automatique.",
          suggested_action: "optimize", effort_score: 40,
          data: { impressions: a.impressions, clicks: a.clicks, ctr, position_avg: avgPos, conversions: a.conversions, pages: a.pages },
          source: "Search Console + conversions + territoires/services",
          potential_searches: a.impressions,
          ctx: {
            type: "local_potential", impressions: a.impressions, clicks: a.clicks, ctr,
            position: avgPos, conversions: a.conversions, qa: null, indexed: null,
            serviceSlug: a.service, citySlug: a.city, groupPages: a.pages.length,
          },
        });
        kept++;
      }
      add("local_potential", "Potentiel territoire × service", cand, kept, "≥ 50 impressions cumulées avec CTR < 3 % ou position > 8");
    }

    // ---------- G. QA faible avec trafic réel ----------
    {
      let cand = 0, kept = 0;
      for (const p of published) {
        const qa = p.qa_last_score;
        if (qa == null || qa >= 70) continue;
        cand++;
        const g = gsc.get(p.id); const c = conv.get(p.slug);
        if ((g?.impressions ?? 0) === 0 && (c?.conversions ?? 0) === 0) continue;
        raw.push({
          signal_key: `low_qa:${p.id}`, type: "low_qa", page_id: p.id,
          entity_type: "page", entity_slug: p.slug, url: urlOf(p),
          target_city_slug: p.city_slug, target_service_slug: p.service_slug, target_material_slug: p.material_slug,
          title: `Corriger la qualité d'une page visible — ${nameOf(p)}`,
          reason: `Score QA ${qa}/100 alors que la page reçoit ${g?.impressions ?? 0} impressions et ${c?.conversions ?? 0} conversion(s).`,
          recommended_action: "Corriger les blocages QA détectés (contenu, meta, FAQ, liens internes, CTA) sans modifier l'URL.",
          suggested_action: "optimize", effort_score: 30,
          data: { qa, seo_score: p.seo_score, impressions: g?.impressions ?? 0, clicks: g?.clicks ?? 0, conversions: c?.conversions ?? 0 },
          source: "QA interne + Search Console + conversions",
          ctx: ctxOf(p, "low_qa"),
        });
        kept++;
      }
      add("low_qa", "QA faible avec trafic réel", cand, kept, "QA < 70 et impressions ou conversions > 0");
    }

    // ---------- H. Cannibalisation possible ----------
    {
      const groups = new Map<string, Page[]>();
      for (const p of published) {
        if (!p.city_slug || !p.service_slug) continue;
        const key = `${p.city_slug}|${p.service_slug}|${p.material_slug ?? "-"}`;
        groups.set(key, [...(groups.get(key) ?? []), p]);
      }
      let cand = 0, kept = 0;
      for (const [key, list] of groups) {
        if (list.length < 2) continue;
        cand++;
        const withImpr = list.filter((p) => (gsc.get(p.id)?.impressions ?? 0) > 0);
        if (withImpr.length < 2) continue;
        // Chevauchement plausible seulement si les titres visent bien la même intention.
        const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const words = withImpr.map((p) => new Set(norm(p.title).split(" ").filter((w) => w.length > 3)));
        let overlap = 0;
        for (let i = 0; i < words.length; i++) {
          for (let j = i + 1; j < words.length; j++) {
            const inter = [...words[i]].filter((w) => words[j].has(w)).length;
            const union = new Set([...words[i], ...words[j]]).size || 1;
            if (inter / union >= 0.5) overlap++;
          }
        }
        if (overlap === 0) continue;
        const impressions = withImpr.reduce((s, p) => s + (gsc.get(p.id)?.impressions ?? 0), 0);
        raw.push({
          signal_key: `cannibalization:${key}`, type: "cannibalization",
          entity_type: "group", entity_slug: key,
          target_city_slug: list[0].city_slug, target_service_slug: list[0].service_slug,
          target_material_slug: list[0].material_slug,
          title: `Vérifier une possible cannibalisation — ${list[0].service_slug} / ${list[0].city_slug}`,
          reason: `${withImpr.length} URL(s) publiées ciblent le même territoire/service/matériau, reçoivent toutes des impressions et partagent une formulation très proche (${overlap} paire(s) similaire(s)). Signal « à vérifier », sans conclusion automatique.`,
          recommended_action: "Comparer les requêtes et les intentions des URLs listées, puis décider manuellement : différencier les contenus, consolider deux pages, ou laisser tel quel.",
          suggested_action: "merge", effort_score: 45,
          data: {
            statut: "à vérifier", paires_similaires: overlap, impressions,
            urls: withImpr.map((p) => ({
              slug: p.slug, title: p.title, impressions: gsc.get(p.id)?.impressions ?? 0,
              clicks: gsc.get(p.id)?.clicks ?? 0, position: gsc.get(p.id)?.position ?? null,
            })),
          },
          source: "Pages SEO (URL, titre, territoire, service, matériau) + Search Console (28 j)",
          ctx: {
            type: "cannibalization", impressions, clicks: null, ctr: null, position: null,
            conversions: 0, qa: null, indexed: null, serviceSlug: list[0].service_slug,
            citySlug: list[0].city_slug, siblingPages: withImpr.length, groupPages: withImpr.length,
          },
        });
        kept++;
      }
      add("cannibalization", "Cannibalisation possible", cand, kept, "≥ 2 URLs du même couple, avec impressions et titres très proches");
    }

    // ---------- I. Analyse par groupes (service et territoire) ----------
    const groupInsights: Array<Record<string, unknown>> = [];
    {
      const totalImpr = [...gsc.values()].reduce((s, g) => s + g.impressions, 0);
      const totalClicks = [...gsc.values()].reduce((s, g) => s + g.clicks, 0);
      const siteCtr = totalImpr ? totalClicks / totalImpr : 0;

      const build = (keyOf: (p: Page) => string | null) => {
        const m = new Map<string, Agg>();
        for (const p of published) {
          const k = keyOf(p);
          if (!k) continue;
          const g = gsc.get(p.id); const c = conv.get(p.slug);
          const a = m.get(k) ?? { impressions: 0, clicks: 0, conversions: 0, posSum: 0, n: 0, pages: [] };
          a.impressions += g?.impressions ?? 0; a.clicks += g?.clicks ?? 0; a.conversions += c?.conversions ?? 0;
          if (g) { a.posSum += g.position; a.n++; }
          a.pages.push(p.slug);
          m.set(k, a);
        }
        return m;
      };

      const byService = build((p) => p.service_slug);
      const byCity = build((p) => p.city_slug);
      let cand = 0, kept = 0;

      for (const [kind, map] of [["group_service", byService], ["group_territory", byCity]] as const) {
        for (const [key, a] of map) {
          if (a.impressions < 100) continue;
          cand++;
          const ctr = a.impressions ? a.clicks / a.impressions : 0;
          const avgPos = a.n ? a.posSum / a.n : null;
          groupInsights.push({
            kind, key, pages: a.pages.length, impressions: a.impressions, clicks: a.clicks,
            ctr, position_avg: avgPos, conversions: a.conversions, site_ctr: siteCtr,
          });
          if (ctr >= siteCtr * 0.7) continue;
          const label = kind === "group_service" ? `service ${key}` : `territoire ${key}`;
          raw.push({
            signal_key: `${kind}:${key}`, type: kind, entity_type: "group", entity_slug: key,
            target_service_slug: kind === "group_service" ? key : null,
            target_city_slug: kind === "group_territory" ? key : null,
            title: kind === "group_service"
              ? `Le service ${key} sous-performe en clics`
              : `Le territoire ${key} sous-performe en clics`,
            reason: `Les ${a.pages.length} pages du ${label} cumulent ${a.impressions} impressions et ${a.clicks} clic(s) (CTR ${pct(ctr)}), sous la moyenne du site (${pct(siteCtr)}). Position moyenne ${avgPos != null ? avgPos.toFixed(1) : "donnée insuffisante"}, ${a.conversions} conversion(s).`,
            recommended_action: `Traiter ce groupe comme un lot : harmoniser les titles et metas des pages du ${label}, puis renforcer le maillage entre elles.`,
            suggested_action: "optimize", effort_score: 45,
            data: { pages: a.pages.length, impressions: a.impressions, clicks: a.clicks, ctr, ctr_site: siteCtr, position_avg: avgPos, conversions: a.conversions, exemples: a.pages.slice(0, 10) },
            source: "Search Console (28 j) agrégé par groupe + pages SEO",
            potential_searches: a.impressions,
            ctx: {
              type: kind, impressions: a.impressions, clicks: a.clicks, ctr,
              position: avgPos, conversions: a.conversions, qa: null, indexed: null,
              serviceSlug: kind === "group_service" ? key : null,
              citySlug: kind === "group_territory" ? key : null,
              groupPages: a.pages.length,
            },
          });
          kept++;
        }
      }
      add("groupes", "Groupes service / territoire sous-performants", cand, kept, "≥ 100 impressions cumulées et CTR sous 70 % de la moyenne du site");
    }

    // ---------- FILTRE DE PERTINENCE + SCORING ----------
    type Scored = RawSignal & { score: number; factors: ScoreFactor[]; dataQuality: string };
    const kept: Scored[] = [];
    const rejected: Array<{ signal_key: string; raison: string }> = [];
    for (const s of raw) {
      const rel = evaluateRelevance(s.ctx);
      if (!rel.relevant) { rejected.push({ signal_key: s.signal_key, raison: rel.rejection ?? "non pertinent" }); continue; }
      const { score, factors } = scoreSignal(s.ctx);
      kept.push({ ...s, score, factors, dataQuality: rel.dataQuality });
    }

    // ---------- Enregistrement (aucune suppression) ----------
    const nowIso = new Date().toISOString();
    const keys = kept.map((s) => s.signal_key);
    const existing = new Map<string, { id: string; status: string; score: number | null }>();
    for (let i = 0; i < keys.length; i += 200) {
      const { data } = await supabase.from("seo_opportunities")
        .select("id,signal_key,status,score").in("signal_key", keys.slice(i, i + 200));
      for (const r of data ?? []) {
        existing.set(r.signal_key as string, { id: r.id as string, status: r.status as string, score: r.score as number | null });
      }
    }

    let newCount = 0, updatedCount = 0, worsened = 0;
    const toInsert: Record<string, unknown>[] = [];
    const rowOf = (s: Scored) => ({
      signal_key: s.signal_key, type: s.type, category: CATEGORY_OF[s.type], page_id: s.page_id ?? null,
      entity_type: s.entity_type, entity_slug: s.entity_slug ?? null,
      target_city_slug: s.target_city_slug ?? null, target_service_slug: s.target_service_slug ?? null,
      target_material_slug: s.target_material_slug ?? null,
      url: s.url ?? null, title: s.title, rationale: s.reason, reason: s.reason,
      recommended_action: s.recommended_action, expected_impact: expectedImpact(s.type),
      source: s.source, suggested_action: s.suggested_action,
      priority: priorityOf(s.score), score: s.score, score_factors: s.factors,
      data_quality: s.dataQuality,
      impact_score: s.score, effort_score: s.effort_score,
      potential_searches: s.potential_searches ?? null,
      data: { ...s.data, service_priorite: servicePriority(s.target_service_slug) },
      evidence: s.data, last_seen_at: nowIso, run_id: runId, stale_at: null, resolved_at: null,
    });

    for (const s of kept) {
      const prev = existing.get(s.signal_key);
      if (prev) {
        // Une opportunité résolue/ignorée manuellement n'est jamais réanimée sans nouveau signal fort.
        const reanimate = prev.status === "stale" || prev.status === "resolved";
        const status = reanimate ? "open" : prev.status;
        if (prev.score != null && s.score - prev.score >= 10) worsened++;
        const { error } = await supabase.from("seo_opportunities").update({ ...rowOf(s), status }).eq("id", prev.id);
        if (error) throw new Error(`mise à jour opportunité : ${error.message}`);
        updatedCount++;
      } else {
        toInsert.push({ ...rowOf(s), status: "open", detected_at: nowIso });
      }
    }
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200);
      const { error } = await supabase.from("seo_opportunities").insert(chunk);
      if (error) throw new Error(`insertion opportunités : ${error.message}`);
      newCount += chunk.length;
    }

    // ---------- Cycle de vie : RESOLVED vs STALE (jamais de suppression) ----------
    const { data: openRows } = await supabase.from("seo_opportunities")
      .select("id,signal_key,page_id").in("status", ["open", "in_progress"]).not("signal_key", "is", null);
    const current = new Set(keys);
    const resolvedIds: string[] = [], staleIds: string[] = [];
    for (const r of openRows ?? []) {
      if (current.has(r.signal_key as string)) continue;
      const pid = r.page_id as string | null;
      // Réévaluable (la page existe toujours dans l'analyse) et signal disparu → RÉSOLUE.
      // Non réévaluable (page absente du périmètre analysé) → STALE.
      if (!pid || pageById.has(pid)) resolvedIds.push(r.id as string);
      else staleIds.push(r.id as string);
    }
    for (let i = 0; i < resolvedIds.length; i += 200) {
      await supabase.from("seo_opportunities")
        .update({ status: "resolved", resolved_at: nowIso }).in("id", resolvedIds.slice(i, i + 200));
    }
    for (let i = 0; i < staleIds.length; i += 200) {
      await supabase.from("seo_opportunities")
        .update({ status: "stale", stale_at: nowIso }).in("id", staleIds.slice(i, i + 200));
    }

    // ---------- Résumé ----------
    const byPrio = (p: string) => kept.filter((s) => priorityOf(s.score) === p).length;
    const top = topOpportunities(kept, 10).map((s, i) => ({
      rang: i + 1, titre: s.title, score: s.score, priorite: priorityOf(s.score),
      type: s.type, url: s.url, raison: s.reason, action: s.recommended_action,
      impact: expectedImpact(s.type), facteurs: s.factors,
    }));
    const comparison = prevRun
      ? {
        run_precedent: prevRun.started_at, opportunites_precedentes: prevRun.opportunities_detected,
        opportunites_actuelles: kept.length, nouvelles: newCount, toujours_ouvertes: updatedCount,
        resolues: resolvedIds.length, obsoletes: staleIds.length, aggravees: worsened,
      }
      : null;

    const summary = {
      status: "success", finished_at: nowIso, duration_ms: Date.now() - t0,
      pages_analyzed: pages.length, published_analyzed: published.length, indexed_analyzed: indexed.length,
      gsc_rows_analyzed: gsc.size, impressions_analyzed: impressionsAnalyzed,
      conversions_analyzed: conversionsAnalyzed,
      cities_analyzed: new Set(published.map((p) => p.city_slug).filter(Boolean)).size,
      services_analyzed: new Set(published.map((p) => p.service_slug).filter(Boolean)).size,
      signals_detected: raw.length, signals_rejected: rejected.length,
      opportunities_detected: kept.length, new_count: newCount, updated_count: updatedCount,
      resolved_count: resolvedIds.length, stale_count: staleIds.length,
      critical_count: byPrio("critical"), high_count: byPrio("high"),
      medium_count: byPrio("medium"), low_count: byPrio("low"),
      rules, group_insights: groupInsights, comparison, top_opportunities: top,
    };
    await supabase.from("seo_opportunity_runs").update(summary).eq("id", runId);

    return json({ ok: true, run_id: runId, ...summary, rejected_samples: rejected.slice(0, 20) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (runId) {
      await supabase.from("seo_opportunity_runs")
        .update({ status: "error", error: message, finished_at: new Date().toISOString(), duration_ms: Date.now() - t0 })
        .eq("id", runId);
    }
    return json({ error: message }, 500);
  }
});
