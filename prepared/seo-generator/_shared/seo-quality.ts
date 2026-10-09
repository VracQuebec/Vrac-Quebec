// Contrôles de qualité SEO d'une page générée. Signalement seulement :
// aucun seuil de similarité n'est appliqué ici (décision en attente).

const PLACEHOLDERS: Array<[RegExp, string]> = [
  [/\{\{[^}]*\}\}/, "{{…}}"],
  [/\$\{[^}]*\}/, "${…}"],
  [/\[(VILLE|MATERIAU|MATÉRIAU|SERVICE|CITY|REGION|RÉGION)\]/i, "[VARIABLE]"],
  [/\b(undefined|NaN)\b/, "undefined/NaN"],
  [/(^|[\s>(«"])null([\s<).,»"]|$)/, "null"],
];

/** Variables non remplacées trouvées dans les champs fournis. */
export function findPlaceholders(fields: Record<string, string | null | undefined>): Array<{ field: string; token: string }> {
  const hits: Array<{ field: string; token: string }> = [];
  for (const [field, value] of Object.entries(fields)) {
    if (!value) continue;
    for (const [re, token] of PLACEHOLDERS) if (re.test(value)) hits.push({ field, token });
  }
  return hits;
}

export type MetaIssue = { code: "desc_empty" | "desc_short" | "title_duplicate" | "desc_duplicate"; detail: string };

export function metaIssues(
  page: { meta_title: string; meta_description: string },
  others: Array<{ slug: string; meta_title: string | null; meta_description: string | null }>,
  minDescription = 120,
): MetaIssue[] {
  const issues: MetaIssue[] = [];
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const d = norm(page.meta_description);
  if (!d) issues.push({ code: "desc_empty", detail: "Description SEO vide" });
  else if (d.length < minDescription) issues.push({ code: "desc_short", detail: `Description de ${d.length} caractères (< ${minDescription})` });
  const t = norm(page.meta_title);
  const dupT = others.filter((o) => t && norm(o.meta_title) === t).map((o) => o.slug);
  const dupD = others.filter((o) => d && norm(o.meta_description) === d).map((o) => o.slug);
  if (dupT.length) issues.push({ code: "title_duplicate", detail: `Titre SEO identique à : ${dupT.join(", ")}` });
  if (dupD.length) issues.push({ code: "desc_duplicate", detail: `Description identique à : ${dupD.join(", ")}` });
  return issues;
}

/** Texte comparable : sans balises, minuscules, sans accents, termes neutralisés, phrases communes retirées. */
export function normalizeForSimilarity(html: string, neutral: string[] = [], common: string[] = []): string {
  const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let t = fold(html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " "));
  for (const c of common) t = t.split(fold(c)).join(" ");
  for (const n of neutral) if (n) t = t.split(fold(n)).join(" § ");
  return t.replace(/[^a-z0-9§ ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function shingles(text: string, size = 5): Set<string> {
  const w = text.split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + size <= w.length; i++) out.add(w.slice(i, i + size).join(" "));
  return out;
}

/** Ressemblance de Jaccard entre deux ensembles de suites de 5 mots (0 à 1). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Seuil de SIGNALEMENT (jamais de blocage) — choisi par l'administrateur. */
export const SIMILARITY_FLAG = 0.40;

/** Pages de la même famille dont la ressemblance atteint le seuil de signalement. */
export function similarityFlags(
  html: string,
  cityName: string,
  others: Array<{ slug: string; city_slug: string | null; content_html: string | null }>,
  threshold = SIMILARITY_FLAG,
): Array<{ slug: string; score: number }> {
  const mine = shingles(normalizeForSimilarity(html, [cityName]));
  const out: Array<{ slug: string; score: number }> = [];
  for (const o of others) {
    if (!o.content_html) continue;
    const cityWords = (o.city_slug ?? "").replace(/-/g, " ");
    const score = jaccard(mine, shingles(normalizeForSimilarity(o.content_html, [cityWords])));
    if (score >= threshold) out.push({ slug: o.slug, score: Math.round(score * 1000) / 1000 });
  }
  return out.sort((a, b) => b.score - a.score);
}
