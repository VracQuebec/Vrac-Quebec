/**
 * PRÉ-RENDU SEO GLOBAL — Vrac Québec
 *
 * Remplace le pilote de 10 pages (PHASE 3C) par un pré-rendu complet :
 * toutes les pages SEO publiées (non noindex) et tous les articles de blogue
 * publiés reçoivent un HTML initial complet (title, meta, canonical, H1,
 * contenu, FAQ, liens internes, CTA, données structurées) sans JavaScript.
 *
 * Fonctionnement : après `vite build`, on lit dist/index.html (le shell SPA),
 * on injecte le contenu réel dans <head> et dans <div id="root">, puis on écrit
 * dist/<chemin>/index.html. React remplace #root au montage : aucun doublon.
 *
 * Garde-fous :
 *  - aucune page n'est créée : on ne pré-rend que ce qui existe déjà en base;
 *  - une page sans contenu réel n'est PAS pré-rendue (aucun contenu inventé);
 *  - aucune donnée commerciale (prix, avis, adresse, LocalBusiness) inventée;
 *  - jamais bloquant : en cas d'erreur réseau, le build produit le SPA normal.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, resolve } from "path";

const SITE = "https://vracquebec.ca";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://kenduhxscnynugpvktin.supabase.co";
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlbmR1aHhzY255bnVncHZrdGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjI4MDQsImV4cCI6MjA4ODQzODgwNH0.9k7w4PB-pHA_CZYrTJ-wzJgnpxV4mlAZETD_Zi-LRR8";

type SeoPage = {
  id: string;
  slug: string;
  city_slug: string | null;
  material_slug: string | null;
  service_slug: string | null;
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

type BlogPost = {
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  meta_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  published_at: string | null;
  updated_at: string | null;
};

type SeoCity = { slug: string; name: string; region: string | null };
type SeoMaterial = { slug: string; name: string };

async function restPage<T>(path: string, from: number, to: number): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Range: `${from}-${to}`,
      "Range-Unit": "items",
    },
  });
  if (!res.ok && res.status !== 206) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return (await res.json()) as T[];
}

/** PostgREST plafonne les réponses : on pagine pour tout récupérer. */
async function restAll<T>(path: string, pageSize = 500): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < 200; i++) {
    const from = i * pageSize;
    const batch = await restPage<T>(path, from, from + pageSize - 1);
    out.push(...batch);
    if (batch.length < pageSize) break;
  }
  return out;
}

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Autorise uniquement le HTML éditorial simple déjà utilisé par les pages. */
function sanitize(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

const textLength = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length;

function jsonLdTag(obj: unknown) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
}

function normalizeFaq(raw: unknown): Array<{ question: string; answer: string }> {
  const list = Array.isArray(raw) ? (raw as Array<Record<string, string>>) : [];
  return list
    .map((f) => ({ question: f?.question ?? f?.q ?? "", answer: f?.answer ?? f?.a ?? "" }))
    .filter((f) => f.question && f.answer);
}

function headTags(opts: {
  url: string;
  title: string;
  description: string;
  image?: string | null;
  jsonLd: unknown[];
  type?: string;
}) {
  return [
    `<title>${esc(opts.title)}</title>`,
    `<meta name="description" content="${esc(opts.description)}" />`,
    `<link rel="canonical" href="${opts.url}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<meta property="og:title" content="${esc(opts.title)}" />`,
    `<meta property="og:description" content="${esc(opts.description)}" />`,
    `<meta property="og:type" content="${opts.type || "website"}" />`,
    `<meta property="og:url" content="${opts.url}" />`,
    opts.image ? `<meta property="og:image" content="${esc(opts.image)}" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(opts.title)}" />`,
    `<meta name="twitter:description" content="${esc(opts.description)}" />`,
    ...opts.jsonLd.map((o) => jsonLdTag(o)),
  ]
    .filter(Boolean)
    .join("\n    ");
}

