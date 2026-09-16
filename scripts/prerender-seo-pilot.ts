/**
 * PHASE 3C — Pré-rendu pilote (10 pages SEO seulement).
 *
 * Objectif : le HTML initial servi par l'hébergement statique contient déjà
 * le title, la meta description, le canonical, le H1, le contenu principal,
 * les liens internes, la FAQ et le CTA de la page — sans JavaScript.
 *
 * Fonctionnement : après `vite build`, on lit dist/index.html (le shell SPA
 * avec ses scripts hashés), on injecte le contenu réel de la page dans <head>
 * et dans <div id="root">, puis on écrit dist/<slug>.html et
 * dist/<slug>/index.html. React remplace le contenu de #root au montage :
 * aucun doublon, aucun texte caché, même contenu qu'aujourd'hui.
 *
 * AUCUNE autre page n'est touchée : la liste PILOT_SLUGS est volontairement
 * limitée à 10 slugs.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, resolve } from "path";

const SITE = "https://vracquebec.ca";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://kenduhxscnynugpvktin.supabase.co";
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlbmR1aHhzY255bnVncHZrdGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjI4MDQsImV4cCI6MjA4ODQzODgwNH0.9k7w4PB-pHA_CZYrTJ-wzJgnpxV4mlAZETD_Zi-LRR8";

export const PILOT_SLUGS = [
  // Pages locales (hub ville)
  "saint-raymond",
  "quebec",
  // Pages matériau
  "pierre-concassee-levis",
  "gravier-0-3-4-loretteville",
  // Pages livraison
  "livraison-pierre-saint-apollinaire",
  "livraison-terre-pintendre",
  // Pages transport
  "transport-vrac-saint-apollinaire",
  "transport-vrac-quebec",
  // Pages service
  "excavation-quebec",
  "nivellement-saint-jean-chrysostome",
];

type SeoPage = {
  id: string;
  slug: string;
  city_slug: string | null;
  material_slug: string | null;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  h1: string | null;
  intro: string | null;
  content_html: string | null;
  faq: Array<{ question: string; answer: string }> | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  internal_links: Array<{ label: string; href: string }> | null;
};

type SeoCity = { slug: string; name: string; region: string | null };
type SeoMaterial = { slug: string; name: string };

async function rest<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return (await res.json()) as T[];
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Autorise uniquement le HTML éditorial simple déjà utilisé par les pages. */
function sanitize(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function jsonLdTag(obj: unknown) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
}

