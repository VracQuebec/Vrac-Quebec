# EXEC-02 — bilan du 19 octobre 2026

## Verdict
Parcours de coordination **fonctionnels et vérifiés sur PostgreSQL/HTTP local isolé**. Intégration Cloud **préparée, désactivée et non terminée**. Aucun déploiement, publication, migration partagée, génération, synchronisation, contact réel ni communication réelle.

## Existant réutilisé
- Dossier canonique `submissions`, conditions propriétaire dans `submission_fill_profile`; exigences documentaires indépendantes dans `submission_material_conditions`.
- Offres `material_offers` et moteur pur de matching existant : raisons compatibles/refusées/à confirmer, sans score fictif.
- Portail propriétaire et composant du CRM existant. Voyages `trips`; jamais conversion de `cpn_trips` en quantité.
- Exceptions dans `request_followups` / journal existant; notifications dans `crm_notifications`, uniquement fixture locale pour les essais.
- Aucun deuxième CRM : nouveau registre technique de réservations lié au dossier/offre/chantier. Aucun registre de réservations mesurées existant trouvé dans le schéma inspecté.

## Développé
`coordination.sql` et `coordination-endpoint.ts` restent sous prepared/exec01b. Le RPC service-only verrouille dossier puis offre, contrôle quantité restante/source/créneau, unité identique, minima, réception progressive, conditions/documentation et copie datée de l’accord. Version/période/empreinte source contrôlées; un changement nécessite une validation renouvelée. Expiration et annulation libèrent la capacité. Débit seulement par voyage terminé, quantité/unité/billet mesurés; unicité voyage et billet dans le dossier.

Trois modes : accord explicite préalable borné; rendez-vous à capacité/presence acceptées; confirmation individuelle avec acceptation/refus/autre moment. Les inconnues ne produisent jamais un accord. Matériaux organiques/déchets restent distincts de l’admissibilité environnementale. Une exigence documentaire acceptée n’est pas une preuve : vérification source nécessaire.

Liens hachés, dossiers limités, code récent pour propriétaire, GET sans mutation, opérations idempotentes. SQL crée lien et file dans la même transaction; panne d’enqueue = rollback, reprise = un seul lien/message. Capture **TEST** seulement. Adapter Cloud JWT/getUser/has_role approuvé préparé, pas exécuté. L’entrepreneur Cloud doit satisfaire la visibilité existante du dossier et posséder son offre; fixture locale de visibilité volontairement distincte, puisque les adresses fictives sont exclues par la vraie règle.

## Chemins d’accès
Serveur fictif : `127.0.0.1:55440`, PostgreSQL 17.9 `127.0.0.1:55439`, base aléatoire distincte et vide. Aucun client Cloud dans le harnais.
- Propriétaire : `/portail/remblai?server=local` depuis le lien capturé (secret en fragment retiré immédiatement, jamais dans ce rapport).
- Entrepreneur : `/entrepreneur/coordination-remblai?server=local&requestId=<dossier fictif>` avec session locale entrepreneur.
- Équipe : `/admin/apercu-suivi-remblai?server=local&requestId=<même dossier>` avec session locale admin.
Les routes personnelles/coordination évitent traceurs/providers métier. Domaine public : mode local refusé, activation réelle false.

Reproduction : démarrer PostgreSQL local déjà disponible; `bun prepared/exec02/harness.ts` (port 55440 libre), puis `python3 prepared/exec02/check_coordination.py`. Le harnais crée une base fictive nouvelle; `/harness/login`, `/harness/create`, `/harness/messages` existent exclusivement en loopback. Ne pas déployer ce harnais. Les rôles de harnais ne constituent pas un test JWT Cloud.

