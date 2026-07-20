// Crawl un site concurrent : lit sitemap.xml, fetch jusqu'à 100 pages,
// extrait title/H1/meta et détecte les slugs ville/matériau connus.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_PAGES = 100;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function stripTags(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function match(re: RegExp, s: string): string | null {
  const m = s.match(re); return m?.[1]?.trim() ?? null;
}
function extractKeywords(text: string, limit = 15): string[] {
  const stop = new Set(["de","la","le","les","des","du","et","en","pour","un","une","au","aux","dans","sur","avec","par","est","sont","vous","nous","à","que","qui","ne","pas","ce","cette","ces","son","sa","ses","plus","tout","tous","chez","notre","nos","votre","vos","the","and","for","with","from","this","that","are","was","were","will","have","has","not","can","our","you","your"]);
  const counts = new Map<string, number>();
  for (const w of text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/)) {
    if (w.length < 4 || stop.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([w]) => w);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: u } = await supabase.auth.getUser(jwt);
    if (!u?.user?.id) return json({ error: "Non autorisé" }, 401);
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);

    const { competitor_id } = await req.json();
    const { data: comp } = await supabase.from("seo_competitors").select("*").eq("id", competitor_id).maybeSingle();
    if (!comp) return json({ error: "Concurrent introuvable" }, 404);

    const domain = comp.domain.replace(/\/$/, "");
    const origin = domain.startsWith("http") ? domain : `https://${domain}`;

    // 1) Sitemap
    const urls: string[] = [];
    try {
      const sitemapRes = await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(15000) });
      if (sitemapRes.ok) {
        const xml = await sitemapRes.text();
        const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
        for (const u of locs) {
          if (u.endsWith(".xml")) {
            try {
              const sub = await fetch(u, { signal: AbortSignal.timeout(10000) });
              if (sub.ok) {
                const subXml = await sub.text();
                for (const m of subXml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(m[1].trim());
              }
            } catch { /* ignore */ }
          } else urls.push(u);
          if (urls.length >= MAX_PAGES) break;
        }
      }
    } catch { /* pas de sitemap, on fallback */ }

    if (urls.length === 0) urls.push(origin);

    // 2) Chargement des slugs connus pour matching
    const [{ data: cities }, { data: materials }] = await Promise.all([
      supabase.from("seo_cities").select("slug,name"),
      supabase.from("seo_materials").select("slug,name"),
    ]);
    const cityMap = new Map<string, string>();
    for (const c of cities ?? []) {
      cityMap.set(c.slug, c.slug);
      cityMap.set(c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""), c.slug);
    }
    const matMap = new Map<string, string>();
    for (const m of materials ?? []) {
      matMap.set(m.slug, m.slug);
      matMap.set(m.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""), m.slug);
    }

    // 3) Crawl
    const results: Array<Record<string, unknown>> = [];
    for (const url of urls.slice(0, MAX_PAGES)) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "VracQuebec-SEO-Bot/1.0" } });
        if (!r.ok) continue;
        const html = await r.text();
        const title = match(/<title[^>]*>([\s\S]*?)<\/title>/i, html);
        const h1 = match(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html)?.replace(/<[^>]+>/g, "").trim() ?? null;
        const meta = match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i, html);
        const text = stripTags(html).slice(0, 20000);
        const wc = text.split(/\s+/).length;
        const kws = extractKeywords(text);
        const normUrl = url.toLowerCase();
        let city_slug: string | null = null;
        let material_slug: string | null = null;
        for (const [k, v] of cityMap) if (normUrl.includes(k)) { city_slug = v; break; }
        for (const [k, v] of matMap) if (normUrl.includes(k)) { material_slug = v; break; }
        results.push({
          competitor_id, url, title, h1, meta_description: meta,
          city_slug, material_slug, keywords: kws, word_count: wc,
          last_crawled_at: new Date().toISOString(),
        });
      } catch { /* skip failed pages */ }
    }

    if (results.length > 0) {
      await supabase.from("seo_competitor_pages").upsert(results, { onConflict: "competitor_id,url" });
    }
    await supabase.from("seo_competitors").update({
      last_crawled_at: new Date().toISOString(),
      pages_count: results.length,
    }).eq("id", competitor_id);

    return json({ ok: true, pages: results.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});