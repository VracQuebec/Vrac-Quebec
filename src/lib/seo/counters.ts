import { natureOfType } from "@/lib/seo/workflow";
import type { ActionGroup } from "@/lib/seo/actionGroups";

export type CopilotCounters = {
  signals: number;
  opportunitiesOpen: number;
  opportunitiesVisible: number;
  hiddenByFilter: number;
  hiddenByLimit: number;
  actionsUnique: number;
  actionsGrouped: number;
  actionsCompleted: number;
  verifications: number;
  executable: number;
};

/**
 * Compteurs explicites : chaque nombre affiché doit être traçable.
 * `total` = opportunités ouvertes retournées par le moteur ; `visible` = après filtre.
 */
export function buildCopilotCounters(args: {
  signalsDetected: number | null | undefined;
  openCount: number;
  inProgressCount: number;
  completedCount: number;
  totalLoaded: number;
  filteredCount: number;
  groups: ActionGroup[];
}): CopilotCounters {
  const opportunitiesOpen = args.openCount + args.inProgressCount;
  const verifications = args.groups.filter((g) => natureOfType(g.primary.type) === "verification").length;
  return {
    signals: args.signalsDetected ?? 0,
    opportunitiesOpen,
    opportunitiesVisible: args.filteredCount,
    hiddenByFilter: Math.max(0, args.totalLoaded - args.filteredCount),
    hiddenByLimit: Math.max(0, opportunitiesOpen - args.totalLoaded),
    actionsUnique: args.groups.length,
    actionsGrouped: args.groups.filter((g) => g.members.length > 1).length,
    actionsCompleted: args.completedCount,
    verifications,
    executable: args.groups.length - verifications,
  };
}

export function countersExplanation(c: CopilotCounters): string[] {
  const out: string[] = [
    `${c.signals} signal(s) détecté(s) lors de la dernière analyse.`,
    `${c.opportunitiesOpen} opportunité(s) ouverte(s) dans le moteur (ouvertes + en cours).`,
    `${c.opportunitiesVisible} opportunité(s) affichée(s) dans la vue actuelle.`,
  ];
  if (c.hiddenByFilter > 0) out.push(`${c.hiddenByFilter} opportunité(s) masquée(s) par le filtre actif.`);
  if (c.hiddenByLimit > 0) out.push(`${c.hiddenByLimit} opportunité(s) non chargée(s) : le moteur en renvoie au maximum 200 par analyse.`);
  out.push(`${c.actionsUnique} action(s) distincte(s) après regroupement, dont ${c.actionsGrouped} qui regroupent plusieurs signaux.`);
  out.push(`${c.executable} action(s) exécutable(s) et ${c.verifications} vérification(s) de diagnostic.`);
  out.push(`${c.actionsCompleted} opportunité(s) terminée(s) au total (conservées dans l'historique).`);
  return out;
}
