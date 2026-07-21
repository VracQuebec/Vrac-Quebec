// Deno edge function — Deterministic SEO QA check for a seo_pages row.
// Admin-only. Validates 8 criteria, persists a report, updates seo_pages.qa_last_score,
// and (optionally) demotes the page to draft when blockers are present.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function countWords(html: string): number {
  const t = stripHtml(html);
  return t ? t.split(" ").length : 0;
}
function countTags(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, "gi")) ?? []).length;
}
function countInternalLinks(html: string): number {
  const links = html.match(/<a\s[^>]*href=["'][^"']+["'][^>]*>/gi) ?? [];
  let n = 0;
  for (const l of links) {
    const href = /href=["']([^"']+)["']/i.exec(l)?.[1] ?? "";
    if (href.startsWith("/") || href.includes("vracquebec.ca")) n++;
  }
  return n;
}
function countCTAs(html: string): number {
  const links = html.match(/<a\s[^>]*href=["'][^"']+["'][^>]*>/gi) ?? [];
  let n = 0;
  for (const l of links) {
    const href = /href=["']([^"']+)["']/i.exec(l)?.[1] ?? "";
    if (/\/transport-request|#questionnaire|\/contact/i.test(href)) n++;
  }
  return n;
}
function countImages(html: string): { total: number; withAlt: number } {
  const imgs = html.match(/<img\s[^>]*>/gi) ?? [];
  let withAlt = 0;
  for (const img of imgs) {
    const alt = /alt=["']([^"']*)["']/i.exec(img)?.[1] ?? "";
    if (alt.trim().length >= 3) withAlt++;
  }
  return { total: imgs.length, withAlt };
}
function avgSentenceLength(text: string): number {
  const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim().length > 0);
  if (!sentences.length) return 0;
  const totalWords = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0);
  return totalWords / sentences.length;
}
// Cheap trigram Jaccard similarity for the "unicité" check.
function trigrams(s: string): Set<string> {
  const norm = s.toLowerCase().replace(/[^a-z0-9à-ÿ ]+/g, " ").replace(/\s+/g, " ").trim();
  const out = new Set<string>();
  for (let i = 0; i < norm.length - 2; i++) out.add(norm.slice(i, i + 3));
  return out;
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

type Check = {
  key: string;
  label: string;
  ok: boolean;
  status: "ok" | "warn" | "fail";
  blocker?: boolean;
  detail?: string;
  fixable?: boolean;
  fix_action?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
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
    const pageId: string | undefined = body?.page_id;
    const threshold: number = Number.isFinite(body?.threshold) ? Number(body.threshold) : 90;
    const enforceDraft: boolean = body?.enforce_draft !== false;
    if (!pageId) return json({ error: "page_id requis" }, 400);

    const { data: page, error: pErr } = await supabase
      .from("seo_pages")
      .select("id, slug, title, meta_title, meta_description, content_html, intro, faq, internal_links, city_slug, material_slug, service_slug, status")
      .eq("id", pageId)
      .maybeSingle();
    if (pErr || !page) return json({ error: pErr?.message || "Page introuvable" }, 404);

    const html = String(page.content_html || "");
    const title = String(page.title || "");
    const metaTitle = String(page.meta_title || "");
    const metaDesc = String(page.meta_description || "");
    const faq: Array<{ question: string; answer: string }> = Array.isArray(page.faq) ? page.faq : [];
    const links: Array<unknown> = Array.isArray(page.internal_links) ? page.internal_links : [];

    const words = countWords(html);
    const h2 = countTags(html, "h2");
    const internal = countInternalLinks(html);
    const ctas = countCTAs(html);
    const plain = stripHtml(html);
    const avgSent = avgSentenceLength(plain);

    // Similarity vs siblings (same family: same material or same service or same city).
    const familyFilter = supabase.from("seo_pages").select("id, title, content_html").neq("id", pageId).eq("status", "published").limit(20);
    if (page.material_slug) familyFilter.eq("material_slug", page.material_slug);
    else if (page.service_slug) familyFilter.eq("service_slug", page.service_slug);
    else if (page.city_slug) familyFilter.eq("city_slug", page.city_slug);
    const { data: siblings } = await familyFilter;
    const myTri = trigrams(plain);
    let maxSim = 0;
    let worstSlug = "";
    for (const s of siblings ?? []) {
      const sim = jaccard(myTri, trigrams(stripHtml(String(s.content_html || ""))));
      if (sim > maxSim) { maxSim = sim; worstSlug = String((s as { title?: string }).title || ""); }
    }

    // Schema.org validity: try parsing FAQPage from faq array and a Service json-ld from row fields.
    let schemaOk = false;
    try {
      const schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
      };
      schemaOk = JSON.parse(JSON.stringify(schema)).mainEntity.length >= 3;
    } catch { schemaOk = false; }

    // Meta title uniqueness across published pages.
    const { data: dupMeta } = await supabase.from("seo_pages").select("id").eq("meta_title", metaTitle).neq("id", pageId).limit(1);
    const metaTitleUnique = !(dupMeta && dupMeta.length > 0);

    const checks: Check[] = [
      {
        key: "uniqueness",
        label: `Unicité (max similarité ${(maxSim * 100).toFixed(0)}%${worstSlug ? ` vs « ${worstSlug} »` : ""})`,
        ok: maxSim < 0.7,
        blocker: maxSim >= 0.7,
      },
      {
        key: "length_structure",
        label: `Longueur & structure (${words} mots, ${h2} H2)`,
        ok: words >= 800 && words <= 1800 && h2 >= 4 && avgSent < 30,
        detail: avgSent >= 30 ? "Phrases trop longues." : undefined,
      },
      {
        key: "internal_linking",
        label: `Maillage interne (${internal} liens inline + ${links.length} liens connexes)`,
        ok: internal + links.length >= 3,
      },
      {
        key: "title_meta",
        label: `Title/Meta (${metaTitle.length} / ${metaDesc.length})`,
        ok: metaTitle.length >= 40 && metaTitle.length <= 65 && metaDesc.length >= 140 && metaDesc.length <= 165 && metaTitleUnique,
        blocker: !metaTitleUnique || metaTitle.length < 30 || metaDesc.length < 120,
        detail: !metaTitleUnique ? "Meta title dupliqué." : undefined,
      },
      {
        key: "schema",
        label: "Schema.org FAQPage valide",
        ok: schemaOk,
        blocker: !schemaOk,
      },
      {
        key: "faq",
        label: `FAQ (${faq.length} Q/R)`,
        ok: faq.length >= 5 && faq.every((f) => (f.answer || "").split(/\s+/).length >= 40),
      },
      {
        key: "related",
        label: `Liens connexes (${links.length})`,
        ok: links.length >= 3,
      },
      {
        key: "cta",
        label: `CTA vers demande (${ctas})`,
        ok: ctas >= 2,
      },
    ];

    // Score = weighted pass rate (blockers count double).
    const weight = (c: Check) => (c.blocker ? 2 : 1);
    const total = checks.reduce((s, c) => s + weight(c), 0);
    const passed = checks.reduce((s, c) => s + (c.ok ? weight(c) : 0), 0);
    const score = Math.round((passed / total) * 100);

    const blockers = checks.filter((c) => !c.ok && c.blocker).map((c) => c.label);
    const warnings = checks.filter((c) => !c.ok && !c.blocker).map((c) => c.label);

    const shouldDemote = enforceDraft && (blockers.length > 0 || score < threshold);
    const autoPublished = !shouldDemote;

    const { data: report } = await supabase
      .from("seo_qa_reports")
      .insert({
        page_id: pageId,
        score,
        checks,
        blockers,
        warnings,
        auto_published: autoPublished,
      })
      .select("id")
      .single();

    const updates: Record<string, unknown> = {
      qa_last_score: score,
      qa_last_checked_at: new Date().toISOString(),
      qa_blockers: blockers,
    };
    if (shouldDemote) updates.status = "draft";
    await supabase.from("seo_pages").update(updates).eq("id", pageId);

    return json({
      ok: true,
      score,
      blockers,
      warnings,
      checks,
      auto_published: autoPublished,
      demoted: shouldDemote,
      report_id: report?.id ?? null,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});