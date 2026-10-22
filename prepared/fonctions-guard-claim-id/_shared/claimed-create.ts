// ============================================================
// PRÉPARÉ — NON DÉPLOYÉ (dossier prepared/, jamais mis en ligne).
// À copier dans supabase/functions/_shared/ SEULEMENT après application de
// migration-guard-claim-id-NON-APPLIQUEE.sql (sinon les insertions échouent).
// ------------------------------------------------------------
// Implémentation UNIQUE de l'anti-doublon pour submit-parcours et quote-submit.
// 1. guard_claim_durable : une réservation non résolue n'expire jamais.
//    600 s est un seuil de recherche exacte, pas une preuve de décès.
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

/** Seulement avant toute insertion, ou après un rejet DB attesté sans commit. */
export class RejectedBeforeInsert extends Error {}

export function rejectedInsert(error: { code?: string; message?: string }): Error {
  // SQLSTATE classes 22/23 : rejet atomique de la commande INSERT.
  return /^(22|23)/.test(error.code ?? '')
    ? new RejectedBeforeInsert('Insertion refusée sans enregistrement')
    : new Error('Résultat de l’insertion incertain');
}

export async function runClaimedCreate<T>(sb: any, guard: GuardOptions, h: ClaimedCreate<T>): Promise<Outcome<T>> {
  // Remap uniquement ce RPC ; aucun secours lecture/insertion n'est accepté.
  const strict = {
    from: (...args: any[]) => sb.from(...args),
    rpc: async (name: string, args: unknown) => {
      const result = await sb.rpc(name === 'guard_claim' ? 'guard_claim_durable' : name, args);
      if (result.error) throw new Error('Protection transactionnelle indisponible');
      return result;
    },
  };
  const claim = await claimPublicRequest(strict, { ...guard, pendingSeconds: PENDING_SECONDS });

  if (claim.state === 'duplicate') {
    const r = claim.result as Ref | null;
    if (r?.submission_id) return { kind: 'duplicate', ref: r };
    console.error(JSON.stringify({ event: 'guard.done_without_reference', scope: guard.scope }));
    return { kind: 'in_progress' };
  }
  if (claim.staleClaimId) {
    const orphan = await h.findByClaim(claim.staleClaimId);
    if (orphan) {
      await completeClaim(sb, guard.scope, claim.staleClaimId, orphan);
      console.warn(JSON.stringify({ event: 'guard.orphan_recovered', scope: guard.scope }));
      return { kind: 'duplicate', ref: orphan };
    }
    return { kind: 'in_progress' };
  }
  if (claim.state !== 'new' || !claim.claimId) return { kind: 'in_progress' };
  const claimId = claim.claimId;

  let created: { ref: Ref; data: T };
  try {
    created = await h.create(claimId);
    if (!created?.ref?.submission_id) throw new Error('création sans référence');
  } catch (e) {
    // Toute exception peut suivre un commit : rechercher l'id exact d'abord.
    const existing = await h.findByClaim(claimId);
    if (existing) {
      await completeClaim(sb, guard.scope, claimId, existing);
      return { kind: 'duplicate', ref: existing };
    }
    if (e instanceof RejectedBeforeInsert) {
      await releaseClaim(sb, guard.scope, claimId, 'insert_rejected');
    }
    // Erreur réseau/absence incertaine : conserver pending, aucune réparation.
    throw e;
  }
  const remembered = await completeClaim(sb, guard.scope, claimId, created.ref);
  return { kind: 'created', ref: created.ref, data: created.data, remembered };
}
