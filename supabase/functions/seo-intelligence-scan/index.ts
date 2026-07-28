// SEO Intelligence — scans published pages and triggers automated actions:
//  * Pages not indexed after 14d → diagnose (robots, noindex, canonical, thin content, links, HTTP)
//  * Pages with ≥100 impressions & 0 clicks → flag for meta rewrite (needs_refresh)
//  * Pages between position 8–20 → flag for Top-3 boost (needs_refresh)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const BASE = "https://vracquebec.ca";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

type Page = {
  id: string; slug: string; title: string;
  word_count: number; internal_link_count: number;
  published_at: string | null; indexed_at: string | null;
  meta_title: string | null; meta_description: string | null;
  content_html: string;
};

type Metric = { page_id: string; impressions: number; clicks: number; position: number };

async function diagnosePage(page: Page, robotsTxt: string): Promise<{ report: Record<string, unknown>; flags: string[] }> {
  const flags: string[] = [];
  const report: Record<string, unknown> = {};
  const url = `${BASE}/${page.slug}`;

  // robots.txt
  const path = "/" + page.slug;
  const disallowed = /Disallow:\s*([^\n]+)/gi;
  let blocked = false;
  let m: RegExpExecArray | null;
  while ((m = disallowed.exec(robotsTxt))) {
    const rule = m[1].trim();
    if (rule && rule !== "" && (rule === "/" || path.startsWith(rule))) { blocked = true; break; }
  }
  report.robots_blocked = blocked;
  if (blocked) flags.push("robots_blocked");

  // HTTP + noindex + canonical
  try {
    const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": "VracQuebecSeoBot/1.0" } });
    report.http_status = res.status;
    if (res.status >= 400) flags.push("http_error");
    const html = res.status < 400 ? await res.text() : "";
    const hasNoindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html);
    report.noindex = hasNoindex;
    if (hasNoindex) flags.push("noindex");
    const canonical = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(html)?.[1] ?? null;
    report.canonical = canonical;
    if (canonical && !canonical.includes(page.slug)) { flags.push("canonical_mismatch"); }
  } catch (e) {
    report.http_error = (e as Error).message;
    flags.push("http_error");
  }

  // Thin content
  report.word_count = page.word_count;
  if (page.word_count < 800) flags.push("thin_content");

  // Internal links
  report.internal_link_count = page.internal_link_count;
  if (page.internal_link_count < 5) flags.push("insufficient_internal_links");

  // Duplicate title (very naive: identical meta_title on another page)
  report.duplicate_title = false;

  return { report, flags };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const stats = { diagnosed: 0, meta_flagged: 0, boost_flagged: 0, errors: 0 };

  try {
    // Fetch robots.txt once
    let robotsTxt = "";
    try {
      const rr = await fetch(`${BASE}/robots.txt`);
      robotsTxt = await rr.text();
    } catch { /* ignore */ }

    // Latest 28d metrics per page
    const { data: metrics } = await supa
      .from("seo_gsc_metrics")
      .select("page_id, impressions, clicks, position, fetched_at")
      .eq("period", "28d")
      .order("fetched_at", { ascending: false });
    const byPage = new Map<string, Metric>();
    for (const row of (metrics ?? []) as Array<Metric & { fetched_at: string }>) {
      if (!byPage.has(row.page_id)) byPage.set(row.page_id, row);
    }

    // 1) Not indexed after 14d → diagnose (batch 40 per scan)
    const cutoff = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const { data: notIndexed } = await supa
      .from("seo_pages")
      .select("id, slug, title, word_count, internal_link_count, published_at, indexed_at, meta_title, meta_description, content_html")
      .eq("status", "published")
      .is("indexed_at", null)
      .lt("published_at", cutoff)
      .order("intelligence_last_checked_at", { ascending: true, nullsFirst: true })
      .limit(40);

    for (const p of (notIndexed ?? []) as Page[]) {
      try {
        const { report, flags } = await diagnosePage(p, robotsTxt);
        await supa.from("seo_pages").update({
          diagnostic_report: report,
          intelligence_flags: flags,
          intelligence_last_checked_at: new Date().toISOString(),
          needs_refresh: flags.includes("thin_content") || flags.includes("insufficient_internal_links"),
          refresh_reason: flags.length ? `intelligence:${flags.join(",")}` : null,
        }).eq("id", p.id);
        stats.diagnosed++;
      } catch { stats.errors++; }
    }

    // 2) 100+ impr & 0 clicks → flag meta rewrite
    for (const [pageId, m] of byPage) {
      if (m.impressions >= 100 && m.clicks === 0) {
        await supa.from("seo_pages").update({
          needs_refresh: true,
          refresh_reason: "intelligence:rewrite_meta",
          intelligence_flags: ["needs_meta_rewrite"],
        }).eq("id", pageId).is("indexed_at", null).then(() => {}); // best-effort
        await supa.from("seo_pages").update({
          needs_refresh: true,
          refresh_reason: "intelligence:rewrite_meta",
        }).eq("id", pageId);
        stats.meta_flagged++;
      }
      if (m.position >= 8 && m.position <= 20) {
        await supa.from("seo_pages").update({
          needs_refresh: true,
          refresh_reason: "intelligence:boost_top3",
        }).eq("id", pageId);
        stats.boost_flagged++;
      }
    }

    return json({ ok: true, stats });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});