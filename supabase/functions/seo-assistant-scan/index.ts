// Copilote SEO — moteur d'opportunités déterministe (admin-only).
// Lecture seule sur les pages SEO : aucune page n'est créée, modifiée, publiée ou supprimée.
// Toutes les opportunités proviennent de données réelles (Search Console, conversions,
// indexation, QA, couverture territoire/service). Aucune donnée inventée.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

type Signal = {
  signal_key: string;
  type: string;
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
  score: number;
  effort_score: number;
  data: Record<string, unknown>;
  source: string;
  potential_searches?: number | null;
  potential_clicks?: number | null;
};

const prio = (score: number) => (score >= 75 ? "critical" : score >= 55 ? "high" : score >= 35 ? "medium" : "low");
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
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

    const { data: runRow, error: runErr } = await supabase
      .from("seo_opportunity_runs").insert({ status: "running", period: "28d" }).select("id").single();
    if (runErr) return json({ error: `Impossible de démarrer l'analyse : ${runErr.message}` }, 500);
    runId = runRow!.id as string;

    // ---------- Données réelles (pagination : PostgREST plafonne à 1 000 lignes) ----------
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

    const [pagesAll, gscAll, convAll] = await Promise.all([
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
    const pagesRes = { data: pagesAll }, gscRes = { data: gscAll }, convRes = { data: convAll };

    const pages = (pagesRes.data ?? []) as Page[];
    const gsc = new Map<string, Gsc>();
    let impressionsAnalyzed = 0;
    for (const g of (gscRes.data ?? []) as Array<Gsc & { fetched_at: string }>) {
      if (!gsc.has(g.page_id)) { gsc.set(g.page_id, g); impressionsAnalyzed += g.impressions ?? 0; }
    }
    const conv = new Map<string, Conv>();
    let conversionsAnalyzed = 0;
    for (const c of (convRes.data ?? []) as Conv[]) {
      conv.set(c.page_slug, c);
      conversionsAnalyzed += c.conversions ?? 0;
    }

    const published = pages.filter((p) => p.status === "published" || p.published_at);
    const indexed = pages.filter((p) => p.google_index_status === "indexed" || p.indexed_at);

    const signals: Signal[] = [];
    const rules: Array<{ code: string; label: string; candidates: number; retained: number; note?: string }> = [];
    const add = (code: string, label: string, candidates: number, retained: number, note?: string) =>
      rules.push({ code, label, candidates, retained, note });

    const urlOf = (p: Page) => `https://vracquebec.ca/${p.slug}`;
    const nameOf = (p: Page) => p.title || p.slug;

    // ---------- A. Impressions élevées, clics faibles ----------
    {
      let cand = 0, kept = 0;
      for (const p of published) {
        const g = gsc.get(p.id);
        if (!g || g.impressions < 100) continue;
        cand++;
        if (g.ctr >= 0.02) continue;
        const score = clamp(40 + Math.min(35, g.impressions / 10) + (g.position <= 10 ? 15 : 0));
        signals.push({
          signal_key: `high_impr_low_ctr:${p.id}`, type: "high_impr_low_ctr", page_id: p.id,
          entity_type: "page", entity_slug: p.slug, url: urlOf(p),
          title: `Améliorer le CTR — ${nameOf(p)}`,
          reason: `La page obtient déjà de la visibilité Google (${g.impressions} impressions sur 28 j) mais génère peu de clics (${g.clicks}, CTR ${pct(g.ctr)}).`,
          recommended_action: "Analyser le title et la meta description, puis proposer une variante mieux alignée avec l'intention de recherche.",
          suggested_action: "optimize", score, effort_score: 15,
          data: { impressions: g.impressions, clicks: g.clicks, ctr: g.ctr, position: g.position, meta_title: p.meta_title, meta_description: p.meta_description },
          source: "Search Console (28 j) + pages SEO",
          potential_searches: g.impressions,
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
        if (signals.some((s) => s.page_id === p.id && s.type === "high_impr_low_ctr")) continue;
        const score = clamp(45 + Math.min(25, g.impressions / 8) + (10 - g.position) * 2);
        signals.push({
          signal_key: `ctr_top10:${p.id}`, type: "ctr_top10", page_id: p.id,
          entity_type: "page", entity_slug: p.slug, url: urlOf(p),
          title: `CTR faible en position ${g.position.toFixed(1)} — ${nameOf(p)}`,
          reason: `Position moyenne ${g.position.toFixed(1)} avec ${g.impressions} impressions, mais seulement ${g.clicks} clic(s) (CTR ${pct(g.ctr)}).`,
          recommended_action: "Réécrire le title/meta pour coller à la requête et ajouter un bénéfice concret (délai, zone, prix indicatif).",
          suggested_action: "optimize", score, effort_score: 15,
          data: { impressions: g.impressions, clicks: g.clicks, ctr: g.ctr, position: g.position },
          source: "Search Console (28 j)",
          potential_searches: g.impressions,
        });
        kept++;
      }
      add("ctr_top10", "Position 3-10 avec CTR faible", cand, kept, "position 3-10, ≥ 30 impressions, CTR < 5 %");
    }

    // ---------- C. Visibilité réelle mais position moyenne ----------
    {
      let cand = 0, kept = 0;
      for (const p of published) {
        const g = gsc.get(p.id);
        if (!g || g.impressions < 30) continue;
        if (g.position <= 10) continue;
        cand++;
        if (g.position > 30) continue;
        const score = clamp(35 + Math.min(30, g.impressions / 8) + (30 - g.position));
        signals.push({
          signal_key: `position_gain:${p.id}`, type: "position_gain", page_id: p.id,
          entity_type: "page", entity_slug: p.slug, url: urlOf(p),
          title: `Gagner des positions — ${nameOf(p)}`,
          reason: `Cette page reçoit ${g.impressions} impressions et se positionne en moyenne ${g.position.toFixed(1)}. Une optimisation du contenu pourrait viser la première page (aucun gain garanti).`,
          recommended_action: "Enrichir le contenu sur l'intention principale, ajouter FAQ et liens internes depuis les pages proches.",
          suggested_action: "optimize", score, effort_score: 35,
          data: { impressions: g.impressions, clicks: g.clicks, position: g.position, word_count: p.word_count, internal_link_count: p.internal_link_count },
          source: "Search Console (28 j) + contenu de la page",
          potential_searches: g.impressions,
        });
        kept++;
      }
      add("position_gain", "Visibilité réelle, position 11-30", cand, kept, "≥ 30 impressions, position 11 à 30");
    }

    // ---------- D. Publiées mais non indexées / problème technique ----------
    {
      let cand = 0, kept = 0;
      const cutoff = Date.now() - 21 * 86400 * 1000;
      for (const p of published) {
        const pubAt = new Date(p.published_at ?? p.updated_at).getTime();
        if (pubAt > cutoff) continue;
        const isIndexed = p.google_index_status === "indexed" || !!p.indexed_at;
        if (isIndexed) continue;
        cand++;
        const g = gsc.get(p.id);
        const issues: string[] = [];
        if (p.noindex) issues.push("balise noindex active");
        if ((p.word_count ?? 0) < 400) issues.push(`contenu court (${p.word_count ?? 0} mots)`);
        if ((p.internal_link_count ?? 0) < 3) issues.push(`peu de liens internes (${p.internal_link_count ?? 0})`);
        const hasImpressions = (g?.impressions ?? 0) > 0;
        // Retenue seulement si un problème réel est détectable ou aucune impression du tout.
        if (!issues.length && hasImpressions) continue;
        const score = clamp((p.noindex ? 85 : 45) + issues.length * 8 + (hasImpressions ? 0 : 5));
        signals.push({
          signal_key: `not_indexed:${p.id}`, type: "not_indexed", page_id: p.id,
          entity_type: "page", entity_slug: p.slug, url: urlOf(p),
          title: `Page publiée non indexée — ${nameOf(p)}`,
          reason: issues.length
            ? `Publiée depuis plus de 21 jours, aucun statut « indexée » enregistré. Problèmes détectables : ${issues.join(", ")}.`
            : `Publiée depuis plus de 21 jours, aucun statut « indexée » enregistré et aucune impression Search Console. Statut Search Console inconnu pour cette URL.`,
          recommended_action: p.noindex
            ? "Retirer la balise noindex si la page doit être indexée, puis demander une vérification manuelle dans Search Console."
            : "Vérifier l'URL dans Search Console, renforcer le contenu et le maillage interne vers cette page.",
          suggested_action: "optimize", score, effort_score: 25,
          data: {
            published_at: p.published_at, google_index_status: p.google_index_status ?? "inconnu",
            impressions: g?.impressions ?? 0, word_count: p.word_count, internal_link_count: p.internal_link_count,
            noindex: !!p.noindex, issues,
          },
          source: "Pages SEO + Search Console (28 j)",
        });
        kept++;
      }
      add("not_indexed", "Publiées non indexées", cand, kept, "publiées > 21 j sans statut indexée");
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
        const score = clamp(55 + conversions * 5 + weak.length * 4);
        signals.push({
          signal_key: `converting_page:${p.id}`, type: "converting_page", page_id: p.id,
          entity_type: "page", entity_slug: p.slug, url: urlOf(p),
          title: `Renforcer une page qui convertit — ${nameOf(p)}`,
          reason: `${conversions} conversion(s) sur 30 j (téléphone ${c?.phone_clicks ?? 0}, WhatsApp ${c?.whatsapp_clicks ?? 0}, courriel ${c?.email_clicks ?? 0}, demandes ${c?.submissions ?? 0}). Améliorations détectables : ${weak.join(", ")}.`,
          recommended_action: "Prioriser cette page : corriger les points faibles détectés et pointer plus de liens internes vers elle.",
          suggested_action: "optimize", score, effort_score: 25,
          data: {
            conversions, phone: c?.phone_clicks ?? 0, whatsapp: c?.whatsapp_clicks ?? 0,
            email: c?.email_clicks ?? 0, submissions: c?.submissions ?? 0, views: c?.views ?? 0,
            qa: p.qa_last_score, position: g?.position ?? null, impressions: g?.impressions ?? 0, weaknesses: weak,
          },
          source: "Conversions (30 j) + Search Console + QA",
        });
        kept++;
      }
      add("converting_page", "Pages avec conversions", cand, kept, "≥ 1 conversion et faiblesse détectée");
    }

    // ---------- F. Potentiel local territoire × service ----------
    {
      type Agg = { impressions: number; clicks: number; conversions: number; posSum: number; n: number; pages: string[]; city: string; service: string };
      const agg = new Map<string, Agg>();
      for (const p of published) {
        if (!p.city_slug || !p.service_slug) continue;
        const g = gsc.get(p.id);
        const c = conv.get(p.slug);
        const key = `${p.city_slug}|${p.service_slug}`;
        const a = agg.get(key) ?? { impressions: 0, clicks: 0, conversions: 0, posSum: 0, n: 0, pages: [], city: p.city_slug, service: p.service_slug };
        a.impressions += g?.impressions ?? 0;
        a.clicks += g?.clicks ?? 0;
        a.conversions += c?.conversions ?? 0;
        if (g) { a.posSum += g.position; a.n++; }
        a.pages.push(p.slug);
        agg.set(key, a);
      }
      let cand = 0, kept = 0;
      for (const [key, a] of agg) {
        if (a.impressions < 50) continue;
        cand++;
        const avgPos = a.n ? a.posSum / a.n : 0;
        const ctr = a.impressions ? a.clicks / a.impressions : 0;
        if (!(ctr < 0.03 || avgPos > 8)) continue;
        const score = clamp(40 + Math.min(30, a.impressions / 20) + a.conversions * 6);
        signals.push({
          signal_key: `local_potential:${key}`, type: "local_potential",
          entity_type: "combo", target_city_slug: a.city, target_service_slug: a.service,
          entity_slug: key,
          title: `Potentiel local — ${a.service} à ${a.city}`,
          reason: `${a.pages.length} page(s) publiée(s) pour ce territoire/service cumulent ${a.impressions} impressions, ${a.clicks} clic(s), position moyenne ${avgPos.toFixed(1)} et ${a.conversions} conversion(s) sur 30 j.`,
          recommended_action: "Renforcer les pages existantes de ce couple territoire/service (contenu, maillage, meta) avant d'envisager toute nouvelle page — aucune création automatique.",
          suggested_action: "optimize", score, effort_score: 40,
          data: { impressions: a.impressions, clicks: a.clicks, ctr, position_avg: avgPos, conversions: a.conversions, pages: a.pages },
          source: "Search Console + conversions + territoires/services",
          potential_searches: a.impressions,
        });
        kept++;
      }
      add("local_potential", "Potentiel territoire × service", cand, kept, "≥ 50 impressions cumulées avec CTR < 3 % ou position > 8");
    }

    // ---------- G. Qualité SEO faible avec trafic réel ----------
    {
      let cand = 0, kept = 0;
      for (const p of published) {
        const qa = p.qa_last_score;
        if (qa == null || qa >= 70) continue;
        cand++;
        const g = gsc.get(p.id);
        const c = conv.get(p.slug);
        const hasSignal = (g?.impressions ?? 0) > 0 || (c?.conversions ?? 0) > 0;
        if (!hasSignal) continue;
        const score = clamp(50 + (70 - qa) + Math.min(20, (g?.impressions ?? 0) / 20));
        signals.push({
          signal_key: `low_qa:${p.id}`, type: "low_qa", page_id: p.id,
          entity_type: "page", entity_slug: p.slug, url: urlOf(p),
          title: `Qualité faible sur une page visible — ${nameOf(p)}`,
          reason: `Score QA ${qa}/100 alors que la page reçoit ${g?.impressions ?? 0} impressions et ${c?.conversions ?? 0} conversion(s).`,
          recommended_action: "Corriger les blocages QA de la page (contenu, meta, FAQ, liens) sans modifier son URL.",
          suggested_action: "optimize", score, effort_score: 30,
          data: { qa, seo_score: p.seo_score, impressions: g?.impressions ?? 0, clicks: g?.clicks ?? 0, conversions: c?.conversions ?? 0 },
          source: "QA interne + Search Console + conversions",
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
        const score = clamp(45 + withImpr.length * 5);
        signals.push({
          signal_key: `cannibalization:${key}`, type: "cannibalization",
          entity_type: "group", entity_slug: key,
          target_city_slug: list[0].city_slug, target_service_slug: list[0].service_slug,
          title: `Cannibalisation à vérifier — ${list[0].service_slug} / ${list[0].city_slug}`,
          reason: `${withImpr.length} URL(s) publiées ciblent le même territoire/service/matériau et reçoivent toutes des impressions. Signal à vérifier, sans conclusion automatique.`,
          recommended_action: "Comparer les intentions de recherche des URLs concernées et décider manuellement : différencier, fusionner ou laisser tel quel.",
          suggested_action: "merge", score, effort_score: 45,
          data: {
            urls: withImpr.map((p) => ({
              slug: p.slug, impressions: gsc.get(p.id)?.impressions ?? 0,
              clicks: gsc.get(p.id)?.clicks ?? 0, position: gsc.get(p.id)?.position ?? null,
            })),
            statut: "à vérifier",
          },
          source: "Pages SEO + Search Console (28 j)",
        });
        kept++;
      }
      add("cannibalization", "Cannibalisation possible", cand, kept, "≥ 2 URLs du même couple avec impressions");
    }

    // ---------- Enregistrement (aucune suppression) ----------
    const nowIso = new Date().toISOString();
    const keys = signals.map((s) => s.signal_key);
    const existing = new Map<string, { id: string; status: string }>();
    for (let i = 0; i < keys.length; i += 200) {
      const { data } = await supabase.from("seo_opportunities")
        .select("id,signal_key,status").in("signal_key", keys.slice(i, i + 200));
      for (const r of data ?? []) existing.set(r.signal_key as string, { id: r.id as string, status: r.status as string });
    }

    let newCount = 0, updatedCount = 0;
    const toInsert: Record<string, unknown>[] = [];
    for (const s of signals) {
      const row = {
        signal_key: s.signal_key, type: s.type, page_id: s.page_id ?? null,
        entity_type: s.entity_type, entity_slug: s.entity_slug ?? null,
        target_city_slug: s.target_city_slug ?? null, target_service_slug: s.target_service_slug ?? null,
        target_material_slug: s.target_material_slug ?? null,
        url: s.url ?? null, title: s.title, rationale: s.reason, reason: s.reason,
        recommended_action: s.recommended_action, source: s.source,
        suggested_action: s.suggested_action,
        priority: prio(s.score), score: s.score,
        impact_score: s.score, effort_score: s.effort_score,
        potential_searches: s.potential_searches ?? null, potential_clicks: s.potential_clicks ?? null,
        data: s.data, evidence: s.data,
        last_seen_at: nowIso, run_id: runId, stale_at: null,
      };
      const prev = existing.get(s.signal_key);
      if (prev) {
        // On ne réanime pas une opportunité traitée/ignorée manuellement.
        const status = prev.status === "stale" ? "open" : prev.status;
        const { error } = await supabase.from("seo_opportunities").update({ ...row, status }).eq("id", prev.id);
        if (error) throw new Error(`mise à jour opportunité : ${error.message}`);
        updatedCount++;
      } else {
        toInsert.push({ ...row, status: "open", detected_at: nowIso });
      }
    }
    for (let i = 0; i < toInsert.length; i += 200) {
      const { error } = await supabase.from("seo_opportunities").insert(toInsert.slice(i, i + 200));
      if (error) throw new Error(`insertion opportunités : ${error.message}`);
      newCount += toInsert.slice(i, i + 200).length;
    }

    // Signaux disparus → STALE (jamais supprimés)
    const { data: openRows } = await supabase.from("seo_opportunities")
      .select("id,signal_key").in("status", ["open", "in_progress"]).not("signal_key", "is", null);
    const current = new Set(keys);
    const staleIds = (openRows ?? []).filter((r) => !current.has(r.signal_key as string)).map((r) => r.id as string);
    for (let i = 0; i < staleIds.length; i += 200) {
      await supabase.from("seo_opportunities")
        .update({ status: "stale", stale_at: nowIso }).in("id", staleIds.slice(i, i + 200));
    }

    const byPrio = (p: string) => signals.filter((s) => prio(s.score) === p).length;
    const summary = {
      status: "success", finished_at: nowIso, duration_ms: Date.now() - t0,
      pages_analyzed: pages.length, published_analyzed: published.length, indexed_analyzed: indexed.length,
      gsc_rows_analyzed: gsc.size, impressions_analyzed: impressionsAnalyzed,
      conversions_analyzed: conversionsAnalyzed,
      cities_analyzed: new Set(published.map((p) => p.city_slug).filter(Boolean)).size,
      services_analyzed: new Set(published.map((p) => p.service_slug).filter(Boolean)).size,
      opportunities_detected: signals.length, new_count: newCount, updated_count: updatedCount,
      stale_count: staleIds.length,
      critical_count: byPrio("critical"), high_count: byPrio("high"),
      medium_count: byPrio("medium"), low_count: byPrio("low"),
      rules,
    };
    await supabase.from("seo_opportunity_runs").update(summary).eq("id", runId);

    return json({ ok: true, run_id: runId, ...summary });
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
