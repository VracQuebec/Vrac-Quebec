# Vrac Québec Simple — état réel et autorisations minimales

22 octobre 2026, complément après la demande de 22:59 UTC. Aucune intervention de production, publication, export, restauration, ressource payante, demande réelle ou communication réelle. Aucun des 1 281 titres SEO ni aucune page publique modifié.

## Verdict
**PRÊT POUR LES TESTS ISOLÉS sur une cible complète fournie et vérifiée ; NON PRÊT pour activation ou validation finale.** Les essais SQL locaux sont concluants. Aucun essai hébergé n’a été exécuté : il n’existe pas de cible complète indépendante accessible démontrée. L’interface publique actuelle ne sait pas encore afficher correctement tous les états d’envoi inconnus ; le contrat corrigé reste exclusivement préparé.

## 1. Défauts corrigés et fichiers
- `formulaire-NON-APPLIQUE.sql` : refus des nouvelles modifications d’un dossier fermé avant autorisation des uploads ; les rejeux légitimes restent distincts.
- `photos-historique-NON-APPLIQUE.sql` : une référence privée conservée dans `result.publicForm.photos` empêche désormais le nettoyage fictif, même après retrait du formulaire courant. Aucune extension du nettoyage aux vrais dossiers.
- `composition.ts`, `sql-compose/` : sept références contrôlées, cinq étapes ; trois dépendances inchangées (courrier atomique, quota, rôle) gardées avec leurs propres droits. Inverse complet restaure seulement quatre définitions modifiées, jamais les droits ou dépendances inchangées.
- `references/has_role-LECTURE-SEULE.json` : définition exacte et ACL relevées ; les six références originales restent intactes. `archives/sql-compose-2257/` conserve l’ancienne composition, historique non exécutable pour le nouveau paquet.
- `../fonctions-guard-claim-id/_shared/delivery-result.ts`, `mail-status.ts`, les deux entrypoints : timeout/réponse illisible → `unknown`, pas `failed` ; aucun écrasement d’un état certain par incertitude. Vrac manuel mémorise `not_sent`.
- `../fonctions-guard-claim-id/client-confirmation.ts` : contrat client inactif partagé, `null` ne vaut jamais envoyé, référence réelle obligatoire. **Non raccordé aux pages publiques**, conformément à l’interdiction de les modifier.
- `../fonctions-guard-claim-id/INTEGRATION.md` : liste exhaustive des quatre helpers et blocage d’interface explicite.
- `../deploiement/PRECONTROLE-SIMPLE-NON-APPLIQUE.sql` : assertions de l’état observé avant M1/M2/durable ; présence inattendue ou droits différents = arrêt et nouvelle référence/inverse, jamais adaptation automatique.
- Commentaires de retour M1/M2 corrigés ; ancien plan général marqué historique/non exécutable. Aucun resserrement général de permissions ou chantier SEO inclus.
- Tests modifiés : `remblai-original-form.test.ts`, `remblai-composition.test.ts`, `claimed-mail-status.test.ts`, `prepared-client-confirmation.test.ts`, `serveur/endpoint.test.ts`. Manifeste serveur SHA-256 actualisé. Règle technique dans `AGENTS.md` et feuille de route actualisées.

## 2. Résultats réellement exécutés cette session
| Suite | Résultat final | Portée |
|---|---|---|
| `test-local.sh`, 23:04 UTC | 91 réussis, 0 échec, 24 ignorés dans ce passage | Contrats + SQL sur cluster vide 127.0.0.1:55438, détruit |
| `test-liens-local.sh`, 23:00 UTC | 54 réussis, 0 échec, aucun ignoré | Cluster vide 55439 ; exécute les 24 cas ignorés au premier passage |
| Suites anti-doublon et contrat client, 23:05 UTC | 51 réussis, 0 échec, aucun ignoré | 13 SQL réels jetables, 38 contrats/mémoire/contrôles de non-activation |
| Deno autonome, 23:05 UTC | 3 réussis, 0 échec | Sans droits réseau ; refus d’envoi non atomique/null/upload non autorisé |
| Vérification historique | 10/10 | Inverse exact, dérive, états historiques ambigus intacts |
| Deno point d’entrée | Contrôle des types réussi | Aucun démarrage du serveur |

