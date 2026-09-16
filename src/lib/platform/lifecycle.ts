// ============================================================
// CRM-02B — Règles du cycle mensuel, exprimées en fonctions pures
// afin d'être vérifiables par des tests. Elles décrivent exactement
// le comportement appliqué côté serveur (webhook et resynchronisation).
// ============================================================

/** Un événement plus ancien que l'état courant ne doit jamais l'écraser. */
export function isStaleEvent(
  lastEventAt: string | null | undefined,
  incomingEventAt: string | null | undefined,
): boolean {
  if (!lastEventAt || !incomingEventAt) return false;
  return new Date(lastEventAt).getTime() > new Date(incomingEventAt).getTime();
}

/** Le même événement reçu deux fois n'est traité qu'une seule fois. */
export function isDuplicateEvent(seenEventIds: Iterable<string>, eventId: string): boolean {
  return new Set(seenEventIds).has(eventId);
}

/** Statuts qui occupent la place unique d'abonnement facturable d'une entreprise. */
export const BILLABLE_STATUSES = ["trialing", "active", "past_due", "incomplete"] as const;

/** Reprise : une nouvelle souscription est refusée si une place facturable est occupée. */
export function canStartNewSubscription(existingStatus: string | null | undefined): boolean {
  if (!existingStatus) return true;
  return !["active", "trialing", "past_due"].includes(existingStatus);
}

/** Double clic : un seul paiement doit pouvoir être ouvert à la fois. */
export function shouldIgnoreCheckoutClick(busy: boolean): boolean {
  return busy;
}
