// Corrige automatiquement des éléments spécifiques d'une page SEO en utilisant
// Lovable AI. Ne réécrit que les fragments demandés (FAQ, meta, mots-clés,
// images alt, liens internes, CTA, lisibilité), puis relance seo-qa-check.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

async function aiJson<T>(system: string, user: string): Promise<T> {
  const r = await fetch(AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`AI ${r.status}: ${t}`);
  }
  const j = await r.json();
  const content = j?.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(content) as T;
}

function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
    // Internal call from optimizer worker: bypass user check when the caller
    // presents the service-role key. Safe because that key is server-only.
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
    const actions: string[] = Array.isArray(body?.actions) && body.actions.length > 0
      ? body.actions.filter((a: unknown): a is string => typeof a === "string")
      : []; // empty = fix all fixable
    if (!pageId) return json({ error: "page_id requis" }, 400);

    const { data: page, error: pErr } = await supabase
      .from("seo_pages")
      .select("id, slug, title, meta_title, meta_description, content_html, intro, faq, internal_links, keywords, city_slug, material_slug, service_slug, og_title, og_description")
      .eq("id", pageId)
      .maybeSingle();
    if (pErr || !page) return json({ error: pErr?.message || "Page introuvable" }, 404);

    const context = `Page: ${page.title}\nVille: ${page.city_slug}\nMatériau: ${page.material_slug ?? "—"}\nService: ${page.service_slug ?? "—"}\nRésumé du contenu: ${stripHtml(String(page.content_html || "")).slice(0, 800)}`;

    const updates: Record<string, unknown> = {};
    const fixedActions: string[] = [];
    let aiCalls = 0;
    const wantAll = actions.length === 0;
    const want = (k: string) => wantAll || actions.includes(k);

    // Regenerate FAQ
    if (want("regenerate_faq")) {
      aiCalls++;
      const faq = await aiJson<{ faq: Array<{ question: string; answer: string }> }>(
        "Tu es un expert SEO local au Québec. Produis un JSON strict.",
        `Génère 6 questions FAQ pertinentes pour cette page. Réponses ≥ 50 mots, ton professionnel, orienté client B2B/B2C au Québec. Format JSON: { "faq": [{ "question": "...", "answer": "..." }, ...] }.\n\nContexte:\n${context}`,
      );
      if (Array.isArray(faq.faq) && faq.faq.length >= 5) {
        updates.faq = faq.faq;
        fixedActions.push("regenerate_faq");
      }
    }

    // Meta title
    if (want("rewrite_meta_title")) {
      aiCalls++;
      const mt = await aiJson<{ meta_title: string }>(
        "SEO expert. JSON strict.",
        `Rédige un meta title unique en français (55–63 caractères), incluant ville et matériau si présents. Format: { "meta_title": "..." }.\n\n${context}`,
      );
      if (typeof mt.meta_title === "string" && mt.meta_title.length >= 40 && mt.meta_title.length <= 65) {
        updates.meta_title = mt.meta_title;
        fixedActions.push("rewrite_meta_title");
      }
    }

    // Meta description
    if (want("rewrite_meta_description")) {
      aiCalls++;
      const md = await aiJson<{ meta_description: string }>(
        "SEO expert. JSON strict.",
        `Rédige une meta description en français (145–160 caractères) avec bénéfice concret + appel à l'action. Format: { "meta_description": "..." }.\n\n${context}`,
      );
      if (typeof md.meta_description === "string" && md.meta_description.length >= 140 && md.meta_description.length <= 165) {
        updates.meta_description = md.meta_description;
        fixedActions.push("rewrite_meta_description");
      }
    }

    // Open Graph
    if (want("rewrite_open_graph")) {
      aiCalls++;
      const og = await aiJson<{ og_title: string; og_description: string }>(
        "SEO expert. JSON strict.",
        `Rédige un og_title (30–80 car.) et une og_description (100–180 car.) en français, orientés partage social, incluant ville et matériau si présents. Format: { "og_title": "...", "og_description": "..." }.\n\n${context}`,
      );
      if (typeof og.og_title === "string" && og.og_title.length >= 20 && og.og_title.length <= 90
          && typeof og.og_description === "string" && og.og_description.length >= 60 && og.og_description.length <= 200) {
        updates.og_title = og.og_title;
        updates.og_description = og.og_description;
        fixedActions.push("rewrite_open_graph");
      }
    }

    // Keywords
    if (want("generate_keywords")) {
      aiCalls++;
      const kw = await aiJson<{ keywords: string[] }>(
        "SEO expert. JSON strict.",
        `Génère 8 mots-clés secondaires (longue traîne) en français pour le SEO local Québec. Format: { "keywords": ["...", "..."] }.\n\n${context}`,
      );
      if (Array.isArray(kw.keywords) && kw.keywords.length >= 5) {
        updates.keywords = kw.keywords.filter((k) => typeof k === "string" && k.length > 2).slice(0, 12);
        fixedActions.push("generate_keywords");
      }
    }

    // Internal links: propose 5 related slugs from existing pages of same city/material
    if (want("add_internal_links")) {
      const { data: siblings } = await supabase
        .from("seo_pages")
        .select("slug, title, city_slug, material_slug")
        .eq("status", "published")
        .neq("id", pageId)
        .or(`city_slug.eq.${page.city_slug},material_slug.eq.${page.material_slug ?? "___none___"}`)
        .limit(20);
      const currentLinks: Array<{ url: string; label: string }> = Array.isArray(page.internal_links)
        ? (page.internal_links as Array<{ url: string; label: string }>)
        : [];
      const seen = new Set(currentLinks.map((l) => l.url));
      const additions: Array<{ url: string; label: string }> = [];
      for (const s of siblings ?? []) {
        const url = `/${s.slug}`;
        if (!seen.has(url)) {
          additions.push({ url, label: String(s.title) });
          seen.add(url);
        }
        if (currentLinks.length + additions.length >= 6) break;
      }
      if (additions.length > 0) {
        updates.internal_links = [...currentLinks, ...additions];
        fixedActions.push("add_internal_links");
      }
    }

    // Images alt: fill missing alt attributes in content_html
    if (want("fix_images_alt")) {
      let html = String(page.content_html || "");
      const imgRegex = /<img\b([^>]*)>/gi;
      let changed = false;
      html = html.replace(imgRegex, (match, attrs: string) => {
        const hasAlt = /\balt=["'][^"']{3,}["']/i.test(attrs);
        if (hasAlt) return match;
        const cleaned = attrs.replace(/\balt=["'][^"']*["']/i, "");
        const alt = `${page.title}`.replace(/"/g, "'").slice(0, 100);
        changed = true;
        return `<img${cleaned} alt="${alt}">`;
      });
      if (changed) {
        updates.content_html = html;
        fixedActions.push("fix_images_alt");
      }
    }

    // CTAs: append a CTA block if none/few detected
    if (want("insert_ctas")) {
      const html = String(page.content_html || "");
      const ctaBlock = `\n<p class="cta-block"><a href="/transport-request" class="cta-primary">Demander une soumission gratuite</a> ou appelez le <a href="tel:+15819947717">581-994-7717</a>.</p>\n`;
      if (!/\/transport-request/.test(html)) {
        updates.content_html = html + ctaBlock;
        fixedActions.push("insert_ctas");
      }
    }

    // Expand content / rebuild headings / readability: delegate to full improvement
    if (want("expand_content") || want("rebuild_headings") || want("improve_readability")) {
      aiCalls++;
      const rewrite = await aiJson<{ content_html: string }>(
        "SEO expert. HTML sémantique propre. JSON strict, pas de markdown.",
        `Réécris le contenu HTML de la page pour: (1) atteindre 900–1400 mots, (2) structurer avec ≥ 4 H2 et ≥ 2 H3, (3) phrases courtes (< 25 mots). Garde le sens et le ton du texte actuel. Format: { "content_html": "<h2>...</h2>..." }.\n\nContenu actuel (HTML):\n${String(page.content_html || "").slice(0, 6000)}`,
      );
      if (typeof rewrite.content_html === "string" && rewrite.content_html.length > 400) {
        // Merge: prefer explicit content_html from this fix over the images/CTA one
        const base = typeof updates.content_html === "string" ? String(updates.content_html) : rewrite.content_html;
        updates.content_html = typeof updates.content_html === "string" ? rewrite.content_html : rewrite.content_html;
        void base;
        if (want("expand_content")) fixedActions.push("expand_content");
        if (want("rebuild_headings")) fixedActions.push("rebuild_headings");
        if (want("improve_readability")) fixedActions.push("improve_readability");
      }
    }

    if (Object.keys(updates).length === 0) {
      return json({ ok: true, fixed: [], ai_calls: aiCalls, message: "Aucune correction applicable." });
    }

    updates.updated_at = new Date().toISOString();
    const { error: uErr } = await supabase.from("seo_pages").update(updates).eq("id", pageId);
    if (uErr) return json({ error: uErr.message }, 500);

    // Re-run QA
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

    return json({ ok: true, fixed: fixedActions, new_score: newScore, ai_calls: aiCalls });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});