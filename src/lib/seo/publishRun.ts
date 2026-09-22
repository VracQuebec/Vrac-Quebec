// Publication par lots des pages SEO déjà validées « prêtes à publier ».
// Module PUR : aucune écriture, aucun appel réseau. Il décide seulement
// quelles pages sont publiables et comment découper/compter les lots.
// Aucune page n'est créée, supprimée, régénérée ni modifiée dans son contenu.

import { classifyDraft, type DraftPage } from "@/lib/seo/draftAudit";
import { runQaControl, type QaControlPage } from "@/lib/seo/qaControl";

/** Taille de lot sécurisée : jamais toutes les pages en une seule requête. */
export const PUBLISH_BATCH_SIZE = 25;

export type PublishRow = DraftPage & QaControlPage & { id?: string };

export type PublishCandidate = {
  id: string;
  slug: string;
  city_slug: string;
  topic: string;
};

/** Raison pour laquelle une page n'est pas (ou plus) publiable. */
export type SkipReason = "already_published" | "status_changed" | "has_error" | "not_ready";

export const SKIP_LABEL: Record<SkipReason, string> = {
  already_published: "Déjà publiée",
  status_changed: "Statut changé",
  has_error: "Erreur détectée",
  not_ready: "Plus prête à publier",
};

/**
 * Une page est publiable uniquement si elle est encore en brouillon, non verrouillée,
 * sans erreur, et si le contrôle qualité la déclare « prête » (verdict ready).
 */
export function isPublishable(page: PublishRow, duplicateTitle = false): boolean {
  if (page.status !== "draft") return false;
  if (page.priority_locked) return false;
  const cls = classifyDraft(page);
  // Un qa_blocker enregistré lors d'un ancien contrôle est historique : le contrôle
  // complet ci-dessous tranche toujours sur l'état actuel. Les erreurs de traitement,
  // les pages incomplètes, anciennes ou volontairement retenues restent exclues.
  const hasProcessingError = page.proc_status === "error" || (page.proc_error ?? "") !== "";
  if (hasProcessingError || cls === "incomplete" || cls === "legacy" || cls === "held") return false;
  return runQaControl(page, { duplicateTitle }).verdict === "ready";
}

export function selectPublishable(pages: PublishRow[], duplicates: Set<string> = new Set()): PublishCandidate[] {
  return pages
    .filter((p) => p.id && isPublishable(p, duplicates.has((p.meta_title ?? "").trim())))
    .map((p) => ({
      id: p.id as string,
      slug: p.slug,
      city_slug: p.city_slug,
      topic: p.material_slug ?? p.service_slug ?? "hub",
    }));
}

/** Vérification juste avant écriture : protège contre les doublons et les états changés. */
export function decideForPage(fresh: PublishRow | null | undefined, duplicateTitle = false): "publish" | SkipReason {
  if (!fresh) return "status_changed";
  if (fresh.status === "published") return "already_published";
  if (fresh.status !== "draft") return "status_changed";
  if (fresh.proc_status === "error" || (fresh.proc_error ?? "") !== "") return "has_error";
  if (!isPublishable(fresh, duplicateTitle)) return "not_ready";
  return "publish";
}

export function chunk<T>(items: T[], size: number = PUBLISH_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) out.push(items.slice(i, i + Math.max(1, size)));
  return out;
}

export type PublishTally = {
  published: number;
  alreadyPublished: number;
  skipped: number;
  failed: number;
  processed: number;
};

export const EMPTY_TALLY: PublishTally = {
  published: 0, alreadyPublished: 0, skipped: 0, failed: 0, processed: 0,
};

export type PublishOutcome = "published" | SkipReason | "failed";

export function applyOutcome(t: PublishTally, outcome: PublishOutcome): PublishTally {
  const next = { ...t, processed: t.processed + 1 };
  if (outcome === "published") next.published++;
  else if (outcome === "already_published") next.alreadyPublished++;
  else if (outcome === "failed") next.failed++;
  else next.skipped++;
  return next;
}

export function progressPct(t: PublishTally, total: number): number {
  return total > 0 ? Math.min(100, Math.round((t.processed / total) * 100)) : 0;
}

export function batchNumber(t: PublishTally, size: number = PUBLISH_BATCH_SIZE): number {
  return Math.floor(t.processed / Math.max(1, size)) + 1;
}

export function batchCount(total: number, size: number = PUBLISH_BATCH_SIZE): number {
  return Math.ceil(total / Math.max(1, size));
}

/** Durée écoulée, format court « 2 min 15 s ». */
export function elapsedLabel(startedAt: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - startedAt) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

const nf = (n: number) => n.toLocaleString("fr-CA");

/** Lignes de la fenêtre de confirmation, uniquement à partir des chiffres réels. */
export function confirmationLines(o: {
  ready: number; alreadyPublished: number; excluded: number; errors: number; toCheck: number;
}): string[] {
  return [
    `Vous êtes sur le point de publier ${nf(o.ready)} page(s) SEO actuellement validée(s) et prête(s) à publier.`,
    `Pages déjà publiées (non touchées) : ${nf(o.alreadyPublished)}`,
    `Pages exclues de cette publication : ${nf(o.excluded)}`,
    `Pages avec erreur : ${nf(o.errors)}`,
    `Pages à vérifier : ${nf(o.toCheck)}`,
    `Publication par lots de ${PUBLISH_BATCH_SIZE} pages, avec vérification du statut réel avant chaque page.`,
  ];
}

/** Rapport final. `remaining` doit venir d'une relecture de la base, jamais d'une soustraction. */
export function finalReport(t: PublishTally, remaining: number): string[] {
  return [
    `${nf(t.published)} page(s) publiée(s)`,
    `${nf(t.alreadyPublished)} déjà publiée(s)`,
    `${nf(t.skipped)} ignorée(s)`,
    `${nf(t.failed)} échec(s)`,
    `${nf(remaining)} restante(s) à publier`,
  ];
}

export function successSentence(t: PublishTally, remaining: number): string | null {
  return t.failed === 0 && remaining === 0 ? "Toutes les pages prêtes ont été publiées avec succès." : null;
}
