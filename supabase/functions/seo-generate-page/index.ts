// Deno edge function — Generates SEO landing page content for a city × material × service combination
// via Lovable AI Gateway. Admin-only. Returns structured JSON: title/meta/h1/content_html/faq.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAIChatCached } from "../_shared/ai-cache.ts";
import { shouldBypassGenerationCache } from "./cache-policy.ts";
import { findUnverifiedClaims, CONTENT_RULES } from "../_shared/seo-claims.ts";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function jwtRole(token: string): string | null {
  try {
    const payload = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!payload) return null;
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")))?.role ?? null;
  } catch {
    return null;
  }
}

function cleanSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim();
  return slug ? slug : null;
}

function cleanName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/**
 * Appel à l'action obligatoire, déterminé par le TYPE de page.
 * Chaque page générée reçoit un CTA réellement pertinent (jamais un bloc
 * générique identique partout) pointant vers l'action Vrac Québec existante.
 */
export function buildCtaBlock(input: {
  cityName: string;
  serviceSlug: string | null;
  serviceName: string | null;
  materialSlug: string | null;
  materialName: string | null;
}): string {
  const { cityName } = input;
  const svc = input.serviceSlug ?? "";
  const mat = input.materialSlug ?? "";
  const matName = (input.materialName ?? "").toLowerCase();
  const svcName = input.serviceName ?? "";

  type Cta = { heading: string; intro: string; primary: [string, string]; secondary: [string, string] };
  let cta: Cta;

  if (svc === "dompe" || svc === "recherche-point-de-depot") {
    cta = {
      heading: `Trouver une dompe à ${cityName}`,
      intro: `Indiquez le type de matériaux à disposer et le secteur du chantier : Vrac Québec vous oriente vers les points de dépôt disponibles près de ${cityName}.`,
      primary: ["/depot-materiaux", `Rechercher une dompe à ${cityName}`],
      secondary: ["/soumission", "Décrire mon besoin de disposition"],
    };
  } else if (svc === "transport-vrac") {
    cta = {
      heading: `Demander du transport en vrac à ${cityName}`,
      intro: `Décrivez la quantité, le matériau et les points de chargement et de déchargement : Vrac Québec coordonne le transport vers ${cityName}.`,
      primary: ["/transport-en-vrac", "Demander du transport en vrac"],
      secondary: ["/soumission", "Obtenir une soumission de transport"],
    };
  } else if (svc.startsWith("livraison")) {
    cta = {
      heading: `Demander une livraison à ${cityName}`,
      intro: `Précisez la quantité et la date souhaitée : Vrac Québec organise la livraison ${svcName ? svcName.toLowerCase().replace(/^livraison de /, "de ") : "de matériaux en vrac"} à ${cityName}.`,
      primary: ["/soumission", `Demander une livraison à ${cityName}`],
      secondary: ["/materiaux", "Voir les matériaux disponibles"],
    };
  } else if (svc === "excavation" || svc === "nivellement") {
    cta = {
      heading: `Demander un service de ${svcName ? svcName.toLowerCase() : "chantier"} à ${cityName}`,
      intro: `Décrivez votre chantier à ${cityName} : Vrac Québec transmet votre besoin aux entrepreneurs et transporteurs du secteur.`,
      primary: ["/soumission", "Décrire mon chantier"],
      secondary: ["/transport-en-vrac", "Besoin de transport en vrac"],
    };
  } else if (svc === "courtage-materiaux") {
    cta = {
      heading: `Trouver les bons matériaux à ${cityName}`,
      intro: `Dites-nous ce que vous cherchez : Vrac Québec compare les sources de matériaux disponibles autour de ${cityName}.`,
      primary: ["/acheter-materiaux", "Chercher des matériaux en vrac"],
      secondary: ["/soumission", "Obtenir une soumission"],
    };
  } else if (mat.includes("remblai")) {
    cta = {
      heading: `Demander du remblai à ${cityName}`,
      intro: `Indiquez le volume et l'accès au chantier : Vrac Québec met en relation avec les sources de remblai près de ${cityName}.`,
      primary: ["/remblai", `Demander du remblai à ${cityName}`],
      secondary: ["/soumission", "Obtenir une soumission gratuite"],
    };
  } else if (mat) {
    cta = {
      heading: `Obtenir ${matName || "ce matériau"} à ${cityName}`,
      intro: `Précisez la quantité et la date de livraison : Vrac Québec vous met en relation avec les fournisseurs et transporteurs qui desservent ${cityName}.`,
      primary: ["/soumission", `Obtenir une soumission à ${cityName}`],
      secondary: ["/materiaux", "Comparer les matériaux en vrac"],
    };
  } else {
    cta = {
      heading: `Vos matériaux en vrac à ${cityName}`,
      intro: `Achat, livraison, transport ou disposition : décrivez votre besoin et Vrac Québec vous oriente vers les bonnes ressources à ${cityName}.`,
      primary: ["/soumission", `Obtenir une soumission à ${cityName}`],
      secondary: ["/depot-materiaux", "Trouver une dompe à proximité"],
    };
  }

  return [
    `<h2>${cta.heading}</h2>`,
    `<p>${cta.intro}</p>`,
    `<ul>`,
    `<li><a href="${cta.primary[0]}">${cta.primary[1]}</a></li>`,
    `<li><a href="${cta.secondary[0]}">${cta.secondary[1]}</a></li>`,
    `</ul>`,
  ].join("");
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").length : 0;
}

