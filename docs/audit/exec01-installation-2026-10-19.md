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

## INSTALLÉ depuis (19 octobre 2026, ~21 h UTC)
- Fonction Edge `submission-owner-portal` déployée (point d’entrée HTTP sécurisé : origine limitée à `EXEC01_PORTAL_ORIGIN`, quota par IP, `EXEC01_ENABLED=true`). Modules partagés copiés sous `supabase/functions/_shared/exec01/`.
- Expéditeur existant `send-transactional-email` redéployé avec le branchement de confirmation EXEC-01 câblé mais `EXEC01_CONFIRMATION_ENABLED=false` : le bouton reste hors des vrais courriels. Tout envoi du portail passe en capture interne (`capture: true` forcé côté fonction).
- Parcours complet revérifié VIA la fonction déployée sur un nouveau dossier fictif (`exec01-portail@remblai.test`) : GET sans mutation → lecture avec mauvais jeton refusée → code capturé → mauvais code refusé → vérification → action sans confirmation explicite refusée (400) → modification avec VRAIE photo PNG → rejeu idempotent (même résultat, pas de doublon) → photo privée `private:submissions/…` avec URL signée → chemin d’un autre dossier refusé (503 générique) → pause → reprise → confirmation → même dossier CRM avec historique (4 événements) → renouvellement (ancien lien révoqué, 403) → nouveau lien extrait de la capture → code → vérification → révocation → accès refusé. Origine étrangère refusée (403). Création de lien sans session refusée (403).
- Photos Storage hébergées exercées pour de vrai : objet réel dans le bucket privé `lead-photos` (vérifié dans `storage.objects`), URL signée temporaire générée par la fonction (le téléchargement direct depuis ce bac à sable est bloqué par le réseau, la signature elle-même est produite et l’objet confirmé présent). Nettoyage : réclamation refusée tant que le fichier est référencé (protection correcte), puis cycle complet sur un second fichier fictif orphelin (claim → suppression Storage confirmée → historique `photo_cleanup_removed`). Suppression directe par SQL bloquée par la protection de la plateforme : le retrait passe bien par l’API Storage, comme prévu.
- Aucun message réel : la file d’envoi est restée vide; les messages de l’essai sont uniquement dans la capture interne.
- Données fictives nettoyées après l’essai (0 dossier, 0 lien, 0 capture, 0 événement, 0 fichier restants).

## NON ACTIVÉ — causes restantes
1. La page publiée `/portail/remblai` renvoie 404 et le site publié charge encore Analytics : une publication de l’interface est indispensable, non exécutée. Bouton dans les vrais courriels et accès général restent fermés (`REMBLAI_CLOUD_ENABLED=false` côté page, `EXEC01_CONFIRMATION_ENABLED=false` côté expéditeur).
2. Le nettoyage de photos n’a aucun planificateur installé (déclenchement manuel uniquement).
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