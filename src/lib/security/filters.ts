// ============================================================
// SÉCURITÉ — VALEURS UTILISÉES DANS LES FILTRES DE RECHERCHE
// ------------------------------------------------------------
// Les filtres « ou » de la base utilisent une grammaire (virgules,
// parenthèses, points) : un texte libre inséré tel quel peut modifier
// le sens de la requête. On neutralise ces caractères avant usage.
// ============================================================

/** Retire les caractères de grammaire de filtre et borne la longueur. */
export function sanitizeFilterTerm(value: string, maxLength = 120): string {
  return value
    .replace(/[,()"'*\\%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Neutralise les formules dans une cellule exportée (CSV / tableur). */
export function neutralizeSpreadsheetCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** Échappe le texte destiné à une chaîne HTML construite à la main. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
