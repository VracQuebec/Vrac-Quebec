// Génération globale des pages SEO manquantes.
// Module PUR : aucun appel réseau, aucune écriture. Il ne fait qu'interpréter
// les chiffres réels renvoyés par la base (seo_pipeline_missing_preview) et
// l'état du moteur existant (seo_pipeline_runs). La logique de pertinence
// reste entièrement côté base (seo_city_slots_expected).

export type MissingPreview = {
  cities_total: number;
  cities_with_missing: number;
  remaining: number;
  pending: number;
  generated: number;
  published: number;
  drafts: number;
  errors: number;
  active_run_id: string | null;
  computed_at?: string;
};

export type GlobalRun = {
  id: string;
  status: string;
  total_pages: number;
  done_pages: number;
  succeeded_pages: number;
  failed_pages: number;
  current_city_slug: string | null;
} | null;

export const EMPTY_PREVIEW: MissingPreview = {
  cities_total: 0, cities_with_missing: 0, remaining: 0, pending: 0,
  generated: 0, published: 0, drafts: 0, errors: 0, active_run_id: null,
};

export function normalizePreview(raw: unknown): MissingPreview {
  const r = (raw ?? {}) as Record<string, unknown>;
  const n = (k: string) => {
    const v = Number(r[k]);
    return Number.isFinite(v) ? v : 0;
  };
  return {
    cities_total: n("cities_total"),
    cities_with_missing: n("cities_with_missing"),
    remaining: n("remaining"),
    pending: n("pending"),
    generated: n("generated"),
    published: n("published"),
    drafts: n("drafts"),
    errors: n("errors"),
    active_run_id: typeof r.active_run_id === "string" ? r.active_run_id : null,
    computed_at: typeof r.computed_at === "string" ? r.computed_at : undefined,
  };
}

const nf = (n: number) => n.toLocaleString("fr-CA");

/** Un lancement global est possible seulement s'il reste des pages pertinentes et qu'aucun run n'est actif. */
export function canStartGlobal(preview: MissingPreview, run: GlobalRun): { allowed: boolean; reason: string } {
  if (run && ["queued", "running", "paused"].includes(run.status)) {
    return { allowed: false, reason: "Une génération est déjà en cours." };
  }
  if (preview.remaining <= 0) {
    return { allowed: false, reason: "Aucune page pertinente à générer." };
  }
  return { allowed: true, reason: "" };
}

/** Texte de confirmation, uniquement à partir des chiffres réels de la base. */
export function confirmationLines(preview: MissingPreview): string[] {
  return [
    `${nf(preview.remaining)} page(s) pertinente(s) restent à générer dans ${nf(preview.cities_with_missing)} ville(s) (sur ${nf(preview.cities_total)} villes actives).`,
    `${nf(preview.generated)} page(s) sont déjà générées.`,
    `${nf(preview.published)} sont publiées.`,
    `${nf(preview.drafts)} sont en brouillon.`,
    `${nf(preview.errors)} sont en erreur.`,
    "Les pages existantes ne seront pas recréées.",
    "Les nouvelles pages seront créées en brouillon et ne seront pas publiées automatiquement.",
  ];
}

export type GlobalPhase = "idle" | "running" | "paused" | "interrupted" | "completed";

export function globalPhase(run: GlobalRun): GlobalPhase {
  if (!run) return "idle";
  if (run.status === "running" || run.status === "queued") return "running";
  if (run.status === "paused") return "paused";
  if (["stopped", "cancelled", "failed"].includes(run.status)) return "interrupted";
  return "completed";
}

export const PHASE_LABEL: Record<GlobalPhase, string> = {
  idle: "Aucune génération en cours",
  running: "Génération en cours",
  paused: "Génération en pause — reprendre",
  interrupted: "Génération interrompue — reprendre",
  completed: "Génération terminée",
};

export type RunProgress = {
  done: number; total: number; pct: number;
  succeeded: number; failed: number; remaining: number; inFlight: number;
};

export function runProgress(run: GlobalRun): RunProgress {
  if (!run) return { done: 0, total: 0, pct: 0, succeeded: 0, failed: 0, remaining: 0, inFlight: 0 };
  const total = Math.max(0, run.total_pages ?? 0);
  const done = Math.min(total, Math.max(0, run.done_pages ?? 0));
  const succeeded = Math.max(0, run.succeeded_pages ?? 0);
  const failed = Math.max(0, run.failed_pages ?? 0);
  return {
    done, total,
    pct: total > 0 ? Math.round((done / total) * 100) : 0,
    succeeded, failed,
    remaining: Math.max(0, total - done),
    inFlight: globalPhase(run) === "running" ? Math.max(0, Math.min(1, total - done)) : 0,
  };
}

/** Résumé final, comparé à l'état mesuré avant le lancement. */
export function finalSummary(before: MissingPreview, after: MissingPreview, run: GlobalRun): string[] {
  const p = runProgress(run);
  const created = Math.max(0, after.generated - before.generated);
  return [
    `Pages générées : ${nf(created)}`,
    `Pages déjà existantes ignorées : ${nf(before.generated)}`,
    `Pages déjà publiées protégées : ${nf(before.published)}`,
    `Pages en brouillon conservées : ${nf(before.drafts)}`,
    `Pages en erreur : ${nf(p.failed)}`,
    `Pages restantes : ${nf(after.remaining)}`,
  ];
}

export function failureNotice(run: GlobalRun): string | null {
  const p = runProgress(run);
  return p.failed > 0 ? `${nf(p.failed)} page(s) n'ont pas pu être générées.` : null;
}

export function shouldOfferRetry(run: GlobalRun, preview: MissingPreview): boolean {
  return runProgress(run).failed > 0 || preview.errors > 0;
}

/** Statut affiché par ville dans « État des villes ». */
export type CityLike = { generated: number; planned: number; errors: number; remaining: number };

export function cityStatus(c: CityLike, isRunning: boolean): "running" | "errors" | "done" | "partial" | "waiting" {
  if (isRunning) return "running";
  if (c.errors > 0) return "errors";
  if (c.planned > 0 && c.remaining === 0) return "done";
  if (c.generated > 0) return "partial";
  return "waiting";
}
