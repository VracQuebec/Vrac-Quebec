# EXEC-01C — configuration et raccordements, activation interdite dans ce lot

## Sources réellement inspectées (19 octobre 2026, lecture seule)
Métadonnées Cloud : colonnes, défauts, contraintes et clés étrangères de `submissions`,
`submission_fill_profile`, `submission_material_conditions`, `submission_accepted_materials`,
`trips`, `cpn_trips`, `transport_requests`, `submission_site_decisions`, `jsc_requests`,
`jsc_quotes`, `jsc_orders`, `jsc_deliveries`; politiques du dossier et des photos,
définitions `has_role`, `set_dompe_availability`, `submissions_touch_availability`,
`log_submission_availability`, `enqueue_email`, déclencheurs de `submissions`.
Types générés consultés, jamais régénérés. Aucune ligne de contact consultée.

Constats déterminants :
- `has_role` exige le rôle admin **approuvé**, avec `app_role`, pas une chaîne de rôle locale.
- `submissions.status` vaut `nouveau`; `request_type` vaut `livraison` par défaut.
  Le hook ne s'applique qu'à `remblai` + direction explicite `reception` sans contradiction.
  Ancien dossier au sens inconnu : refus, pas interprétation automatique.
- Le déclencheur existant date aussi les pauses : cette date n'est pas une confirmation.
  `exec01_owner_confirmed_at` distingue désormais la confirmation explicite du propriétaire.
- `submission_material_conditions` porte des exigences documentaires; le propriétaire
  ne les écrase jamais. Ses préférences restent dans le profil de réception existant.
- `lead-photos` est **privé en Cloud**, contrairement à son ancienne migration initiale.
  Limite 10 Mo, JPEG/PNG/WebP/HEIC/HEIF. Le nouveau parcours n'accepte que JPEG/PNG/WebP,
  4 Mo, signature MIME contrôlée; aucune nouvelle création de bucket requise.
- `trips.submission_id` et `cpn_trips.submission_id` sont des liens effectifs.
  `jsc_deliveries` n'a pas de lien direct au dossier : aucune association par adresse/client.

## Intégration sans activation
- `src/lib/remblai/activation.ts` : false. Aucun paramètre URL ou variable d'environnement
  n'autorise Cloud. Client chargé dynamiquement seulement après ce contrôle.
- `CrmReceptionPanel` monté dans la fiche `/admin?lead=<id>` existante, invisible tant
  que désactivé; lit le même RPC, jamais un second dossier. Le portail existant sélectionne
  l'adaptateur local/Cloud; accès réel désactivé.
- `schema.sql` et `quota.sql` restent **préparés** : aucune migration publique appliquée.
  Le local applique ces mêmes fichiers byte pour byte, avec fixture structurelle vide.
- Empaquetage répétable : `bun prepared/exec01b/package.ts`; sorties `/tmp/exec01c-package`.
  Contrôle des types : `deno check --config /tmp/exec01c-package/deno.json /tmp/exec01c-package/prepared/exec01b/edge-entry.ts`.
  Ce contrôle prépare les sources; il n'exécute pas l'entrée ni n'appelle Cloud.
- `photos.ts` + adaptateur `lead-photos` : chemin par dossier, empreinte du contenu,
  pas de nom privé dans le chemin, référence privée stockée, URL de lecture 120 secondes.
  Autorisation et code récent avant upload; propriétaire d'un autre dossier refusé.
- `mail-dispatch-hook.ts` : seam du `client-confirmation` existant; conserve
  `client-confirm-<id>`, destinataire serveur, contenu sans traceur, aucun second envoi.

## Activation minimale ultérieure et limites à ne pas masquer
1. **Cloud/PostgREST/JWT non exécutés.** Cause : le projet accessible est le serveur
   public partagé, les essais écrits y sont interdits. Autoriser un environnement Cloud
   isolé, appliquer schema.sql, quota.sql, coordination.sql puis lifecycle.sql préparés et y vérifier JWT réel, rôle approuvé, RLS,
   appels PostgREST et tous les déclencheurs. Aucun nouveau service payant créé ici.
   La fixture copie les colonnes nécessaires et le déclencheur de disponibilité,
   pas les notifications, le SEO, l'audit entreprise ni le schéma complet.
