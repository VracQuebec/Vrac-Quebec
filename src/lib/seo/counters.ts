import { natureOfType } from "@/lib/seo/workflow";
import type { ActionGroup } from "@/lib/seo/actionGroups";

export type CopilotCounters = {
  signals: number;
  /** open + in_progress (compatibilité historique) */
  opportunitiesOpen: number;
  /** open + in_progress + error : tout ce qui reste à traiter */
  opportunitiesActive: number;
  opportunitiesTotal: number;
  opportunitiesVisible: number;
  hiddenByFilter: number;
  hiddenByLimit: number;
  actionsUnique: number;
  actionsGrouped: number;
  actionsCompleted: number;
  verifications: number;
  executable: number;
  errors: number;
  dismissed: number;
  resolved: number;
  stale: number;
  /** signaux conservés dans les actions regroupées (membres au-delà du premier) */
  signalsGrouped: number;
};

export type CounterSource = { key: string; label: string; value: number; source: string };

/**
 * Compteurs explicites : chaque nombre affiché doit être traçable jusqu'à une requête en base.
 * Aucune opportunité n'est supprimée : les écarts sont toujours explicables.
 */
export function buildCopilotCounters(args: {
  signalsDetected: number | null | undefined;
  openCount: number;
  inProgressCount: number;
  completedCount: number;
  totalLoaded: number;
  filteredCount: number;
  groups: ActionGroup[];
  errorCount?: number;
  dismissedCount?: number;
  resolvedCount?: number;
  appliedCount?: number;
  staleCount?: number;
  totalCount?: number;
}): CopilotCounters {
  const opportunitiesOpen = args.openCount + args.inProgressCount;
  const errors = args.errorCount ?? 0;
  const resolved = (args.resolvedCount ?? 0) + (args.appliedCount ?? 0);
  const verifications = args.groups.filter((g) => natureOfType(g.primary.type) === "verification").length;
  const signalsGrouped = args.groups.reduce((n, g) => n + Math.max(0, g.members.length - 1), 0);
  return {
    signals: args.signalsDetected ?? 0,
    opportunitiesOpen,
    opportunitiesActive: opportunitiesOpen + errors,
    opportunitiesTotal: args.totalCount ?? 0,
    opportunitiesVisible: args.filteredCount,
    hiddenByFilter: Math.max(0, args.totalLoaded - args.filteredCount),
    hiddenByLimit: Math.max(0, opportunitiesOpen + errors - args.totalLoaded),
    actionsUnique: args.groups.length,
    actionsGrouped: args.groups.filter((g) => g.members.length > 1).length,
    actionsCompleted: args.completedCount,
    verifications,
    executable: args.groups.length - verifications,
    errors,
    dismissed: args.dismissedCount ?? 0,
    resolved,
    stale: args.staleCount ?? 0,
    signalsGrouped,
  };
}

/** Source exacte de chaque compteur affiché (pour « Comprendre les compteurs »). */
export function counterSources(c: CopilotCounters): CounterSource[] {
  return [
    { key: "signals", label: "Signaux", value: c.signals, source: "seo_opportunity_runs.signals_detected de la dernière analyse" },
    { key: "total", label: "Opportunités (toutes)", value: c.opportunitiesTotal, source: "count(*) sur seo_opportunities, tous statuts confondus" },
    { key: "active", label: "Opportunités actives", value: c.opportunitiesActive, source: "statut open + in_progress + error" },
    { key: "open", label: "Opportunités ouvertes", value: c.opportunitiesOpen, source: "statut open + in_progress" },
    { key: "visible", label: "Affichées ici", value: c.opportunitiesVisible, source: "opportunités chargées après application du filtre courant" },
    { key: "errors", label: "En erreur (à réessayer)", value: c.errors, source: "statut error" },
    { key: "resolved", label: "Résolues", value: c.resolved, source: "statut resolved + applied (historique conservé)" },
    { key: "completed", label: "Terminées", value: c.actionsCompleted, source: "statut completed" },
    { key: "dismissed", label: "Ignorées", value: c.dismissed, source: "statut dismissed, avec la raison saisie" },
    { key: "stale", label: "Obsolètes", value: c.stale, source: "statut stale : signal disparu lors d'une analyse ultérieure, conservé en historique" },
    { key: "actionsUnique", label: "Actions distinctes", value: c.actionsUnique, source: "regroupement des opportunités affichées par action réelle" },
    { key: "actionsGrouped", label: "Actions regroupées", value: c.actionsGrouped, source: "actions distinctes contenant plus d'un signal" },
    { key: "signalsGrouped", label: "Signaux regroupés", value: c.signalsGrouped, source: "signaux conservés dans le détail des actions regroupées" },
    { key: "executable", label: "Actions exécutables", value: c.executable, source: "actions distinctes moins les vérifications" },
    { key: "verifications", label: "Vérifications", value: c.verifications, source: "actions dont le type est indexation, QA technique ou cannibalisation" },
  ];
}

