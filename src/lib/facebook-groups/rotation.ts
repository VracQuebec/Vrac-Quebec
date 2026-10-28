// Logique de rotation « Prochains groupes » — fonctions pures, testables.
// Règles du mandat :
// - d'abord les groupes éligibles jamais tentés dans la campagne et le cycle courants ;
// - ensuite ceux dont la dernière tentative est la plus ancienne ;
// - les groupes avec une soumission encore en attente sont retirés de la file ;
// - la règle d'intervalle du groupe prévaut sur celle de la campagne ;
// - les refus et retraits comptent comme tentatives, jamais comme publications réussies ;
// - les doublons sont détectés toutes campagnes confondues.

import {
  ATTEMPT_STATUSES,
  FbAssignment,
  FbCampaign,
  FbCampaignGroup,
  FbGroup,
  FbPublication,
} from "./types";

export type QueueItem = {
  group: FbGroup;
  neverAttempted: boolean;
  lastAttemptAt: string | null;
  lastPublishedAt: string | null;
  nextAllowedDate: string | null; // ISO date ou null si aucune règle
  blockedByDate: boolean;
  rulesUnknown: boolean;
  duplicateWarning: string | null;
  assignedTo: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (iso: string | null): Date | null => (iso ? new Date(iso) : null);

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/** Intervalle minimal applicable : la règle du groupe prévaut sur celle de la campagne. */
export function effectiveIntervalDays(group: FbGroup, campaign: FbCampaign): number {
  return group.min_interval_days ?? campaign.min_interval_days;
}

/** Dernière tentative (soumis/publié/refusé/retiré) du groupe dans la campagne + cycle donnés. */
export function lastAttempt(
  publications: FbPublication[],
  groupId: string,
  campaignId: string,
  cycle: number,
): FbPublication | null {
  let best: FbPublication | null = null;
  for (const p of publications) {
    if (p.group_id !== groupId || p.campaign_id !== campaignId || p.cycle !== cycle) continue;
    if (!ATTEMPT_STATUSES.includes(p.status)) continue;
    const at = p.published_at ?? p.submitted_at ?? p.updated_at;
    if (!best || at > (best.published_at ?? best.submitted_at ?? best.updated_at)) best = p;
  }
  return best;
}

/** Dernière publication confirmée du groupe, toutes campagnes confondues. */
export function lastPublished(publications: FbPublication[], groupId: string): FbPublication | null {
  let best: FbPublication | null = null;
  for (const p of publications) {
    if (p.group_id !== groupId || p.status !== "publie") continue;
    const at = p.published_at ?? p.updated_at;
    if (!best || at > (best.published_at ?? best.updated_at)) best = p;
  }
  return best;
}

/** Prochaine date autorisée selon l'intervalle applicable et la dernière tentative. */
export function nextAllowedDate(
  group: FbGroup,
  campaign: FbCampaign,
  lastAttemptAt: string | null,
): string | null {
  if (!lastAttemptAt) return null;
  const interval = effectiveIntervalDays(group, campaign);
  const base = toDate(lastAttemptAt);
  if (!base) return null;
  return isoDay(new Date(base.getTime() + interval * DAY_MS));
}

/** Avertissement de doublon : même groupe déjà planifié, en attente ou publié récemment (toutes campagnes). */
export function duplicateWarning(
  publications: FbPublication[],
  groupId: string,
  campaignId: string,
  cycle: number,
  intervalDays: number,
  today: Date,
): string | null {
  for (const p of publications) {
    if (p.group_id !== groupId) continue;
    const sameContext = p.campaign_id === campaignId && p.cycle === cycle;
    if (sameContext && (p.status === "planifie" || p.status === "a_preparer")) {
      return "Déjà planifié dans cette campagne";
    }
    if (p.status === "soumis") {
      return sameContext
        ? "Soumission encore en attente dans cette campagne"
        : "Soumission en attente dans une autre campagne";
    }
    if (p.status === "publie") {
      const at = toDate(p.published_at ?? p.updated_at);
      if (at && today.getTime() - at.getTime() < intervalDays * DAY_MS) {
        return sameContext
          ? "Publié récemment dans cette campagne"
          : "Publié récemment dans une autre campagne";
      }
    }
  }
  return null;
}

export function computeQueue(args: {
  groups: FbGroup[];
  campaignGroups: FbCampaignGroup[];
  publications: FbPublication[];
  assignments: FbAssignment[];
  campaign: FbCampaign;
  today?: Date;
}): QueueItem[] {
  const { groups, campaignGroups, publications, assignments, campaign } = args;
  const today = args.today ?? new Date();
  const todayIso = isoDay(today);
  const byId = new Map(groups.map((g) => [g.id, g]));

  const items: QueueItem[] = [];
  for (const cg of campaignGroups) {
    if (cg.campaign_id !== campaign.id || cg.excluded) continue;
    const group = byId.get(cg.group_id);
    if (!group) continue;
    if (group.archived_at || group.merged_into || group.status === "en_pause") continue;

    // Une soumission encore en attente retire le groupe de la file.
    const pending = publications.some(
      (p) =>
        p.group_id === group.id &&
        p.campaign_id === campaign.id &&
        p.cycle === campaign.cycle &&
        p.status === "soumis",
    );
    if (pending) continue;

    const attempt = lastAttempt(publications, group.id, campaign.id, campaign.cycle);
    const attemptAt = attempt ? attempt.published_at ?? attempt.submitted_at ?? attempt.updated_at : null;
    const published = lastPublished(publications, group.id);
    const publishedAt = published ? published.published_at ?? published.updated_at : null;

    const nextDate = nextAllowedDate(group, campaign, attemptAt);
    const blockedByDate = nextDate !== null && nextDate > todayIso;

    const assignment = assignments.find(
      (a) => a.group_id === group.id && a.campaign_id === campaign.id && a.cycle === campaign.cycle,
    );

    items.push({
      group,
      neverAttempted: !attempt,
      lastAttemptAt: attemptAt,
      lastPublishedAt: publishedAt,
      nextAllowedDate: nextDate,
      blockedByDate,
      rulesUnknown: group.ad_rules === "a_verifier",
      duplicateWarning: duplicateWarning(
        publications,
        group.id,
        campaign.id,
        campaign.cycle,
        effectiveIntervalDays(group, campaign),
        today,
      ),
      assignedTo: assignment?.assigned_to ?? null,
    });
  }

  // Jamais tentés d'abord (ordre alphabétique), puis tentés de la plus ancienne à la plus récente.
  items.sort((a, b) => {
    if (a.neverAttempted !== b.neverAttempted) return a.neverAttempted ? -1 : 1;
    if (a.neverAttempted) return a.group.name.localeCompare(b.group.name, "fr");
    return (a.lastAttemptAt ?? "").localeCompare(b.lastAttemptAt ?? "");
  });
  return items;
}

export type CycleStats = {
  selected: number;
  attempted: number;
  pending: number;
  published: number;
  refused: number;
  remaining: number;
  coveredGroups: number; // groupes distincts avec au moins une publication confirmée
};

export function cycleStats(args: {
  campaignGroups: FbCampaignGroup[];
  publications: FbPublication[];
  campaign: FbCampaign;
}): CycleStats {
  const { campaignGroups, publications, campaign } = args;
  const selected = campaignGroups.filter((cg) => cg.campaign_id === campaign.id && !cg.excluded).length;
  const pubs = publications.filter((p) => p.campaign_id === campaign.id && p.cycle === campaign.cycle);
  const attemptedGroups = new Set(pubs.filter((p) => ATTEMPT_STATUSES.includes(p.status)).map((p) => p.group_id));
  const publishedGroups = new Set(pubs.filter((p) => p.status === "publie").map((p) => p.group_id));
  return {
    selected,
    attempted: attemptedGroups.size,
    pending: pubs.filter((p) => p.status === "soumis").length,
    published: pubs.filter((p) => p.status === "publie").length,
    refused: pubs.filter((p) => p.status === "refuse" || p.status === "retire").length,
    remaining: Math.max(0, selected - attemptedGroups.size),
    coveredGroups: publishedGroups.size,
  };
}
