// Deno edge function — Uses Lovable AI to rewrite a SEO page (content, FAQs, meta),
// recomputes SEO metrics + internal links, and saves the proposal in
// seo_page_improvements. Never overwrites the live page automatically — the client
// applies the improvement in a second call to `apply` mode.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAIChatCached } from "../_shared/ai-cache.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").length : 0;
}
function countTags(html: string, tag: string): number {
  const re = new RegExp(`<${tag}[\\s>]`, "gi");
  return (html.match(re) ?? []).length;
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
function computeScore(m: {
  words: number; h2: number; h3: number; internal: number;
  metaTitleLen: number; metaDescLen: number; faqCount: number; introLen: number;
}): number {
  let s = 0;
  if (m.words >= 800 && m.words <= 1500) s += 30;
  else if (m.words >= 600) s += 22; else s += 10;
  s += Math.min(m.h2 * 3, 12) + Math.min(m.h3 * 2, 8);
  s += (m.metaTitleLen >= 40 && m.metaTitleLen <= 65) ? 7 : 3;
  s += (m.metaDescLen >= 140 && m.metaDescLen <= 165) ? 8 : 3;
  s += m.internal >= 5 ? 15 : m.internal * 2;
  s += m.faqCount >= 6 ? 12 : m.faqCount * 2;
  s += m.introLen > 40 ? 8 : 0;
  return Math.min(100, Math.max(0, Math.round(s)));
}

async function buildInternalLinks(
  supabase: any, citySlug: string, materialSlug: string | null, serviceSlug: string | null,
): Promise<Array<{ label: string; href: string; kind: string }>> {
  const links: Array<{ label: string; href: string; kind: string }> = [];
  const { data: sameCity } = await supabase
    .from("seo_pages").select("slug, title").eq("city_slug", citySlug).eq("status", "published").limit(5);
  for (const p of sameCity ?? []) links.push({ label: p.title, href: `/${p.slug}`, kind: "same_city" });
  if (materialSlug) {
    const { data: sameMat } = await supabase
      .from("seo_pages").select("slug, title").eq("material_slug", materialSlug).neq("city_slug", citySlug).eq("status", "published").limit(5);
    for (const p of sameMat ?? []) links.push({ label: p.title, href: `/${p.slug}`, kind: "same_material" });
  }
  if (serviceSlug) {
    const { data: sameSvc } = await supabase
      .from("seo_pages").select("slug, title").eq("service_slug", serviceSlug).neq("city_slug", citySlug).eq("status", "published").limit(3);
    for (const p of sameSvc ?? []) links.push({ label: p.title, href: `/${p.slug}`, kind: "same_service" });
  }
  return links.slice(0, 10);
}


/** Coupe un texte sur une frontière de mot, sans dépasser `max`. */
function clampText(text: string, min: number, max: number): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" — "));
  if (lastStop >= min) return cut.slice(0, lastStop + 1).trim();
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace >= min ? cut.slice(0, lastSpace) : cut).trim();
}

