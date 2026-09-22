// Règles de qualité « Pages à corriger » — LECTURE SEULE.
// Aucune écriture : ce module ne modifie jamais une page, il décrit seulement
// pourquoi une page existe dans l'encadré « Pages à corriger » du Centre de pilotage.
//
// Critères validés sur la base réelle (2026-09-22) — exactement 2 pages concernées :
//  - Notre-Dame-du-Sacré-Cœur-d'Issoudun (hub) : titre SEO de 29 caractères (< 30)
//  - Portneuf / roche : 1 lien interne (< 2)
// Ces critères qualité (audit) sont volontairement plus stricts que la validation
// technique de génération (seo_validate_page_fields) : les deux sources sont distinctes.

export type QualityCheck = {
  meta_title?: string | null;
  internal_link_count?: number | null;
};

export type QualityFix<T extends QualityCheck = QualityCheck> = T & { reason: string };

export const QUALITY_RULES = {
  /** Longueur minimale (caractères) du titre SEO. */
  metaTitleMinLength: 30,
  /** Nombre minimal de liens internes. */
  internalLinksMin: 2,
} as const;

/** Raison de correction si la page ne respecte pas les règles de qualité, sinon null. */
export function fixReason(p: QualityCheck): string | null {
  const titleLen = (p.meta_title ?? "").trim().length;
  if (titleLen < QUALITY_RULES.metaTitleMinLength) {
    return `Titre SEO trop court (${titleLen} caractère${titleLen === 1 ? "" : "s"}, minimum ${QUALITY_RULES.metaTitleMinLength})`;
  }
  const links = p.internal_link_count ?? 0;
  if (links < QUALITY_RULES.internalLinksMin) {
    return links === 0
      ? "Page orpheline — aucun lien interne"
      : `Liens internes insuffisants (${links} lien, minimum ${QUALITY_RULES.internalLinksMin})`;
  }
  return null;
}

export function needsFix(p: QualityCheck): boolean {
  return fixReason(p) !== null;
}

/** Filtre en mémoire : retourne uniquement les pages à corriger, avec leur raison. */
export function collectFixes<T extends QualityCheck>(pages: T[]): Array<QualityFix<T>> {
  return pages
    .map((p) => ({ ...p, reason: fixReason(p) }))
    .filter((p): p is QualityFix<T> => p.reason !== null);
}

/** Villes distinctes qui ont au moins une page à corriger (problème de qualité). */
export function citiesWithQualityProblem(fixes: Array<{ city_slug: string }>): string[] {
  return [...new Set(fixes.map((f) => f.city_slug))];
}
