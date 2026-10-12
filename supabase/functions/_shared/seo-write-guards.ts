// Gardes d'écriture SEO partagées (pilote de génération + correction automatique).
// Fonctions pures ou à dépendances injectées : testables sans base ni IA.

/** Le pilote ne publie jamais lui-même : publication = action validée du tableau de bord. */
export const PIPELINE_PUBLISH_REFUSED =
  "Publication refusée par le pilote : utilisez « Publier » du tableau de bord (contrôles de qualité, disponibilité, noindex volontaire et confirmation explicite).";

export function pipelinePublishRefusal(kind: string | null | undefined): string | null {
  return kind === "publish" ? PIPELINE_PUBLISH_REFUSED : null;
}

export type AutofixAuth =
  | { ok: true }
  | { ok: false; status: number; code: string; error: string };

/** Une page en ligne n'est corrigée que si l'admin a autorisé CETTE page explicitement. */
export function autofixAuthorization(input: {
  pageId: string;
  status: string | null | undefined;
  confirmPublishedPageId?: string | null;
}): AutofixAuth {
  if (input.status === "published" && input.confirmPublishedPageId !== input.pageId) {
    return {
      ok: false,
      status: 409,
      code: "published_confirmation_required",
      error: "Page en ligne : correction refusée sans autorisation explicite pour cette page. Rien n'a été modifié.",
    };
  }
  return { ok: true };
}

export type GuardedDeps = {
  /** Insère la sauvegarde complète (non appliquée). Retourne son id ou null en cas d'échec. */
  insertBackup: (before: Record<string, unknown>) => Promise<string | null>;
  /** Met à jour seulement si updated_at est inchangé. Retourne le nombre de lignes modifiées (ou -1 si erreur). */
  conditionalUpdate: (expectedUpdatedAt: string) => Promise<number>;
  /** Marque la sauvegarde comme appliquée, ou note l'abandon. */
  finalizeBackup: (id: string, applied: boolean, note: string) => Promise<void>;
};

export type GuardedResult =
  | { ok: true; backupId: string }
  | { ok: false; status: number; code: string; error: string };

/**
 * Ordre imposé : sauvegarde complète → remplacement conditionnel → confirmation.
 * Si la sauvegarde échoue ou si la page a changé depuis la lecture : rien n'est modifié.
 */
export async function guardedReplace(
  fullBefore: Record<string, unknown> | null,
  deps: GuardedDeps,
): Promise<GuardedResult> {
  const readAt = fullBefore?.updated_at;
  if (!fullBefore || typeof readAt !== "string" || !readAt) {
    return { ok: false, status: 409, code: "no_read_state", error: "Lecture initiale incomplète : rien n'a été modifié." };
  }
  let backupId: string | null = null;
  try { backupId = await deps.insertBackup(fullBefore); } catch { backupId = null; }
  if (!backupId) {
    return { ok: false, status: 500, code: "backup_failed", error: "Sauvegarde impossible : rien n'a été modifié." };
  }
  let rows = -1;
  try { rows = await deps.conditionalUpdate(readAt); } catch { rows = -1; }
  if (rows !== 1) {
    const changed = rows === 0;
    await deps.finalizeBackup(backupId, false, changed
      ? "Annulé : la page a changé depuis sa lecture."
      : "Annulé : erreur au remplacement.").catch(() => {});
    return changed
      ? { ok: false, status: 409, code: "page_changed", error: "La page a changé depuis sa lecture : rien n'a été modifié." }
      : { ok: false, status: 500, code: "update_failed", error: "Remplacement refusé par la base : rien n'a été modifié." };
  }
  await deps.finalizeBackup(backupId, true, "").catch(() => {});
  return { ok: true, backupId };
}
