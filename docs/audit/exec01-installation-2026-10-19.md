# EXEC-01 — état réel au 19 octobre 2026

## Exécuté dans le projet, pas sur le serveur partagé
- Protection précoce du document personnel : pas de chargement GA/polices externes; fragments et paramètres privés retirés avant montage; mémoire seule. Navigation publique→personnelle redémarre le document avant affichage.
- Sources préparées : émission, codes et renouvellement avec capture/file transactionnelle; pas de livraison indépendante après commit. Contact courant associé à une empreinte vérifiée; nouveau contact doit être vérifié.
- Collecte préparée, commandes admin explicites uniquement : chemins du dossier enregistrés, fichiers fictifs seulement, âge minimal 24 h, bail de 15 minutes, conservation des références actuelles et des résultats d’opérations/historique. Aucun balayage du bucket. Une suppression réussie suivie d’un échec d’historique garde le verrou de suppression.
- Identifiant de lecture CRM conservé en mémoire après retrait de l’URL.

## Preuves locales
Commande : `EXEC01B_LOCAL_TEST=1 bunx vitest run src/test/remblai-installation-sql.test.ts src/test/remblai-installation.test.ts src/test/remblai-finalisation.test.ts src/test/remblai-exec01-handler.test.ts src/test/remblai-exec01b.test.ts src/test/remblai-exec01c.test.ts`.

51 tests réussis. Base PostgreSQL jetable locale, pas un clone du Cloud. Nouveau test : contenu réellement capturé → extraction du lien/code → traitements préparés → modification et même identifiant CRM → références photos privées et signatures locales → confirmation/pause/reprise → révocation. Renouvellement, replays, rollback de capture, quotas et changement de contact vérifiés en SQL local. Stockage d’images injecté en mémoire : ce n’est pas une preuve Storage hébergée.

Navigateur : aperçu `/portail/remblai` désactivé, zéro requête externe, aucun gtag, fragment retiré, aucune erreur JavaScript. Cette vérification ne prétend pas exercer le dossier hébergé. Site publié sans paramètre TEST : 404 et script GA présent. Aucun secret réel utilisé sur le site publié.

## Opérations hébergées réellement exécutées
Aucune migration, aucun déploiement de fonction, aucune modification de l’expéditeur, aucune suppression Storage, aucun message réel, aucune publication. Inspections en lecture seule seulement.

## NON ACTIVÉ — causes
1. Sauvegarde préalable non vérifiée : inventaire non accessible par outil. Le propriétaire doit fournir l’horodatage UTC de la dernière ligne dans **Plus → Base de données → Gérer → Sauvegardes**; l’autorisation d’installation existe déjà et ne sera pas redemandée. Aucune preuve de sauvegarde ou de restauration n’est inventée.
2. La page publiée n’existe pas : une publication de l’interface est indispensable, mais n’a pas été autorisée comme publication générale. Bouton dans les vrais courriels et accès général restent fermés.
3. Le parcours hébergé complet reste non exercé; fonctions préparées toujours sous `prepared/`, entrée propriétaire désactivée, capture uniquement. Avant activation : paquet de fonction, authentification admin et visiteurs sans compte, origine, quotas gateway, RPC/permissions, capture interne et stockage privé doivent être validés sur le dossier fictif.

## Installation préparée, non exécutée
Ordre SQL : `schema.sql` → `quota.sql` → `confirmation-queue.sql` → `owner-mail.sql` → `owner-photos.sql`. Additions aux dossiers existants et tables/RPC privés; aucune reprise massive des demandes historiques. Nouvelle empreinte de contact nullable, pas de vérification rétroactive présumée. Raccordement initial remplace la confirmation existante, jamais un second message.

Retour opérationnel : maintenir/désactiver l’entrée et le bouton, rétablir la version précédente de l’expéditeur; conserver les extensions additives et l’historique, aucune suppression de tables ni de données. Restauration globale seulement en dernier recours : perte des écritures postérieures et retour du schéma avec les données; Storage non couvert.

## Changements potentiellement publiés
Une publication générale publierait tout le code de la version courante, pas uniquement EXEC-01. Pour EXEC-01, les changements comprennent le document initial (chargement conditionnel GA/polices et retrait des paramètres), les gardes Analytics/SEO/attribution/retour, le démarrage de l’application, la page personnelle/CRM et le rendu des photos. Les autres changements non publiés du projet ne sont pas inventoriés exhaustivement ici; aucune garantie de publication exclusivement EXEC-01. Les SQL et fichiers préparés ne seraient pas installés par publication du site.