function seoPageHead(page: SeoPage, city?: SeoCity, material?: SeoMaterial) {
  const url = `${SITE}/${page.slug}`;
  const title = page.meta_title || page.title;
  const description = page.meta_description || (page.intro ?? "").slice(0, 158);
  const faq = normalizeFaq(page.faq);

  const jsonLd: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      "@id": `${url}#service`,
      name: page.title,
      serviceType: material?.name || "Matériaux en vrac",
      url,
      description,
      areaServed: city
        ? { "@type": "City", name: city.name, addressRegion: "QC", addressCountry: "CA" }
        : { "@type": "AdministrativeArea", name: "Québec" },
      provider: { "@type": "Organization", name: "Vrac Québec", url: SITE, telephone: "+1-581-994-7717" },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Zones desservies", item: `${SITE}/livraison` },
        ...(city
          ? [{ "@type": "ListItem", position: 3, name: city.name, item: `${SITE}/livraison/${city.slug}` }]
          : []),
        { "@type": "ListItem", position: city ? 4 : 3, name: page.title, item: url },
      ],
    },
  ];
  // FAQPage uniquement si les questions/réponses existent réellement.
  if (faq.length) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }
  return { title, headHtml: headTags({ url, title, description, image: page.cover_image_url, jsonLd }) };
}

