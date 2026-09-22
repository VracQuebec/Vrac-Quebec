// Contrôle qualité des brouillons « À VÉRIFIER » — LECTURE SEULE.
// Ce module évalue des lignes de pages déjà chargées et ne fait AUCUNE écriture :
// il ne publie pas, ne corrige pas, ne crée pas et ne supprime pas de page.
// Les règles reprennent celles du contrôle qualité existant (seo-qa-check) appliquées
// aux champs réellement disponibles en base.

export type QaControlPage = {
  id?: string;
  slug: string;
  city_slug: string;
  material_slug?: string | null;
  service_slug?: string | null;
  title?: string | null;
  h1?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  content_html?: string | null;
  word_count?: number | null;
  internal_link_count?: number | null;
  internal_links?: unknown;
  qa_last_score?: number | null;
};

export type QaSeverity = "blocker" | "fix" | "warn";

export type QaIssue = {
  /** Identifiant stable du contrôle (évite tout doublon lors d'une relance). */
  key: string;
  label: string;
  severity: QaSeverity;
  /** Valeur constatée sur la page. */
  actual: string;
  /** Règle attendue. */
  expected: string;
  /** Action recommandée (jamais appliquée automatiquement). */
  action: string;
};

export type QaVerdict = "ready" | "fix" | "blocked";

export const QA_VERDICT_LABEL: Record<QaVerdict, string> = {
  ready: "Prête à publier",
  fix: "À corriger",
  blocked: "Erreur bloquante",
};

export type QaControlResult = {
  slug: string;
  city_slug: string;
  /** Matériau, service, ou « hub » pour une page de municipalité. */
  topic: string;
  url: string;
  verdict: QaVerdict;
  score: number;
  issues: QaIssue[];
  checked_at: string;
};

export const QA_CONTROL_RULES = {
  metaTitleMin: 30,
  metaTitleMax: 65,
  metaDescriptionMin: 100,
  metaDescriptionMax: 200,
  wordCountBlocking: 150,
  wordCountMin: 300,
  internalLinksMin: 2,
  /** Pénalités de score par sévérité. */
  penalty: { blocker: 40, fix: 15, warn: 5 } as Record<QaSeverity, number>,
} as const;

/** Liens de conversion réels du site (aucune URL inventée). */
const CTA_PATTERNS = ["/soumission", "/contact", "/transport-request", "#questionnaire"];

