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

## Opérations hébergées réellement exécutées (19 octobre 2026, après sauvegarde confirmée 04:41:30 UTC)
- Migrations additives appliquées, dans l’ordre prévu : `0225_exec01_schema_portail_remblai` (tables liens/opérations/événements, RPC `exec01_dispatch`/`exec01_projection`, verrous), `0226_exec01_quota_portail`, `0227_exec01_dispatch_correctif_inputhash` (correction d’une coquille de transcription `p->'inputHash'` → `p->>'inputHash'` dans la première application, par remplacement de fonction, sans donnée touchée), `0228_exec01_confirmation_queue`, `0229_exec01_mail_capture`, `0230_exec01_photos_privees`.
- Parcours complet exercé sur dossier fictif (`exec01-essai@remblai.test`, adresse réservée) : émission du lien → capture de la confirmation → demande de code (capture) → mauvais code refusé → vérification → action sans confirmation explicite refusée → modification des conditions → rejeu idempotent → conflit d’opération refusé → pause → confirmation en pause refusée → reprise → confirmation → même dossier CRM avec historique → renouvellement (ancien lien révoqué) → quota 60 s sur le code appliqué → vérification du nouveau lien → révocation → lecture refusée. Résultat : succès complet.
- Photos privées : cycle complet sur fichier fictif (enregistrement, claim trop récent refusé, claim après 24 h, mauvais identifiant de claim refusé, suppression confirmée, second claim refusé, chemin étranger refusé). Succès.
- Aucun message réel : la file `transactional_emails` est restée vide (0 message); les 4 messages de l’essai sont uniquement dans `exec01_mail_capture`.
- Données fictives nettoyées après l’essai (verrou d’historique contourné uniquement dans cette session de nettoyage).

## NON ACTIVÉ — causes
1. Le traitement de bout en bout navigateur n’est pas installé : la fonction Edge (adaptateur préparé `prepared/exec01b/owner-edge-entry.ts`) n’est pas déployée; les RPC sont installés et vérifiés, mais aucun point d’entrée HTTP ne les expose encore. Raccordement de l’expéditeur existant (hook confirmation) non installé.
2. La page publiée `/portail/remblai` renvoie 404 et le site publié charge encore Analytics : une publication de l’interface est indispensable, non exécutée. Bouton dans les vrais courriels et accès général restent fermés (`REMBLAI_CLOUD_ENABLED=false`).
3. Le stockage photo hébergé (bucket privé) n’a pas été exercé; le cycle testé l’a été sur le registre SQL, pas sur des objets Storage réels.
Retour arrière privilégié (sans restauration globale) : garder l’entrée désactivée et le bouton hors des vrais courriels; les extensions additives peuvent rester en place sans effet, ou être marquées DEPRECATED. Aucune restauration de la sauvegarde du 19 oct. 04:41 UTC n’est prévue : elle effacerait les données postérieures.

## Installation préparée, non exécutée
Ordre SQL : `schema.sql` → `quota.sql` → `confirmation-queue.sql` → `owner-mail.sql` → `owner-photos.sql`. Additions aux dossiers existants et tables/RPC privés; aucune reprise massive des demandes historiques. Nouvelle empreinte de contact nullable, pas de vérification rétroactive présumée. Raccordement initial remplace la confirmation existante, jamais un second message.

Retour opérationnel : maintenir/désactiver l’entrée et le bouton, rétablir la version précédente de l’expéditeur; conserver les extensions additives et l’historique, aucune suppression de tables ni de données. Restauration globale seulement en dernier recours : perte des écritures postérieures et retour du schéma avec les données; Storage non couvert.

## Changements potentiellement publiés
Une publication générale publierait tout le code de la version courante, pas uniquement EXEC-01; elle n’a pas été exécutée à cette étape.

Changements EXEC-01 qui seraient inclus :
- `index.html` : exclusion précoce des routes personnelles (GA/polices non chargés, CSP, fragments gardés en mémoire puis retirés), redémarrage du document lors d’une navigation publique→personnelle.
- `src/lib/analytics/privacy.ts`, `ga4.ts`, `attribution.ts`, `src/lib/seo/tracking.ts`, `src/App.tsx`, `src/main.tsx`, `src/lib/navigation/returnTo.ts` : gardes de télémétrie et de destination de retour.
- `src/index.css` : retrait de l’import Google Fonts (chargé conditionnellement).
- `src/pages/RemblaiFollowup.tsx`, `src/lib/remblai/isolated-client.ts`, `src/components/remblai/*` : page personnelle et panneau CRM.
- `src/lib/remblai/activation.ts` reste `REMBLAI_CLOUD_ENABLED=false` : même publiée, la page affiche « suivi non activé » et le bouton n’apparaît pas dans les vrais courriels tant que le traitement Edge n’est pas déployé et la page vérifiée sans traceur.

Autres changements non publiés du projet : non inventoriés exhaustivement; aucune garantie de publication exclusivement EXEC-01.

Fonctions pouvant rester désactivées après publication : l’envoi réel (`exec01_dispatch_mail` avec capture=false) et la file de confirmation initiale (`exec01_enqueue_confirmation`) restent sans point d’entrée tant que la fonction Edge préparée n’est pas déployée; le nettoyage de photos n’a aucun planificateur installé.

Les SQL et fichiers préparés ne seraient pas installés par publication du site.