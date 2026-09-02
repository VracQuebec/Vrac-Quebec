// Deno edge function — Deterministic SEO QA check for a seo_pages row.
// Admin-only. Validates 8 criteria, persists a report, updates seo_pages.qa_last_score,
// and (optionally) demotes the page to draft when blockers are present.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function normalize(text: string): string {
  return (text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function containsWord(haystack: string, needle: string): boolean {
  // Ponctuation-insensible : « Château-Richer » doit matcher « chateau richer ».
  const loose = (s: string) => normalize(s).replace(/[^a-z0-9]+/g, " ").trim();
  const h = loose(haystack);
  const n = loose(needle);
  if (!n) return false;
  return h.includes(n);
}
function countWords(html: string): number {
  const t = stripHtml(html);
  return t ? t.split(" ").length : 0;
}
function countTags(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, "gi")) ?? []).length;
}
function countInternalLinks(html: string): number {
  const links = html.match(/<a\s[^>]*href=["'][^"']+["'][^>]*>/gi) ?? [];
  let n = 0;
  for (const l of links) {
    const href = /href=["']([^"']+)["']/i.exec(l)?.[1] ?? "";
    if (href.startsWith("/") || href.includes("vracquebec.ca")) n++;
  }
  return n;
}
function countCTAs(html: string): number {
  const links = html.match(/<a\s[^>]*href=["'][^"']+["'][^>]*>/gi) ?? [];
  let n = 0;
  for (const l of links) {
    const href = /href=["']([^"']+)["']/i.exec(l)?.[1] ?? "";
    if (/\/transport-request|#questionnaire|\/contact/i.test(href)) n++;
  }
  return n;
}
function countImages(html: string): { total: number; withAlt: number } {
  const imgs = html.match(/<img\s[^>]*>/gi) ?? [];
  let withAlt = 0;
  for (const img of imgs) {
    const alt = /alt=["']([^"']*)["']/i.exec(img)?.[1] ?? "";
    if (alt.trim().length >= 3) withAlt++;
  }
  return { total: imgs.length, withAlt };
}
function avgSentenceLength(text: string): number {
  const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim().length > 0);
  if (!sentences.length) return 0;
  const totalWords = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0);
  return totalWords / sentences.length;
}
// Cheap trigram Jaccard similarity for the "unicité" check.
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