**196 tests Vitest distincts réussis + 3 Deno + 10 contrôles.** Les 24 ignorés dans une exécution ont effectivement tourné dans l’autre. Aucun cas de ces suites ciblées reste ignoré au total. Les fichiers de preuve `validation-complete-*.log` sont conservés sous `preuves/`.

Nouveaux cas : dossier fermé → zéro appel stockage ; photo uniquement dans résultat historique → nettoyage refusé ; dérive de chacune des quatre dépendances → arrêt ; réponse illisible/inconnue jamais acceptée ; absence volontaire conservée ; incertitude sans écriture de statut ; référence absente refusée.

**Limites précises :** tests de l’émetteur initial utilisent une file locale substituée ; tests des deux parcours utilisent leurs helpers et SQL, pas les deux endpoints HTTP complets avec worker réel. Storage/signatures et identité/JWT hébergés, déclencheurs CRM complets, notifications après crash, courrier atomique hébergé, géocodage, vraie réception Outlook et vrais appareils : non testés. Les comparaisons navigateur aux trois tailles restent les preuves historiques de 22:55 UTC, non réexécutées ici. Aucune nouvelle simulation ne remplace la cible manquante.

## 3. Lecture seule réelle, préconditions et empreintes
À 23:00–23:05 UTC : dispatcher/projection/émetteur initial et leurs trois dépendances conservent les empreintes originales. Retours/propriétaires/ACL inchangés ; privées non exécutables par anon/authenticated, exécutables par service_role. `has_role` original `6e055322eaad390f6c2c3ef45fec6857` reste public/exécutable selon ses droits actuels : gardés, jamais recopiés sur les fonctions privées.

| Définition modifiée proposée | Original réel | Final préparé |
|---|---|---|
| `exec01_dispatch(jsonb)` | `2da0b80649cfacf5db57fe559adab3c2` | `2b75c1d873d6dd490ebb226eb5022807` |
| `exec01_projection(uuid,boolean)` | `e4cec3f904e15ec6ef264a22f71298c1` | `effd16af586b2222d7a16c1ce2fcc8fe` |
| `exec01_enqueue_confirmation(jsonb)` | `7262c4525163637476d42b57c8b63c82` | `6a85648de113e2c2c2b8aaf3c1bb9705` |
| `exec01_photo_manage(jsonb)` | `797eadff98c2eca9cf750a29464524c2` | `e483d52d97a78b70a266ae9385d4897a` |

Les sept définitions archivées correspondent à leur MD5. `dispatch_mail` original `99da54e6fe02f7ad192bbecc3e355bee` et quota `49e2fbbcd39780e7fb7ff2e113dd553d` ne changent pas.

Catalogue production : sept fonctions guard ciblées absentes, colonnes guard_claim_id et deux index absents. Tables public_request_guard/submissions/jsc_requests existantes, RLS activée ; ACL larges actuelles consignées dans le précontrôle sans aucune modification. Les politiques détaillées et effets de tous les déclencheurs ne sont pas certifiés par la seule lecture des ACL. Les nouvelles RPC guard proposées sont serveur uniquement ; aucune permission client supplémentaire.

Avant toute proposition d’application : relire définitions, ACL, types/propriétaires/droits effectifs, colonnes/index, politiques et dépendances sur la **cible désignée**. Les gardes ne valent pas autorisation d’exécuter. Une fonction nouvellement présente exige son original/inverse exact ; ne pas écraser sur la foi de CREATE OR REPLACE ou IF NOT EXISTS.

## 4. Coûts et environnement le moins coûteux
Vérifié par les outils : **Pro actif ; 510,68 crédits restants au premier relevé**, période 25 septembre–25 octobre. Ce solde n’est pas une réservation ni un devis ; les échanges suivants le consomment. Aucune nouvelle infrastructure ni achat engagés. Documentation Cloud : allowance de 20 crédits/mois par espace de travail, pas par projet ; usage supplémentaire variable. Aucun montant fixe ni nombre de crédits nécessaire à une cible complète n’est confirmé.

**Option à privilégier pour les essais fictifs : ordinateur/CI déjà financé et accessible, avec moteur de conteneurs.** Stack complète locale du même moteur de services : PostgreSQL, API de données, Auth/JWT, Storage privé, runtime Deno, file et worker de capture sans fournisseur. Un stockage S3 quelconque + PostgreSQL seuls ne reproduisent pas les permissions/API du projet. Pas de nouvelle instance Cloud dans cette option ; licences, matériel et minutes CI peuvent coûter et doivent être vérifiés par le propriétaire.

