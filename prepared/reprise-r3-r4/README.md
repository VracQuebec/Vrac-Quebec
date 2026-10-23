# R3/R4 — édition et réquisitions préparées, non installées

## Actualisation R4C — 23 octobre, après 18:43 UTC
Invitations chauffeurs composées avec le mécanisme employés : profil explicite, activation d’identité confirmée, expiration/rotation, révocation couvrant aussi les anciennes RPCs, catalogue protégé et panneaux préparés. Correction préparée supplémentaire du portail chauffeur et lecture directe du profil. **154 tests ciblés réussis**, serveur partagé inchangé; vraie Auth/API/Storage et raccordement des écrans/transport restent R4D. Le fichier `INSTALLATION-R4C.md` et son manifeste remplacent l’ordre historique ci-dessous pour la prochaine décision. « Fixed admin SEO » n’est pas un correctif revendiqué; seuls les changements de navigation approved/cache décrits en R4B sont démontrés.

## Actualisation R4B — 23 octobre 18:19 UTC
Composition réservations et transport réalisée/testée localement; détail et ordre exact dans `INSTALLATION-R4B.md`. Les limites R3/R4 ci-dessous sont historiques : la modification ne bloque plus toute réservation locale, mais invalide les accords affectés vers exception et préserve snapshots/mesures. Invitation JSC, vraie chaîne Auth/API/Storage et mise en service restent non livrées. Aucun serveur partagé modifié.

## Résultat exact
Éditeur de demande ajouté au dossier entrepreneur; panneau réquisition ajouté aux transports entrepreneur, missions admin et portail chauffeur. Contrats de sauvegarde/relecture/version et serveur PostgreSQL préparés. `REQUEST_WORKBENCH_INSTALLED=false` : aucune sauvegarde étendue, affectation ou notification réelle exécutables depuis ces nouveaux contrôles sur le serveur partagé. Ce verrou n’est pas une simulation de réussite.

## Structure et identifiants
- Demande = même ligne `submissions`, même UUID/numéro. Association d’entreprise explicite `edit_company_id`, jamais dérivée de texte/courriel/adresse; ancienne ligne non rattachée reste bloquée sans migration de données.
- Réquisition = enrichissement de la ligne `transport_requests` existante, pas nouvelle table CRM. Les IDs `driver_id`/`truck_id` historiques pointent vers `drivers`/`trucks`; les profils personnels existants sont `jsc_drivers`/`jsc_trucks`. Champs additifs distincts évitent de confondre ces références. Pas de synchronisation implicite entre les catalogues.
- Affectation exclusivement à un chauffeur ayant son propre `user_id` + membre actif `chauffeur` dans la même entreprise; camion actif, destination approuvée pour cette demande précise.
- Historique dans `ent_crm_history` et `transport_request_events`; notifications via `crm_notify` / `jsc_notifications`, jamais SMS/courriel du navigateur.
- Snapshot d’acceptation daté conservé; changement impose revalidation. Terminer une mission ne crée ni livraison mesurée, ni `trips`, ni débit ou écriture financière.

## Fichiers serveur proposés
`INSTALLATION-NON-APPLIQUEE.sql` : colonnes additives, fonctions sécurisées lecture/modification/association/réquisition/options, verrous et version/idempotence. Aucun nouveau tableau public créé dans cette proposition; aucun changement de rôle; `entcrm_can_write` conserve l’accès d’abonnement existant.

`RETOUR-NON-APPLIQUE.sql` : révoquer seulement nouveaux points d’entrée, conserver données/historique, laisser le flag désactivé. Pas restauration générale.

`REVOCATION-CHAUFFEUR-NON-APPLIQUEE.sql` : correction **indépendante** du helper historique `jsc_my_driver_ids()`. Définition hébergée lue : vérifie `user_id` et `archived_at` seulement, pas `is_active` ni appartenance révoquée. Empreinte originale épinglée; correctif préparé exige profil ET membership actifs. Aucun déploiement/appel d’écriture réel. L’inverse préparé est à épingler sur l’empreinte finale avant installation; aucune certification du retour arrière hébergé.

## Tests réellement exécutés
- 18 tests PostgreSQL de ce sous-lot, sur cluster vide `/tmp/exec-correctifs/reprise-r3/pg`, `127.0.0.1:55439`, bases UUID détruites individuellement après tests. Les appels métiers utilisent `SET LOCAL ROLE authenticated` et des sujets JWT fictifs; pas clé/profil réel.
- 7 tests interface/contrats injectés; 21 tests reprise SEO/date/double lancement; 6 régressions GPS du premier lot.
- Les 17 tests EXEC-03, dont les **5 anciennement ignorés**, exécutés sur le même cluster vide (base distincte). Aucun appel Google.
- Chromium 360/768/1280 : composants réels injectés dans un montage isolé, requêtes externes bloquées, modification/confirmation/relecture fictives; aucune largeur excédentaire. Ce contrôle n’est pas un parcours Auth/PostgREST hébergé.

