// Dynamic XML sitemap — always reflects the current published pages in the DB.
// Public; no auth required. Cached at the edge for 5 minutes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE = "https://vracquebec.ca";

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const urls: Array<{ loc: string; lastmod?: string; priority?: string; changefreq?: string }> = [
    { loc: `${BASE}/`, priority: "1.0", changefreq: "daily" },
    { loc: `${BASE}/blog`, priority: "0.9", changefreq: "daily" },
    { loc: `${BASE}/livraison`, priority: "0.8", changefreq: "weekly" },
  ];

  // PostgREST plafonne chaque réponse à 1 000 lignes : on pagine pour tout couvrir.
  async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; from < 200000; from += 1000) {
      const { data, error } = await build(from, from + 999);
      if (error) throw error;
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }
  const seen = new Set<string>();

  const pages = await all((f, t) => supabase
    .from("seo_pages")
    .select("slug, updated_at, last_generated_at")
    .eq("status", "published")
    .eq("noindex", false)
    .order("slug")
    .range(f, t));
  for (const p of pages) {
    if (seen.has((p as { slug: string }).slug)) continue;
    seen.add((p as { slug: string }).slug);
    const ts = String((p as { updated_at?: string | null }).updated_at ?? (p as { last_generated_at?: string | null }).last_generated_at ?? "");
    urls.push({
      loc: `${BASE}/${(p as { slug: string }).slug}`,
      lastmod: ts ? ts.slice(0, 10) : undefined,
      priority: "0.7",
      changefreq: "weekly",
    });
  }

  const posts = await all((f, t) => supabase
    .from("blog_posts")
    .select("slug, updated_at, published_at")
    .eq("status", "published")
    .eq("noindex", false)
    .lte("published_at", new Date().toISOString())
    .order("slug")
    .range(f, t));
  for (const p of posts) {
    const ts = String((p as { updated_at?: string | null }).updated_at ?? (p as { published_at?: string | null }).published_at ?? "");
    urls.push({
      loc: `${BASE}/blog/${(p as { slug: string }).slug}`,
      lastmod: ts ? ts.slice(0, 10) : undefined,
      priority: "0.6",
      changefreq: "monthly",
    });
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    urls.map((u) => `  <url>\n    <loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}${u.changefreq ? `\n    <changefreq>${u.changefreq}</changefreq>` : ""}${u.priority ? `\n    <priority>${u.priority}</priority>` : ""}\n  </url>`).join("\n")
  }\n</urlset>\n`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Sitemap-Count": String(urls.length),
      "Access-Control-Allow-Origin": "*",
    },
  });
});