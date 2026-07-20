// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.
// Fetches published blog posts and categories from Supabase to include them.

import { writeFileSync } from "fs";
import { resolve } from "path";
import { CITIES as STATIC_CITIES } from "../src/lib/seo/cities";
import { MATERIALS as STATIC_MATERIALS } from "../src/lib/seo/materials";

const BASE_URL = "https://vracquebec.ca";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://kenduhxscnynugpvktin.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlbmR1aHhzY255bnVncHZrdGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjI4MDQsImV4cCI6MjA4ODQzODgwNH0.9k7w4PB-pHA_CZYrTJ-wzJgnpxV4mlAZETD_Zi-LRR8";

type Entry = {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
};

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function build(): Promise<Entry[]> {
  const entries: Entry[] = [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/blog", changefreq: "daily", priority: "0.9" },
    { path: "/blog/outils", changefreq: "monthly", priority: "0.8" },
    { path: "/blog/outils/tonnage", changefreq: "monthly", priority: "0.7" },
    { path: "/blog/outils/verges-cubes", changefreq: "monthly", priority: "0.7" },
    { path: "/blog/outils/volume", changefreq: "monthly", priority: "0.7" },
    { path: "/blog/outils/voyages-camion", changefreq: "monthly", priority: "0.7" },
    { path: "/blog/outils/cout-transport", changefreq: "monthly", priority: "0.7" },
    { path: "/blog/guides", changefreq: "weekly", priority: "0.8" },
    { path: "/blog/faq", changefreq: "weekly", priority: "0.8" },
    { path: "/livraison", changefreq: "weekly", priority: "0.8" },
  ];

  // Load active cities & materials from DB, with static fallback.
  let cities: { slug: string }[] = STATIC_CITIES;
  let materials: { slug: string }[] = STATIC_MATERIALS;
  try {
    const [dbCities, dbMaterials] = await Promise.all([
      fetchJson(`${SUPABASE_URL}/rest/v1/seo_cities?select=slug&active=eq.true&order=sort_order`),
      fetchJson(`${SUPABASE_URL}/rest/v1/seo_materials?select=slug&active=eq.true&order=sort_order`),
    ]);
    if (Array.isArray(dbCities) && dbCities.length) cities = dbCities;
    if (Array.isArray(dbMaterials) && dbMaterials.length) materials = dbMaterials;
  } catch (e) {
    console.warn("sitemap: could not fetch SEO cities/materials from DB, using static fallback:", e);
  }

  for (const c of cities) {
    entries.push({ path: `/livraison/${c.slug}`, changefreq: "monthly", priority: "0.7" });
  }
  for (const m of materials) {
    for (const c of cities) {
      entries.push({ path: `/${m.slug}-${c.slug}`, changefreq: "monthly", priority: "0.7" });
    }
  }

  // Material-usage pages
  try {
    const uses = (await fetchJson(
      `${SUPABASE_URL}/rest/v1/seo_material_uses?select=slug&active=eq.true&order=sort_order`
    )) as { slug: string }[];
    for (const u of uses) {
      entries.push({ path: `/${u.slug}`, changefreq: "monthly", priority: "0.7" });
    }
  } catch (e) {
    console.warn("sitemap: could not fetch material uses:", e);
  }

  // Generated SEO pages (SEO Manager)
  try {
    const pages = (await fetchJson(
      `${SUPABASE_URL}/rest/v1/seo_pages?select=slug,updated_at&status=eq.published&order=updated_at.desc&limit=5000`
    )) as { slug: string; updated_at: string }[];
    for (const p of pages) {
      entries.push({
        path: `/${p.slug}`,
        lastmod: (p.updated_at || new Date().toISOString()).slice(0, 10),
        changefreq: "monthly",
        priority: "0.7",
      });
    }
  } catch (e) {
    console.warn("sitemap: could not fetch seo_pages:", e);
  }

  try {
    const cats = (await fetchJson(
      `${SUPABASE_URL}/rest/v1/blog_categories?select=slug&order=sort_order`
    )) as { slug: string }[];
    for (const c of cats) {
      entries.push({ path: `/blog/categorie/${c.slug}`, changefreq: "weekly", priority: "0.7" });
    }
  } catch (e) {
    console.warn("sitemap: could not fetch categories:", e);
  }

  try {
    const nowIso = new Date().toISOString();
    const posts = (await fetchJson(
      `${SUPABASE_URL}/rest/v1/blog_posts?select=slug,updated_at,published_at&status=eq.published&published_at=lte.${nowIso}&noindex=eq.false&order=published_at.desc&limit=5000`
    )) as { slug: string; updated_at: string; published_at: string }[];
    for (const p of posts) {
      entries.push({
        path: `/blog/${p.slug}`,
        lastmod: (p.updated_at || p.published_at || nowIso).slice(0, 10),
        changefreq: "monthly",
        priority: "0.8",
      });
    }
  } catch (e) {
    console.warn("sitemap: could not fetch posts:", e);
  }

  return entries;
}

function render(entries: Entry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

(async () => {
  const entries = await build();
  writeFileSync(resolve("public/sitemap.xml"), render(entries));
  console.log(`sitemap.xml written (${entries.length} entries)`);
})();