# EXEC-01 / vrac — finalisation préparée, 22 octobre 2026, 21:38 UTC

**Prêt à poursuivre une validation isolée. Mise en service BLOQUÉE.**
Ce document remplace pour les nouveaux travaux les conclusions de 21:20 UTC ; aucun résultat local ne vaut preuve de production.

## Changements de préparation

- `prepared/fonctions-guard-claim-id/submit-parcours/index.ts` : copie complète utilisant la réservation exacte dans l'insertion `submissions`, sans recherche par courriel/adresse. Confirmation idempotente ; statut lu sur la réservation lors d'un rejeu ordinaire.
- `prepared/fonctions-guard-claim-id/quote-submit/index.ts` : copie complète des branches prix calculé et à confirmer, `guard_claim_id` dans `jsc_requests`, référence principale toujours l'identifiant du dossier. Les soumissions sont recherchées par `request_id` exact. Rejet avant insertion principale libérable ; erreur après création ne détruit pas le dossier. Un doublon ordinaire n'envoie aucun courriel ; un renvoi explicite conserve la clé par soumission.
- `_shared/claimed-create.ts` : pas de secours non atomique, pas de remplacement d'une réservation non résolue. Rechercher le dossier exact après toute exception. Libérer seulement un rejet attesté avant l'insertion principale ou SQLSTATE 22/23 avec commande rejetée atomiquement. Une erreur réseau reste indéterminée et bloquante.
- `_shared/exact-reference.ts` : erreurs de lecture refusées, aucune déduction à partir du courriel/adresse ; plus d'une soumission retrouvée = arrêt.
- `_shared/mail-status.ts` : accepté, échoué, non envoyé et inconnu distincts. Un statut inconnu ne prétend ni livraison ni échec confirmé.
- `prepared/deploiement/migration-guard-durable-NON-APPLIQUEE.sql` : ajoute deux RPC **distinctes**, `guard_claim_durable(text,text,text,jsonb,integer,integer)` et `guard_email_status(uuid,text)`. Droits serveur seuls, aucune table/colonne/RLS nouvelle. La première utilise l'état existant des réservations, la seconde mémorise l'acceptation sans toucher l'état de création et sans remplacer un succès par un échec ultérieur. Aucune migration appliquée.
- `previous/` : six sources locales antérieures et manifest SHA-256, pas une copie certifiée de la version hébergée.
- `INTEGRATION.md`, AGENTS du paquet et racine : importations, dépendances et retour additif documentés.
- `sauvegarde-et-validation-separee-2026-10-22.md` : procédure manuelle, sans export/restauration exécutés.
- `PROTOCOLE-HEBERGE-ISOLE-NON-EXECUTE.md` : adresse fournie, deux clients/plusieurs dossiers, code, renouvellement, renvoi, refus et nettoyage sur identifiants exacts avec accord distinct.

Les sources actives `supabase/functions/` et les interfaces publiées n'ont pas été modifiées.

## Tests réellement exécutés

| Type | Résultat | Limite |
|---|---:|---|
| Vitest, neuf fichiers de protections/recherches/statuts | 79/79 | Mocks et anciens handlers partagés, pas tout le nouvel endpoint HTTP |
| SQL PostgreSQL jetable + helper durable | 13/13 | Deux tables, cinq appels simultanés, instance tardive >31 min, rejet/reprise, réponse perdue, historique avant migration, ancien code, droits RPC, statut accepté conservé |
| SQL + endpoint personnel local | 30/30 | Dates déplacées pour l'attente, messages capturés, aucun fournisseur réel |
| Vérification préparatoire/inverse renouvellement | 10/10 | Définition et métadonnées exactes, dérive refusée, historique ambigu intact |
| SQL existant concurrence M1 | 55/55 | L'ancien test de DROP n'est pas le retour opérationnel recommandé |
| SQL existant index claim-id | 31/31 | Fixtures locales, pas la stack hébergée |

**218 contrôles locaux réussis**, sans compter les réexécutions intermédiaires. Deux copies d'endpoint assemblées avec Bun (15 modules) : preuve d'imports/transformation seulement, pas typecheck Deno ni validation HTTP complète.

Les premiers essais du nouvel adaptateur ont échoué sur dossier temporaire absent puis encodage JSON du simulateur ; corrections locales et dernière suite verte. Aucun échec caché ni recours à la production.

## Compatibilité et retour arrière

Preuve locale : les fonctions antérieures `runDedupedCreate` et `claimQuote/completeQuote` créent et relisent leur référence avec M1/M2 et les nouveaux ajouts conservés. Elles appellent toujours `guard_claim`, dont la définition n'est pas changée par la RPC durable. Les anciennes insertions omettent les colonnes nullables ; les index ne portent que sur valeurs non NULL. Les fixtures créées avant M2 gardent leurs données et NULL.

