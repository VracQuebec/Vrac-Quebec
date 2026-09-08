// Deno edge function — Deterministic SEO auto-fixes (Phase 2, no AI by default).
//
// Fixable actions are split into two families:
//   - deterministic (default & preferred): rewrite_meta_title, rewrite_meta_description,
//     rewrite_open_graph, generate_keywords, regenerate_faq, add_internal_links,
//     fix_images_alt, insert_ctas
//   - AI-assisted (opt-in via allow_ai=true AND explicit action name): expand_content,
//     rebuild_headings, improve_readability
//
// "Fix all" (empty actions array) applies deterministic actions ONLY — zero AI calls.
// This function no longer reads LOVABLE_API_KEY unless the caller explicitly opts in.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const AI_ACTIONS = new Set(["expand_content", "rebuild_headings", "improve_readability"]);

function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function titleCase(s: string): string {
  return s.split(/\s+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}
function humanize(slug: string | null | undefined): string {
  if (!slug) return "";
  return titleCase(slug.replace(/-/g, " ").trim());
}
function clip(s: string, min: number, max: number, tail = ""): string {
  let t = s.trim();
  if (t.length > max) {
    // Coupe sur une frontière de mot pour éviter les textes tronqués en plein mot.
    let cut = t.slice(0, max - tail.length);
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > 40) cut = cut.slice(0, lastSpace);
    t = cut.replace(/[\s.,;:!?-]+$/, "") + tail;
  } else if (t.length < min && tail) {
    t = (t + " " + tail).trim();
  }
  return t.slice(0, max);
}
// Raccourcit un titre trop long en retirant des segments entiers (séparés par | : -)
// plutôt qu'en coupant au milieu de la marque.
function shortenTitle(current: string, max = 65, brand = "Vrac Québec"): string {
  const parts = current.split(/\s*[|·]\s*/).map((x) => x.trim()).filter(Boolean);
  const hasBrand = parts.some((x) => x.toLowerCase() === brand.toLowerCase());
  const core = parts.filter((x) => x.toLowerCase() !== brand.toLowerCase());
  const withBrand = [...core, ...(hasBrand ? [brand] : [])].join(" | ");
  if (withBrand.length <= max) return withBrand;
  // On sacrifie la marque avant l'information utile.
  const withoutBrand = core.join(" | ");
  if (withoutBrand.length <= max) return withoutBrand;
  let cut = withoutBrand.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  if (sp > 25) cut = cut.slice(0, sp);
  return cut.replace(/[\s.,;:!?&|-]+$/, "");
}

function dedupe<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

type Page = {
  id: string;
  slug: string;
  title: string | null;
  h1: string | null;
  word_count: number | null;
  meta_title: string | null;
  meta_description: string | null;
  content_html: string | null;
  intro: string | null;
  faq: Array<{ question: string; answer: string }> | null;
  internal_links: Array<{ url: string; label: string }> | null;
  keywords: string[] | null;
  city_slug: string | null;
  material_slug: string | null;
  service_slug: string | null;
  og_title: string | null;
  og_description: string | null;
  // Noms réels (avec accents) résolus depuis le référentiel; fallback sur le slug.
  city_name?: string | null;
  material_name?: string | null;
  service_name?: string | null;
};

function cityOf(page: Page): string {
  return (page.city_name || "").trim() || humanize(page.city_slug);
}
function topicOf(page: Page, fallback = "Matériaux en vrac"): string {
  return (page.material_name || "").trim()
    || (page.service_name || "").trim()
    || humanize(page.material_slug)
    || humanize(page.service_slug)
    || fallback;
}

function buildMetaTitle(page: Page): string {
  const city = cityOf(page);
  const topic = topicOf(page);
  const suffix = " | Vrac Québec";
  const core = city ? `${topic} à ${city}` : topic;
  return clip(core + suffix, 40, 63);
}