function countTags(html: string, tag: string): number {
  const re = new RegExp(`<${tag}[\\s>]`, "gi");
  return (html.match(re) ?? []).length;
}

function countLinks(html: string, site = "vracquebec.ca"): { internal: number; external: number } {
  const links = html.match(/<a\s[^>]*href=["'][^"']+["'][^>]*>/gi) ?? [];
  let internal = 0, external = 0;
  for (const l of links) {
    const href = /href=["']([^"']+)["']/i.exec(l)?.[1] ?? "";
    if (!href) continue;
    if (href.startsWith("/") || href.includes(site)) internal++;
    else if (href.startsWith("http")) external++;
    else internal++;
  }
  return { internal, external };
}

function computeSeoScore(m: {
  words: number; h2: number; h3: number; internal: number;
  metaTitleLen: number; metaDescLen: number; hasFaq: boolean; hasIntro: boolean;
}): { score: number; errors: string[]; suggestions: string[] } {
  const errors: string[] = [];
  const suggestions: string[] = [];
  let score = 0;
  // Contenu (30)
  if (m.words >= 800 && m.words <= 1500) score += 30;
  else if (m.words >= 600) { score += 22; suggestions.push("Étoffer le contenu vers 800-1500 mots."); }
  else { score += 10; errors.push(`Contenu trop court (${m.words} mots).`); }
  // Structure (20)
  if (m.h2 >= 4) score += 12; else { score += Math.min(m.h2 * 3, 12); suggestions.push("Ajouter des sections H2."); }
  if (m.h3 >= 3) score += 8; else score += Math.min(m.h3 * 2, 8);
  // Meta (15)
  if (m.metaTitleLen >= 40 && m.metaTitleLen <= 65) score += 7; else { score += 3; suggestions.push("Ajuster le meta title (40-65 caractères)."); }
  if (m.metaDescLen >= 140 && m.metaDescLen <= 165) score += 8; else { score += 3; suggestions.push("Ajuster la meta description (140-165 caractères)."); }
  // Liens internes (15)
  if (m.internal >= 5) score += 15; else { score += m.internal * 2; suggestions.push("Renforcer le maillage interne (≥ 5 liens)."); }
  // Bonus (20)
  if (m.hasFaq) score += 12; else errors.push("FAQ manquante.");
  if (m.hasIntro) score += 8; else suggestions.push("Ajouter un paragraphe d'introduction.");
  return { score: Math.min(100, Math.max(0, Math.round(score))), errors, suggestions };
}