export function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Normalisation insensible aux accents et à la ponctuation. */
export function loose(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function topicOf(p: QaControlPage): string {
  return p.material_slug ?? p.service_slug ?? "hub";
}

function countLinks(p: QaControlPage): number {
  const inline = p.internal_link_count ?? 0;
  const related = Array.isArray(p.internal_links) ? p.internal_links.length : 0;
  return inline + related;
}

function hasCta(html: string): boolean {
  const links = html.match(/href=["']([^"']+)["']/gi) ?? [];
  return links.some((l) => CTA_PATTERNS.some((c) => l.toLowerCase().includes(c)));
}

/** Chiffres commerciaux (prix, pourcentages) à faire valider avant publication. */
function suspiciousFigure(html: string): string | null {
  const m = /(\$\s?\d[\d ,.]*|\d[\d ,.]*\s?\$|\d+\s?%)/.exec(stripHtml(html));
  return m ? m[0].trim() : null;
}

/**
 * Exécute le contrôle qualité d'une page. Fonction pure : mêmes entrées → mêmes
 * résultats, donc relançable autant de fois que voulu sans créer de doublon.
 */
export function runQaControl(
  p: QaControlPage,
  opts: { duplicateTitle?: boolean } = {},
): QaControlResult {
  const issues: QaIssue[] = [];
  const R = QA_CONTROL_RULES;
  const html = p.content_html ?? "";
  const plain = stripHtml(html);
  const metaTitle = (p.meta_title ?? "").trim();
  const metaDesc = (p.meta_description ?? "").trim();
  const heading = ((p.h1 ?? "").trim() || (p.title ?? "").trim());
  const words = p.word_count ?? (plain ? plain.split(" ").length : 0);
  const links = countLinks(p);
  const topic = topicOf(p);

  // 1. Meta title
  if (metaTitle.length < R.metaTitleMin) {
    issues.push({
      key: "meta_title", label: "Meta title", severity: "blocker",
      actual: metaTitle ? `${metaTitle.length} caractères` : "absent",
      expected: `${R.metaTitleMin} à ${R.metaTitleMax} caractères`,
      action: "Réécrire le titre SEO (matériau + municipalité).",
    });
  } else if (metaTitle.length > R.metaTitleMax) {
    issues.push({
      key: "meta_title_long", label: "Meta title", severity: "fix",
      actual: `${metaTitle.length} caractères`,
      expected: `maximum ${R.metaTitleMax} caractères`,
      action: "Raccourcir le titre SEO pour éviter la troncature dans Google.",
    });
  }

  // 2. Meta description
  if (metaDesc.length < R.metaDescriptionMin) {
    issues.push({
      key: "meta_description", label: "Meta description", severity: "blocker",
      actual: metaDesc ? `${metaDesc.length} caractères` : "absente",
      expected: `${R.metaDescriptionMin} à ${R.metaDescriptionMax} caractères`,
      action: "Rédiger une description orientée besoin + appel à l'action.",
    });
  } else if (metaDesc.length > R.metaDescriptionMax) {
    issues.push({
      key: "meta_description_long", label: "Meta description", severity: "fix",
      actual: `${metaDesc.length} caractères`,
      expected: `maximum ${R.metaDescriptionMax} caractères`,
      action: "Raccourcir la description (elle sera coupée dans les résultats).",
    });
  }

  // 3. H1
  if (!heading) {
    issues.push({
      key: "h1", label: "Titre H1", severity: "blocker",
      actual: "aucun titre", expected: "un H1 unique",
      action: "Renseigner le titre de la page (affiché en H1).",
    });
  } else if ((html.match(/<h1[\s>]/gi) ?? []).length >= 2) {
    issues.push({
      key: "h1_multiple", label: "Titre H1", severity: "fix",
      actual: `${(html.match(/<h1[\s>]/gi) ?? []).length} H1 dans le contenu`,
      expected: "un seul H1",
      action: "Transformer les H1 supplémentaires en H2.",
    });
  }

  // 4. Contenu principal
  if (words < R.wordCountBlocking) {
    issues.push({
      key: "content", label: "Contenu principal", severity: "blocker",
      actual: `${words} mots`, expected: `au moins ${R.wordCountMin} mots`,
      action: "Régénérer le contenu de la page avant publication.",
    });
  } else if (words < R.wordCountMin) {
    issues.push({
      key: "content_short", label: "Contenu principal", severity: "fix",
      actual: `${words} mots`, expected: `au moins ${R.wordCountMin} mots`,
      action: "Enrichir le contenu avec des informations propres au territoire.",
    });
  }

  // 5. Liens internes
  if (links < R.internalLinksMin) {
    issues.push({
      key: "internal_links", label: "Liens internes", severity: "fix",
      actual: `${links} lien${links === 1 ? "" : "s"}`,
      expected: `au moins ${R.internalLinksMin} liens vers des pages existantes`,
      action: "Ajouter des liens vers la page municipalité et une page matériau.",
    });
  }

  // 6. CTA réel
  if (!hasCta(html)) {
    issues.push({
      key: "cta", label: "Appel à l'action", severity: "fix",
      actual: "aucun lien de conversion",
      expected: `un lien vers ${CTA_PATTERNS.join(" ou ")}`,
      action: "Ajouter le bouton vers le parcours de soumission.",
    });
  }

  // 7. Cohérence municipalité + matériau/service
  const cityWords = loose(p.city_slug);
  const head = loose(`${p.title ?? ""} ${metaTitle}`);
  const body = loose(plain);
  if (cityWords && !head.includes(cityWords)) {
    issues.push({
      key: "city_in_title", label: "Cohérence municipalité", severity: "fix",
      actual: "municipalité absente du titre", expected: `« ${p.city_slug} » présent dans le titre`,
      action: "Replacer le nom officiel de la municipalité dans le titre SEO.",
    });
  }
  if (cityWords && !body.includes(cityWords)) {
    issues.push({
      key: "city_in_body", label: "Cohérence municipalité", severity: "fix",
      actual: "municipalité absente du contenu", expected: "municipalité citée dans le contenu",
      action: "Mentionner la municipalité dans le contenu principal.",
    });
  }
  if (topic !== "hub" && !body.includes(loose(topic))) {
    issues.push({
      key: "topic_in_body", label: "Cohérence matériau / service", severity: "fix",
      actual: `« ${topic} » absent du contenu`, expected: "matériau ou service cité dans le contenu",
      action: "Nommer explicitement le matériau ou le service traité.",
    });
  }

  // 8. Contenu inventé (prix, pourcentages, statistiques)
  const figure = suspiciousFigure(html);
  if (figure) {
    issues.push({
      key: "invented", label: "Donnée chiffrée à valider", severity: "fix",
      actual: `« ${figure} » dans le contenu`,
      expected: "aucun prix ni statistique non vérifiable",
      action: "Vérifier la source du chiffre ou le retirer avant publication.",
    });
  }

  // 9. Doublon évident
  if (opts.duplicateTitle) {
    issues.push({
      key: "duplicate", label: "Doublon", severity: "blocker",
      actual: "titre SEO identique à une autre page",
      expected: "un titre SEO unique",
      action: "Différencier le titre (matériau × municipalité).",
    });
  }

  // 10. Score qualité
  const score = Math.max(
    0,
    issues.reduce((s, i) => s - QA_CONTROL_RULES.penalty[i.severity], 100),
  );
  const verdict: QaVerdict = issues.some((i) => i.severity === "blocker")
    ? "blocked"
    : issues.some((i) => i.severity === "fix")
    ? "fix"
    : "ready";

  return {
    slug: p.slug,
    city_slug: p.city_slug,
    topic,
    url: `/${p.slug}`,
    verdict,
    score,
    issues,
    checked_at: new Date().toISOString(),
  };
}

export type QaControlSummary = {
  checked: number;
  ready: number;
  fix: number;
  blocked: number;
  remaining: number;
  /** Progression 0–100 du contrôle. */
  progress: number;
};

export function summarizeQaControl(results: QaControlResult[], total: number): QaControlSummary {
  const checked = results.length;
  return {
    checked,
    ready: results.filter((r) => r.verdict === "ready").length,
    fix: results.filter((r) => r.verdict === "fix").length,
    blocked: results.filter((r) => r.verdict === "blocked").length,
    remaining: Math.max(0, total - checked),
    progress: total > 0 ? Math.round((checked / total) * 100) : 0,
  };
}

/** Relance idempotente : un seul résultat par page, le plus récent l'emporte. */
export function mergeResults(previous: QaControlResult[], fresh: QaControlResult[]): QaControlResult[] {
  const map = new Map(previous.map((r) => [r.slug, r]));
  for (const r of fresh) map.set(r.slug, r);
  return [...map.values()];
}

/** Titres SEO présents plus d'une fois dans l'ensemble fourni. */
export function duplicateTitles(pages: Array<{ meta_title?: string | null }>): Set<string> {
  const count = new Map<string, number>();
  for (const p of pages) {
    const t = (p.meta_title ?? "").trim();
    if (!t) continue;
    count.set(t, (count.get(t) ?? 0) + 1);
  }
  return new Set([...count.entries().filter?.(() => true) ?? []].filter(([, n]) => n > 1).map(([t]) => t));
}

/** Total de pages publiables après contrôle = brouillons déjà prêts + pages devenues prêtes. */
export function publishableTotal(readyBefore: number, becameReady: number): number {
  return readyBefore + becameReady;
}
