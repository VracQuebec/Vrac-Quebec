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
  related_city_slugs: string[] | null;
  related_material_slugs: string[] | null;
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
      provider: { "@type": "Organization", name: "Vrac Québec", url: SITE, telephone: "+1-819-592-3495" },
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
          <a href="tel:+18195923495" class="inline-flex px-6 py-3 rounded-lg border border-border font-display font-bold">819-592-3495</a>
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

function blogHeadBody(
  post: BlogPost,
  cityMap?: ReadonlyMap<string, { slug: string; name: string }>,
  materialMap?: ReadonlyMap<string, { slug: string; name: string }>,
) {
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
          ${(post.related_city_slugs ?? [])
            .slice(0, 4)
            .map((s) => cityMap?.get(s))
            .filter(Boolean)
            .map((c) => `<li><a href="/livraison/${esc(c!.slug)}">Livraison à ${esc(c!.name)}</a></li>`)
            .join("")}
          ${(post.related_material_slugs ?? [])
            .slice(0, 4)
            .map((s) => materialMap?.get(s))
            .filter(Boolean)
            .map((m) => `<li><a href="/materiaux/${esc(m!.slug)}">${esc(m!.name)} en vrac</a></li>`)
            .join("")}
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

/* ------------------------------------------------------------------ *
 * Pages publiques rendues par React (piliers, zones, fiches matériaux)
 * Elles posaient leurs balises via Helmet, donc côté client uniquement :
 * on écrit ici leur HTML initial (title, meta, canonical, H1, contenu,
 * liens internes, CTA) à partir des mêmes textes et des mêmes données.
 * ------------------------------------------------------------------ */

type StaticRoute = {
  path: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  links: Array<{ label: string; href: string }>;
};

const STATIC_ROUTES: StaticRoute[] = [
  {
    path: "",
    title: "Vrac Québec — matériaux en vrac, dompes et transport",
    description:
      "Plateforme de référence pour le vrac au Québec : matériaux, sites de dépôt (dompes), remblai et transport en vrac pour l'excavation et la construction.",
    h1: "Matériaux en vrac, dompes et transport au Québec",
    intro:
      "Vrac Québec met en relation les chantiers avec les matériaux en vrac, les sites de dépôt et le transport dont ils ont besoin dans la région de Québec, à Lévis et dans les environs.",
    links: [
      { label: "Matériaux en vrac", href: "/materiaux" },
      { label: "Transport en vrac", href: "/transport-en-vrac" },
      { label: "Trouver une dompe", href: "/depot-materiaux" },
      { label: "Remblai et matériel de remplissage", href: "/remblai" },
      { label: "Villes desservies", href: "/livraison" },
      { label: "Blogue", href: "/blog" },
    ],
  },
  {
    path: "materiaux",
    title: "Matériaux en vrac — catalogue | Vrac Québec",
    description:
      "Terre, sable, gravier, pierre concassée et remblai : le catalogue des matériaux en vrac coordonnés par Vrac Québec pour les chantiers du Québec.",
    h1: "Catalogue des matériaux en vrac",
    intro:
      "Consultez les matériaux en vrac disponibles, leurs usages courants et faites votre demande pour la livraison ou la disposition sur votre chantier.",
    links: [
      { label: "Transport en vrac", href: "/transport-en-vrac" },
      { label: "Acheter des matériaux", href: "/acheter-materiaux" },
      { label: "Villes desservies", href: "/livraison" },
    ],
  },
  {
    path: "transport-en-vrac",
    title: "Transport en vrac au Québec : comment ça fonctionne | Vrac Québec",
    description:
      "Transport de matériaux en vrac dans la région de Québec et de Lévis : fonctionnement de la plateforme, types de camions, matériaux et villes couvertes. Faites votre demande.",
    h1: "Transport en vrac au Québec",
    intro:
      "Vrac Québec coordonne le transport de matériaux en vrac : vous décrivez le besoin, la plateforme détermine le camion, le nombre de voyages et le trajet.",
    links: [
      { label: "Types de camions", href: "/types-de-camions" },
      { label: "Matériaux en vrac", href: "/materiaux" },
      { label: "Livraison par ville", href: "/livraison" },
      { label: "Faire une demande de transport", href: "/soumission" },
    ],
  },
  {
    path: "livraison",
    title: "Livraison de matériaux en vrac — Québec, Lévis et environs | Vrac Québec",
    description:
      "Livraison de terre, sable, gravier et pierre concassée dans la région de Québec, à Lévis et dans les municipalités environnantes. Choisissez votre ville.",
    h1: "Livraison de matériaux en vrac par ville",
    intro:
      "Sélectionnez votre municipalité pour voir les matériaux et les pages disponibles dans votre secteur.",
    links: [
      { label: "Matériaux en vrac", href: "/materiaux" },
      { label: "Transport en vrac", href: "/transport-en-vrac" },
      { label: "Trouver une dompe", href: "/depot-materiaux" },
    ],
  },
  {
    path: "remblai",
    title: "Remblai à Québec — terre et sable de chantier | Vrac Québec",
    description:
      "Besoin de remblai pour remplir un terrain à Québec et les environs ? Terre, sable et matériaux de surplus de chantier, livraison coordonnée par Vrac Québec.",
    h1: "Remblai et matériel de remplissage",
    intro:
      "Vrac Québec repère la terre, le sable et les surplus d'excavation disponibles près de votre terrain et coordonne leur transport.",
    links: [
      { label: "Matériaux en vrac", href: "/materiaux" },
      { label: "Trouver une dompe", href: "/depot-materiaux" },
      { label: "Transport en vrac", href: "/transport-en-vrac" },
    ],
  },
  {
    path: "depot-materiaux",
    title: "Trouver une dompe à Québec — site de dépôt | Vrac Québec",
    description:
      "Sortir de la terre ou des matériaux de chantier ? Vrac Québec trouve une dompe ou un site de dépôt compatible près de votre chantier à Québec et en région.",
    h1: "Trouver une dompe ou un site de dépôt",
    intro:
      "Décrivez votre matériau et votre secteur : la plateforme cherche un site receveur compatible avec votre chantier et votre camion.",
    links: [
      { label: "Remblai et matériel de remplissage", href: "/remblai" },
      { label: "Transport en vrac", href: "/transport-en-vrac" },
      { label: "Villes desservies", href: "/livraison" },
    ],
  },
  {
    path: "acheter-materiaux",
    title: "Acheter des matériaux en vrac | Vrac Québec",
    description:
      "Achat de terre, sable, gravier et pierre concassée en vrac avec livraison coordonnée sur votre chantier dans la région de Québec.",
    h1: "Acheter des matériaux en vrac",
    intro:
      "Indiquez le matériau, la quantité et le lieu de livraison : Vrac Québec coordonne l'approvisionnement et le transport.",
    links: [
      { label: "Catalogue des matériaux", href: "/materiaux" },
      { label: "Calculateur de quantités", href: "/calculateur" },
      { label: "Transport en vrac", href: "/transport-en-vrac" },
    ],
  },
  {
    path: "types-de-camions",
    title: "Types de camions pour le transport en vrac | Vrac Québec",
    description:
      "Dix roues, douze roues, semi-remorque : les types de camions utilisés pour le transport de matériaux en vrac et leurs usages sur les chantiers du Québec.",
    h1: "Types de camions pour le vrac",
    intro:
      "Comprenez quel type de camion correspond à votre chantier, à votre matériau et à votre accès.",
    links: [
      { label: "Transport en vrac", href: "/transport-en-vrac" },
      { label: "Calculateur de quantités", href: "/calculateur" },
      { label: "Matériaux en vrac", href: "/materiaux" },
    ],
  },
];

function ctaBlock(citySuffix = "") {
  return `
      <p class="mt-6 flex flex-wrap gap-3">
        <a href="/soumission" class="inline-flex px-6 py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold">Obtenir une soumission gratuite${citySuffix}</a>
        <a href="tel:+18195923495" class="inline-flex px-6 py-3 rounded-lg border border-border font-display font-bold">819-592-3495</a>
      </p>`;
}

function linksList(links: Array<{ label: string; href: string }>) {
  return `<ul>${links.map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join("")}</ul>`;
}

function staticRouteHtml(shell: string, route: StaticRoute) {
  const url = `${SITE}/${route.path}`.replace(/\/$/, "/");
  const jsonLd: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` },
        ...(route.path
          ? [{ "@type": "ListItem", position: 2, name: route.h1, item: url }]
          : []),
      ],
    },
  ];
  const headHtml = headTags({ url, title: route.title, description: route.description, jsonLd });
  const body = `
    <div class="min-h-screen bg-background">
      <header class="container mx-auto px-4 sm:px-6 pt-8 pb-6">
        <h1 class="text-3xl md:text-5xl font-display font-extrabold text-foreground leading-tight max-w-3xl">${esc(route.h1)}</h1>
        <p class="mt-4 text-base md:text-lg text-muted-foreground font-body max-w-2xl">${esc(route.intro)}</p>
        ${ctaBlock()}
      </header>
      <section class="container mx-auto px-4 sm:px-6 py-8 border-t border-border">
        <h2 class="text-xl font-display font-bold">Continuez à explorer</h2>
        ${linksList(route.links)}
      </section>
    </div>`;
  return inject(shell, route.title, headHtml, body);
}

type ZoneCity = SeoCity & { intro: string | null; active: boolean };

function zoneCityHtml(
  shell: string,
  city: ZoneCity,
  materials: SeoMaterial[],
  cityPages: SeoPage[],
) {
  const url = `${SITE}/livraison/${city.slug}`;
  const title = `Livraison de matériaux en vrac à ${city.name} | Vrac Québec`;
  const description = (
    city.intro?.trim()
      ? city.intro.trim()
      : `Terre, sable, gravier et pierre concassée livrés à ${city.name}${city.region ? ` (${city.region})` : ""}. Vrac Québec coordonne la livraison et la disposition de matériaux pour vos chantiers.`
  ).slice(0, 158);
  const jsonLd: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Zones desservies", item: `${SITE}/livraison` },
        { "@type": "ListItem", position: 3, name: city.name, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: `Livraison de matériaux en vrac à ${city.name}`,
      serviceType: "Livraison de terre, gravier, pierre concassée et remblai",
      areaServed: { "@type": "City", name: city.name, addressRegion: "QC", addressCountry: "CA" },
      provider: { "@type": "Organization", name: "Vrac Québec", url: SITE },
      url,
    },
  ];
  const headHtml = headTags({ url, title, description, jsonLd });
  const body = `
    <div class="min-h-screen bg-background">
      <nav aria-label="Fil d'Ariane" class="container mx-auto px-4 sm:px-6 pt-4 text-xs text-muted-foreground font-body">
        <a href="/">Accueil</a> › <a href="/livraison">Zones desservies</a> › <span class="text-foreground font-semibold">${esc(city.name)}</span>
      </nav>
      <header class="container mx-auto px-4 sm:px-6 pt-6 pb-6">
        ${city.region ? `<p class="text-xs font-semibold text-primary">${esc(city.region)}</p>` : ""}
        <h1 class="text-3xl md:text-5xl font-display font-extrabold text-foreground leading-tight max-w-3xl">Livraison de matériaux en vrac à ${esc(city.name)}</h1>
        <p class="mt-4 text-base md:text-lg text-muted-foreground font-body max-w-2xl">${esc(description)}</p>
        ${ctaBlock(` à ${city.name}`)}
      </header>
      ${
        cityPages.length
          ? `<section class="container mx-auto px-4 sm:px-6 py-8 border-t border-border">
        <h2 class="text-xl font-display font-bold">Pages disponibles à ${esc(city.name)}</h2>
        ${linksList(cityPages.slice(0, 24).map((p) => ({ label: p.title, href: `/${p.slug}` })))}
      </section>`
          : ""
      }
      <section class="container mx-auto px-4 sm:px-6 py-8 border-t border-border">
        <h2 class="text-xl font-display font-bold">Matériaux en vrac</h2>
        ${linksList(materials.slice(0, 16).map((m) => ({ label: m.name, href: `/materiaux/${m.slug}` })))}
      </section>
      <section class="container mx-auto px-4 sm:px-6 py-8 border-t border-border">
        <h2 class="text-xl font-display font-bold">Autres services</h2>
        ${linksList([
          { label: "Transport en vrac", href: "/transport-en-vrac" },
          { label: "Trouver une dompe", href: "/depot-materiaux" },
          { label: "Remblai et matériel de remplissage", href: "/remblai" },
          { label: "Toutes les villes desservies", href: "/livraison" },
        ])}
      </section>
    </div>`;
  return inject(shell, title, headHtml, body);
}

type PublicMaterial = {
  slug: string;
  name: string;
  public_description: string | null;
  seo_text: string | null;
  seo_title: string | null;
  seo_description: string | null;
  cover_image_url: string | null;
};

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function materialHtml(shell: string, m: PublicMaterial) {
  const url = `${SITE}/materiaux/${m.slug}`;
  const title = m.seo_title || `${m.name} en vrac — livraison au Québec | Vrac Québec`;
  const description =
    m.seo_description || m.public_description || `${m.name} livré en vrac dans la région de Québec.`;
  const jsonLd: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Matériaux", item: `${SITE}/materiaux` },
        { "@type": "ListItem", position: 3, name: m.name, item: url },
      ],
    },
  ];
  const headHtml = headTags({ url, title, description, image: m.cover_image_url, jsonLd });
  const body = `
    <div class="min-h-screen bg-background">
      <nav aria-label="Fil d'Ariane" class="container mx-auto px-4 sm:px-6 pt-4 text-xs text-muted-foreground font-body">
        <a href="/">Accueil</a> › <a href="/materiaux">Matériaux</a> › <span class="text-foreground font-semibold">${esc(m.name)}</span>
      </nav>
      <header class="container mx-auto px-4 sm:px-6 pt-6 pb-6">
        <h1 class="text-3xl md:text-5xl font-display font-extrabold text-foreground leading-tight max-w-3xl">${esc(m.name)}</h1>
        ${m.public_description ? `<p class="mt-4 text-base md:text-lg text-muted-foreground font-body max-w-2xl">${esc(m.public_description)}</p>` : ""}
        ${ctaBlock()}
      </header>
      ${m.seo_text ? `<article class="container mx-auto px-4 sm:px-6 pb-8 prose prose-neutral max-w-3xl">${sanitize(m.seo_text)}</article>` : ""}
      <section class="container mx-auto px-4 sm:px-6 py-8 border-t border-border">
        <h2 class="text-xl font-display font-bold">Continuez à explorer</h2>
        ${linksList([
          { label: "Tous les matériaux en vrac", href: "/materiaux" },
          { label: "Transport en vrac", href: "/transport-en-vrac" },
          { label: "Livraison par ville", href: "/livraison" },
          { label: "Obtenir une soumission", href: "/soumission" },
        ])}
      </section>
    </div>`;
  return inject(shell, title, headHtml, body);
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
      "blog_posts?select=slug,title,excerpt,content,meta_title,meta_description,canonical_url,cover_image_url,cover_image_alt,published_at,updated_at,related_city_slugs,related_material_slugs&status=eq.published&noindex=eq.false&order=slug",
    ),
    restAll<ZoneCity>("seo_cities?select=slug,name,region,intro,active&active=eq.true&order=slug"),
    restAll<SeoMaterial>("seo_materials?select=slug,name&active=eq.true&order=sort_order"),
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
    const { title, headHtml, body } = blogHeadBody(post, cityMap, materialMap);
    write(distDir, `blog/${post.slug}`, inject(shell, title, headHtml, body));
    written.push(`blog/${post.slug}`);
  }

  // --- Pages publiques React : piliers, zones par ville, fiches matériaux ---
  for (const route of STATIC_ROUTES) {
    const html = staticRouteHtml(shell, route);
    if (route.path === "") writeFileSync(resolve(distDir, "index.html"), html);
    else write(distDir, route.path, html);
    written.push(`/${route.path}`);
  }

  const pagesByCity = new Map<string, SeoPage[]>();
  for (const p of pages) {
    if (!p.city_slug) continue;
    const list = pagesByCity.get(p.city_slug) ?? [];
    list.push(p);
    pagesByCity.set(p.city_slug, list);
  }
  for (const city of cities) {
    write(
      distDir,
      `livraison/${city.slug}`,
      zoneCityHtml(shell, city, materials, pagesByCity.get(city.slug) ?? []),
    );
    written.push(`livraison/${city.slug}`);
  }

  const catalog = (await rpc<PublicMaterial[]>("jsc_public_catalog", {})) ?? [];
  for (const entry of catalog) {
    if (!entry?.slug) continue;
    const full = (await rpc<PublicMaterial>("jsc_public_material", { _slug: entry.slug })) ?? entry;
    write(distDir, `materiaux/${entry.slug}`, materialHtml(shell, full));
    written.push(`materiaux/${entry.slug}`);
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
