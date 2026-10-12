# Changements serveur préparés (NON déployés)

À appliquer après approbation de `migration-protections-actions-NON-APPLIQUEE.sql`.

## seo-page-repair
1. Mode `all_errors` : remplacer la sélection actuelle (qui inclut `gen_state = 'missing'`) par
   `selectRepairTargets` de `_shared/seo-repair-guard.ts` (copie de `prepared/seo-generator/_shared/seo-repair-guard.ts`).
   Effet : seuls les brouillons existants en erreur, non publiés, sans noindex volontaire, < 3 tentatives.
2. Mode unitaire : même garde; refuser (409) avec la raison si la cible est ignorée — y compris la limite
   de 3 tentatives, qui ne peut plus être contournée par une relance manuelle.
3. Tentatives : compter les tâches `kind = 'repair'` de la combinaison (journal conservé) et refuser à 3.

## seo-generate-page
1. Avant tout appel IA : `seo_lock_acquire(ville|matériau|service, run_id, 600)`; si `false` →
   réponse 409 « Combinaison déjà en cours de traitement » sans consommer de crédit.
2. `finally` : `seo_lock_release`.
3. Inchangé : sauvegarde du brouillon avant remplacement, mise à jour conditionnelle sur `updated_at`
   et `status = 'draft'`, proposition séparée pour une page en ligne, création toujours en noindex.

## Aperçu (déjà fait côté interface)
- Les boutons « Régénérer » de la carte de ville, de la fenêtre des pages et des listes d'erreurs
  n'utilisent plus le mode `all_errors` : sélection stricte + appel unitaire.
- La publication de la fenêtre des pages utilise le contrôle complet avec relecture.
- Après migration : `cityPublish.ts` passera de `seo_page_publish` à `seo_page_publish_validated`
  (retrait du noindex de génération uniquement à la publication validée).