Dans ce sandbox : PostgreSQL et Deno disponibles, ni Docker ni Podman présents au contrôle. Aucun runtime complet fourni, aucun conteneur lancé. L’option locale complète n’est donc pas exécutable ici aujourd’hui. Elle ne valide pas non plus un déploiement Cloud : la matrice doit ensuite tourner sur une cible hébergée indépendante si la validation hébergée est exigée.

**Option hébergée : projet Cloud indépendant**, identifiants base/API/stockage/Auth et origine distincts, capture de file uniquement, aucun worker CRM/SMS/SEO actif ni clé Live. Coût incrémental **non vérifié** avant choix de taille/durée et limites ; création nécessite budget/plafond explicitement autorisé. Un aperçu ou un remix sans données n’est pas une preuve d’isolation ni une restauration. Aucun nouveau projet/brouillon créé.

Étapes minimales : (1) fournir cible et accès autorisés ; (2) prouver séparations et sorties réseau interdites ; (3) installer schéma et droits uniquement fictifs avec dépendances réelles nécessaires ; (4) installer le paquet inactif sur cette seule cible autorisée ; (5) créer A/B synthétiques et photos artificielles ; (6) exécuter la matrice et inverses ; (7) conserver preuves puis nettoyer exclusivement fixtures/cible selon autorisation. Pour tester l’émetteur initial qui refuse les adresses réservées : domaine de capture contrôlé sans aucune sortie mail ; jamais lever les gardes de production.

Sources : https://docs.lovable.dev/integrations/cloud ; https://docs.lovable.dev/features/database-backups ; https://docs.lovable.dev/features/storage ; https://docs.docker.com/guides/docker-compose/ ; https://mailpit.axllent.org/docs/install/docker/ . Pas de devis d’un fournisseur créé.

## 5. Sauvegarde, export et restauration — non validés
La base actuelle mesure réellement **5 006 814 355 octets**, environ **5,01 Go décimaux / 4,66 Gio** (affichage PostgreSQL 4775 MB). **Ce n’est ni la taille d’un snapshot ni la taille compressée d’un export.** Taille réelle des sauvegardes/export : non vérifiée ; aucun téléchargement ni export effectué.

Sauvegarde déclarée par le propriétaire le 22 octobre ; existence/date du dernier snapshot **non vérifiées**, inventaire non accessible aux outils. Le propriétaire doit ouvrir **More → Database → Manage → Backups**, relever la dernière date UTC et l’environnement. Ce projet a une seule instance partagée aperçu/site publié ; ne pas inventer une sélection Test/Live séparée.

Documentation : une sauvegarde quotidienne, environ 14 jours, schéma+données uniquement ; pas de fichiers Storage, pas de restauration à un instant arbitraire. Export : base jusqu’à 15 GB, fichier jusqu’à 5 GB, un export/24 h ; backend doit fonctionner. La taille actuelle est sous la limite de base, mais l’éligibilité complète et la taille du futur fichier ne sont pas garanties. Export contient comptes et empreintes de mots de passe ; exclut fichiers, fonctions, secrets et fournisseurs de connexion.

Procédure **à autoriser séparément** : More → Database → Manage → Settings → Export data → Database → Export → Start export ; télécharger via lien reçu ou Storage. Destination indépendante détenue par le propriétaire, accès restreint, sortie courrier interdite, réconfiguration des connexions et secrets à destination ; vérifier restauration et sign-in, jamais mêler ces données réelles aux tests fictifs. Pas d’import libre-service dans le panneau Cloud. L’interface Backups restaure seulement le même projet en place, pas une nouvelle cible ; ne jamais l’utiliser comme essai en production. Les fichiers Storage nécessitent conservation séparée depuis More → Storage, sans copie automatique ici.

Avant tout retour global : données post-snapshot perdues, schéma reverti, indisponibilité de quelques minutes ; un export préalable conserve l’état courant de la base, pas les fichiers. Cette opération est permanente et n’est pas un retour ciblé réversible. **Restauration effective, sign-in restauré, photos conservées : non vérifiés.**

## 6. Liste d’actions finale, strictement séparée
### Déjà validé localement
196 tests ciblés, contrats des états, SQL/inverses sur bases jetables, refus null/version/interclient, liens/code/renouvellement, fermeture conservant historique/statut commercial, protections photos, intégrité des références et manifeste. Lecture seule actuelle effectuée.