function buildMetaDescription(page: Page): string {
  const city = cityOf(page);
  const topic = topicOf(page, "matériaux en vrac et dompes");
  const target = city
    ? `Vrac Québec coordonne la livraison de ${topic.toLowerCase()} à ${city} avec Transport JSC. Fournisseurs vérifiés, réponse rapide, aucun engagement.`
    : `Vrac Québec coordonne la livraison de ${topic.toLowerCase()} au Québec avec Transport JSC. Fournisseurs vérifiés, réponse rapide, aucun engagement.`;
  const cta = " Demandez votre soumission gratuite dès maintenant.";
  return clip(target + cta, 145, 160);
}

function buildOpenGraph(page: Page, metaTitle: string, metaDesc: string): { og_title: string; og_description: string } {
  const city = cityOf(page);
  const topic = topicOf(page);
  const ogTitleCore = city ? `${topic} à ${city} — Vrac Québec` : `${topic} — Vrac Québec`;
  const og_title = clip(ogTitleCore, 30, 88);
  const og_description = clip(metaDesc || `Plateforme québécoise pour ${topic.toLowerCase()}${city ? ` à ${city}` : ""}. Coordination Transport JSC, matériaux vérifiés.`, 80, 195);
  return { og_title, og_description };
}

function buildKeywords(page: Page): string[] {
  const city = cityOf(page).toLowerCase();
  const topic = topicOf(page, "").toLowerCase();
  const kws: string[] = [];
  if (topic && city) {
    kws.push(
      `${topic} ${city}`,
      `livraison ${topic} ${city}`,
      `${topic} en vrac ${city}`,
      `dompe ${topic} ${city}`,
      `camion ${topic} ${city}`,
      `${topic} pas cher ${city}`,
      `fournisseur ${topic} ${city}`,
      `${topic} secteur ${city}`,
    );
  } else if (city) {
    kws.push(
      `matériaux vrac ${city}`,
      `dompe ${city}`,
      `livraison vrac ${city}`,
      `camion benne ${city}`,
      `fournisseur matériaux ${city}`,
      `transport vrac ${city}`,
      `remblai ${city}`,
      `terre ${city}`,
    );
  } else if (topic) {
    kws.push(
      `${topic} québec`,
      `livraison ${topic}`,
      `${topic} en vrac`,
      `fournisseur ${topic}`,
      `camion ${topic}`,
      `dompe ${topic}`,
    );
  }
  return dedupe(kws.map((k) => k.trim()).filter((k) => k.length > 2)).slice(0, 10);
}