## Vérifications réellement effectuées
- `EXEC01B_LOCAL_TEST=1 bunx vitest run src/test/remblai-exec02.test.ts` : **20/20**, aucun échec. Même SQL préparé exécuté dans une nouvelle base vide à chaque suite.
- Trois modes; concurrence de deux réservations de 30 sur capacité 50 : une seule accordée, 30 réservés; refus d’une composante mixte; minima inconnus; documents absents et nouvelle exigence après proposition; expiration; autre dossier et autre entrepreneur refusés; code récent requis; lien expiré/révoqué; GET inerte; reprise idempotente; voyage et même billet déduits une seule fois; accord modifié bloque le débit; exception refus à l’arrivée avec libération; rollback lien/file lors de panne puis reprise cohérente.
- Navigateur réel : création fictive → confirmation capturée → ouverture du lien → code capturé et vérifié → proposition entrepreneur 30 m³ → accord propriétaire → **même dossier CRM affiche 30 m³ réservés**, restant inchangé 100. Annulation libère; rendez-vous 50 m³/presence accepté puis réservation; préautorisation explicite puis réservation compatible automatique.
- 360 / 768 / 1280 px : aucune erreur JavaScript ni débordement. Captures inspectées dans `exec02-preuves/` : confirmation propriétaire mobile, CRM desktop, portail aux trois largeurs.
- Sources préparées : `bun prepared/exec01b/package.ts` puis `deno check --config /tmp/exec01c-package/deno.json /tmp/exec01c-package/prepared/exec01b/edge-entry.ts` réussis. Compilation aperçu : dernier journal `build OK`.
- **121 fichiers actifs de fonctions serveur** : SHA-256 tous identiques, zéro nouveau fichier. Aucune action de déploiement appelée.

## Reste à activer / limites précises
1. **Cloud/JWT/PostgREST/RLS/tous triggers et Storage non vérifiés** : serveur public partagé interdit aux écritures TEST. Après autorisation d’environnement hébergé isolé, appliquer les SQL préparés uniquement là, tester rôles approuvés, visibilité réelle, règles de stockage et isolation des dossiers. La fixture n’est pas une restauration complète du Cloud.
2. **Courriel géré non raccordé** : `prepareMail` doit être fourni par la branche existante d’envoi après contrôle suppression/désabonnement, rendu React Email et construction complète du payload (from, sender_domain, purpose transactional, unsubscribe_token, message_id). L’adaptateur Cloud reste bloquant sans ce raccordement. Le payload local `purpose:service` est destiné au captureur, pas une preuve de compatibilité prestataire. Aucun deuxième expéditeur ni contournement de suppression. Le hook atomique est préparé; l’ancien hook non atomique ne doit pas être activé. Événements propriétaires capturés; envoi à l’entrepreneur non raccordé.
3. **Expiration/rappels autonomes non activés** : l’état expiré/libération est calculé en lecture et l’action expire journalise/prépare une capture. Raccorder un balayage serveur existant après autorisation; aucun cron public créé. Absence de réponse ne vaut pas accord.
4. **Mesures opérationnelles** : `trips` ne possédait pas quantity/unit/ticket mesurés; colonnes additives préparées. Raccorder la saisie/vérification des mesures au voyage existant avant débit Cloud; les nombres de voyages CPN ne suffisent pas. Test de débit exécuté SQL, pas formulaire complet de billet opérationnel.
5. **Documents de l’offre** : `material_offers.reception_documents` préparé; la vérification doit être écrite par l’équipe autorisée, pas le propriétaire. Contrôle spécifique source testé; upload/pièces réelles restant dans la validation Storage hébergée.
6. **Proxy/quota** : contrôle préparé exige header fiable `cf-connecting-ip`; sa présence/nettoyage réel n’est pas validé. Sans proxy validé, accès refusé. Aucun quota public activé.
7. **Couverture navigateur ciblée** : les trois modes et lecture CRM ont été exercés; concurrence, expirations, refus d’accès, rollback, débit et changement sont vérifiés SQL/endpoint, pas tous rejoués en navigateur. Les anciennes suites n’ont pas été relancées.

Facturation, punch et paiements non touchés. Développement local livré; ne pas qualifier l’activation Cloud d’EXEC-02 de terminée.
