// Audit LECTURE SEULE des pages en brouillon et des municipalités.
// Aucune écriture, aucune génération, aucune publication : ce module ne fait que
// classer des lignes déjà présentes en base selon des règles déterministes.

export type DraftPage = {
  slug: string;
  city_slug: string;
  material_slug: string | null;
  service_slug: string | null;
  title: string | null;
  status: string;
  meta_title: string | null;
  meta_description: string | null;
  internal_link_count: number | null;
  word_count: number | null;
  qa_last_score: number | null;
  qa_last_checked_at: string | null;
  qa_blockers: string[] | null;
  proc_status: string | null;
  proc_error: string | null;
  priority_locked: boolean | null;
  last_generated_at: string | null;
};

export type DraftClass = "ready" | "error" | "incomplete" | "check" | "held" | "legacy";

export const DRAFT_CLASS_LABEL: Record<DraftClass, string> = {
  ready: "Prête à publier",
  error: "Avec erreur",
  incomplete: "Incomplète",
  check: "À vérifier",
  held: "Conservée en brouillon volontairement",
  legacy: "Ancienne logique / anciennes données",
};

/** Règles de qualité minimales appliquées à un brouillon (mêmes seuils que l'audit qualité). */
export const DRAFT_RULES = {
  metaTitleMinLength: 30,
  internalLinksMin: 2,
  wordCountMin: 300,
  qaScoreMin: 70,
  /** Au-delà, la page vient d'une génération antérieure à la logique actuelle. */
  legacyDays: 60,
} as const;

/** Nombre de jours depuis la dernière génération (null si inconnu). */
function ageDays(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (now - t) / 86_400_000;
}

/** Classe un brouillon. Ordre : erreur → incomplet → à vérifier → conservé → ancien → prêt. */
export function classifyDraft(p: DraftPage, now: number = Date.now()): DraftClass {
  if (p.proc_status === "error" || (p.proc_error ?? "") !== "" || (p.qa_blockers?.length ?? 0) > 0) return "error";
  const titleLen = (p.meta_title ?? "").trim().length;
  if (
    titleLen < DRAFT_RULES.metaTitleMinLength ||
    (p.meta_description ?? "").trim() === "" ||
    (p.internal_link_count ?? 0) < DRAFT_RULES.internalLinksMin ||
    (p.word_count ?? 0) < DRAFT_RULES.wordCountMin
  ) return "incomplete";
  if (!p.qa_last_checked_at || p.qa_last_score === null || p.qa_last_score < DRAFT_RULES.qaScoreMin) return "check";
  if (p.priority_locked) return "held";
  const age = ageDays(p.last_generated_at, now);
  if (age !== null && age > DRAFT_RULES.legacyDays) return "legacy";
  return "ready";
}

/** Raison lisible expliquant pourquoi la page est encore en brouillon. */
export function draftReason(p: DraftPage, now: number = Date.now()): string {
  switch (classifyDraft(p, now)) {
    case "error":
      return p.qa_blockers?.length ? `Bloqueur QA : ${p.qa_blockers.join(" · ")}` : (p.proc_error ?? "Erreur de traitement");
    case "incomplete": {
      const titleLen = (p.meta_title ?? "").trim().length;
      if (titleLen < DRAFT_RULES.metaTitleMinLength) return `Titre SEO trop court (${titleLen} car., min. ${DRAFT_RULES.metaTitleMinLength})`;
      if ((p.meta_description ?? "").trim() === "") return "Meta description absente";
      if ((p.internal_link_count ?? 0) < DRAFT_RULES.internalLinksMin) return `Liens internes insuffisants (${p.internal_link_count ?? 0}, min. ${DRAFT_RULES.internalLinksMin})`;
      return `Contenu trop court (${p.word_count ?? 0} mots, min. ${DRAFT_RULES.wordCountMin})`;
    }
    case "check":
      return !p.qa_last_checked_at || p.qa_last_score === null
        ? "Jamais vérifiée (aucun contrôle qualité enregistré)"
        : `Score qualité faible (${p.qa_last_score}/100, min. ${DRAFT_RULES.qaScoreMin})`;
    case "held":
      return "Conservée en brouillon volontairement (priorité verrouillée)";
    case "legacy":
      return "Générée avec une logique antérieure — à régénérer avant publication";
    default:
      return "Aucun blocage détecté — publication manuelle en attente";
  }
}

export type DraftSummary = Record<DraftClass, number> & { total: number };

export function summarizeDrafts(pages: DraftPage[], now: number = Date.now()): DraftSummary {
  const acc: DraftSummary = { total: 0, ready: 0, error: 0, incomplete: 0, check: 0, held: 0, legacy: 0 };
  for (const p of pages) {
    if (p.status !== "draft") continue;
    acc.total++;
    acc[classifyDraft(p, now)]++;
  }
  return acc;
}

/** Phrase de résumé : « Les X brouillons représentent … ». */
export function draftSentence(s: DraftSummary): string {
  const parts = [
    `${s.ready} page(s) prête(s) à publier`,
    `${s.error} avec erreur`,
    `${s.incomplete} incomplète(s)`,
    `${s.check} à vérifier`,
    `${s.held} conservée(s) volontairement`,
    `${s.legacy} issue(s) d'anciennes données`,
  ];
  return `Les ${s.total} brouillons représentent ${parts.join(", ")}.`;
}

// ── Audit par municipalité ───────────────────────────────────────────

export type CityCounts = {
  slug: string; name: string;
  planned: number; generated: number; published: number;
  drafts: number; errors: number; remaining: number;
};

export type CityAuditStatus = "complete" | "to_publish" | "error" | "incomplete" | "check";

export const CITY_AUDIT_LABEL: Record<CityAuditStatus, string> = {
  complete: "COMPLET",
  to_publish: "À PUBLIER",
  error: "AVEC ERREUR",
  incomplete: "INCOMPLET",
  check: "À VÉRIFIER",
};

/** Statut déduit uniquement des chiffres réels. */
export function cityAuditStatus(c: CityCounts): CityAuditStatus {
  if (c.generated !== c.published + c.drafts) return "check";
  if (c.generated + c.remaining !== c.planned) return "check";
  if (c.generated > c.planned || c.planned < 0) return "check";
  if (c.errors > 0) return "error";
  if (c.remaining > 0) return "incomplete";
  if (c.drafts > 0) return "to_publish";
  return "complete";
}

export function cityCompletion(c: CityCounts): number {
  return c.planned > 0 ? Math.round((c.generated / c.planned) * 100) : 0;
}

export type CityAuditSummary = Record<CityAuditStatus, number> & { total: number };

export function summarizeCityAudit(rows: CityCounts[]): CityAuditSummary {
  const acc: CityAuditSummary = { total: rows.length, complete: 0, to_publish: 0, error: 0, incomplete: 0, check: 0 };
  for (const r of rows) acc[cityAuditStatus(r)]++;
  return acc;
}