2. **Serveur préparé non déployé.** Cause : toute écriture sous `supabase/functions`
   déclenche potentiellement un déploiement automatique. Après autorisation, empaqueter
   les imports (`src` n'est pas envoyé avec une fonction) et installer l'entrée sous
   `submission-owner-portal/index.ts`; remplacer explicitement les deux verrous false
   seulement après les essais isolés. URL d'origine complète, CORS exact, aucune télémétrie
   sur les routes personnelles. Configuration `EXEC01_PORTAL_ORIGIN`, capture locale
   `EXEC01_MAIL_MODE=capture` et `EXEC01_CAPTURE_URL` tant que l'envoi n'est pas autorisé.
3. **Courriel normal non activé, atomicité lien/file vérifiée localement par EXEC-02.** Cause : les fonctions
   actives restent intactes. Insérer le hook dans `send-transactional-email` après lecture
   du dossier et contrôles d'envoi; remplacer le rendu de `client-confirmation`, conserver
   la file `transactional_emails`. Ne pas insérer le hook dans les données anonymes du
   modèle : elles sont remplacées côté serveur. Avant activation, réserver l'idempotence
   de confirmation et garantir reprise du même lien/message à l'échec d'enqueue.
   Utiliser désormais `enqueueExistingClientConfirmation` et `exec02_dispatch`, pas l'ancien
   hook de préparation séparée : rollback lien/file/opération et reprise sans doublon vérifiés
   sur PostgreSQL local. Le branchement au rendu géré, suppression et désabonnement est écrit par EXEC-02B
   dans les copies préparées du sender/worker; installer et tester ces copies en isolé,
   puis retirer leurs verrous uniquement après autorisation. `prepareMail` absent reste bloquant.
   Codes/renouvellement : adaptateur capture seulement, aucun prestataire réel branché.
4. **Storage API réelle non exécutée.** Cause : aucun fichier test autorisé en Cloud.
   Tester upload/signature/expiry sur le bucket privé de l'environnement isolé. Le test
   actuel applique la vraie politique de chemins/MIME et sert les octets en HTTP local,
   mais n'est pas un test de Storage Cloud. Fichiers historiques non conformes au chemin
   dossier : pas de signature ni migration automatique; rapprochement explicite à préparer.
   Un échec SQL après upload peut laisser un objet privé orphelin : prévoir collecte avant activation.
5. **Quota en bordure.** SQL concurrent testé (30/minute, empreinte uniquement) dans
   `public_request_guard`. L'entrée préparée exige `cf-connecting-ip` provenant d'un
   proxy de confiance; vérifier présence et nettoyage de ce champ côté hébergement,
   sinon accès refusé. Ne pas utiliser une adresse IP fournie par le visiteur.
6. **EXEC-02 développé et validé localement, non activé.** Lecture des voyages explicitement liés seulement; `planifie` n'est pas
   « livraison confirmée ». `cpn_trips` reçu = preuve séparée, jamais ajouté au livré ni
   utilisé pour convertir le restant. Compatibilité, proposition acceptée par propriétaire,
   réservation et autorisation de réception sont préparées dans `coordination.sql`. Aucun lien nouveau vers
   `jsc_deliveries`, aucune identité d'entrepreneur/transporteur exposée.

La configuration des fournisseurs d'authentification et la livraison réelle des messages
ne sont pas établies par `project_info` : elles restent non vérifiées.
## EXEC-02B — mise à jour commune (19 octobre 2026)
- **Terminé dans les sources, non déployé** : payload/render React Email existant, idempotence stable, contact revérifié transactionnellement; copie sender + copie worker avec gardes/suppression et report de rappel hors horaires. Historique événement/lien/enqueue atomique. Mesures trips et corrections au delta dans le panneau CRM déjà monté. Aucun second CRM ni expéditeur.
- **Validé isolément** : SQL/HTTP persistants (35 tests ciblés), capture du vrai rendu React Email, billet partiel 12 → correction 10 → CRM/portail restant 90 et réservé 20; trois largeurs. Types des trois entrées Deno et compilation aperçu. Les fonctions actives restent inchangées.
- **À installer seulement dans un Cloud isolé autorisé** : ordre schema → quota → coordination → lifecycle; fixture locale ne remplace pas tous les triggers. Vérifier JWT/PostgREST/RLS/roles/visibilité/photos. Copies préparées à intégrer au sender/worker existants après empaquetage; conserver leurs constantes scaffoldées et enregistrer le modèle dans le registre existant.
- **Queue API non exécutée localement** : `exec02_defer_message` utilise pgmq.set_vt de l’infrastructure existante; vérifier signature/permissions, reprises, suppression, désabonnement, TTL d’un rappel jusqu’à l’expiration et capture prestataire autorisée. Ne pas recréer l’infrastructure email. Ne pas annoncer une capture comme un envoi.
- **Planificateur écrit, non installé** : `lifecycle-schedule.sql`, repli horaire authentifié avec le credential Vault de la file existante; 24 checks/jour, <=60 min de retard pour journal/courriel, risque de coût récurrent. La capacité est exclue à l’échéance lors de la lecture. Valider d’abord environnement/extensions/acteur système; aucun cron public dans ce lot. Harnais local minute seulement.
- **Proxy** : header fiable absent = refus; nettoyage hébergé non validé. **Codes/renouvellements** : capture locale uniquement, envoi réel séparément autorisé. **Storage** : signatures/upload/collecte d’orphelins à vérifier isolément, aucun objet réel utilisé.
- Aucune dépendance d’activation ne remplace du code courrier/rappels/mesures à écrire; toutes les dépendances restantes exigent autorisation ou validation sur un service hébergé réellement isolé.

## EXEC-03 — secteurs et économies, sources préparées
- Même carte et comparateur, domaine de secteurs/coûts partagé avec HTTP local; 17 tests ciblés et navigateur local, calcul 600 $ et export PDF vérifiés. Bilan : docs/audit/exec03-bilan.md.
- Autoriser Cloud isolé, appliquer prepared/exec03/preferences.sql puis search-sites.sql; tester membership actif, JWT, RLS et résultats entrepreneur. La ville n’est pas exposée par le RPC courant; extension limitée au résultat autorisé et aux coordonnées publiques.
- Empaqueter `bun prepared/exec03/package.ts`, installer entrepreneur-search seulement après autorisation; vérifier configuration d’origine, connexion Google existante et acteur approuvé. SEARCH_CLOUD_ENABLED et entrée serveur restent false.
- Aucun appel Google exécuté : géocodage libre, dessin/rendu carte et routes à valider sur origine déployée autorisée. Usage Google potentiellement facturé : validation des coûts avant activation, session obligatoire, 25 candidates maximum, cache/déduplication. DRIVE n’est pas une validation camion lourd.
- Préférences serveur non actives sur le site partagé; région via référentiel municipal partiel, inconnue conservée. Conditions détaillées restent validées par coordination EXEC-02, pas autorisées par la recherche. Aucune modification aux dépendances EXEC-01/02 ci-dessus.

## EXEC-04 — communications et partenaires, sources préparées
- Extensions des objets `mkt_consents`, `mkt_promo_sends`, `mkt_quote_requests`, `mkt_bids`, `mkt_commissions`, `mkt_pricing_rules`; campagnes et journal seulement, aucun second CRM. `prepared/exec04/schema.sql` après les migrations EXEC-01/02; aucun ancien propriétaire inscrit automatiquement au réseau, `exec04_network_enrolled_at` exige une provenance explicite. Ne jamais remplir cette date globalement à partir du type remblai.
- 21 tests PostgreSQL ciblés, capture courrier locale et parcours navigateur propriétaire/code → besoin → qualification → refus/partage → réponse/soumission relue; desktop/mobile sans appels externes. Le harnais exige `EXEC01B_LOCAL_TEST=1`, écoute loopback seulement, identité fictive explicite et Origin local pour login; ce login n'est pas une authentification Cloud.
- Autoriser un Cloud isolé avant installation; vérifier tous les déclencheurs réels, JWT admin approuvé, membership propriétaire/gestionnaire par entreprise, RLS/grants et refus entre dossiers. L'entrée `network-communications` et `EXEC04_CLOUD_ENABLED` restent désactivés. Empaqueter avec `bun prepared/exec04/package.ts`; contrôle Deno sans exécution serveur.
- Installer uniquement en isolé la copie préparée du worker existant, avec `queue-guard.ts` (empaqueté par `prepared/exec01b/package.ts`); vérifier enqueue/pgmq réels, reprise avec même idempotency_key, suppression/retrait, échéance et échecs prestataire. `capture_only` bloque toujours le prestataire. Aucun envoyé/livré déclaré par les captures; événement livré réservé au retour fiable du prestataire.
- Les modèles offre/rendez-vous réutilisent EXEC-02; les campagnes générales les excluent pour ne jamais inventer offre ou réservation. Suivi opérationnel distinct des promotions et du partage. SMS/app enregistrables au registre mais aucune nouvelle voie d'envoi raccordée.
- Retrait promotionnel : garde du jeton utilisé et de suppressed_emails; vérifier le parcours hébergé `/unsubscribe` et son prestataire en isolé. Proxy de confiance nécessaire au quota, absent = refus; ne pas déclarer le proxy validé.
- Commission : référence unique à une facture existante émise, montant/attribution/droits financiers contrôlés; émission/crédits/encaissements via moteur `fin_*` existant, aucun second mouvement. `fin_invoice_balance` réel pour états payée/annulée par crédit. Le local utilise une fixture de son contrat : crédits/taxes/receipts complets et trigger financier réels restent à tester en Cloud isolé. Sans taux et preuve d'événement, montant/acquisition inconnus.
- Bilan et captures : `docs/audit/exec04-bilan.md`. Toutes les dépendances EXEC-01/02/03 et Google ci-dessus restent en attente; aucune publication, dépense ou modification de contact réel.

## Correctifs audit EXEC-03 / EXEC-04 — 19 octobre 2026
- Ordre complémentaire : EXEC-01/02 → EXEC-03 geography.sql → preferences.sql/search-sites.sql → EXEC-04 schema.sql. Référence seo_cities (name, province, territory_type, region_admin) requise; aucune copie de coordonnées ni enrôlement historique.
- Consentement isolé par entité/sujet/canal/partenaire/besoin; preuves TEST immuables et autorisantes seulement pour capture dans le cluster jetable local vérifié, jamais pour le worker réel.
- Valider en Cloud isolé la rotation du jeton utilisé, l’invalidation de l’ancien URL et la conservation bounce/complaint avec le handler de désabonnement existant.
- Vérifier file pgmq réelle : messages déjà en file délégués au worker existant, progression des suivants, éligibilité fraîche et journal; capture et envoi séparés.
- Acquisition limitée aux événements result journalisés, liés au même besoin et partenaire; autres déclencheurs restent refusés tant qu’une preuve métier officielle n’est pas raccordée. Finances complètes non certifiées localement.
- Prévol Authorization/apikey/x-client-info corrigé; dessin Google réel non testé ni activé. Résultats courants sans ville/région restent à confirmer jusqu’à installation autorisée de search-sites.
- Bilan de correctifs : docs/audit/exec03-exec04-correctifs.md. GO éventuel concerne uniquement une validation d’intégration isolée, pas la production ni EXEC-05.

## Complément EXEC-04 — 19 octobre 2026
- Registre complet et identité propriétaire prioritaire intégrés aux sources; 55 tests ciblés et parcours navigateur complet capturé uniquement en local.
- Avant activation isolée autorisée : vérifier permissions réseau/admin, identité du lien avec session staff concomitante, projections du registre et historique, prévol CORS, reprise du worker et preuves financières avec vrais objets de test.
- Aucun taux retenu : ententes sans montant sauvegardables, acquisition impossible sans règles commerciales complètes et événement vérifiable. Validation financière de bout en bout toujours non réalisée.
- Tous les verrous Cloud, Google, envoi réel et EXEC-05 précédents restent en vigueur.

## EXEC-05 — facturation entrepreneur, 19 octobre 2026
- Sources intégrées aux écrans CRM/Factures existants : navigation croisée, client/chantier, création idempotente préparée, PDF figé téléchargeable, destinataire/objet/message et brouillon EML non envoyé. Règlements et avoirs réutilisent fin_*; aucun second registre.
- 29 tests ciblés réussis : 7 tests SQL sur base vide jetable, 4 règles courriel/statuts et 18 tests des composants financiers concernés. Entrepreneur propriétaire ordinaire, refus interentreprises, facture directe/conversion, paiement partiel/solde, acompte/solde progressifs, avoir et rejeu. Grand livre original 0148 chargé localement : facture 229,95 $, encaissement 100 $, avoir 229,95 $, débits=crédits, comptabilisation répétée sans doublon et écritures protégées.
- SQL prepared/exec05/invoices.sql NON appliqué au Cloud. EXEC05_HOSTED_ENABLED=false; entrée finance_test=local sur localhost uniquement. Adresses fictives, capture locale de la file EXEC-02, aucun appel à un prestataire. Migrations 0118/0119/0120 hors assemblage local; tous les déclencheurs hébergés restent à vérifier.
- Autorisation Cloud isolé requise pour vérifier schéma exact et prédécesseurs, migration additive préparée, JWT/permissions/PostgREST, numérotation concurrente et Storage privé (upload, signature, téléchargement, absence d'écrasement). La fixture locale de membres ne certifie pas les paramètres d'inscription ou de connexion hébergés.
- Courriel réel non raccordé ni activé : le fichier EML local accepte une pièce jointe, mais le service de courriels d'application ne prend pas en charge les pièces jointes; adapter à un lien privé signé et enregistrer le modèle dans la file EXISTANTE lors d'une validation isolée autorisée, sans envoi externe. Vérifier suppression, reprise, destinataire, idempotence et retours prestataire séparément. Ne jamais convertir « capturé » en « envoyé/livré » ni marquer payé après courrier.
- Associations du grand livre par entreprise indispensables, sans compte ni tarif inventé. Le lien « Grand livre » ouvre l'écran comptable global existant, pas une écriture présélectionnée. Paiements manuels indépendants de tout nouveau processeur; activation PSP hors lot.
- Bilan/captures : docs/audit/exec05-bilan.md et exec05-preuves/. GO pour demander une validation isolée; NO-GO production. Toutes les dépendances EXEC-01/02/03/04, Google et communications restent conservées; aucun lot suivant autorisé.


## EXEC-06 — accès employés et punch, 19 octobre 2026
- `prepared/exec06/schema.sql` préparé seulement après les objets CRM/Punch/Paie existants; `EXEC06_HOSTED_ENABLED=false`. Identités/memberships existantes; aucun deuxième punch ni paie. Entrée locale exclue des montages de télémétrie, invitation via fragment séparé.
- 17 tests ciblés réussis (12 SQL + 5 dates); parcours ordinateur/mobile avec employée/employeur fictifs, invitation préparée, punch/pause/reprise/sortie, oubli, approbation/export, correction après export, révocation et refus interentreprises. 0 requête externe, 0 erreur JS final. Base loopback vide jetable vérifiée puis supprimée; serveur arrêté.
- Cloud isolé autorisé requis pour schéma/signatures réels, index memberships, migrations 0154/0155, dépendances RPC *_base, JWT/RLS/PostgREST, confirmation email, création nouveau compte et révocation multi-session. Aucun réglage d'auth hébergée certifié.
- Invitation réelle non raccordée à la file existante : validation capture et parcours connexion conservant fragment nécessaire, aucun courrier externe autorisé. Hébergé affiche attente de validation, pas activation fictive.
- Hors connexion indisponible et clairement signalé; aucun événement mis en queue. Corrections des heures ambiguës Toronto demandent un choix d'offset explicite. Aucun suivi géographique permanent.
- Exports d'heures approuvées versionnés/idempotents et alerte après correction; ne garantissent pas déduplication dans un logiciel tiers. Paie finalisée bloque changements sans traitement financier séparé. Projection par chantier non monétisée, aucun tarif inventé ni imputation à trips.cost; règle de rapprochement/paie à valider en isolé avant raccordement monétaire.
- Bilan/captures : `docs/audit/exec06-bilan.md`, `exec06-preuves/`. GO validation isolée autorisée uniquement, NO-GO production. Toutes les dépendances EXEC-01/02/03/04/05 et Google conservées; aucun lot suivant autorisé.
