// Logique PURE de l'audit des combinaisons par ville (aucun appel réseau, aucune écriture).
// Les chiffres viennent exclusivement de seo_control_center() (même logique que le Générateur).

export type AuditRow = {
  slug: string; name: string;
  planned: number; generated: number; published: number;
  drafts: number; remaining: number; errors: number; pending: number;
};

export type AuditStatus = "complete" | "incomplete" | "none" | "error" | "check";

export const AUDIT_STATUS_LABEL: Record<AuditStatus, string> = {
  complete: "COMPLÈTE",
  incomplete: "INCOMPLÈTE",
  none: "AUCUNE PAGE",
  error: "ERREUR",
  check: "À VÉRIFIER",
};

/** Statut d'une ville, déduit uniquement des chiffres réels de la base. */
export function auditStatus(c: AuditRow): AuditStatus {
  // Incohérence entre les sources : plus de pages générées que de combinaisons prévues,
  // ou des totaux qui ne s'additionnent pas.
  if (c.planned < 0 || c.generated > c.planned) return "check";
  if (c.generated !== c.published + c.drafts) return "check";
  if (c.generated + c.remaining !== c.planned) return "check";
  if (c.errors > 0) return "error";
  if (c.generated === 0) return c.planned === 0 ? "check" : "none";
  if (c.remaining > 0) return "incomplete";
  return "complete";
}

export type AuditSortKey = "missing" | "generated" | "errors" | "name" | "completeness";

export function completeness(c: AuditRow): number {
  return c.planned > 0 ? c.generated / c.planned : 0;
}

export function sortAuditRows<T extends AuditRow>(rows: T[], key: AuditSortKey): T[] {
  const out = [...rows];
  switch (key) {
    case "missing": out.sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name, "fr-CA")); break;
    case "generated": out.sort((a, b) => a.generated - b.generated || a.name.localeCompare(b.name, "fr-CA")); break;
    case "errors": out.sort((a, b) => b.errors - a.errors || a.name.localeCompare(b.name, "fr-CA")); break;
    case "name": out.sort((a, b) => a.name.localeCompare(b.name, "fr-CA")); break;
    case "completeness": out.sort((a, b) => completeness(a) - completeness(b) || a.name.localeCompare(b.name, "fr-CA")); break;
  }
  return out;
}

export type AuditSummary = { total: number; complete: number; incomplete: number; none: number; errors: number; check: number };

export function summarize(rows: AuditRow[]): AuditSummary {
  const acc: AuditSummary = { total: rows.length, complete: 0, incomplete: 0, none: 0, errors: 0, check: 0 };
  for (const r of rows) {
    const s = auditStatus(r);
    if (s === "complete") acc.complete++;
    else if (s === "incomplete") acc.incomplete++;
    else if (s === "none") acc.none++;
    else if (s === "error") acc.errors++;
    else acc.check++;
  }
  return acc;
}
