# Paquet EXEC-02 → éditeur de demandes → missions R4D (préparé, NON installé)

État au 2026-10-27 13:45 UTC. Aucune installation autorisée par la consigne de ce lot.

## Constats sur le serveur en service (lectures seulement)
- EXEC-02 **absent** : aucune table de réservations, d’accords acceptés, d’exceptions ni de réquisitions. Seul `transport_request_events` existe.
- Éditeur absent : aucune fonction `submission_edit_*`, `requisition_*`, `request_update_versioned`.
- Missions actuelles : `drv_mission_start(_sub, _driver, _truck, _consent)`, `drv_mission_point`, `drv_mission_end`, `drv_points_batch` présents. Empreintes md5 des définitions :
  - start `69be1722ee4ae88ea5ac924613843175`, point `e90183e81735e443e71592342390fc8b`, end `ae368118fab9b950755e58a157fdb744`, batch `d2298bdec54e224e506b3f66e0557e34`.
- Données à préserver : `drv_missions` = 0 ligne, `drv_points` = 0 ligne (comptes seulement). Le correctif R4D doit quand même accepter la forme historique (mission liée à une demande sans réquisition) — couvert par les tests locaux R4D antérieurs (14/14 SQL).

## Ordre d’installation (chaque étape = autorisation distincte)
1. Sauvegarde + archivage des définitions/ACL des 4 fonctions missions ci-dessus; refuser si une empreinte diffère.
2. EXEC-02 schéma : composition de `exec01b/coordination.sql` + `exec01b/lifecycle.sql` sur le schéma réel (ces fichiers ne sont pas des migrations rejouables telles quelles). Planificateur `lifecycle-schedule.sql` laissé désactivé.
3. Éditeur R4B : `R4B-COMPOSITION`, `R4B-TRANSPORT`, `INSTALLATION-NON-APPLIQUEE.sql` (lecture/écriture versionnée, invalidation des accords).
4. R4C : dépendance employés → profil RLS → portail → invitations (ordre `INSTALLATION-R4C.md`).
5. R4D : capture → révocation → documents → RPC missions (`R4D-*-NON-APPLIQUE*.sql`), drapeaux interface laissés à false.
6. Vérification droits effectifs + appel serveur anonyme (401) + essais avec comptes TEST.

## Retour arrière
Ordre inverse : `R4D-RETOUR`, `R4C-RETOUR`, `RETOUR-NON-APPLIQUE.sql`; fonctions missions restaurées depuis l’archive de l’étape 1 (empreintes ci-dessus). Pas de suppression de tables ni de restauration globale.

## Empreintes
`MANIFEST-PAQUET-EXEC02-EDITEUR-R4D-2026-10-27.sha256` (24 fichiers). Les anciens manifestes R4C/R4D ne correspondent plus (3 fichiers modifiés depuis par correctifs ultérieurs) : utiliser le nouveau.

## Bloquants
- Autorisation d’installation (non donnée dans ce lot).
- Composition EXEC-02 sur schéma réel à écrire puis tester sur base jetable avant toute demande.
- Essais intégrés exigeant les comptes TEST.
