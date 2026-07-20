// Deno edge function — Generates SEO landing page content for a city × material × service combination
// via Lovable AI Gateway. Admin-only. Returns structured JSON: title/meta/h1/content_html/faq.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 120);
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
    const city = body?.city as { slug: string; name: string; region?: string } | undefined;
    const material = body?.material as { slug: string; name: string; short_name?: string; description?: string } | undefined;
    const service = body?.service as { slug: string; name: string; description?: string } | undefined;
    if (!city?.slug) return json({ error: "Ville requise" }, 400);
    if (!material && !service) return json({ error: "Matériau ou service requis" }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY manquante" }, 500);

    // Build slug: service-material-city, or material-city, or service-city
    const parts = [service?.slug, material?.slug, city.slug].filter(Boolean) as string[];
    const pageSlug = slugify(parts.join("-"));

    // Skip if already exists
    const { data: existing } = await supabase
      .from("seo_pages")
      .select("id")
      .eq("slug", pageSlug)
      .maybeSingle();
    if (existing?.id) {
      return json({ skipped: true, reason: "exists", slug: pageSlug });
    }

    const label = [service?.name, material?.name].filter(Boolean).join(" — ");
    const humanTitle = `${label} à ${city.name}`;

    const system = `Tu es rédacteur SEO senior pour Vrac Québec, plateforme québécoise de mise en relation pour matériaux en vrac et services de transport (remblai, terre, gravier, sable, pierre, béton/asphalte recyclés, dompe, excavation).
Français québécois professionnel, ton clair, orienté conversion, zéro emoji, zéro superlatif creux, aucun prix inventé.
Vrac Québec n'est PAS un vendeur : c'est un connecteur qui met en relation clients, fournisseurs et entrepreneurs locaux.
Réponds UNIQUEMENT en JSON valide (aucun texte autour, aucun bloc markdown) avec ce schéma STRICT :
{
  "title": "H1 accrocheur ≤ 70 caractères, mot-clé principal en début",
  "meta_title": "Meta title ≤ 60 caractères",
  "meta_description": "150-160 caractères avec CTA implicite",
  "intro": "Paragraphe d'introduction 2-3 phrases, HTML sans balise",
  "content_html": "Corps HTML — voir règles",
  "faq": [{"question":"...","answer":"réponse 2-4 phrases"}]
}

RÈGLES content_html :
- 600 à 1200 mots.
- Balises autorisées uniquement : h2, h3, p, ul, ol, li, strong, em, a.
- Aucun h1 (le H1 est géré ailleurs). Aucun script/style/iframe/img.
- Structure : 4 à 6 sections H2 avec sous-sections H3 pertinentes.
- Localise fortement sur ${city.name} (${city.region ?? "Québec"}) : quartiers, accès camion, type de chantier.
- 4 à 6 FAQ locales et concrètes (accès, délais, quantité minimum, unité de mesure, camion utilisé). Jamais de prix précis.
- Aucune donnée officielle inventée. Ne cite pas de règlements municipaux par numéro.`;

    const user = `Rédige la page SEO "${humanTitle}".
Ville : ${city.name} (${city.region ?? ""}).
${material ? `Matériau : ${material.name}${material.description ? ` — ${material.description}` : ""}.` : ""}
${service ? `Service : ${service.name}${service.description ? ` — ${service.description}` : ""}.` : ""}
Objectif : positionner cette page en tête de Google pour ce mot-clé local et convertir vers le formulaire de demande de Vrac Québec.
Respecte STRICTEMENT le schéma JSON et les règles content_html du system prompt.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
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
      if (resp.status === 429) return json({ error: "Trop de requêtes IA — réessayez plus tard." }, 429);
      if (resp.status === 402) return json({ error: "Crédits IA épuisés." }, 402);
      return json({ error: `Erreur IA: ${text}` }, 500);
    }
    const dataAi = await resp.json();
    const raw = dataAi?.choices?.[0]?.message?.content ?? "";
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = {}; } }
    }

    const title = String(parsed.title || humanTitle).slice(0, 200);
    const metaTitle = String(parsed.meta_title || title).slice(0, 70);
    const metaDescription = String(parsed.meta_description || "").slice(0, 300);
    const intro = String(parsed.intro || "");
    const contentHtml = String(parsed.content_html || "");
    const faqRaw = Array.isArray(parsed.faq) ? parsed.faq : [];
    const faq = faqRaw
      .map((f: unknown) => {
        const r = f as { question?: unknown; answer?: unknown };
        return { question: String(r?.question || "").trim(), answer: String(r?.answer || "").trim() };
      })
      .filter((f: { question: string; answer: string }) => f.question && f.answer)
      .slice(0, 10);

    const { data: inserted, error: insertError } = await supabase
      .from("seo_pages")
      .insert({
        slug: pageSlug,
        city_slug: city.slug,
        material_slug: material?.slug ?? null,
        service_slug: service?.slug ?? null,
        title,
        meta_title: metaTitle,
        meta_description: metaDescription,
        h1: title,
        intro,
        content_html: contentHtml,
        faq,
        status: "published",
        ai_model: "google/gemini-2.5-flash",
        last_generated_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
      })
      .select("id, slug")
      .single();

    if (insertError) return json({ error: insertError.message }, 500);
    return json({ created: true, page: inserted });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});