// ============================================================
// Cycle de vie anti-doublon d'une demande /remblai ou /depot-materiaux
// ------------------------------------------------------------
// 1. Réservation de l'empreinte (claimPublicRequest).
// 2. Doublon confirmé → la RÉFÉRENCE MÉMORISÉE de la demande initiale est
//    renvoyée telle quelle (jamais une recherche « par courriel »).
// 3. Création en cours ailleurs → « réessayez », jamais un faux succès.
// 4. Nouvelle demande → création ; la réservation est confirmée APRÈS la
//    création réelle (completeClaim), ou libérée si elle échoue.
// Aucun courriel n'est envoyé ici : l'appelant n'envoie qu'en cas « created ».
// ============================================================
import { claimPublicRequest, completeClaim, releaseClaim, type GuardOptions } from '../_shared/public-guard.ts';

export interface DedupeKey {
  email: string;
  address: string;
  variant: 'reception' | 'evacuation';
  quantityLabel: string;
  materials: string[];
}

const norm = (s: string) => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Définition métier d'un doublon : même courriel normalisé, même sens
 * (réception / évacuation), même adresse normalisée, même quantité et mêmes
 * matériaux (ordre indifférent), dans la fenêtre de 30 minutes.
 * L'empreinte est hachée : aucune donnée personnelle en clair dans le journal.
 */
export async function parcoursFingerprint(k: DedupeKey): Promise<string> {
  const raw = [
    norm(k.email), k.variant, norm(k.address), norm(k.quantityLabel),
    [...k.materials].map(norm).sort().join('/'),
  ].join('|');
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return 'v2:' + Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type FlowOutcome<T> =
  | { kind: 'created'; submissionId: string; data: T; remembered: boolean }
  | { kind: 'duplicate'; submissionId: string }
  | { kind: 'in_progress' };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

/**
 * Réservation expirée sans issue connue (instance arrêtée entre la création
 * et la confirmation) : on vérifie la table métier avec TOUS les critères
 * de l'empreinte avant de recréer. Un seul résultat exact est accepté.
 */
async function findOrphan(sb: any, key: DedupeKey, since: string): Promise<string | null> {
  const { data, error } = await sb.from('submissions')
    .select('id')
    .ilike('email', escapeLike(key.email.trim()))
    .eq('address', key.address)
    .eq('parcours_direction', key.variant)
    .eq('quantity', key.quantityLabel)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(2);
  if (error || !Array.isArray(data) || data.length !== 1) return null;
  return String(data[0].id);
}

export async function runDedupedCreate<T>(
  sb: any,
  guard: Omit<GuardOptions, 'fingerprint'>,
  key: DedupeKey,
  create: () => Promise<{ submissionId: string; data: T }>,
): Promise<FlowOutcome<T>> {
  const fingerprint = await parcoursFingerprint(key);
  const claim = await claimPublicRequest(sb, { ...guard, fingerprint });

  if (claim.state === 'duplicate') {
    const id = claim.result?.submission_id;
    if (typeof id === 'string' && id) return { kind: 'duplicate', submissionId: id };
    // Ligne « done » sans référence : ne devrait pas exister (guard_complete
    // l'interdit). On ne renvoie jamais de référence devinée.
    console.error(JSON.stringify({ event: 'guard.done_without_reference', scope: guard.scope }));
    return { kind: 'in_progress' };
  }
  if (claim.state === 'in_progress' || !claim.claimId) return { kind: 'in_progress' };

  const claimId = claim.claimId;
  if (claim.staleAt) {
    const orphan = await findOrphan(sb, key, new Date(Date.parse(claim.staleAt) - 5000).toISOString());
    if (orphan) {
      await releaseClaim(sb, guard.scope, claimId, 'orphan_found');
      if (claim.staleClaimId) await completeClaim(sb, guard.scope, claim.staleClaimId, { submission_id: orphan });
      return { kind: 'duplicate', submissionId: orphan };
    }
  }

  let created: { submissionId: string; data: T };
  try {
    created = await create();
    if (!created?.submissionId) throw new Error('création sans référence');
  } catch (e) {
    await releaseClaim(sb, guard.scope, claimId, 'create_failed');
    throw e;
  }
  // La demande EXISTE : on ne renvoie jamais d'erreur à partir d'ici
  // (sinon le visiteur renverrait et créerait un double).
  const remembered = await completeClaim(sb, guard.scope, claimId, { submission_id: created.submissionId });
  return { kind: 'created', submissionId: created.submissionId, data: created.data, remembered };
}