function countCtaLinks(html: string): number {
  const links = html.match(/<a\s[^>]*href=["'][^"']+["'][^>]*>/gi) ?? [];
  let n = 0;
  for (const l of links) {
    const href = /href=["']([^"']+)["']/i.exec(l)?.[1] ?? "";
    if (/\/transport-request|#questionnaire|\/contact/i.test(href)) n++;
  }
  return n;
}

function normalizeLoose(text: string): string {
  return (text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Corrections déterministes appliquées après l'IA : CTA manquants et mention
 * explicite ville + sujet. L'IA échoue régulièrement sur ces critères mesurés.
 */
function enforceCtaAndLocal(html: string, cityName: string, topicName: string): string {
  let out = html;
  const plain = normalizeLoose(out.replace(/<[^>]+>/g, " "));
  const cityOk = !cityName || plain.includes(normalizeLoose(cityName));
  const topicOk = !topicName || plain.includes(normalizeLoose(topicName));
  if (!cityOk || !topicOk) {
    out += `<p><strong>${[topicName, cityName].filter(Boolean).join(" à ")}</strong> : Vrac Québec met en relation les chantiers de ${cityName} avec les fournisseurs et transporteurs locaux disponibles.</p>`;
  }
  let ctas = countCtaLinks(out);
  if (ctas < 2) {
    const blocks = [
      `<p><a href="/transport-request">Demander une soumission pour ${topicName || "vos matériaux"} à ${cityName}</a></p>`,
      `<p>Besoin d'un accompagnement ? <a href="/contact">Contactez l'équipe Vrac Québec</a> pour valider votre besoin.</p>`,
    ];
    while (ctas < 2 && blocks.length) { out += blocks.shift(); ctas++; }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) return json({ error: "Non autorisé" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: userData } = await supabase.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Session invalide" }, 401);
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);

    const body = await req.json().catch(() => ({}));
    const pageId = String(body?.page_id || "");
    const mode = String(body?.mode || "propose"); // "propose" | "apply"
    const focus: string[] = Array.isArray(body?.focus)
      ? (body.focus as unknown[]).map((f) => String(f || "").trim()).filter(Boolean).slice(0, 20)
      : [];
    if (!pageId) return json({ error: "page_id requis" }, 400);

    if (mode === "apply") {
      const improvementId = String(body?.improvement_id || "");
      if (!improvementId) return json({ error: "improvement_id requis" }, 400);
      const { data: imp, error: iErr } = await supabase
        .from("seo_page_improvements").select("*").eq("id", improvementId).maybeSingle();
      if (iErr || !imp) return json({ error: "Amélioration introuvable" }, 404);
      const after = imp.after_snapshot as Record<string, unknown>;
      const { error: uErr } = await supabase.from("seo_pages").update({
        title: after.title,
        meta_title: after.meta_title,
        meta_description: after.meta_description,
        og_title: after.og_title,
        og_description: after.og_description,
        cover_image_alt: after.cover_image_alt,
        keywords: after.keywords,
        intro: after.intro,
        content_html: after.content_html,
        faq: after.faq,
        internal_links: after.internal_links,
        word_count: after.word_count,
        h2_count: after.h2_count,
        h3_count: after.h3_count,
        internal_link_count: after.internal_link_count,
        seo_score: after.seo_score,
        last_generated_at: new Date().toISOString(),
        last_analyzed_at: new Date().toISOString(),
        needs_refresh: false,
        refresh_reason: null,
      }).eq("id", pageId);
      if (uErr) return json({ error: uErr.message }, 500);
      await supabase.from("seo_page_improvements").update({ applied: true, applied_at: new Date().toISOString() }).eq("id", improvementId);
      return json({ ok: true, applied: true });
    }

    // mode "propose"
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY manquante" }, 500);

    const { data: page, error: pErr } = await supabase.from("seo_pages").select("*").eq("id", pageId).maybeSingle();
    if (pErr || !page) return json({ error: "Page introuvable" }, 404);

    const [{ data: city }, { data: material }, { data: service }] = await Promise.all([
      supabase.from("seo_cities").select("*").eq("slug", page.city_slug).maybeSingle(),
      page.material_slug ? supabase.from("seo_materials").select("*").eq("slug", page.material_slug).maybeSingle() : Promise.resolve({ data: null }),
      page.service_slug ? supabase.from("seo_services").select("*").eq("slug", page.service_slug).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    const system = `Tu es rédacteur SEO senior pour Vrac Québec (plateforme québécoise de mise en relation pour matériaux en vrac et transport). Français québécois professionnel, orienté conversion, zéro emoji, aucun prix inventé.
Améliore la page existante : réécris le contenu, enrichis les FAQ, optimise les balises, densifie le maillage interne. Conserve le sujet et l'intention. Améliore la structure et l'unicité.
Réponds UNIQUEMENT en JSON valide strict :
{
  "title": "≤ 70 caractères",
  "meta_title": "≤ 60 caractères",
  "meta_description": "150-160 caractères",
  "og_title": "≤ 60 caractères",
  "og_description": "≤ 200 caractères",
  "cover_image_alt": "≤ 120 caractères",
  "keywords": ["8 à 12 mots-clés secondaires ciblés (longue traîne locale)"],
  "intro": "2-3 phrases HTML sans balise",
  "content_html": "voir règles",
  "faq": [{"question":"...","answer":"..."}],
  "notes": "1-2 phrases décrivant les principaux changements"
}

RÈGLES content_html :
- 900 à 1500 mots.
- Balises : h2, h3, p, ul, ol, li, strong, em, a. Aucun h1/img/script/style/iframe.
- 5 à 7 H2, chaque H2 avec 1-2 H3.
- 6 à 8 FAQ locales concrètes.
- 3 à 5 liens internes contextuels relatifs (ex : /gravier-levis).
- Densité mot-clé principal 1-2 %.`;

    const user = `Améliore cette page.
Ville : ${city?.name} (${city?.region ?? ""}).
${material ? `Matériau : ${material.name}.` : ""}
${service ? `Service : ${service.name}.` : ""}

CONTENU ACTUEL (à améliorer, pas à copier) :
Titre : ${page.title}
Meta title : ${page.meta_title}
Meta description : ${page.meta_description}
Intro : ${page.intro}

HTML actuel :
${(page.content_html ?? "").slice(0, 6000)}

FAQ actuelle :
${JSON.stringify(page.faq ?? [])}

Score SEO actuel : ${page.seo_score ?? "n/a"}/100 (${page.word_count ?? 0} mots).
${focus.length ? `\nPROBLÈMES DÉTECTÉS PAR L'AUDIT SEO — corrige-les en priorité :\n- ${focus.join("\n- ")}` : ""}`;

    let raw = "";
    try {
      // "Améliorer" is always a human-triggered rewrite.
      const ai = await callAIChatCached({
        supabase,
        functionName: "seo-improve-page",
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        allowAi: true,
      });
      raw = ai.content;
    } catch (e) {
      const err = e as { status?: number; message?: string };
      const status = err.status ?? 500;
      if (status === 429) return json({ error: "Trop de requêtes IA — réessayez plus tard." }, 429);
      if (status === 402) return json({ error: err.message || "Crédits IA épuisés." }, 402);
      return json({ error: `Erreur IA: ${err.message}` }, 500);
    }
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = {}; } }
    }

    const title = String(parsed.title || page.title).slice(0, 200);
    const metaTitle = String(parsed.meta_title || page.meta_title || title).slice(0, 70);
    const metaDescription = clampText(String(parsed.meta_description || page.meta_description || ""), 140, 165);
    const ogTitleRaw = clampText(String(parsed.og_title || metaTitle), 20, 90);
    const ogTitleSafe = ogTitleRaw.length >= 20 ? ogTitleRaw : clampText(`${ogTitleRaw} — Vrac Québec`, 20, 90);
    const ogDescription = clampText(String(parsed.og_description || metaDescription), 60, 200);
    const kwRaw = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    const keywords = kwRaw
      .map((k: unknown) => String(k || "").trim())
      .filter((k: string) => k.length > 1)
      .slice(0, 15);
    const coverAlt = String(parsed.cover_image_alt || page.cover_image_alt || `${title} — Vrac Québec`).slice(0, 160);
    const intro = String(parsed.intro || page.intro || "");
    const contentHtml = enforceCtaAndLocal(
      String(parsed.content_html || page.content_html || ""),
      String(city?.name ?? "").trim(),
      String(material?.name ?? service?.name ?? "").trim(),
    );
    const faqRaw = Array.isArray(parsed.faq) ? parsed.faq : [];
    const faq = faqRaw
      .map((f: unknown) => {
        const r = f as { question?: unknown; answer?: unknown };
        return { question: String(r?.question || "").trim(), answer: String(r?.answer || "").trim() };
      })
      .filter((f: { question: string; answer: string }) => f.question && f.answer)
      .slice(0, 10);
    const notes = String(parsed.notes || "").slice(0, 500);

    const words = countWords(contentHtml);
    const h2 = countTags(contentHtml, "h2");
    const h3 = countTags(contentHtml, "h3");
    const inlineInternal = countInternalLinks(contentHtml);
    const rebuiltLinks = await buildInternalLinks(supabase, page.city_slug, page.material_slug, page.service_slug);
    const totalInternal = inlineInternal + rebuiltLinks.length;

    const score = computeScore({
      words, h2, h3, internal: totalInternal,
      metaTitleLen: metaTitle.length, metaDescLen: metaDescription.length,
      faqCount: faq.length, introLen: intro.length,
    });

    const afterSnapshot = {
      title, meta_title: metaTitle, meta_description: metaDescription,
      og_title: ogTitleSafe, og_description: ogDescription, cover_image_alt: coverAlt,
      keywords: keywords.length >= 5 ? keywords : (Array.isArray(page.keywords) ? page.keywords : keywords),
      intro, content_html: contentHtml, faq, internal_links: rebuiltLinks,
      word_count: words, h2_count: h2, h3_count: h3,
      internal_link_count: totalInternal, seo_score: score,
    };
    const beforeSnapshot = {
      title: page.title, meta_title: page.meta_title, meta_description: page.meta_description,
      og_title: page.og_title, og_description: page.og_description, cover_image_alt: page.cover_image_alt,
      keywords: page.keywords,
      intro: page.intro, content_html: page.content_html, faq: page.faq, internal_links: page.internal_links,
      word_count: page.word_count, h2_count: page.h2_count, h3_count: page.h3_count,
      internal_link_count: page.internal_link_count, seo_score: page.seo_score,
    };

    const { data: imp, error: impErr } = await supabase.from("seo_page_improvements").insert({
      page_id: pageId,
      before_snapshot: beforeSnapshot,
      after_snapshot: afterSnapshot,
      applied: false,
      model: "google/gemini-2.5-flash",
      notes,
      created_by: uid,
    }).select("id").single();
    if (impErr) return json({ error: impErr.message }, 500);

    return json({
      ok: true,
      improvement_id: imp.id,
      before: beforeSnapshot,
      after: afterSnapshot,
      notes,
      delta: {
        score: (afterSnapshot.seo_score ?? 0) - (beforeSnapshot.seo_score ?? 0),
        words: (afterSnapshot.word_count ?? 0) - (beforeSnapshot.word_count ?? 0),
        internal_links: (afterSnapshot.internal_link_count ?? 0) - (beforeSnapshot.internal_link_count ?? 0),
        faq: (afterSnapshot.faq?.length ?? 0) - ((beforeSnapshot.faq as unknown[])?.length ?? 0),
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});