### Ressource/coût et validation isolée nécessaires
Cible complète accessible et prouvée, budget si hébergée ; matrice `ENVIRONNEMENT-ET-MATRICE-ISOLEE.md` plus les nouveaux cas photos/dérive/unknown/manuelle. Deux endpoints HTTP complets et notification/file capturée sans doublon **et sans notification manquante** après crash. Reprise explicite simultanée et fournisseur capturé à exercer. L’unicité du dossier dans une réservation ne prouve pas une livraison de notifications exactement une fois. JWT/Storage/API/déclencheurs réels de test requis. Sans ces preuves, arrêt.

### Migrations SQL proposées, aucune appliquée
1. Précontrôle M1 : fonctions absentes et état tables/droits actuel ; sinon nouvel original/inverse. M1 anti-doublon v2, puis vérifier signatures/droits serveur et comportement ancien.
2. M2 guard_claim_id : deux colonnes nullables et deux index uniques partiels, historique NULL intact. Verrous/temps à mesurer sur cible ; ne pas promettre « quelques secondes » en production.
3. Durable : guard_claim_durable + guard_email_status ; seuil 600 s = recherche, jamais droit de recréer une réservation incertaine. Garder les ajouts au retour opérationnel.
4. Composition portail unique transactionnelle : **01 renouvellement → 02 durée → 03 formulaire → 04 confirmation initiale → 05 photos historique**. Sept gardes avant/après ; aucune table/ACL/policy/backfill. Ne pas appliquer les prototypes en plus.
5. Vérifier empreintes finales/droits/types sans dossier réel. Toute divergence = arrêt avant déploiement. Aucun autre lot de permission/SEO inclus.

### Déploiement des fonctions, autorisation séparée
Archive exacte des versions réellement hébergées et drapeaux manquante ; `previous/` n’est qu’une archive locale. Après validation complète, assembler les deux parcours et les quatre helpers, imports corrects ; portail autonome et dépendances ; courrier atomique, capture ciblée, origine et passerelle IP fiables. Ne jamais copier vers supabase/functions avant autorisation. L’absence des migrations empêcherait le code préparé de fonctionner.

### Publication du site, autorisation séparée
Adapter/raccorder d’abord le contrat `unknown` aux écrans remblai/vrac en développement sous autorisation de modification de ces pages. Le vrac actuel transforme `email_sent:null` en succès : **blocage connu non caché**. Revalider navigateur contre cible complète, pas mémoire fictive. Publication limitée aux changements approuvés, aucun titre/URL/SEO implicite.

### Test réel, autorisation séparée
Un dossier dédié et destinataire fourni, consentement explicite de création et d’envoi. Vérifier dossier exact, réception/code, édition/relecture, aucun doublon. Aucun effacement de demande/photo réelle ; nettoyage fictif exact seulement après accord distinct.

### Retour et arrêt
Avant commit : annulation de la transaction. Après commit autorisé : accès/admissions arrêtés selon procédure approuvée, paquet hébergé exact précédent d’abord ; inverse complet ou inverses **05 → 04 → 03 → 02 → 01** selon empreintes présentes. Restaurer uniquement les quatre définitions modifiées, zéro GRANT/REVOKE, zéro données. Réserver les correctifs durables souhaités, refuser toute dérive. Les liens déjà créés infinity ne sont pas raccourcis. M1/M2/durable et réservations restent conservés au retour code.

Risques d’arrêt immédiat : isolation douteuse, absence de sauvegarde/restauration/archives, fuite interclient, faux succès, secret journalisé, droits élargis, historique/photo perdu, courrier externe de test, notification double/manquante, SQL incomplet ou version périmée acceptée. Le traitement des anciennes échéances reste choix humain : renouvellement sécurisé conservateur ou prolongation ciblée expressément autorisée ; aucune mise à jour automatique.

## Prochaine autorisation minimale
**Fournir/autoriser une cible de tests complète distincte déjà disponible (ordinateur/CI avec conteneurs, sans nouvelle dépense), ou choisir une cible hébergée avec plafond de coût avant sa création.** Autoriser uniquement son initialisation fictive/capture et essais, pas la production. En parallèle : fournir la date UTC réelle du snapshot via Backups. Export/restauration de données réelles, adaptations des pages publiques, SQL production, fonctions, publication et vrai courriel restent des accords séparés.