type Check = {
  key: string;
  label: string;
  ok: boolean;
  status: "ok" | "warn" | "fail";
  blocker?: boolean;
  detail?: string;
  fixable?: boolean;
  fix_action?: string;
};

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
    const threshold: number = Number.isFinite(body?.threshold) ? Number(body.threshold) : 90;
    const enforceDraft: boolean = body?.enforce_draft !== false;
    if (!pageId) return json({ error: "page_id requis" }, 400);

    const { data: page, error: pErr } = await supabase
      .from("seo_pages")
      .select("id, slug, title, meta_title, meta_description, content_html, intro, faq, internal_links, city_slug, material_slug, service_slug, status, keywords, og_title, og_description")
      .eq("id", pageId)
      .maybeSingle();
    if (pErr || !page) return json({ error: pErr?.message || "Page introuvable" }, 404);

    const html = String(page.content_html || "");
    const title = String(page.title || "");
    const metaTitle = String(page.meta_title || "");
    const metaDesc = String(page.meta_description || "");
    const faq: Array<{ question: string; answer: string }> = Array.isArray(page.faq) ? page.faq : [];
    const links: Array<unknown> = Array.isArray(page.internal_links) ? page.internal_links : [];
    const keywords: string[] = Array.isArray((page as { keywords?: unknown }).keywords)
      ? ((page as { keywords: unknown[] }).keywords.filter((k): k is string => typeof k === "string"))
      : [];
    const ogTitle = String((page as { og_title?: string | null }).og_title || "");
    const ogDesc = String((page as { og_description?: string | null }).og_description || "");

    const words = countWords(html);
    // The SPA template (SeoLandingPage.tsx) renders <h1> from page.title / page.h1,
    // not from content_html. Count the effective H1: template-provided title OR an
    // explicit <h1> in content. Presence of the title field is sufficient.
    const contentH1 = countTags(html, "h1");
    const templateH1 = String(page.title || "").trim().length > 0 ? 1 : 0;
    const h1 = templateH1 + contentH1; // 1 (template only) is the normal case
    const h2 = countTags(html, "h2");
    const h3 = countTags(html, "h3");
    const internal = countInternalLinks(html);
    const ctas = countCTAs(html);
    const images = countImages(html);
    // L'image de couverture rendue par le gabarit compte comme visuel de la page.
    if (page.cover_image_url) {
      images.total += 1;
      if (String(page.cover_image_alt || "").trim().length >= 3) images.withAlt += 1;
    }
    const plain = stripHtml(html);
    const avgSent = avgSentenceLength(plain);

    // Local optimization: does the content name the city + material/service in body + title?
    const citySlug = String(page.city_slug || "");
    const materialSlug = String(page.material_slug || "");
    const serviceSlug = String(page.service_slug || "");
    const cityLabel = citySlug.replace(/-/g, " ");
    const materialLabel = materialSlug.replace(/-/g, " ");
    const serviceLabel = serviceSlug.replace(/-/g, " ");
    const cityInTitle = cityLabel ? containsWord(title + " " + metaTitle, cityLabel) : true;
    const cityInContent = cityLabel ? containsWord(plain, cityLabel) : true;
    const topicInContent = materialLabel
      ? containsWord(plain, materialLabel)
      : serviceLabel ? containsWord(plain, serviceLabel) : true;
    const localOk = cityInTitle && cityInContent && topicInContent;

    // Similarity vs siblings (same family: same material or same service or same city).
    const familyFilter = supabase.from("seo_pages").select("id, title, content_html").neq("id", pageId).eq("status", "published").limit(20);
    if (page.material_slug) familyFilter.eq("material_slug", page.material_slug);
    else if (page.service_slug) familyFilter.eq("service_slug", page.service_slug);
    else if (page.city_slug) familyFilter.eq("city_slug", page.city_slug);
    const { data: siblings } = await familyFilter;
    const myTri = trigrams(plain);
    let maxSim = 0;
    let worstSlug = "";
    for (const s of siblings ?? []) {
      const sim = jaccard(myTri, trigrams(stripHtml(String(s.content_html || ""))));
      if (sim > maxSim) { maxSim = sim; worstSlug = String((s as { title?: string }).title || ""); }
    }

    // Schema.org validity: try parsing FAQPage from faq array and a Service json-ld from row fields.
    let schemaOk = false;
    try {
      const schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
      };
      schemaOk = JSON.parse(JSON.stringify(schema)).mainEntity.length >= 3;
    } catch { schemaOk = false; }

    // Meta title uniqueness across published pages.
    const { data: dupMeta } = await supabase.from("seo_pages").select("id").eq("meta_title", metaTitle).neq("id", pageId).limit(1);
    const metaTitleUnique = !(dupMeta && dupMeta.length > 0);

    // Build a rich, actionable checklist.
    const contentLenOk = words >= 800;
    const contentLenWarn = words >= 500 && words < 800;
    const h1Ok = h1 >= 1 && contentH1 <= 1;
    const h1Warn = contentH1 >= 2;
    const headingsOk = h2 >= 4 && (h2 + h3) >= 6;
    const headingsWarn = h2 >= 2;
    const faqOk = faq.length >= 5 && faq.every((f) => (f.answer || "").split(/\s+/).length >= 40);
    const faqWarn = faq.length >= 3 && !faqOk;
    const internalOk = internal + links.length >= 5;
    const internalWarn = internal + links.length >= 2 && !internalOk;
    const metaTitleOk = metaTitle.length >= 40 && metaTitle.length <= 65 && metaTitleUnique;
    const metaDescOk = metaDesc.length >= 140 && metaDesc.length <= 165;
    const metaDescWarn = metaDesc.length >= 100 && !metaDescOk;
    const ogTitleOk = ogTitle.length >= 20 && ogTitle.length <= 90;
    const ogDescOk = ogDesc.length >= 60 && ogDesc.length <= 200;
    const ogOk = ogTitleOk && ogDescOk;
    const ogWarn = (ogTitle.length > 0 && !ogTitleOk) || (ogDesc.length > 0 && !ogDescOk);
    const imagesOk = images.total >= 1 && images.withAlt === images.total;
    const imagesWarn = images.total >= 1 && !imagesOk;
    const keywordsOk = keywords.length >= 5;
    const keywordsWarn = keywords.length >= 2 && !keywordsOk;
    const ctaOk = ctas >= 2;
    const ctaWarn = ctas === 1;

    const mkStatus = (okFlag: boolean, warnFlag: boolean): "ok" | "warn" | "fail" =>
      okFlag ? "ok" : warnFlag ? "warn" : "fail";

    const checks: Check[] = [
      {
        key: "h1",
        label: `Balise H1 unique (${h1Ok ? 1 : contentH1})`,
        ok: h1Ok,
        status: mkStatus(h1Ok, h1Warn),
        blocker: h1 === 0,
        detail: h1 === 0
          ? "Aucun titre défini — remplir le champ `title` de la page."
          : contentH1 >= 2 ? "Plusieurs <h1> dans le contenu — n'en garder qu'un (le template en injecte déjà un)." : undefined,
        fixable: true,
        fix_action: "rebuild_headings",
      },
      {
        key: "content_length",
        label: `Longueur du contenu (${words} mots)`,
        ok: contentLenOk,
        status: mkStatus(contentLenOk, contentLenWarn),
        detail: contentLenOk ? undefined : `Objectif ≥ 800 mots (actuellement ${words}).`,
        fixable: true,
        fix_action: "expand_content",
      },
      {
        key: "headings",
        label: `Balises H2/H3 (${h2} H2, ${h3} H3)`,
        ok: headingsOk,
        status: mkStatus(headingsOk, headingsWarn),
        detail: headingsOk ? undefined : "Ajouter des sous-sections (≥ 4 H2, ≥ 6 titres au total).",
        fixable: true,
        fix_action: "rebuild_headings",
      },
      {
        key: "faq",
        label: `FAQ (${faq.length} Q/R)`,
        ok: faqOk,
        status: mkStatus(faqOk, faqWarn),
        detail: faqOk ? undefined : "Objectif ≥ 5 questions, réponses ≥ 40 mots.",
        fixable: true,
        fix_action: "regenerate_faq",
      },
      {
        key: "internal_linking",
        label: `Maillage interne (${internal} inline + ${links.length} connexes)`,
        ok: internalOk,
        status: mkStatus(internalOk, internalWarn),
        detail: internalOk ? undefined : "Ajouter ≥ 5 liens vers villes, matériaux ou articles connexes.",
        fixable: true,
        fix_action: "add_internal_links",
      },
      {
        key: "meta_title",
        label: `Meta title (${metaTitle.length} car.)`,
        ok: metaTitleOk,
        status: mkStatus(metaTitleOk, metaTitle.length >= 30 && metaTitleUnique),
        blocker: !metaTitleUnique || metaTitle.length < 30,
        detail: !metaTitleUnique ? "Duplicata avec une autre page." : "Longueur idéale 40–65 caractères.",
        fixable: true,
        fix_action: "rewrite_meta_title",
      },
      {
        key: "meta_description",
        label: `Meta description (${metaDesc.length} car.)`,
        ok: metaDescOk,
        status: mkStatus(metaDescOk, metaDescWarn),
        blocker: metaDesc.length < 100,
        detail: metaDescOk ? undefined : "Cible 140–165 caractères, orientée bénéfice + CTA.",
        fixable: true,
        fix_action: "rewrite_meta_description",
      },
      {
        key: "open_graph",
        label: `Open Graph (title ${ogTitle.length} / desc ${ogDesc.length})`,
        ok: ogOk,
        status: mkStatus(ogOk, ogWarn),
        detail: ogOk ? undefined : "Renseigner og_title (20–90 car.) et og_description (60–200 car.) pour les aperçus sociaux.",
        fixable: true,
        fix_action: "rewrite_open_graph",
      },
      {
        key: "local_optimization",
        label: `Optimisation locale (ville ${cityInContent ? "✓" : "✗"} / sujet ${topicInContent ? "✓" : "✗"})`,
        ok: localOk,
        status: localOk ? "ok" : "fail",
        detail: localOk ? undefined
          : `Le contenu doit mentionner ${cityLabel || "la ville"} et ${materialLabel || serviceLabel || "le sujet"} explicitement.`,
        fixable: true,
        fix_action: "expand_content",
      },
      {
        key: "images",
        label: `Images (${images.total}, ${images.withAlt} avec alt)`,
        ok: imagesOk,
        status: mkStatus(imagesOk, imagesWarn),
        detail: imagesOk ? undefined : images.total === 0
          ? "Aucune image — ajouter une image de couverture avec attribut alt."
          : "Compléter les attributs alt (≥ 3 caractères).",
        fixable: true,
        fix_action: "fix_images_alt",
      },
      {
        key: "schema",
        label: "Schema.org FAQPage valide",
        ok: schemaOk,
        status: schemaOk ? "ok" : "fail",
        blocker: !schemaOk,
        detail: schemaOk ? undefined : "Générer 5+ Q/R pour activer FAQPage.",
        fixable: true,
        fix_action: "regenerate_faq",
      },
      {
        key: "keywords",
        label: `Mots-clés secondaires (${keywords.length})`,
        ok: keywordsOk,
        status: mkStatus(keywordsOk, keywordsWarn),
        detail: keywordsOk ? undefined : "Objectif ≥ 5 mots-clés secondaires ciblés.",
        fixable: true,
        fix_action: "generate_keywords",
      },
      {
        key: "cta",
        label: `CTA vers demande (${ctas})`,
        ok: ctaOk,
        status: mkStatus(ctaOk, ctaWarn),
        detail: ctaOk ? undefined : "Insérer ≥ 2 CTA (téléphone, WhatsApp ou /transport-request).",
        fixable: true,
        fix_action: "insert_ctas",
      },
      {
        key: "uniqueness",
        label: `Unicité (max similarité ${(maxSim * 100).toFixed(0)}%${worstSlug ? ` vs « ${worstSlug} »` : ""})`,
        ok: maxSim < 0.7,
        status: maxSim < 0.55 ? "ok" : maxSim < 0.7 ? "warn" : "fail",
        blocker: maxSim >= 0.7,
        detail: maxSim >= 0.7 ? "Contenu trop proche d'une page existante — réécrire l'angle." : undefined,
        fixable: false,
      },
      {
        key: "readability",
        label: `Lisibilité (phrase moy. ${avgSent.toFixed(1)} mots)`,
        ok: avgSent > 0 && avgSent < 25,
        status: avgSent > 0 && avgSent < 25 ? "ok" : avgSent < 30 ? "warn" : "fail",
        detail: avgSent >= 25 ? "Raccourcir les phrases (< 25 mots en moyenne)." : undefined,
        fixable: true,
        fix_action: "improve_readability",
      },
    ];

    // Score = weighted pass rate (blockers count double).
    const weight = (c: Check) => (c.blocker ? 2 : 1);
    const total = checks.reduce((s, c) => s + weight(c), 0);
    const passed = checks.reduce((s, c) => s + (c.ok ? weight(c) : 0), 0);
    const score = Math.round((passed / total) * 100);

    const blockers = checks.filter((c) => !c.ok && c.blocker).map((c) => c.label);
    const warnings = checks.filter((c) => !c.ok && !c.blocker).map((c) => c.label);

    // Persistent-state guarantee: never demote a page that has already
    // been published. Once a page is live, subsequent QA runs must only
    // record diagnostics — they cannot flip the page back to draft on
    // restart / refresh. Only pages still in draft may be blocked from
    // being auto-published by a below-threshold QA check.
    const isDraft = (page as { status?: string | null }).status === "draft";
    const shouldDemote = enforceDraft && isDraft && (blockers.length > 0 || score < threshold);
    const autoPublished = !shouldDemote;

    const { data: report } = await supabase
      .from("seo_qa_reports")
      .insert({
        page_id: pageId,
        score,
        checks,
        blockers,
        warnings,
        auto_published: autoPublished,
      })
      .select("id")
      .single();

    const updates: Record<string, unknown> = {
      qa_last_score: score,
      qa_last_checked_at: new Date().toISOString(),
      qa_blockers: blockers,
      qa_breakdown: checks,
      // Keep the SEO Manager dashboards (Analyse SEO, centre de contrôle massif)
      // aligned with the real, freshly computed score.
      seo_score: score,
      last_analyzed_at: new Date().toISOString(),
      needs_refresh: blockers.length > 0 || score < 65,
      refresh_reason: blockers.length ? `qa:${blockers.slice(0, 3).join(",")}` : null,
    };
    if (shouldDemote) updates.status = "draft";
    await supabase.from("seo_pages").update(updates).eq("id", pageId);

    return json({
      ok: true,
      score,
      blockers,
      warnings,
      checks,
      auto_published: autoPublished,
      demoted: shouldDemote,
      report_id: report?.id ?? null,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});