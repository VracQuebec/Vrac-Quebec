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
    if (!keyword) return json({ error: "Mot-clé requis" }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY manquante" }, 500);

    const system = `Tu es rédacteur SEO pour Vrac Québec, une entreprise québécoise de transport de matériaux en vrac (remblai, terre, sable, gravier, pierre, excavation).
Tu écris en français québécois professionnel, orienté SEO Google, sans emojis, ton clair et utile.
Retourne UNIQUEMENT un JSON valide (aucun texte autour) avec ce schéma exact :
{
  "title": "Titre H1 accrocheur incluant le mot-clé principal (≤ 70 caractères)",
  "slug": "slug-en-kebab-case",
  "excerpt": "Résumé de 140-160 caractères optimisé pour Google",
  "meta_title": "Meta titre SEO (≤ 60 caractères)",
  "meta_description": "Meta description (≤ 160 caractères)",
  "content_html": "Article complet en HTML propre : h2, h3, p, ul, ol, strong, blockquote. Environ 900-1400 mots, structure claire avec 4-6 sections H2 dont une FAQ finale et une conclusion. Aucun script/style/iframe.",
  "suggested_tags": ["3 à 6 étiquettes courtes"]
}`;

    const user = `Rédige un article de blogue SEO complet sur le sujet : "${keyword}"${category ? ` (catégorie : ${category})` : ""}.
Contexte : Vrac Québec livre du remblai, de la terre, du sable, du gravier et de la pierre partout au Québec, et récupère aussi les surplus.
Inclure : introduction, 4-6 sections H2, quelques H3, listes à puces utiles, section FAQ H2 (3-5 questions), conclusion avec appel à l'action naturel vers "faire une demande" ou "déposer des matériaux". Localiser Québec.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
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
    return json({
      title,
      slug: slugify(slug),
      excerpt: String(parsed.excerpt || ""),
      meta_title: String(parsed.meta_title || title).slice(0, 70),
      meta_description: String(parsed.meta_description || ""),
      content_html: String(parsed.content_html || ""),
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