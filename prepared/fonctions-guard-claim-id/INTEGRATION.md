# Intégration préparée — guard_claim_id (NON DÉPLOYÉE)

Ne rien copier dans `supabase/functions/` avant l'application de `migration-guard-claim-id-NON-APPLIQUEE.sql` :
toute modification de ce dossier est mise en ligne automatiquement, et écrire une colonne absente ferait échouer chaque demande.

Ordre : migration anti-doublon v2 → migration guard_claim_id → migration-guard-durable-NON-APPLIQUEE.sql → copie du code validé ci-dessous. Aucune étape n'est autorisée maintenant.

## Copie
- `_shared/claimed-create.ts` → `supabase/functions/_shared/claimed-create.ts` (changer l'import en `./public-guard.ts`).

## submit-parcours/index.ts
- Remplacer `runDedupedCreate(...)` par `runClaimedCreate(sb, { ...guard, fingerprint: await parcoursFingerprint(key) }, { findByClaim, create })`.
- Utiliser `_shared/exact-reference.ts` : recherche par réservation exacte et toute erreur de lecture est refusée, jamais assimilée à une absence.
- Dans l'insertion `submissions` : ajouter `guard_claim_id: claimId`.
- Supprimer `findOrphan` (recherche par courriel/adresse) : remplacée par l'identifiant exact.

## quote-submit/index.ts
- Même appel ; `findByClaim` lit `jsc_requests` par `guard_claim_id`, puis `jsc_quotes` par `request_id` pour renvoyer `{ submission_id, request_number, quote_number, valid_until }`.
- Insertion `jsc_requests` : ajouter `guard_claim_id: claimId` (parcours prix calculé ET « à confirmer »).
- Une demande retrouvée sans soumission (arrêt entre les deux insertions) est renvoyée comme « demande à confirmer » avec son numéro ; elle apparaît déjà dans l'administration. Aucun courriel n'est renvoyé.
- `pendingSeconds` passe de 180 à 600 (constante partagée).

## Effet visible
Après un rejet d'insertion attesté sans commit, un nouvel essai est permis. Après une erreur réseau ambiguë ou un arrêt sans résultat connu, la réservation reste bloquante sans limite de durée ; après 600 secondes, seule une recherche exacte peut récupérer un dossier déjà créé. Une absence ne permet jamais une nouvelle insertion. Une intervention manuelle séparément autorisée est nécessaire si aucun dossier ne peut être retrouvé.

## Copies assemblées, non actives

- `submit-parcours/index.ts` et `quote-submit/index.ts` sont des copies complètes de préparation, pas des fichiers déjà installés.
- `_shared/claimed-create.ts` et `_shared/exact-reference.ts` constituent les dépendances nouvelles.
- Les imports `../../../supabase/functions/...` sont réservés aux essais locaux. Au report autorisé, rétablir les imports des dépendances existantes vers `../_shared/...`, `./dedupe-flow.ts`, `./dedupe.ts` et `../submit-parcours/confirmation-status.ts`. Le helper utilise alors `./public-guard.ts`.
- `previous/` conserve six sources locales et leurs SHA-256 ; elles ne constituent pas une preuve de la version réellement hébergée. Capturer le paquet hébergé exact avant autorisation.
- Ne pas recopier `previous/`, les tests ni les documents dans les fonctions actives.

## Retour opérationnel

Revenir au paquet précédent complet, après arrêt autorisé des nouvelles admissions et traitement des exécutions en cours. Conserver M1, M2, la RPC durable, les index, colonnes et valeurs. Aucun DROP ou réinitialisation automatique. Les anciens appelants utilisent `guard_claim`, pas `guard_claim_durable` ; leur comportement SQL est inchangé. Les tests locaux prouvent cette compatibilité sur fixtures seulement.
