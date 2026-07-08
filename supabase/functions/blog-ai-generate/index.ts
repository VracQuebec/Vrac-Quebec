// Deno edge function — Generates a blog article draft from a keyword using Lovable AI Gateway.
// Auth: admin only. Returns { title, slug, excerpt, meta_title, meta_description, content_html, suggested_tags }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 80);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
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
    const keyword: string = (body?.keyword || "").toString().trim();
    const category: string = (body?.category || "").toString().trim();
    const existingPosts: Array<{ title: string; slug: string; category?: string }> = Array.isArray(body?.existing_posts) ? body.existing_posts.slice(0, 40) : [];
    if (!keyword) return json({ error: "Mot-clé requis" }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY manquante" }, 500);

    const linkList = existingPosts.length
      ? existingPosts.map((p) => `- ${p.title} → /blog/${p.slug}`).join("\n")
      : "(aucun article existant — n'invente pas de lien interne)";

    const system = `Tu es rédacteur SEO senior pour Vrac Québec, entreprise québécoise de transport de matériaux en vrac (remblai, terre, sable, gravier, pierre, béton/asphalte recyclés, excavation, camions 10 et 12 roues).
Français québécois professionnel, ton clair, orienté conversion, zéro emoji, zéro superlatif creux.
Réponds UNIQUEMENT en JSON valide (aucun texte autour, aucun bloc markdown) avec ce schéma STRICT :
{
  "title": "H1 accrocheur ≤ 70 caractères, mot-clé principal en début",
  "slug": "url-en-kebab-case-sans-accents",
  "excerpt": "Résumé 140-160 caractères optimisé Google",
  "meta_title": "Meta title ≤ 60 caractères",
  "meta_description": "Meta description 150-160 caractères avec CTA implicite",
  "cover_image_prompt": "Prompt anglais photoréaliste pour générer une image de couverture 16:9 illustrant le sujet (chantier québécois, camion benne, matériaux en vrac, etc.). Pas de texte dans l'image.",
  "content_html": "Article HTML complet — voir règles",
  "faq": [{"question":"...","answer":"réponse HTML courte 2-4 phrases"}],
  "suggested_tags": ["3 à 6 étiquettes courtes en minuscules"]
}

RÈGLES content_html :
- Longueur OBLIGATOIRE : 1500 à 2500 mots.
- Balises autorisées uniquement : h2, h3, p, ul, ol, li, strong, em, blockquote, a.
- Aucun h1 (le titre H1 est géré ailleurs). Aucun script, style, iframe, img.
- Structure : introduction (2-3 paragraphes) → 5 à 8 sections H2 avec sous-sections H3 pertinentes → section H2 "Questions fréquentes" contenant les mêmes questions/réponses que le tableau "faq" (H3 = question, p = réponse) → H2 "Conclusion" avec appel à l'action naturel.
- Insère 3 à 6 liens internes <a href="/blog/SLUG"> vers des articles existants pertinents (uniquement à partir de la liste fournie, jamais inventés). Ancre naturelle intégrée à la phrase, pas de "cliquez ici".
- Ajoute 2 à 3 CTA en bloc <p><a href="..."><strong>...</strong></a></p> :
  * /#questionnaire → « Faire une demande de remblai »
  * /#questionnaire → « Déposer des matériaux »
  * /contact ou /#questionnaire → « Demander une soumission de transport »
- Localise sur le Québec (Montréal, Laval, Rive-Sud, Rive-Nord, Québec, Estrie, Outaouais…). Cite des ordres de grandeur crédibles (verges cubes, tonnes, chargements).
- Aucune donnée inventée qui semble officielle (règlements précis, tarifs exacts). Utilise des fourchettes prudentes.

Articles existants disponibles pour liens internes :
${linkList}`;

    const user = `Rédige un article SEO complet sur : "${keyword}"${category ? ` (catégorie : ${category})` : ""}.
Objectif : positionner Vrac Québec en tête de Google pour ce mot-clé et convertir le lecteur vers une demande de remblai, un dépôt de matériaux, ou une soumission de transport.
Contexte : Vrac Québec livre du remblai, terre, sable, gravier, pierre partout au Québec et récupère aussi les surplus de chantier.
Respecte STRICTEMENT le schéma JSON et les règles content_html du system prompt.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 429) return json({ error: "Trop de requêtes IA — réessayez dans un instant." }, 429);
      if (resp.status === 402) return json({ error: "Crédits IA épuisés. Ajoutez des crédits dans les paramètres." }, 402);
      return json({ error: `Erreur IA: ${text}` }, 500);
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = {}; }
      }
    }

    const title = String(parsed.title || keyword).slice(0, 200);
    const slug = String(parsed.slug || slugify(title));
    const faqRaw = Array.isArray(parsed.faq) ? parsed.faq : [];
    const faq = faqRaw
      .map((f: unknown) => {
        const rec = f as { question?: unknown; answer?: unknown };
        return { question: String(rec?.question || "").trim(), answer: String(rec?.answer || "").trim() };
      })
      .filter((f: { question: string; answer: string }) => f.question && f.answer)
      .slice(0, 10);

    return json({
      title,
      slug: slugify(slug),
      excerpt: String(parsed.excerpt || ""),
      meta_title: String(parsed.meta_title || title).slice(0, 70),
      meta_description: String(parsed.meta_description || ""),
      content_html: String(parsed.content_html || ""),
      cover_image_prompt: String(parsed.cover_image_prompt || ""),
      faq,
      suggested_tags: Array.isArray(parsed.suggested_tags) ? parsed.suggested_tags.slice(0, 8).map(String) : [],
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}