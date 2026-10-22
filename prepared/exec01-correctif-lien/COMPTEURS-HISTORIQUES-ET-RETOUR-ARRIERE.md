# Compteurs historiques et inverse — validation locale du 22 octobre 2026

## Reconnaissance, sans réparation

Dans `public.submission_portal_links`, un compteur `failures >= 5` avec `code_expires_at IS NULL` n’a aucune échéance récupérable. Le correctif refuse `code`, `verify` et `renew` sans modifier cet état. Un lien révoqué est refusé avant toute remise à zéro. Cela ne retire pas la consultation déjà autorisée à un contact précédemment vérifié et lié au même dossier.

**Ambiguïté importante :** avant correctif, `code_expires_at` était seulement l’expiration du code. L’ancien compteur pouvait atteindre cinq avec `code_hash` encore présent et une date de code passée. Le correctif préparé n’exige PAS `code_hash IS NULL` avant de traiter cette date comme une fin d’attente. Une opération `code` remet alors le compteur à zéro automatiquement. Ce comportement a été reproduit avec une fixture locale; il ne constitue pas une preuve d’état de production.

Même `code_hash IS NULL` et une date passée ne prouvent pas à eux seuls la provenance d’un délai historique : aucun marqueur dédié n’existe. `created_at` date le lien, pas le cinquième échec; ne pas inventer son heure ni remplacer une date inconnue par « maintenant moins 15 minutes ».

### Inventaire proposé (SELECT uniquement, NON exécuté en production)

```sql
SELECT
  count(*) FILTER (WHERE revoked_at IS NOT NULL) AS revoked,
  count(*) FILTER (WHERE revoked_at IS NULL AND code_expires_at IS NULL) AS unknown_deadline,
  count(*) FILTER (WHERE revoked_at IS NULL AND code_expires_at IS NOT NULL AND code_hash IS NOT NULL) AS ambiguous_old_code,
  count(*) FILTER (WHERE revoked_at IS NULL AND code_expires_at IS NOT NULL AND code_hash IS NULL) AS needs_provenance_check
FROM public.submission_portal_links
WHERE failures >= 5;
```

Requête agrégée sans identifiant, adresse, code, jeton ni hash retourné. Aucun inventaire hébergé réalisé aujourd’hui; aucun nombre réel avancé.

## Stratégie proposée — non activée

1. Conserver les lignes, liens, dates et historique; pas de nettoyage ni réinitialisation automatique de données historiques ambiguës.
2. Avec autorisation de lecture ciblée, établir l’inventaire agrégé et la provenance à partir d’événements existants non sensibles; absence de preuve = état inconnu.
3. Faire valider une garde qui échoue fermée pour les états ambigus, ou un marqueur de provenance fiable. Ne pas appliquer cette nouvelle proposition aujourd’hui. Une modification du correctif exige recalcul de la définition et des deux empreintes, inverse correspondant et nouveaux tests.
4. Pour une récupération manuelle future : vérifier l’identité par un canal approuvé, destinataire inchangé, portée limitée à un dossier, décision humaine et trace datée. Nouvelle émission/révocation uniquement après autorisation et contrôles de fréquence; ne jamais restaurer un ancien code ou réactiver un lien révoqué.
5. Aucune réparation massive. Si une échéance historique n’est pas démontrable, ne pas présenter ce dossier comme automatiquement débloqué après 15 minutes.

**Résolu localement le 22 octobre (20 h 40 UTC) :** la garde n’accepte plus qu’une échéance de forme cohérente (voir VALIDATION). Ancien constat : la règle actuellement préparée peut réinitialiser certains compteurs historiques à date passée. La préparation documentaire et les essais locaux peuvent continuer; la conformité « aucune réparation automatique historique » doit être résolue par un correctif autorisé et retesté ou une stratégie explicitement approuvée.

## Retour arrière ciblé — vérifié localement seulement

Fichier inchangé : `0231_retour_arriere_NON_APPLIQUE.sql`.
- Entrée corrigée exigée : MD5 `e9d8b2ad33d864aa7a3ba881e78b82cc` de `pg_get_functiondef('public.exec01_dispatch(jsonb)'::regprocedure)`.
- Sortie initiale exigée : MD5 `2da0b80649cfacf5db57fe559adab3c2`.
- Inverse des trois blocs, `EXECUTE` seulement après validation de chaque texte (une occurrence exacte) et du résultat entier.
- Égalité octet pour octet de la définition initiale démontrée, pas seulement égalité de hash.
- Propriétaire, ACL, SECURITY DEFINER, search_path, arguments et retour inchangés dans la fixture; une seconde fonction sentinelle reste intacte.
- Second inverse et définition dérivée refusés sans modification. Signature absente : résolution `regprocedure` échoue, aucun EXECUTE.

Le test ne prétend pas restaurer les données : codes consommés, compteurs, échéances, liens créés/révoqués et événements émis après activation ne sont pas annulés. L’inverse rétablit aussi l’ancien refus du renouvellement avant première vérification et la limite permanente des compteurs élevés. Les dépendances appelées restent inchangées; aucune restauration globale à utiliser comme substitut.

### Dépendances à confirmer avant toute application réelle

Autorisation explicite; environnement visé; lecture fraîche de la signature/définition/empreinte attendue; aucune évolution concurrente. Propriétaire et privilèges d’exécution suffisants et inchangés; disponibilité de `submissions`, `submission_portal_links`, projections et fonctions appelées. Chaque divergence = arrêt, jamais adaptation automatique. Le contrôle MD5 est un garde de dérive de texte, pas un mécanisme d’authentification.

Sauvegarde récente : **non confirmée**. Aucun accès à une liste réelle de sauvegardes n’a été exercé, aucune sauvegarde/export lancé. Faire fournir disponibilité, date UTC, portée, état terminé et restaurabilité avant une action réelle, avec autorisation distincte pour toute opération de sauvegarde ou restauration.