**Retour opérationnel = ancien paquet de code exact, schéma additif conservé.** Garder les cinq RPC M1, les deux RPC nouvelles, les deux colonnes, leurs valeurs et index. Pas de suppression de fonction, d'index, de réservation ou de dossier. Ce retour n'annule ni courrier accepté ni modifications déjà enregistrées. Arrêter les admissions et traiter les instances en vol uniquement selon une procédure et une autorisation séparées.

L'ancien code conserve ses défauts de récupération heuristique : compatibilité ne signifie pas égalité des nouvelles garanties. Le paquet précédent archivé ici est local ; obtenir et identifier la version hébergée avant autorisation. Le retrait de schéma n'est pas préparé comme inverse sûr et n'est pas recommandé. M3 conserve son inverse exact distinct, empreinte `e9d8b2ad…` vers `2da0b806…`.

## Risques résiduels et tests manquants

1. **Réservation sans résultat connu** : conserve le blocage même après dix ou trente minutes. Aucun remplacement automatique ; identité/dossier/audit/autorisation humaine nécessaires. Ce choix élimine le risque de créer un deuxième dossier si l'ancienne instance finit tardivement, au prix de disponibilité.
2. **Statut inconnu de courrier** : l'interface actuelle ne gère pas partout ce nouvel état. Son adaptation doit rester dans des copies préparées puis être testée HTTP/navigateur avant activation. Un crash après acceptation et avant mémorisation peut rester inconnu ; ne pas envoyer un deuxième message pour deviner son état.
3. **Envoi idempotent hébergé** : le nouvel essai réutilise les mêmes clés, mais les endpoints complets préparés et le worker réel doivent encore être exercés avec capture isolée, notamment réponse perdue après acceptation et notifications internes en échec. Les tests de helper seuls ne le garantissent pas.
4. **Vrac partiellement créé** : le dossier principal reste conservé même sans soumission. Les doublons rafraîchissent la référence par l'identifiant exact, sans figer une absence de soumission pendant une exécution tardive. Les états prix calculé/manuel et leur interface complète restent à tester ensemble.
5. **Transition historique** : les anciennes traces sans état ne donnent pas de référence fiable ; aucune association automatique aux demandes réelles. Prévoir admissions contrôlées et exécutions en vol avant activation.
6. **Sauvegarde** : horodatage réel et essai de restauration séparée non vérifiés. Inventaire accessible uniquement à l'utilisateur dans Lovable ; mise en service reste bloquée.
7. **Hébergé** : aucune stack isolée Auth/PostgREST/Storage/fonctions confirmée ; aucun vrai Outlook, Safari iPhone ni envoi. Aucune durée de livraison garantie.

## Plan et critères d'arrêt

1. **Maintenant :** poursuivre uniquement la validation isolée autorisée localement : tests HTTP des copies entières avec tous services capturés ; préparer le traitement interface de `unknown`, tester ordinateur/mobile et perte réseau. Arrêt si référence manquante/erronée, état transformé en faux succès ou deuxième envoi.
2. **Sauvegarde manuelle :** obtenir le timestamp UTC depuis Lovable et l'essai de restauration séparée après autorisations export/destination/coût. Arrêt tant que l'une manque.
3. **Cible isolée :** identité, clés, files, tâches et intégrations distinctes confirmées ; aucun secret ou destinataire de production. Autorisation distincte avant sa création ou tout coût.
4. **Paquets :** relever version hébergée antérieure exacte et dépendances ; comparer manifest et code préparé. Toute dérive = arrêt, pas d'adaptation automatique.
5. **Après autorisation uniquement :** M1 anti-doublon → M2 colonnes/index → RPC durable et statut → contrôles catalogue/ACL → M3 renouvellement distinct si autorisé → copies de fonctions et interface préparée validées. L'outil de migration gère chaque transaction. Les copies n'atteignent jamais les sources actives avant les prérequis vérifiés.
6. **Contrôles sans dossier :** signatures exactes, ACL serveur seules pour RPC, deux colonnes/index exacts, tables et RLS inchangées, empreinte renouvellement attendue. Arrêt à la première divergence ou secours non atomique ; absence de trafic n'est pas preuve du parcours.
7. **Test personnel autorisé séparément :** adresse dédiée confirmée, A1/A2/B1 exacts, réception/code/bon dossier, falsification, renouvellement, échec/renvoi, double clic, ordinateur/iPhone. Aucun nettoyage implicite.
8. **Retour si échec :** ancien code complet, ajouts conservés ; inverse M3 seul si autorisé et empreinte exacte. Pas de restauration globale ni reset automatique. Nouvelle validation locale/hébergée séparée avant réouverture.
9. **Nettoyage éventuel :** identifiants TEST nommés et autorisation explicite ; archivage JSC par défaut. Aucune suppression par adresse courriel ni nettoyage de demandes réelles.

**Aucune action en production pendant cette session : zéro migration, déploiement, publication, permission/RLS modifiée, demande réelle, courriel, export, restauration, sauvegarde ou coût engagé. SEO et données réelles intacts.**