function seoPageBody(page: SeoPage, city?: SeoCity) {
  const h1 = page.h1 || page.title;
  const links = Array.isArray(page.internal_links) ? page.internal_links : [];
  const faq = normalizeFaq(page.faq);
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
        faq.length
          ? `<section class="container mx-auto px-4 sm:px-6 py-10">
        <h2 class="text-2xl font-display font-bold">Questions fréquentes</h2>
        ${faq
          .map(
            (f) =>
              `<details class="rounded-lg border border-border p-4 mt-3"><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`,
          )
          .join("\n        ")}
      </section>`
          : ""
      }
      <section class="container mx-auto px-4 sm:px-6 py-8 border-t border-border">
        <h2 class="text-xl font-display font-bold">Continuez à explorer</h2>
        <ul>
          ${links.map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join("")}
          ${city ? `<li><a href="/livraison/${esc(city.slug)}">Livraison à ${esc(city.name)}</a></li>` : ""}
          <li><a href="/transport-en-vrac">Transport en vrac</a></li>
          <li><a href="/materiaux">Matériaux en vrac</a></li>
          <li><a href="/remblai">Remblai et matériel de remplissage</a></li>
          <li><a href="/depot-materiaux">Dépôt et disposition de matériaux</a></li>
        </ul>
      </section>
      <section id="soumission" class="container mx-auto px-4 sm:px-6 py-10">
        <h2 class="text-2xl font-display font-bold">Faire une demande${city ? ` à ${esc(city.name)}` : ""}</h2>
        <p class="font-body">Formulaire rapide — moins d'une minute pour recevoir une soumission.
          <a href="/soumission">Remplir le formulaire de soumission</a>.</p>
      </section>
    </div>`;
}

function blogHeadBody(post: BlogPost) {
  const url = post.canonical_url || `${SITE}/blog/${post.slug}`;
  const title = post.meta_title || post.title;
  const description = post.meta_description || (post.excerpt ?? "").slice(0, 158);
  const jsonLd: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description,
      url,
      mainEntityOfPage: url,
      datePublished: post.published_at || undefined,
      dateModified: post.updated_at || post.published_at || undefined,
      image: post.cover_image_url || undefined,
      author: { "@type": "Organization", name: "Vrac Québec" },
      publisher: { "@type": "Organization", name: "Vrac Québec", url: SITE },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Blogue", item: `${SITE}/blog` },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
  ];
  const headHtml = headTags({
    url,
    title,
    description,
    image: post.cover_image_url,
    jsonLd,
    type: "article",
  });
  const body = `
    <div class="min-h-screen bg-background">
      <nav aria-label="Fil d'Ariane" class="container mx-auto px-4 sm:px-6 pt-4 text-xs text-muted-foreground font-body">
        <a href="/">Accueil</a> › <a href="/blog">Blogue</a> › <span class="text-foreground font-semibold">${esc(post.title)}</span>
      </nav>
      <header class="container mx-auto px-4 sm:px-6 pt-6 pb-6">
        <h1 class="text-3xl md:text-5xl font-display font-extrabold text-foreground leading-tight max-w-3xl">${esc(post.title)}</h1>
        ${post.excerpt ? `<p class="mt-4 text-base md:text-lg text-muted-foreground font-body max-w-2xl">${esc(post.excerpt)}</p>` : ""}
      </header>
      <article class="container mx-auto px-4 sm:px-6 pb-10 prose prose-neutral max-w-3xl">
        ${sanitize(post.content || "")}
      </article>
      <section class="container mx-auto px-4 sm:px-6 py-8 border-t border-border">
        <h2 class="text-xl font-display font-bold">Aller plus loin</h2>
        <ul>
          <li><a href="/blog">Tous les articles</a></li>
          <li><a href="/transport-en-vrac">Transport en vrac</a></li>
          <li><a href="/materiaux">Matériaux en vrac</a></li>
          <li><a href="/soumission">Obtenir une soumission gratuite</a></li>
        </ul>
      </section>
    </div>`;
  return { title, headHtml, body };
}

function inject(shell: string, title: string, headHtml: string, body: string) {
  let html = shell;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, "");
  html = html.replace(/<meta[^>]+name="description"[^>]*>/gi, "");
  html = html.replace(/<meta[^>]+property="og:title"[^>]*>/gi, "");
  html = html.replace(/<meta[^>]+name="twitter:title"[^>]*>/gi, "");
  html = html.replace(/<meta[^>]+property="og:description"[^>]*>/gi, "");
  html = html.replace(/<meta[^>]+name="twitter:description"[^>]*>/gi, "");
  html = html.replace(/<meta[^>]+property="og:type"[^>]*>/gi, "");
  html = html.replace("</head>", `  ${headHtml}\n  </head>`);
  html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  return html;
}

function write(distDir: string, routePath: string, html: string) {
  const nested = resolve(distDir, routePath, "index.html");
  mkdirSync(dirname(nested), { recursive: true });
  writeFileSync(nested, html);
  // Variante plate pour les hébergements qui résolvent /slug -> /slug.html
  if (!routePath.includes("/")) writeFileSync(resolve(distDir, `${routePath}.html`), html);
}

export async function prerenderSeo(distDir: string) {
  const shellPath = resolve(distDir, "index.html");
  if (!existsSync(shellPath)) throw new Error(`dist/index.html introuvable (${shellPath})`);
  const shell = readFileSync(shellPath, "utf8");

  const [pages, posts, cities, materials] = await Promise.all([
    restAll<SeoPage>(
      "seo_pages?select=id,slug,city_slug,material_slug,service_slug,title,meta_title,meta_description,h1,intro,content_html,faq,cover_image_url,cover_image_alt,internal_links&status=eq.published&noindex=eq.false&order=slug",
    ),
    restAll<BlogPost>(
      "blog_posts?select=slug,title,excerpt,content,meta_title,meta_description,canonical_url,cover_image_url,cover_image_alt,published_at,updated_at&status=eq.published&noindex=eq.false&order=slug",
    ),
    restAll<SeoCity>("seo_cities?select=slug,name,region"),
    restAll<SeoMaterial>("seo_materials?select=slug,name"),
  ]);

  const cityMap = new Map(cities.map((c) => [c.slug, c]));
  const materialMap = new Map(materials.map((m) => [m.slug, m]));

  const written: string[] = [];
  const skipped: string[] = [];

  for (const page of pages) {
    // Aucun contenu réel -> pas de pré-rendu (on n'invente rien, le SPA prend le relais).
    if (textLength(page.content_html || "") < 300) {
      skipped.push(page.slug);
      continue;
    }
    const city = page.city_slug ? cityMap.get(page.city_slug) : undefined;
    const material = page.material_slug ? materialMap.get(page.material_slug) : undefined;
    const { title, headHtml } = seoPageHead(page, city, material);
    write(distDir, page.slug, inject(shell, title, headHtml, seoPageBody(page, city)));
    written.push(page.slug);
  }

  for (const post of posts) {
    if (textLength(post.content || "") < 300) {
      skipped.push(`blog/${post.slug}`);
      continue;
    }
    const { title, headHtml, body } = blogHeadBody(post);
    write(distDir, `blog/${post.slug}`, inject(shell, title, headHtml, body));
    written.push(`blog/${post.slug}`);
  }

  return { written, skipped };
}

// Exécution directe : bunx tsx scripts/prerender-seo.ts [distDir]
if (process.argv[1] && process.argv[1].includes("prerender-seo")) {
  const dist = resolve(process.argv[2] || "dist");
  prerenderSeo(dist)
    .then((r) => console.log(`[prerender] ${r.written.length} pages écrites, ${r.skipped.length} ignorées`))
    .catch((e) => console.warn("[prerender] ignoré :", e?.message || e));
}
