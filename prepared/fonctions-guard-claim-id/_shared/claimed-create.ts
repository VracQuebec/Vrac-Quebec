// ============================================================
// PRÉPARÉ — NON DÉPLOYÉ (dossier prepared/, jamais mis en ligne).
// À copier dans supabase/functions/_shared/ SEULEMENT après application de
// migration-guard-claim-id-NON-APPLIQUEE.sql (sinon les insertions échouent).
// ------------------------------------------------------------
// Implémentation UNIQUE de l'anti-doublon pour submit-parcours et quote-submit.
// 1. guard_claim (réservation, fenêtre « en cours » = 600 s, plus longue que
//    la durée maximale d'exécution d'une fonction : une réservation périmée
//    signifie que son instance est morte, pas qu'elle travaille encore).
// 2. Réservation périmée → recherche de la demande par guard_claim_id EXACT.
// 3. create(claimId) écrit guard_claim_id dans la même insertion ; l'index
//    unique partiel garantit au plus une demande par réservation.
// 4. guard_complete (référence réelle) | guard_release (échec).
// ============================================================
import { claimPublicRequest, completeClaim, releaseClaim, type GuardOptions } from '../../../supabase/functions/_shared/public-guard.ts';

export const PENDING_SECONDS = 600;

export type Ref = { submission_id: string } & Record<string, unknown>;

export type Outcome<T> =
  | { kind: 'created'; ref: Ref; data: T; remembered: boolean }
  | { kind: 'duplicate'; ref: Ref }
  | { kind: 'in_progress' };

export interface ClaimedCreate<T> {
  /** Recherche par identifiant de réservation exact ; null si absente. */
  findByClaim: (claimId: string) => Promise<Ref | null>;
  /** Doit écrire guard_claim_id = claimId dans l'insertion principale. */
  create: (claimId: string) => Promise<{ ref: Ref; data: T }>;
}

const isUniqueViolation = (e: unknown) => /23505|duplicate key|guard_claim_id_uq/i.test(String((e as any)?.code ?? '') + ' ' + String((e as any)?.message ?? e));

export async function runClaimedCreate<T>(sb: any, guard: GuardOptions, h: ClaimedCreate<T>): Promise<Outcome<T>> {
  const claim = await claimPublicRequest(sb, { ...guard, pendingSeconds: PENDING_SECONDS });

  if (claim.state === 'duplicate') {
    const r = claim.result as Ref | null;
    if (r?.submission_id) return { kind: 'duplicate', ref: r };
    console.error(JSON.stringify({ event: 'guard.done_without_reference', scope: guard.scope }));
    return { kind: 'in_progress' };
  }
  if (claim.state === 'in_progress' || !claim.claimId) return { kind: 'in_progress' };
  const claimId = claim.claimId;

  // Instance morte après création mais avant confirmation : la demande porte
  // l'identifiant de l'ancienne réservation → renvoi exact, aucune recréation.
  if (claim.staleClaimId) {
    const orphan = await h.findByClaim(claim.staleClaimId);
    if (orphan) {
      await completeClaim(sb, guard.scope, claim.staleClaimId, orphan);
      await releaseClaim(sb, guard.scope, claimId, 'orphan_found');
      console.warn(JSON.stringify({ event: 'guard.orphan_recovered', scope: guard.scope }));
      return { kind: 'duplicate', ref: orphan };
    }
  }

  let created: { ref: Ref; data: T };
  try {
    created = await h.create(claimId);
    if (!created?.ref?.submission_id) throw new Error('création sans référence');
  } catch (e) {
    if (isUniqueViolation(e)) {
      // Une demande existe déjà pour CETTE réservation : on la renvoie.
      const existing = await h.findByClaim(claimId);
      if (existing) {
        await completeClaim(sb, guard.scope, claimId, existing);
        return { kind: 'duplicate', ref: existing };
      }
    }
    await releaseClaim(sb, guard.scope, claimId, 'create_failed');
    throw e;
  }
  const remembered = await completeClaim(sb, guard.scope, claimId, created.ref);
  return { kind: 'created', ref: created.ref, data: created.data, remembered };
}
