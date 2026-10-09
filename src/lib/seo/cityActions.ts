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

// ── Plan d'action d'une ville : une seule règle pour toutes les municipalités ──
// Entrée = emplacements signalés par le serveur (seo_control_center.problems) +
// pages publiées connues. Sortie = compteurs et état de chaque bouton avec sa raison.

export type PlanProblem = Problem & {
  kind: string; material_slug: string | null; service_slug: string | null;
  task_status?: string | null; task_updated_at?: string | null;
};

export const slotKey = (kind: string, material: string | null | undefined, service: string | null | undefined) =>
  `${kind}|${material ?? ""}|${service ?? ""}`;

/** Une tâche en file sans mouvement depuis ce délai, sans exécution active, est considérée interrompue. */
export const STALE_PENDING_MS = 15 * 60 * 1000;

export type CityPlanInput = {
  slug: string;
  unpublished: number;
  drafts: number;
  problems: PlanProblem[];
  /** Clés slotKey des pages actuellement publiées dans cette ville. */
  publishedKeys: Set<string>;
  runningHere: boolean;
  lockedByOther: boolean;
  globalRunActive: boolean;
  hasGenRow: boolean;
  now?: number;
};

export type ButtonState = { enabled: boolean; count: number; reason: string | null };

export function cityPlan(i: CityPlanInput) {
  const now = i.now ?? Date.now();
  const rows = i.problems.filter((p) => p.city_slug === i.slug);
  const missing = rows.filter((p) => p.gen_state === "missing").length;
  const failed = rows.filter((p) => p.gen_state === "error").length;
  const pendingRows = rows.filter((p) => p.gen_state === "pending");
  const stalled = pendingRows.filter((p) =>
    !i.globalRunActive && !i.runningHere &&
    (!p.task_updated_at || now - new Date(p.task_updated_at).getTime() > STALE_PENDING_MS)).length;
  const pending = pendingRows.length - stalled;
  const invalid = rows.filter((p) => p.gen_state === "invalid" && !isNoindexOnly(p));
  const invalidPublished = invalid.filter((p) => i.publishedKeys.has(slotKey(p.kind, p.material_slug, p.service_slug))).length;
  const invalidDrafts = invalid.length - invalidPublished;
  const noindex = rows.filter(isNoindexOnly).length;

  const lock = i.runningHere ? "Génération en cours pour cette ville."
    : i.lockedByOther ? "Une autre ville est en cours de génération — une seule ville à la fois."
    : !i.hasGenRow ? "Ville absente du registre du générateur (municipalité inactive ou non rattachée)."
    : null;

  const genCount = missing + failed + stalled;
  const generate: ButtonState = { count: genCount, enabled: false, reason: null };
  generate.reason = lock ?? (genCount > 0 ? null
    : pending > 0 ? `${pending} page(s) déjà en file du pipeline global — attendre la fin ou arrêter le pipeline.`
    : "Toutes les pages prévues existent déjà (aucune page manquante, aucun échec de création).");
  generate.enabled = generate.reason === null;

  const retry: ButtonState = { count: invalidDrafts, enabled: false, reason: null };
  retry.reason = lock ?? (invalidDrafts > 0 ? null
    : invalidPublished > 0 ? `${invalidPublished} page(s) en ligne à corriger : protégées, leur remplacement exige votre approbation page par page.`
    : retryDisabledReason(0, noindex));
  retry.enabled = retry.reason === null;

  const publish: ButtonState = { count: i.unpublished, enabled: false, reason: null };
  publish.reason = publishDisabledReason({ unpublished: i.unpublished, drafts: i.drafts });
  publish.enabled = publish.reason === null;

  return { missing, failed, pending, stalled, invalidDrafts, invalidPublished, noindex, generate, retry, publish };
}

/** Cibles de génération d'une ville : manquantes, échouées et (si autorisé) interrompues — sans doublon. */
export function generationTargets<T extends { state: string; kind: string; material_slug: string | null; service_slug: string | null }>(
  slots: T[], includeStalled: boolean,
): T[] {
  const seen = new Set<string>();
  return slots.filter((s) => {
    if (!(s.state === "missing" || s.state === "error" || (includeStalled && s.state === "pending"))) return false;
    const k = slotKey(s.kind, s.material_slug, s.service_slug);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}
