# Intégration préparée — guard_claim_id (NON DÉPLOYÉE)

Ne rien copier dans `supabase/functions/` avant l'application de `migration-guard-claim-id-NON-APPLIQUEE.sql` :
toute modification de ce dossier est mise en ligne automatiquement, et écrire une colonne absente ferait échouer chaque demande.

Ordre : migration anti-doublon v2 → migration guard_claim_id → copie du code ci-dessous.

## Copie
- `_shared/claimed-create.ts` → `supabase/functions/_shared/claimed-create.ts` (changer l'import en `./public-guard.ts`).

## submit-parcours/index.ts
- Remplacer `runDedupedCreate(...)` par `runClaimedCreate(sb, { ...guard, fingerprint: await parcoursFingerprint(key) }, { findByClaim, create })`.
- `findByClaim = async (id) => { const { data } = await sb.from('submissions').select('id').eq('guard_claim_id', id).maybeSingle(); return data ? { submission_id: data.id } : null; }`
- Dans l'insertion `submissions` : ajouter `guard_claim_id: claimId`.
- Supprimer `findOrphan` (recherche par courriel/adresse) : remplacée par l'identifiant exact.

## quote-submit/index.ts
- Même appel ; `findByClaim` lit `jsc_requests` par `guard_claim_id`, puis `jsc_quotes` par `request_id` pour renvoyer `{ submission_id, request_number, quote_number, valid_until }`.
- Insertion `jsc_requests` : ajouter `guard_claim_id: claimId` (parcours prix calculé ET « à confirmer »).
- Une demande retrouvée sans soumission (arrêt entre les deux insertions) est renvoyée comme « demande à confirmer » avec son numéro ; elle apparaît déjà dans l'administration. Aucun courriel n'est renvoyé.
- `pendingSeconds` passe de 180 à 600 (constante partagée).

## Effet visible
Après un arrêt du serveur avant toute création, une nouvelle tentative reçoit « en cours » jusqu'à 10 minutes au lieu de 2–3 minutes. C'est le prix d'une garantie sans doublon.