function buildFaq(page: Page): Array<{ question: string; answer: string }> {
  const cityRaw = cityOf(page);
  const city = cityRaw || "votre secteur";
  const materialRaw = (page.material_name || "").trim() || humanize(page.material_slug);
  const serviceRaw = (page.service_name || "").trim() || humanize(page.service_slug);
  const topicHuman = materialRaw || serviceRaw || "matériaux en vrac";
  const topic = topicHuman.toLowerCase();

  const faq: Array<{ question: string; answer: string }> = [
    {
      question: `Comment obtenir une soumission de ${topic} à ${city} ?`,
      answer: `Vous remplissez le formulaire de demande de Vrac Québec en indiquant l'adresse du chantier${cityRaw ? ` à ${cityRaw}` : ""}, la quantité approximative et la date souhaitée. Notre partenaire logistique Transport JSC prend contact rapidement pour confirmer la disponibilité, l'accès camion et un prix ferme avant toute livraison. Aucun engagement n'est requis pour recevoir votre soumission gratuite.`,
    },
    {
      question: `Quelle quantité minimum de ${topic} peut-on commander ?`,
      answer: `Les chargements de ${topic} sont généralement facturés au voyage complet (camion 10 ou 12 roues), soit environ 12 à 20 verges cubes. Pour de plus petites quantités, nous coordonnons avec des partenaires équipés de camions plus légers ou proposons un regroupement de livraison. Précisez votre volume estimé dans le formulaire pour obtenir la meilleure option.`,
    },
    {
      question: `Quels sont les délais de livraison à ${city} ?`,
      answer: `La plupart des livraisons de ${topic} à ${city} sont assurées sous 24 à 72 heures ouvrables selon la saison, la disponibilité des dompes locales et l'accessibilité du chantier. En haute saison (avril à novembre), planifier 3 à 5 jours d'avance permet de sécuriser le meilleur créneau et de limiter les frais d'attente sur place.`,
    },
    {
      question: `Vrac Québec vend-il directement le ${topic} ?`,
      answer: `Non. Vrac Québec est une plateforme de mise en relation : nous connectons les entrepreneurs, les fournisseurs de matériaux et les propriétaires de dompes du Québec. Transport JSC agit comme orchestrateur pour coordonner la logistique. Cela garantit un prix compétitif basé sur le fournisseur le plus proche du chantier.`,
    },
    {
      question: `Puis-je faire livrer et récupérer les surplus dans la même intervention ?`,
      answer: `Oui. Notre réseau permet fréquemment de combiner une livraison de ${topic} avec la reprise de surplus (terre d'excavation, sable, béton concassé, matériaux mixtes) sur le même chantier. Cette formule « bidirectionnelle » réduit les coûts de transport et les délais. Mentionnez-le dans votre demande pour que nous priorisions un partenaire équipé pour les deux opérations.`,
    },
    {
      question: `Que se passe-t-il si l'accès au chantier de ${city} est limité ?`,
      answer: `Nos partenaires interviennent avec des camions 10 ou 12 roues et, au besoin, des unités plus courtes ou des remorques dédiées. Précisez dans le formulaire les contraintes d'accès (rue étroite, hauteur limitée, présence de fils, terrain meuble). Transport JSC valide la faisabilité avant confirmation pour éviter tout aller-retour inutile et facturé.`,
    },
  ];
  return faq;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) return json({ error: "Non autorisé" }, 401);
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey,
      { auth: { persistSession: false } },
    );
    const isInternal = jwt === serviceKey;
    if (!isInternal) {
      const { data: userData } = await supabase.auth.getUser(jwt);
      const uid = userData?.user?.id;
      if (!uid) return json({ error: "Session invalide" }, 401);
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const pageId: string | undefined = body?.page_id;
    const requestedActions: string[] = Array.isArray(body?.actions)
      ? body.actions.filter((a: unknown): a is string => typeof a === "string")
      : [];
    const allowAi = body?.allow_ai === true;
    if (!pageId) return json({ error: "page_id requis" }, 400);

    const { data: page, error: pErr } = await supabase
      .from("seo_pages")
      .select("id, slug, title, h1, word_count, meta_title, meta_description, content_html, intro, faq, internal_links, keywords, city_slug, material_slug, service_slug, og_title, og_description")
      .eq("id", pageId)
      .maybeSingle();
    if (pErr || !page) return json({ error: pErr?.message || "Page introuvable" }, 404);
    const p = page as Page;

    // Résout les vrais noms (accentués) du référentiel pour ne jamais générer
    // « Beton à Quebec » à partir d'un slug sans accents.
    const [cityRow, matRow, svcRow] = await Promise.all([
      p.city_slug ? supabase.from("seo_cities").select("name").eq("slug", p.city_slug).maybeSingle() : Promise.resolve({ data: null }),
      p.material_slug ? supabase.from("seo_materials").select("name").eq("slug", p.material_slug).maybeSingle() : Promise.resolve({ data: null }),
      p.service_slug ? supabase.from("seo_services").select("name").eq("slug", p.service_slug).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    p.city_name = (cityRow as { data: { name?: string } | null }).data?.name ?? null;
    p.material_name = (matRow as { data: { name?: string } | null }).data?.name ?? null;
    p.service_name = (svcRow as { data: { name?: string } | null }).data?.name ?? null;

    // "Fix all" (empty actions) selects deterministic actions only.
    const wantAll = requestedActions.length === 0;
    const deterministicSet = new Set([
      "rewrite_meta_title",
      "rewrite_meta_description",
      "rewrite_open_graph",
      "generate_keywords",
      "regenerate_faq",
      "add_internal_links",
      "fix_images_alt",
      "insert_ctas",
      "fix_h1",
    ]);
    const actions = wantAll
      ? Array.from(deterministicSet)
      : requestedActions.filter((a) => deterministicSet.has(a) || (AI_ACTIONS.has(a) && allowAi));
    const skippedAi = requestedActions.filter((a) => AI_ACTIONS.has(a) && !allowAi);

    const want = (k: string) => actions.includes(k);

    const updates: Record<string, unknown> = {};
    const fixedActions: string[] = [];
    const preserved: string[] = [];
    let aiCalls = 0;

    // Duplicate detection: a title/description shared with another page is a real
    // SEO defect (cannibalisation), so it justifies a rewrite even when lengths are fine.
    const isDuplicate = async (column: "meta_title" | "meta_description", value: string | null) => {
      if (!value) return false;
      const { count } = await supabase
        .from("seo_pages")
        .select("id", { count: "exact", head: true })
        .eq(column, value)
        .neq("id", pageId);
      return (count ?? 0) > 0;
    };
    const uniquify = async (column: "meta_title" | "meta_description", value: string, max: number) => {
      if (!(await isDuplicate(column, value))) return value;
      const marker = humanize(p.service_slug) || humanize(p.material_slug) || humanize(p.slug.split("-").slice(-1)[0]);
      if (!marker) return value;
      const merged = column === "meta_title"
        ? value.replace(" | Vrac Québec", ` — ${marker} | Vrac Québec`)
        : `${value} ${marker}.`;
      return clip(merged, 0, max);
    };

    // ----- Deterministic rewrites (never overwrite content that is already correct) -----

    let newMetaTitle = p.meta_title ?? "";
    if (want("rewrite_meta_title")) {
      const current = (p.meta_title ?? "").trim();
      // Un titre descriptif un peu long n'est pas « faible » : on le raccourcit sans
      // perdre son information, au lieu de le remplacer par un titre générique.
      const tooLong = current.length > 65;
      const needsRewrite = current.length < 25 || await isDuplicate("meta_title", current);
      if (!needsRewrite && !tooLong) {
        preserved.push("meta_title");
      } else {
        const candidate = needsRewrite ? buildMetaTitle(p) : shortenTitle(current);
        const mt = await uniquify("meta_title", candidate, 65);
        if (mt && mt !== current) {
          updates.meta_title = mt;
          newMetaTitle = mt;
          fixedActions.push("rewrite_meta_title");
        }
      }
    }

    let newMetaDesc = p.meta_description ?? "";
    if (want("rewrite_meta_description")) {
      const current = (p.meta_description ?? "").trim();
      const weak = current.length < 110 || current.length > 170 || await isDuplicate("meta_description", current);
      if (!weak) {
        preserved.push("meta_description");
      } else {
        const md = await uniquify("meta_description", buildMetaDescription(p), 170);
        if (md && md !== current) {
          updates.meta_description = md;
          newMetaDesc = md;
          fixedActions.push("rewrite_meta_description");
        }
      }
    }

    if (want("fix_h1")) {
      const currentH1 = (p.h1 ?? "").trim();
      if (currentH1.length >= 15) {
        preserved.push("h1");
      } else {
        const city = cityOf(p);
        const topic = topicOf(p);
        const h1 = (p.title && p.title.trim().length >= 15)
          ? p.title.trim()
          : (city ? `${topic} à ${city}` : `${topic} au Québec`);
        if (h1 && h1 !== currentH1) {
          updates.h1 = h1.slice(0, 120);
          fixedActions.push("fix_h1");
        }
      }
    }

    if (want("rewrite_open_graph")) {
      const { og_title, og_description } = buildOpenGraph(p, newMetaTitle, newMetaDesc);
      if (og_title !== p.og_title || og_description !== p.og_description) {
        updates.og_title = og_title;
        updates.og_description = og_description;
        fixedActions.push("rewrite_open_graph");
      }
    }

    if (want("generate_keywords")) {
      const existing = Array.isArray(p.keywords) ? p.keywords.filter((k) => String(k).trim().length > 2) : [];
      if (existing.length >= 3) {
        preserved.push("keywords");
      } else {
        // Cap at 8 to stay a topical map, not keyword stuffing.
        const kws = buildKeywords(p).slice(0, 8);
        if (kws.length >= 5) {
          updates.keywords = kws;
          fixedActions.push("generate_keywords");
        }
      }
    }

    if (want("regenerate_faq")) {
      // Never replace an existing FAQ: only fill in a missing or too-short one,
      // so hand-written answers are preserved and pages don't become near-duplicates.
      const existingFaq = Array.isArray(p.faq) ? p.faq.filter((f) => f && f.question && f.answer) : [];
      if (existingFaq.length >= 3) {
        preserved.push("faq");
      } else {
        const generated = buildFaq(p).filter(
          (g) => !existingFaq.some((e) => e.question.trim().toLowerCase() === g.question.trim().toLowerCase()),
        );
        const merged = [...existingFaq, ...generated].slice(0, 6);
        if (merged.length > existingFaq.length) {
          updates.faq = merged;
          fixedActions.push("regenerate_faq");
        }
      }
    }


    if (want("add_internal_links")) {
      const { data: siblings } = await supabase
        .from("seo_pages")
        .select("slug, title, city_slug, material_slug")
        .eq("status", "published")
        .neq("id", pageId)
        .or(`city_slug.eq.${p.city_slug},material_slug.eq.${p.material_slug ?? "___none___"}`)
        .limit(20);
      const currentLinks: Array<{ url: string; label: string }> = Array.isArray(p.internal_links)
        ? p.internal_links
        : [];
      const seen = new Set(currentLinks.map((l) => l.url));
      const additions: Array<{ url: string; label: string }> = [];
      for (const s of siblings ?? []) {
        const url = `/${s.slug}`;
        if (!seen.has(url)) {
          additions.push({ url, label: String((s as { title?: string }).title || url) });
          seen.add(url);
        }
        if (currentLinks.length + additions.length >= 6) break;
      }
      if (additions.length > 0) {
        updates.internal_links = [...currentLinks, ...additions];
        fixedActions.push("add_internal_links");
      }
    }

    if (want("fix_images_alt")) {
      let html = String(p.content_html || "");
      const imgRegex = /<img\b([^>]*)>/gi;
      let changed = false;
      html = html.replace(imgRegex, (match, attrs: string) => {
        const hasAlt = /\balt=["'][^"']{3,}["']/i.test(attrs);
        if (hasAlt) return match;
        const cleaned = attrs.replace(/\balt=["'][^"']*["']/i, "");
        const alt = `${p.title ?? ""}`.replace(/"/g, "'").slice(0, 100);
        changed = true;
        return `<img${cleaned} alt="${alt}">`;
      });
      if (changed) {
        updates.content_html = html;
        fixedActions.push("fix_images_alt");
      }
    }

    if (want("insert_ctas")) {
      const html = String(updates.content_html ?? p.content_html ?? "");
      const ctaBlock = `\n<p class="cta-block"><a href="/transport-request" class="cta-primary">Demander une soumission gratuite</a> ou appelez le <a href="tel:+15819947717">581-994-7717</a>.</p>\n`;
      // Never inject a CTA into an empty page — that produces a CTA-only stub
      // (0-word "published" page). Require real body content first.
      if (html.trim().length > 400 && !/\/transport-request/.test(html)) {
        updates.content_html = html + ctaBlock;
        fixedActions.push("insert_ctas");
      }
    }

    // ----- AI-assisted rewrites (opt-in) -----
    if (allowAi && (want("expand_content") || want("rebuild_headings") || want("improve_readability"))) {
      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!apiKey) {
        return json({ error: "LOVABLE_API_KEY manquante pour les actions IA demandées." }, 500);
      }
      aiCalls++;
      try {
        const { callAIChatCached } = await import("../_shared/ai-cache.ts");
        const ai = await callAIChatCached({
          supabase,
          functionName: "seo-qa-autofix",
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "SEO expert. HTML sémantique propre. JSON strict, pas de markdown." },
            { role: "user", content: `Réécris le contenu HTML pour: (1) 900–1400 mots, (2) ≥ 4 H2 et ≥ 2 H3, (3) phrases < 25 mots. Garde le sens actuel. Format: { "content_html": "..." }.\n\nContenu actuel:\n${String(p.content_html || "").slice(0, 6000)}` },
          ],
          response_format: { type: "json_object" },
          allowAi: true, // reached only when the caller explicitly passed allow_ai
        });
        const content = ai.content || "{}";
        try {
          const parsed = JSON.parse(content) as { content_html?: string };
          if (typeof parsed.content_html === "string" && parsed.content_html.length > 400) {
            updates.content_html = parsed.content_html;
            if (want("expand_content")) fixedActions.push("expand_content");
            if (want("rebuild_headings")) fixedActions.push("rebuild_headings");
            if (want("improve_readability")) fixedActions.push("improve_readability");
          }
        } catch { /* ignore */ }
      } catch { /* AI call failed — skip AI-assisted rewrite, deterministic fixes still applied */ }
    }

    if (Object.keys(updates).length === 0) {
      return json({
        ok: true,
        fixed: [],
        preserved,
        ai_calls: aiCalls,
        skipped_ai_actions: skippedAi,
        message: skippedAi.length
          ? "Actions IA ignorées (allow_ai=false). Passez allow_ai:true pour autoriser la réécriture de contenu."
          : "Aucune correction applicable.",
      });
    }

    // Content protection: snapshot the previous value of every field we are about to
    // change, so any optimisation can be rolled back and stays in the page history.
    const changedKeys = Object.keys(updates);
    const beforeSnapshot: Record<string, unknown> = {};
    for (const k of changedKeys) beforeSnapshot[k] = (p as unknown as Record<string, unknown>)[k] ?? null;

    updates.updated_at = new Date().toISOString();
    const { error: uErr } = await supabase.from("seo_pages").update(updates).eq("id", pageId);
    if (uErr) return json({ error: uErr.message }, 500);

    let improvementId: string | null = null;
    try {
      const { data: imp } = await supabase
        .from("seo_page_improvements")
        .insert({
          page_id: pageId,
          before_snapshot: beforeSnapshot,
          after_snapshot: updates,
          applied: true,
          applied_at: new Date().toISOString(),
          model: aiCalls > 0 ? "deterministic-v2+ai" : "deterministic-v2",
          notes: `Corrections: ${fixedActions.join(", ") || "aucune"}${preserved.length ? ` · Conservé: ${preserved.join(", ")}` : ""}`,
        })
        .select("id")
        .maybeSingle();
      improvementId = imp?.id ?? null;
    } catch { /* history is best-effort, never blocks the fix */ }


    // Re-run QA (deterministic)
    let newScore: number | null = null;
    try {
      const qaRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/seo-qa-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ page_id: pageId, enforce_draft: false }),
      });
      const qaJson = await qaRes.json().catch(() => ({}));
      if (typeof qaJson?.score === "number") newScore = qaJson.score;
    } catch { /* ignore */ }

    return json({
      ok: true,
      fixed: fixedActions,
      preserved,
      new_score: newScore,
      ai_calls: aiCalls,
      improvement_id: improvementId,
      skipped_ai_actions: skippedAi,
      engine: "deterministic-v2",
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});