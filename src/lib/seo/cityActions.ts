// Lecture des problèmes d'une ville pour les actions du gestionnaire SEO.
// Aucune règle de publication ni de génération n'est définie ici : on classe
// seulement ce que le serveur signale déjà, pour expliquer les boutons.

export const NOINDEX_ISSUE = "Publiée mais noindex";

type Problem = { city_slug: string; gen_state: string; issues: string[] | null };

/** Une page publiée volontairement non indexée n'est pas un échec de génération. */
export function isNoindexOnly(p: Problem): boolean {
  return p.gen_state === "invalid" && !!p.issues?.length && p.issues.every((i) => i === NOINDEX_ISSUE);
}

export function cityProblemSplit(problems: Problem[], citySlug: string) {
  const rows = problems.filter((p) => p.city_slug === citySlug && (p.gen_state === "error" || p.gen_state === "invalid"));
  const noindex = rows.filter(isNoindexOnly).length;
  return { realErrors: rows.length - noindex, noindex };
}

export function retryDisabledReason(realErrors: number, noindex: number): string | null {
  if (realErrors > 0) return null;
  if (noindex > 0) return "Aucune erreur à régénérer — page(s) publiée(s) non indexée(s) volontairement; régénérer ne changerait rien.";
  return "Aucune erreur de génération ni de qualité dans cette ville.";
}

export function publishDisabledReason(c: { unpublished: number; drafts: number }): string | null {
  if (c.unpublished > 0) return null;
  if (c.drafts > 0) return "Les brouillons de cette ville ne passent pas les contrôles de qualité — corriger ou régénérer avant publication.";
  return "Aucun brouillon dans la file du générateur pour cette ville.";
}

export function publishResultMessage(r: { published?: number; skipped_invalid?: number } | null): string {
  const pub = r?.published ?? 0;
  const skip = r?.skipped_invalid ?? 0;
  return `${pub} page(s) publiée(s), ${skip} ignorée(s) (contrôle qualité non réussi).`;
}

export function repairResultMessage(r: { queued?: number; done?: boolean; message?: string; skipped_published?: number } | null): string {
  const q = r?.queued ?? 0;
  const prot = r?.skipped_published ?? 0;
  const tail = prot > 0 ? ` ${prot} page(s) en ligne protégée(s) — non remplacée(s) sans validation.` : "";
  if (q === 0) return (r?.message ?? "Aucune page à régénérer.");
  return (r?.done ? `${q} page(s) traitée(s) en brouillon.` : `${q} page(s) en cours de traitement (brouillon) — résultat dans les logs.`) + tail;
}
