// Séparation stricte entre l'Intelligence SEO automatique (analyse) et le
// Copilote SEO (seul autorisé à modifier une page après confirmation admin).
// Module PUR : aucune dépendance réseau.

/** Colonnes purement analytiques : une tâche automatique peut les actualiser. */
export const ANALYTIC_PAGE_COLUMNS = [
  "diagnostic_report",
  "intelligence_flags",
  "intelligence_last_checked_at",
  "needs_refresh",
  "refresh_reason",
  "last_analyzed_at",
  "seo_score",
  "qa_last_score",
  "qa_last_checked_at",
  "qa_blockers",
  "qa_breakdown",
  "google_index_status",
  "google_last_checked_at",
  "discovered_at",
  "indexed_at",
  "backlinks_count",
  "view_count",
  "proc_status",
  "proc_kind",
  "proc_started_at",
  "proc_finished_at",
  "proc_error",
  "proc_result",
] as const;

/** Colonnes SEO opérationnelles : modifiables UNIQUEMENT par le workflow Copilote. */
export const OPERATIONAL_PAGE_COLUMNS = [
  "title",
  "meta_title",
  "meta_description",
  "h1",
  "intro",
  "content_html",
  "faq",
  "internal_links",
  "internal_link_count",
  "og_title",
  "og_description",
  "status",
  "published_at",
  "slug",
  "cover_image_url",
  "cover_image_alt",
  "keywords",
] as const;

export type PageUpdateVerdict = {
  analytic: string[];
  operational: string[];
  unknown: string[];
  allowedForAutomation: boolean;
};

/** Classe les colonnes d'une écriture sur seo_pages. */
export function classifyPageUpdate(columns: string[]): PageUpdateVerdict {
  const analytic: string[] = [];
  const operational: string[] = [];
  const unknown: string[] = [];
  for (const c of columns) {
    if ((ANALYTIC_PAGE_COLUMNS as readonly string[]).includes(c)) analytic.push(c);
    else if ((OPERATIONAL_PAGE_COLUMNS as readonly string[]).includes(c)) operational.push(c);
    else unknown.push(c);
  }
  return {
    analytic,
    operational,
    unknown,
    allowedForAutomation: operational.length === 0 && unknown.length === 0,
  };
}

/**
 * Extrait les colonnes de chaque `.from("seo_pages").update({ ... })`
 * présent dans un code source d'edge function.
 */
export function extractPageUpdateColumns(source: string): string[][] {
  const out: string[][] = [];
  const marker = /from\(\s*["']seo_pages["']\s*\)\s*(?:\.[a-zA-Z]+\([^)]*\)\s*)*?\.update\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = marker.exec(source))) {
    const start = marker.lastIndex - 1; // position de '{'
    let depth = 0;
    let end = start;
    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    const body = source.slice(start + 1, end);
    const cols: string[] = [];
    let level = 0;
    let key = "";
    let expectingKey = true;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch === "{" || ch === "[" || ch === "(") level++;
      else if (ch === "}" || ch === "]" || ch === ")") level--;
      else if (level === 0 && ch === "," ) { expectingKey = true; key = ""; continue; }
      else if (level === 0 && ch === ":" && expectingKey) {
        const clean = key.trim().replace(/^["']|["']$/g, "");
        if (clean) cols.push(clean);
        expectingKey = false;
        key = "";
        continue;
      }
      if (level === 0 && expectingKey) key += ch;
    }
    out.push(cols);
  }
  return out;
}

/** Détecte des écritures interdites (création / suppression de page) dans un source. */
export function findForbiddenPageWrites(source: string): string[] {
  const found: string[] = [];
  if (/from\(\s*["']seo_pages["']\s*\)\s*\.insert\(/.test(source)) found.push("insert");
  if (/from\(\s*["']seo_pages["']\s*\)\s*\.upsert\(/.test(source)) found.push("upsert");
  if (/from\(\s*["']seo_pages["']\s*\)\s*\.delete\(/.test(source)) found.push("delete");
  return found;
}

/** Une tâche automatique peut produire des signaux : décrit ce qu'elle a le droit d'écrire. */
export const AUTOMATION_ALLOWED_TABLES = [
  "seo_opportunities",
  "seo_opportunity_runs",
  "seo_gsc_metrics",
  "seo_page_scores",
  "seo_page_analytics",
  "seo_qa_reports",
] as const;
