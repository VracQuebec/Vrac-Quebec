// Contrôle des liens écrits par l'IA dans le corps d'une page générée.
// Un lien n'est conservé que s'il pointe vers une page SEO interne PUBLIÉE.
// Sinon la balise <a> est retirée et son texte lisible conservé.
// Aucune URL de remplacement n'est jamais inventée.

export type RemovedLink = {
  href: string | null;
  text: string;
  reason: "external" | "malformed" | "not_published";
};

const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
const HREF = /\bhref\s*=\s*(["'])(.*?)\1/i;
const INTERNAL_SLUG = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;

/** Renvoie le slug d'un lien interne simple (« /gravier-levis »), sinon null. */
export function internalSlug(href: string | null | undefined): string | null {
  const m = INTERNAL_SLUG.exec((href ?? "").trim());
  return m ? m[1] : null;
}

/** Slugs internes candidats présents dans le HTML (pour une lecture ciblée en base). */
export function candidateSlugs(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(ANCHOR)) {
    const h = HREF.exec(m[1]);
    const s = internalSlug(h?.[2]);
    if (s) out.add(s);
  }
  return [...out];
}

function classify(href: string | null): RemovedLink["reason"] {
  if (!href || !href.trim()) return "malformed";
  if (/^(https?:)?\/\//i.test(href.trim()) || /^[a-z]+:/i.test(href.trim())) return "external";
  if (!internalSlug(href)) return "malformed";
  return "not_published";
}

/** Pages fixes du site vérifiées (existantes, accessibles, dans le plan du site). */
export const FIXED_ROUTES = ["soumission", "transport-en-vrac"] as const;

export function sanitizeContentLinks(
  html: string,
  publishedSlugs: Iterable<string>,
  fixedRoutes: Iterable<string> = [],
): { html: string; kept: string[]; removed: RemovedLink[] } {
  const allowed = new Set([...publishedSlugs, ...fixedRoutes]);
  const kept: string[] = [];
  const removed: RemovedLink[] = [];
  const out = html.replace(ANCHOR, (whole, attrs: string, inner: string) => {
    const href = HREF.exec(attrs)?.[2] ?? null;
    const slug = internalSlug(href);
    if (slug && allowed.has(slug)) { kept.push(slug); return whole; }
    removed.push({ href, text: inner.replace(/<[^>]+>/g, "").trim(), reason: classify(href) });
    return inner;
  });
  return { html: out, kept, removed };
}