function buildHead(page: SeoPage, city: SeoCity | undefined, material: SeoMaterial | undefined) {
  const url = `${SITE}/${page.slug}`;
  const title = page.meta_title || page.title;
  const description = page.meta_description || (page.intro ?? "").slice(0, 158);

  const service = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${url}#service`,
    name: page.title,
    serviceType: material?.name || "Matériaux en vrac",
    url,
    description,
    areaServed: city
      ? { "@type": "City", name: city.name, addressRegion: "QC", addressCountry: "CA" }
      : { "@type": "AdministrativeArea", name: "Région de Québec" },
    provider: { "@type": "Organization", name: "Vrac Québec", url: SITE, telephone: "+1-581-994-7717" },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Zones desservies", item: `${SITE}/livraison` },
      ...(city ? [{ "@type": "ListItem", position: 3, name: city.name, item: `${SITE}/livraison/${city.slug}` }] : []),
      { "@type": "ListItem", position: city ? 4 : 3, name: page.title, item: url },
    ],
  };
  const faq = page.faq?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: page.faq.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      }
    : null;

  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${url}" />`,
    page.cover_image_url ? `<meta property="og:image" content="${esc(page.cover_image_url)}" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    jsonLdTag(service),
    jsonLdTag(breadcrumb),
    faq ? jsonLdTag(faq) : "",
  ].filter(Boolean);

  return { title, description, headHtml: tags.join("\n    ") };
}

function buildBody(page: SeoPage, city: SeoCity | undefined) {
  const h1 = page.h1 || page.title;
  const links = Array.isArray(page.internal_links) ? page.internal_links : [];
  return `
    <div class="min-h-screen bg-background">
      <nav aria-label="Fil d'Ariane" class="container mx-auto px-4 sm:px-6 pt-4 text-xs text-muted-foreground font-body">
        <a href="/">Accueil</a> › <a href="/livraison">Zones desservies</a>${
          city ? ` › <a href="/livraison/${city.slug}">${esc(city.name)}</a>` : ""
        } › <span class="text-foreground font-semibold">${esc(page.title)}</span>
      </nav>
      <header class="container mx-auto px-4 sm:px-6 pt-6 pb-8">
        ${city ? `<p class="text-xs font-semibold text-primary">${esc(city.name)}${city.region ? ` · ${esc(city.region)}` : ""}</p>` : ""}
        <h1 class="text-3xl md:text-5xl font-display font-extrabold text-foreground leading-tight max-w-3xl">${esc(h1)}</h1>
        ${page.intro ? `<p class="mt-4 text-base md:text-lg text-muted-foreground font-body max-w-2xl">${esc(page.intro)}</p>` : ""}
        <p class="mt-6 flex flex-wrap gap-3">
          <a href="#soumission" class="inline-flex px-6 py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold">Obtenir une soumission gratuite</a>
          <a href="tel:+15819947717" class="inline-flex px-6 py-3 rounded-lg border border-border font-display font-bold">581-994-7717</a>
        </p>
      </header>
      <article class="container mx-auto px-4 sm:px-6 pb-10 prose prose-neutral max-w-3xl">
        ${sanitize(page.content_html || "")}
      </article>
      ${
        page.faq?.length
          ? `<section class="container mx-auto px-4 sm:px-6 py-10">
        <h2 class="text-2xl font-display font-bold">Questions fréquentes</h2>
        ${page.faq
          .map(
            (f) =>
              `<details class="rounded-lg border border-border p-4 mt-3"><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`,
          )
          .join("\n        ")}
      </section>`
          : ""
      }
      ${
        links.length
          ? `<section class="container mx-auto px-4 sm:px-6 py-8 border-t border-border">
        <h2 class="text-xl font-display font-bold">Continuez à explorer</h2>
        <ul>${links.map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join("")}</ul>
      </section>`
          : ""
      }
      <section id="soumission" class="container mx-auto px-4 sm:px-6 py-10">
        <h2 class="text-2xl font-display font-bold">Faire une demande${city ? ` à ${esc(city.name)}` : ""}</h2>
        <p class="font-body">Formulaire rapide — moins d'une minute pour recevoir une soumission.
          <a href="/soumission">Remplir le formulaire de soumission</a>.</p>
      </section>
    </div>`;
}

function renderPage(shell: string, page: SeoPage, city?: SeoCity, material?: SeoMaterial) {
  const { title, headHtml } = buildHead(page, city, material);
  let html = shell;

  // Remplace le <title> et la meta description génériques du shell.
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta[^>]+name="description"[^>]*>/i, "");
  html = html.replace(/<meta[^>]+property="og:title"[^>]*>/gi, "");
  html = html.replace(/<meta[^>]+name="twitter:title"[^>]*>/gi, "");
  html = html.replace(/<meta[^>]+property="og:description"[^>]*>/gi, "");
  html = html.replace(/<meta[^>]+name="twitter:description"[^>]*>/gi, "");
  html = html.replace("</head>", `  ${headHtml}\n  </head>`);
  html = html.replace('<div id="root"></div>', `<div id="root">${buildBody(page, city)}</div>`);
  return html;
}

export async function prerenderPilot(distDir: string) {
  const shellPath = resolve(distDir, "index.html");
  if (!existsSync(shellPath)) throw new Error(`dist/index.html introuvable (${shellPath})`);
  const shell = readFileSync(shellPath, "utf8");

  const inList = `(${PILOT_SLUGS.map((s) => `"${s}"`).join(",")})`;
  const pages = await rest<SeoPage>(
    `seo_pages?select=id,slug,city_slug,material_slug,title,meta_title,meta_description,h1,intro,content_html,faq,cover_image_url,cover_image_alt,internal_links&status=eq.published&slug=in.${inList}`,
  );
  const cities = await rest<SeoCity>("seo_cities?select=slug,name,region");
  const materials = await rest<SeoMaterial>("seo_materials?select=slug,name");
  const cityMap = new Map(cities.map((c) => [c.slug, c]));
  const materialMap = new Map(materials.map((m) => [m.slug, m]));

  const written: string[] = [];
  for (const page of pages) {
    const html = renderPage(
      shell,
      page,
      page.city_slug ? cityMap.get(page.city_slug) : undefined,
      page.material_slug ? materialMap.get(page.material_slug) : undefined,
    );
    const flat = resolve(distDir, `${page.slug}.html`);
    const nested = resolve(distDir, page.slug, "index.html");
    mkdirSync(dirname(nested), { recursive: true });
    writeFileSync(flat, html);
    writeFileSync(nested, html);
    written.push(page.slug);
  }
  return written;
}

// Exécution directe : bunx tsx scripts/prerender-seo-pilot.ts [distDir]
if (process.argv[1] && process.argv[1].includes("prerender-seo-pilot")) {
  const dist = resolve(process.argv[2] || "dist");
  prerenderPilot(dist)
    .then((slugs) => console.log(`[prerender-pilot] ${slugs.length} pages écrites : ${slugs.join(", ")}`))
    .catch((e) => {
      console.warn("[prerender-pilot] ignoré :", e?.message || e);
    });
}
