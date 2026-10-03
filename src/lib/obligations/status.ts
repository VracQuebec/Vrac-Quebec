// Statut affiché d'une obligation (pur, testable). Toujours couleur + texte.
export type OblStatus = "a_confirmer" | "a_venir" | "proche" | "depassee" | "realisee" | "desactivee" | "non_applicable";
export type OblLike = { status: string; applicability: string; due_date: string | null; due_source: string | null; due_confirmed: boolean };

export const NEAR_DAYS = 30;

/** Date du jour à Toronto, AAAA-MM-JJ. */
export function torontoToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function daysLeft(due: string | null, today: string): number | null {
  if (!due) return null;
  return Math.round((Date.parse(due + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
}

export function oblStatus(o: OblLike, today: string): OblStatus {
  if (o.status === "desactive") return "desactivee";
  if (o.applicability === "non_applicable") return "non_applicable";
  if (o.status === "realise") return "realisee";
  if (o.applicability === "a_confirmer" || !o.due_date || !o.due_confirmed) return "a_confirmer";
  const d = daysLeft(o.due_date, today)!;
  if (d < 0) return "depassee";
  if (d <= NEAR_DAYS) return "proche";
  return "a_venir";
}

export const STATUS_UI: Record<OblStatus, { label: string; cls: string }> = {
  a_confirmer: { label: "Informations à confirmer", cls: "bg-muted text-muted-foreground border-border" },
  a_venir: { label: "À venir", cls: "bg-sky-500/15 text-sky-800 border-sky-500/40 dark:text-sky-300" },
  proche: { label: "Échéance proche", cls: "bg-orange-500/15 text-orange-800 border-orange-500/40 dark:text-orange-300" },
  depassee: { label: "Échéance dépassée selon la date enregistrée", cls: "bg-destructive/15 text-destructive border-destructive/40" },
  realisee: { label: "Réalisation déclarée par l'entreprise", cls: "bg-emerald-500/15 text-emerald-800 border-emerald-500/40 dark:text-emerald-300" },
  desactivee: { label: "Suivi désactivé", cls: "bg-muted text-muted-foreground border-border" },
  non_applicable: { label: "Non applicable", cls: "bg-muted text-muted-foreground border-border" },
};

export const OFFICIAL_LINKS: Record<string, { label: string; url: string }> = {
  req: { label: "Déclaration annuelle au Registre des entreprises", url: "https://www.quebec.ca/entreprises-et-travailleurs-autonomes/mettre-a-jour-informations/declaration-mise-a-jour/annuelle" },
  rpevl: { label: "Mise à jour annuelle au RPEVL", url: "https://www.ctq.gouv.qc.ca/securite-routiere/proprietaires-et-exploitants-de-vehicules-lourds/mise-a-jour-de-linscription/" },
  rcv: { label: "Registre du camionnage en vrac", url: "https://www.ctq.gouv.qc.ca/permis-et-autorisations-de-transport/camionnage-en-vrac/" },
};

export function linkFor(kind: string) {
  if (kind.startsWith("req_")) return OFFICIAL_LINKS.req;
  if (kind.startsWith("rpevl")) return OFFICIAL_LINKS.rpevl;
  if (kind === "rcv_droits") return OFFICIAL_LINKS.rcv;
  return null;
}

export const STEP_LABEL = (s: string) =>
  s.startsWith("retard_s") ? `Échéance dépassée depuis ${s.slice(8)} semaine(s)`
  : ({ m3: "Dans 3 mois", m2: "Dans 2 mois", m1: "Dans 1 mois", j21: "Dans 21 jours", j14: "Dans 14 jours", j7: "Dans 7 jours", j1: "Demain", j0: "Aujourd'hui" } as Record<string, string>)[s] ?? "Rappel";
