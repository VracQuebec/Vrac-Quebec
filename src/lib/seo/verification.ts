// Vérifications du Copilote SEO.
// Module PUR et en LECTURE SEULE : ces fonctions analysent des lignes de pages
// déjà chargées et ne produisent JAMAIS de modification de page.

export type VerificationKind = "indexation" | "qa" | "cannibalisation";

export const VERIFICATION_LABEL: Record<VerificationKind, string> = {
  indexation: "Indexation",
  qa: "QA technique",
  cannibalisation: "Cannibalisation",
};

/** Un signal de vérification n'est jamais exécutable : il se diagnostique. */
export function verificationKindOfType(type: string): VerificationKind | null {
  switch (type) {
    case "not_indexed":
    case "not_indexed_bulk":
      return "indexation";
    case "low_qa":
      return "qa";
    case "cannibalization":
      return "cannibalisation";
    default:
      return null;
  }
}

export type VerificationPageRow = {
  id: string;
  slug: string;
  title?: string | null;
  status?: string | null;
  noindex?: boolean | null;
  google_index_status?: string | null;
  qa_last_score?: number | null;
  qa_blockers?: unknown;
  city_slug?: string | null;
  service_slug?: string | null;
};

export type VerificationIssue = { slug: string; url: string; message: string };

export type VerificationOutcome = "ok" | "issue";

export type VerificationResult = {
  kind: VerificationKind;
  outcome: VerificationOutcome;
  checked: number;
  issues: VerificationIssue[];
  summary: string;
  checked_at: string;
};

/** Statut affiché d'une vérification — vocabulaire distinct des actions. */
export function verificationStatusLabel(
  state: "idle" | "running" | "done" | "error",
  outcome?: VerificationOutcome | null,
  alreadyRun = false,
): string {
  if (state === "running") return "En cours";
  if (state === "error") return "Erreur";
  if (state === "done") return outcome === "issue" ? "Problème détecté" : "Vérifiée";
  return alreadyRun ? "À revérifier" : "À vérifier";
}

/** Le bouton d'une vérification n'est jamais « Travailler ». */
export function verificationButtonLabel(state: "idle" | "running" | "done" | "error", alreadyRun = false): string {
  if (state === "running") return "Vérification en cours…";
  if (state === "error") return "Réessayer la vérification";
  if (state === "done" || alreadyRun) return "Revérifier";
  return "Vérifier";
}

const url = (slug: string) => `/${slug}`;

function result(kind: VerificationKind, checked: number, issues: VerificationIssue[], okText: string, issueText: string): VerificationResult {
  return {
    kind,
    outcome: issues.length ? "issue" : "ok",
    checked,
    issues,
    summary: issues.length ? `${issues.length} ${issueText}` : okText,
    checked_at: new Date().toISOString(),
  };
}

/** Indexation : page publiée mais non indexée, ou marquée noindex. */
export function runIndexationCheck(rows: VerificationPageRow[]): VerificationResult {
  const issues: VerificationIssue[] = [];
  for (const p of rows) {
    if (p.status !== "published") continue;
    if (p.noindex) {
      issues.push({ slug: p.slug, url: url(p.slug), message: "Page publiée mais marquée noindex." });
      continue;
    }
    const idx = (p.google_index_status ?? "").toLowerCase();
    if (idx && idx !== "indexed") {
      issues.push({ slug: p.slug, url: url(p.slug), message: `Statut Google : ${p.google_index_status}.` });
    } else if (!idx) {
      issues.push({ slug: p.slug, url: url(p.slug), message: "Aucun statut d'indexation connu pour cette page." });
    }
  }
  return result("indexation", rows.length, issues, "Toutes les pages vérifiées sont indexables et indexées.", "page(s) avec un problème d'indexation.");
}

function blockerList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((b) => (typeof b === "string" ? b : typeof b === "object" && b ? String((b as Record<string, unknown>).message ?? (b as Record<string, unknown>).code ?? "") : "")).filter(Boolean);
  }
  return [];
}

/** QA technique : score QA sous le seuil ou bloqueurs QA présents. */
export function runQaCheck(rows: VerificationPageRow[], minScore = 70): VerificationResult {
  const issues: VerificationIssue[] = [];
  for (const p of rows) {
    const blockers = blockerList(p.qa_blockers);
    if (blockers.length) {
      issues.push({ slug: p.slug, url: url(p.slug), message: `Bloqueurs QA : ${blockers.slice(0, 3).join(", ")}.` });
      continue;
    }
    if (typeof p.qa_last_score === "number" && p.qa_last_score < minScore) {
      issues.push({ slug: p.slug, url: url(p.slug), message: `Score QA ${p.qa_last_score}/100 (seuil ${minScore}).` });
    }
  }
  return result("qa", rows.length, issues, `Aucun bloqueur QA et aucun score sous ${minScore}/100.`, "page(s) avec un problème de qualité technique.");
}

/** Cannibalisation : plusieurs pages publiées sur le même territoire × service. */
export function runCannibalizationCheck(rows: VerificationPageRow[]): VerificationResult {
  const buckets = new Map<string, VerificationPageRow[]>();
  for (const p of rows) {
    if (p.status !== "published") continue;
    if (!p.city_slug || !p.service_slug) continue;
    const key = `${p.city_slug}::${p.service_slug}`;
    buckets.set(key, [...(buckets.get(key) ?? []), p]);
  }
  const issues: VerificationIssue[] = [];
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    const [city, service] = key.split("::");
    for (const p of list) {
      issues.push({
        slug: p.slug,
        url: url(p.slug),
        message: `${list.length} pages publiées ciblent ${service} à ${city} : ${list.map((x) => `/${x.slug}`).join(", ")}.`,
      });
    }
  }
  return result("cannibalisation", rows.length, issues, "Aucun doublon territoire × service parmi les pages vérifiées.", "page(s) en concurrence sur le même territoire × service.");
}

export function runVerification(kind: VerificationKind, rows: VerificationPageRow[]): VerificationResult {
  if (kind === "indexation") return runIndexationCheck(rows);
  if (kind === "qa") return runQaCheck(rows);
  return runCannibalizationCheck(rows);
}