export function countersExplanation(c: CopilotCounters): string[] {
  const out: string[] = [
    `${c.signals} signal(s) détecté(s) lors de la dernière analyse.`,
    `${c.opportunitiesOpen} opportunité(s) ouverte(s) dans le moteur (ouvertes + en cours).`,
    `${c.opportunitiesVisible} opportunité(s) affichée(s) dans la vue actuelle.`,
  ];
  if (c.errors > 0) out.push(`${c.errors} opportunité(s) en erreur, affichée(s) avec l'état « À réessayer ».`);
  if (c.hiddenByFilter > 0) out.push(`${c.hiddenByFilter} opportunité(s) masquée(s) par le filtre actif.`);
  if (c.hiddenByLimit > 0) out.push(`${c.hiddenByLimit} opportunité(s) non chargée(s) : le moteur en renvoie au maximum 200 par analyse.`);
  out.push(`${c.actionsUnique} action(s) distincte(s) après regroupement, dont ${c.actionsGrouped} qui regroupent plusieurs signaux (${c.signalsGrouped} signal(aux) supplémentaire(s) conservé(s) dans le détail).`);
  out.push(`${c.executable} action(s) exécutable(s) et ${c.verifications} vérification(s) de diagnostic.`);
  out.push(`${c.actionsCompleted} opportunité(s) terminée(s), ${c.resolved} résolue(s), ${c.dismissed} ignorée(s), ${c.stale} obsolète(s) — toutes conservées en base.`);
  if (c.opportunitiesTotal > 0) {
    out.push(`Total en base : ${c.opportunitiesTotal} opportunité(s). Aucune n'est jamais supprimée : chaque écart avec les ${c.opportunitiesVisible} affichées s'explique par un statut ou un filtre.`);
  }
  return out;
}

export type HiddenOpportunity = {
  id: string;
  type: string | null;
  title: string | null;
  status: string;
  priority?: string | null;
  score?: number | null;
  page_id?: string | null;
  dismiss_reason?: string | null;
  last_error?: string | null;
};

export type HiddenReason = HiddenOpportunity & { reason: string; filter: string };

const HIDDEN_REASON: Record<string, { reason: string; filter: string }> = {
  completed: { reason: "Action exécutée et marquée terminée — conservée dans l'historique.", filter: "statut = completed" },
  applied: { reason: "Modification appliquée par une version antérieure du workflow — conservée en historique.", filter: "statut = applied" },
  resolved: { reason: "Signal disparu lors d'une analyse ultérieure — résolue.", filter: "statut = resolved" },
  dismissed: { reason: "Ignorée volontairement par un administrateur.", filter: "statut = dismissed" },
  stale: { reason: "Signal absent de la dernière analyse — conservée en historique.", filter: "statut = stale" },
};

/** Explique, opportunité par opportunité, pourquoi elle n'apparaît pas dans la vue active. */
export function explainHidden(rows: HiddenOpportunity[]): HiddenReason[] {
  return rows.map((r) => {
    const info = HIDDEN_REASON[r.status] ?? {
      reason: `Statut « ${r.status} » hors de la vue active (open, en cours, erreur).`,
      filter: `statut = ${r.status}`,
    };
    return { ...r, ...info };
  });
}