### Liste exacte des cinq anciens essais SQL
Dans `src/test/entrepreneur-exec03.test.ts`, groupe « same prepared SQL on isolated PostgreSQL » :
1. `direct RPC cannot bypass geometric validation` : géométrie/rayon invalides refusés.
2. `direct RPC rejects missing fields and persists a polygon unchanged` : champs absents refusés, polygone conservé.
3. `preferences survive new session and stay company scoped` : relecture et séparation entreprises.
4. `other user and revoked membership denied server-side` : autre utilisateur et révocation refusés.
5. `GET read does not mutate preference timestamp` : lecture sans mutation.

Motif antérieur : aucun cluster loopback initialisé/precontrôlé dans R1, variable `EXEC01B_LOCAL_TEST` inactive. Moyen utilisé maintenant : nouveau `initdb` vide sous utilisateur non root, port fixe et data_directory vérifiés; `EXEC01B_LOCAL_TEST=1 bunx vitest run src/test/entrepreneur-exec03.test.ts --no-file-parallelism`. **Les cinq sont désormais réussis**, pas « non exécutés ». Cela ne certifie pas le serveur hébergé.

## Refus SEO : cause établie
La session `--self` possède seulement `user_roles.role='entrepreneur', approved=true`. `seo_city_generation_report` exige `has_role(auth.uid(),'admin')`; `has_role` exige également approved=true. Refus métier attendu, aucune preuve de panne de GRANT dans ce cas. Une session entrepreneur n’est jamais convertie en admin.

Action nécessaire pour E2E SEO admin : ouvrir l’aperçu avec un compte déjà administrateur approuvé; ou désigner ce compte existant pour une session de test via l’autorisation nominative `auth-session --user <UUID>`. Ne fournir aucun mot de passe ni jeton. Aucune génération réelle requise pour la lecture. 188 villes et catalogue théorique/pertinence conservés; correctifs SEO testés localement, pas « SEO entièrement corrigé ».

## Limites restantes avant installation
- Test local = schéma de dépendances minimal, vrai moteur PostgreSQL et vrai rôle SQL; `auth.uid()` fixture reproduit sujet JWT mais aucune vraie Auth/PostgREST/Storage, aucun worker de messages. Les triggers métier complets et contraintes du serveur public ne sont pas tous chargés.
- Raccordement `edit_company_id` absent pour l’historique : association administrateur unitaire préparée, aucun backfill. Questions de demandes liées uniquement par courriel/affectation et partenaires restent refusées pour éviter une appropriation.
- Réservations EXEC-02 présentes/engagées : modification **refusée** avec motif, pas libération fictive ni modification d’accord. Revalidation de capacité complète à composer avec EXEC-02 avant activation.
- Modification du formulaire transport legacy reste via `request_update` installé; sa version optimiste, notification sur modification sans changement de statut et composition avec réquisition ne sont pas corrigées serveur par cette proposition.
- Le panneau offre choix autorisés après installation, mais choix de contexte entreprise et invitations/rattachement au bon catalogue de chauffeurs doivent être vérifiés dans la chaîne réelle. Pas d’accès initial nouveau créé par ce lot.
- Avancement enregistrable, refus/annulation/incident testés; reprise opérationnelle après incident, mesures réelles/billet/capacité/finances restent à raccorder explicitement. Aucun accord implicite.
- Durée de rétention GPS et vérification sur écran verrouillé/arrière-plan demandent appareils physiques; permissions SQL, révocation et formulaire ne nécessitent pas de téléphone réel.
- Helper chauffeur legacy non corrigé en hébergé : risque réel identifié, correction préparée distincte; la sécurité du nouveau parcours préparé ne répare pas les anciennes policies tant qu’il n’est pas installé.

## Prochaine étape précise
R4B : composer la modification avec les réservations EXEC-02 et le `request_update` existant, charger les contraintes/triggers originaux dans une cible indépendante complète, tester les 3 chemins entreprise/admin/chauffeur avec vraie Auth et notifications capturées; ajouter choix d’entreprise/invitations via modules existants. Puis dresser la liste unique d’installation avec empreintes finales et inverse revérifié. Aucune demande d’installation n’est faite tant que ces points restent incomplets.