// Build internal links to related pages (same city / same material / neighbor cities)
async function buildInternalLinks(
  supabase: any,
  citySlug: string,
  materialSlug: string | null,
  serviceSlug: string | null,
): Promise<Array<{ label: string; href: string; kind: string }>> {
  const links: Array<{ label: string; href: string; kind: string }> = [];
  // 5 autres pages de la même ville
  const { data: sameCity } = await supabase
    .from("seo_pages")
    .select("slug, title")
    .eq("city_slug", citySlug)
    .eq("status", "published")
    .limit(5);
  for (const p of sameCity ?? []) links.push({ label: p.title, href: `/${p.slug}`, kind: "same_city" });
  // 5 autres villes avec le même matériau
  if (materialSlug) {
    const { data: sameMat } = await supabase
      .from("seo_pages")
      .select("slug, title")
      .eq("material_slug", materialSlug)
      .neq("city_slug", citySlug)
      .eq("status", "published")
      .limit(5);
    for (const p of sameMat ?? []) links.push({ label: p.title, href: `/${p.slug}`, kind: "same_material" });
  }
  // 3 pages du même service
  if (serviceSlug) {
    const { data: sameSvc } = await supabase
      .from("seo_pages")
      .select("slug, title")
      .eq("service_slug", serviceSlug)
      .neq("city_slug", citySlug)
      .eq("status", "published")
      .limit(3);
    for (const p of sameSvc ?? []) links.push({ label: p.title, href: `/${p.slug}`, kind: "same_service" });
  }
  return links.slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    // Allow service-role calls (from orchestrator / pipeline) to bypass
    // the user admin check.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwt = authHeader.replace("Bearer ", "");
    // The gateway verifies this bearer token before invocation; the role
    // claim also supports managed service keys whose serialized value differs.
    const isService = req.headers.get("apikey") === serviceKey || jwtRole(jwt) === "service_role";
    if (!jwt && !isService) return json({ error: "Non autorisé" }, 401);
    if (!isService) {
      const { data: userData } = await supabase.auth.getUser(jwt);
      const uid = userData?.user?.id;
      if (!uid) return json({ error: "Session invalide" }, 401);
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);
    }

    const body = await req.json().catch(() => ({}));

    const bodyCity = isRecord(body?.city) ? body.city : null;
    const bodyMaterial = isRecord(body?.material) ? body.material : null;
    const bodyService = isRecord(body?.service) ? body.service : null;

    const citySlug = cleanSlug(bodyCity?.slug) ?? cleanSlug(body?.city_slug);
    const materialSlug = cleanSlug(bodyMaterial?.slug) ?? cleanSlug(body?.material_slug);
    const serviceSlug = cleanSlug(bodyService?.slug) ?? cleanSlug(body?.service_slug);
    const usage = typeof body?.usage === "string" ? body.usage.trim().slice(0, 180) : "";

    let city: { slug: string; name: string; region?: string } | null = citySlug
      ? {
          slug: citySlug,
          name: cleanName(bodyCity?.name, citySlug),
          region: typeof bodyCity?.region === "string" ? bodyCity.region : undefined,
        }
      : null;
    let material: { slug: string; name: string; short_name?: string; description?: string } | null = materialSlug
      ? {
          slug: materialSlug,
          name: cleanName(bodyMaterial?.name, materialSlug),
          short_name: typeof bodyMaterial?.short_name === "string" ? bodyMaterial.short_name : undefined,
          description: typeof bodyMaterial?.description === "string" ? bodyMaterial.description : undefined,
        }
      : null;
    let service: { slug: string; name: string; description?: string } | null = serviceSlug
      ? {
          slug: serviceSlug,
          name: cleanName(bodyService?.name, serviceSlug),
          description: typeof bodyService?.description === "string" ? bodyService.description : undefined,
        }
      : null;

    if (citySlug && (!bodyCity?.name || !bodyCity?.region)) {
      const { data: row } = await supabase
        .from("seo_cities")
        .select("slug, name, region")
        .eq("slug", citySlug)
        .maybeSingle();
      if (row) city = row;
    }
    if (materialSlug && (!bodyMaterial?.name || !bodyMaterial?.description)) {
      const { data: row } = await supabase
        .from("seo_materials")
        .select("slug, name, short_name, description")
        .eq("slug", materialSlug)
        .maybeSingle();
      if (row) material = row;
    }
    if (serviceSlug && (!bodyService?.name || !bodyService?.description)) {
      const { data: row } = await supabase
        .from("seo_services")
        .select("slug, name, description")
        .eq("slug", serviceSlug)
        .maybeSingle();
      if (row) service = row;
    }

    // Mode aperçu : génère et contrôle, n'écrit jamais rien (ni page, ni journal IA, ni cache).
    const preview = body?.preview === true;
    const forceRegenerate = !preview && Boolean(body?.force && body?.confirm_overwrite === true);
    if (!city?.slug) return json({ error: "Ville requise" }, 400);

    // New pages may only be created for active municipalities from the CRM
    // registry. Historical SEO cities remain readable, but are not silently
    // reused as generation candidates.
    const { data: isGenerable, error: eligibilityError } = await supabase
      .rpc("seo_city_is_generable", { _city_slug: city.slug });
    if (eligibilityError) return json({ error: eligibilityError.message }, 500);
    if (!isGenerable) return json({ error: "Cette ville n’est pas une municipalité active du registre CRM" }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY manquante" }, 500);

    // Build slug: service-material-city, or material-city, or service-city
    const parts = [service?.slug, material?.slug, city.slug].filter(Boolean) as string[];
    const pageSlug = slugify(parts.join("-"));

    // Skip if already exists (sauf régénération forcée)
    const { data: existing } = await supabase
      .from("seo_pages")
      .select("id, status, published_at")
      .eq("slug", pageSlug)
      .maybeSingle();
    if (preview && existing?.id && (existing.status === "published" || existing.published_at)) {
      return json({ error: "Aperçu refusé : page en ligne.", protected: true, slug: pageSlug }, 409);
    }
    if (existing?.id && !forceRegenerate && !preview) {
      return json({ skipped: true, reason: "exists", slug: pageSlug });
    }
    // Une page EN LIGNE n'est jamais remplacée sans validation explicite :
    // la régénération la remettrait en brouillon non indexé.
    if (existing?.id && (existing.status === "published" || existing.published_at) && body?.confirm_published !== true) {
      return json({ error: "Page en ligne protégée : remplacement refusé sans validation explicite.", protected: true, slug: pageSlug }, 409);
    }

    // Données vérifiées (lecture seule) : seuls faits locaux permis dans le texte.
    const verified: string[] = [];
    {
      const { data: terr } = await supabase.from("geo_territories")
        .select("id").eq("seo_city_slug", city.slug).eq("type", "municipalite").eq("status", "active")
        .order("request_count", { ascending: false }).limit(1).maybeSingle();
      if (terr?.id) {
        const { data: subs } = await supabase.from("submissions").select("materials").eq("territory_id", terr.id).limit(2000);
        const total = subs?.length ?? 0;
        if (total > 0) verified.push(`${total} demande(s) enregistrée(s) sur Vrac Québec pour ${city.name}`);
        if (material) {
          const key = slugify(material.name);
          const n = (subs ?? []).filter((r: { materials: string[] | null }) => (r.materials ?? []).some((m) => slugify(m).includes(key))).length;
          if (n > 0) verified.push(`${n} demande(s) mentionnant « ${material.name} »`);
        }
        const { data: svcs } = await supabase.from("geo_territory_services").select("service_key, status").eq("territory_id", terr.id);
        const active = (svcs ?? []).filter((x: { status: string }) => x.status === "ACTIVE" || x.status === "PARTIELLE").map((x: { service_key: string }) => x.service_key);
        verified.push(active.length ? `services configurés (actifs/partiels) : ${active.join(", ")}` : "aucun service de transport ou de livraison n'est configuré pour cette ville — n'en promets aucun");
      }
    }
    const verifiedBlock = verified.length ? verified.map((v) => `- ${v}`).join("\n") : "- aucune donnée locale vérifiée : reste général";

    const label = [service?.name, material?.name].filter(Boolean).join(" — ") || "Matériaux en vrac et dompes";
    const humanTitle = `${label} à ${city.name}`;

    const system = `Tu es rédacteur SEO senior pour Vrac Québec, plateforme québécoise de mise en relation pour matériaux en vrac et services de transport (remblai, terre, gravier, sable, pierre, béton/asphalte recyclés, dompe, excavation).
Français québécois professionnel, ton clair et factuel, zéro emoji, zéro superlatif creux, aucun prix inventé.
Vrac Québec n'est PAS un vendeur : c'est une plateforme qui reçoit les demandes et les analyse selon les possibilités réellement confirmées (aucun réseau local n'est garanti).
Réponds UNIQUEMENT en JSON valide (aucun texte autour, aucun bloc markdown) avec ce schéma STRICT :
{
  "title": "H1 accrocheur ≤ 70 caractères, mot-clé principal en début",
  "meta_title": "Meta title ≤ 60 caractères",
  "meta_description": "150-160 caractères avec CTA implicite et mot-clé principal",
  "og_title": "Titre Open Graph ≤ 60 caractères, engageant",
  "og_description": "Description Open Graph ≤ 200 caractères",
  "cover_image_alt": "Balise alt descriptive de l'image de couverture ≤ 120 caractères",
  "intro": "Paragraphe d'introduction 2-3 phrases, HTML sans balise",
  "content_html": "Corps HTML — voir règles",
  "faq": [{"question":"...","answer":"réponse 2-4 phrases"}],
  "cta_primary": "Texte du bouton principal ≤ 45 caractères",
  "cta_secondary": "Texte du bouton secondaire ≤ 45 caractères"
}

RÈGLES content_html :
- 450 à 1000 mots, sans remplissage.
- Balises autorisées uniquement : h2, h3, p, ul, ol, li, strong, em, a.
- Aucun h1 (le H1 est géré ailleurs). Aucun script/style/iframe/img.
- Structure : 4 à 6 sections H2, avec sous-sections H3 si utiles.
- Mentionne ${city.name} naturellement, sans inventer de caractéristique locale.
- 4 à 6 FAQ concrètes et générales (unité de mesure, estimation de volume, saisonnalité, contamination, préparation, déroulement d'une demande). Jamais de prix, de délai ni de disponibilité promis.

${CONTENT_RULES}
- Aucune donnée officielle inventée. Ne cite pas de règlements municipaux par numéro.
- Densité du mot-clé principal : 1-2 % (naturel).
- Inclus 2-4 liens internes contextuels vers d'autres villes/matériaux (utiliser des liens relatifs, ex : /gravier-levis).`;

    const user = `Rédige la page SEO "${humanTitle}".
Ville : ${city.name} (${city.region ?? ""}).
${material ? `Matériau : ${material.name}${material.description ? ` — ${material.description}` : ""}.` : ""}
${service ? `Service : ${service.name}${service.description ? ` — ${service.description}` : ""}.` : ""}
${usage ? `Usage ciblé : ${usage}.` : ""}
${!material && !service ? "Type de page : hub local général sur les matériaux en vrac, l'accès aux dompes et la coordination locale." : ""}
Données vérifiées (seuls faits locaux permis) :
${verifiedBlock}
Objectif : répondre utilement et exactement à la recherche, puis orienter vers le formulaire de demande de Vrac Québec.
Respecte STRICTEMENT le schéma JSON et les règles content_html du system prompt.`;

    let raw = "";
    try {
      // Honor `allow_ai` from the request; force flag also implies user intent.
      const allowAi = body?.allow_ai === true || forceRegenerate === true || preview;
      const bypassCache = shouldBypassGenerationCache({
        forceRegenerate,
        bypassCacheRequested: body?.bypass_cache === true,
      });
      const ai = await callAIChatCached({
        supabase,
        functionName: "seo-generate-page",
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        allowAi,
        // Never replay a response already known to be malformed during a retry.
        forceRefresh: preview ? true : bypassCache,
        noWrite: preview,
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

    const title = String(parsed.title || humanTitle).slice(0, 200);
    const metaTitle = String(parsed.meta_title || title).slice(0, 70);
    const metaDescription = String(parsed.meta_description || "").slice(0, 300);
    const coverImageAlt = String(parsed.cover_image_alt || `${title} — Vrac Québec`).slice(0, 160);
    const intro = String(parsed.intro || "");
    const aiContentHtml = String(parsed.content_html || "");
    const faqRaw = Array.isArray(parsed.faq) ? parsed.faq : [];
    const faq = faqRaw
      .map((f: unknown) => {
        const r = f as { question?: unknown; answer?: unknown };
        return { question: String(r?.question || "").trim(), answer: String(r?.answer || "").trim() };
      })
      .filter((f: { question: string; answer: string }) => f.question && f.answer)
      .slice(0, 10);

    // CTA obligatoire, propre au type de page (service / matériau / remblai /
    // dompe / transport / livraison / hub local). Ajouté à la source pour que
    // toute page générée respecte le gabarit SEO complet.
    const ctaBlock = buildCtaBlock({
      cityName: city.name,
      serviceSlug: service?.slug ?? null,
      serviceName: service?.name ?? null,
      materialSlug: material?.slug ?? null,
      materialName: material?.name ?? null,
    });
    const contentHtml = aiContentHtml ? `${aiContentHtml}\n${ctaBlock}` : "";

    // Compute analytics
    const words = countWords(contentHtml);
    const h2 = countTags(contentHtml, "h2");
    const h3 = countTags(contentHtml, "h3");
    const linkStats = countLinks(contentHtml);

    // Guardrail: never persist an empty / stub page. If the AI response was
    // malformed or truncated, return a retryable 502 so the pipeline requeues
    // the task instead of publishing a 0-word page that QA autofix would then
    // overwrite with a CTA-only stub.
    const claimHitsPreview = preview ? findUnverifiedClaims([intro, aiContentHtml, ...faq.map((f: { question: string; answer: string }) => `${f.question} ${f.answer}`), metaDescription].join(" ")) : [];
    if (preview) {
      return json({
        preview: true, saved: false, slug: pageSlug, existing_status: existing?.status ?? null,
        would_be_rejected: claimHitsPreview.length > 0 || countWords(aiContentHtml) < 400 || h2 < 3 || faq.length < 3,
        claims: claimHitsPreview,
        stats: { words: countWords(aiContentHtml), h2, faq: faq.length },
        title, meta_title: metaTitle, meta_description: metaDescription, intro, faq, content_html: contentHtml,
      });
    }
    if (countWords(aiContentHtml) < 400 || aiContentHtml.length < 2000 || h2 < 3 || faq.length < 3) {
      return json({
        error: "AI response incomplete (< 400 words or malformed) — task will retry",
        details: { words, contentLen: aiContentHtml.length, h2, faq: faq.length },
      }, 502);
    }

    // Affirmations non vérifiées : la page n'est pas enregistrée, rien n'est écrasé.
    const claimHits = findUnverifiedClaims([intro, aiContentHtml, ...faq.map((f: { question: string; answer: string }) => `${f.question} ${f.answer}`), metaDescription].join(" "));
    if (claimHits.length) {
      return json({ error: `Affirmations non vérifiées détectées — page non enregistrée : ${claimHits.map((h) => `${h.reason} (« ${h.excerpt} »)`).join(" ; ")}`.slice(0, 900), claims: claimHits }, 422);
    }

    const analytics = computeSeoScore({
      words, h2, h3,
      internal: linkStats.internal,
      metaTitleLen: metaTitle.length,
      metaDescLen: metaDescription.length,
      hasFaq: faq.length >= 4,
      hasIntro: intro.length > 40,
    });

    // Build internal links block
    const internalLinks = await buildInternalLinks(
      supabase, city.slug, material?.slug ?? null, service?.slug ?? null,
    );

    const payload = {
      slug: pageSlug,
      city_slug: city.slug,
      material_slug: material?.slug ?? null,
      service_slug: service?.slug ?? null,
      title,
      meta_title: metaTitle,
      meta_description: metaDescription,
      cover_image_alt: coverImageAlt,
      h1: title,
      intro,
      content_html: contentHtml,
      faq,
      internal_links: internalLinks,
      word_count: words,
      h2_count: h2,
      h3_count: h3,
      internal_link_count: linkStats.internal + internalLinks.length,
      external_link_count: linkStats.external,
      seo_score: analytics.score,
      needs_refresh: false,
      refresh_reason: null,
      last_analyzed_at: new Date().toISOString(),
      status: "draft",
      noindex: true,
      ai_model: "google/gemini-2.5-flash",
      last_generated_at: new Date().toISOString(),
      published_at: null,
    };

    let pageRow: { id: string; slug: string } | null = null;
    if (existing?.id && forceRegenerate) {
      const { data: upd, error: uErr } = await supabase
        .from("seo_pages")
        .update(payload)
        .eq("id", existing.id)
        .select("id, slug")
        .single();
      if (uErr) return json({ error: uErr.message }, 500);
      pageRow = upd;
    } else {
      const { data: ins, error: iErr } = await supabase
        .from("seo_pages")
        .insert(payload)
        .select("id, slug")
        .single();
      if (iErr) return json({ error: iErr.message }, 500);
      pageRow = ins;
    }

    // Persist analytics snapshot
    if (pageRow?.id) {
      await supabase.from("seo_page_analytics").insert({
        page_id: pageRow.id,
        score: analytics.score,
        word_count: words,
        internal_links: linkStats.internal + internalLinks.length,
        external_links: linkStats.external,
        h1_count: 1,
        h2_count: h2,
        h3_count: h3,
        meta_title_length: metaTitle.length,
        meta_description_length: metaDescription.length,
        keyword_density: 0,
        errors: analytics.errors,
        suggestions: analytics.suggestions,
      });
    }

    return json({ created: !existing?.id, updated: Boolean(existing?.id && forceRegenerate), page: pageRow, score: analytics.score });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});