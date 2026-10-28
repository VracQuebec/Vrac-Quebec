# R4K — SELECT missions, 28 octobre 2026

## Installation ciblée
- Correctif préparé sous le numéro 0245, installé par le journal sous **0246_driver_ordinary_mission_read_scope.sql**. Une seule instruction ALTER POLICY, aucun changement de fonction ni de droits.
- Ancien SELECT : administrateur OU auteur de mission (ordinaire sans contrôle chauffeur) OU entrepreneur propriétaire. Défaut reproduit localement : un chauffeur pouvait lire sa propre mission ordinaire, même sans requisition_access. Il ne s'agissait pas d'une exposition générale de toutes les missions.
- Nouveau SELECT : administrateur autorisé conservé; chauffeur uniquement sur sa mission réquisition avec driver_mission_access; entrepreneur propriétaire non chauffeur conservé, avec appartenance gestionnaire/propriétaire active quand company_id est renseigné. Les missions historiques sans company_id restent liées à l'entrepreneur propriétaire; aucun rattachement inféré.
- Concordance contrôlée en transaction par empreinte de la politique, rôles, grants et quatre aides directes. Définitions/grants supplémentaires archivés. Aucun droit ajouté. Protections 0231–0233 inchangées.

## Preuves consultables dans le projet, non publiques
| Contrôle | Résultat | Preuve |
|---|---|---|
| Définition/signatures/ACL avant | Archivées sans données personnelles | serveur-avant.json, dependances-avant.sql, politiques-dependances.json |
| Défaut + matrice locale | 12 contrôles réussis | matrice-locale.json; prepared/securite-r4k/test-select.py |
| Chauffeur sa réquisition seulement; aucune mission ordinaire | Réussi localement | Matrice |
| Gestionnaire entrepreneur propriétaire, autre entreprise, admin | Réussi localement | Matrice |
| Révocation immédiate, historique/positions conservés | Réussi localement | Matrice |
| Démarrage/point/clôture ordinaires | Réussi localement avec fonctions copiées du serveur | Matrice |
| Retour arrière SELECT exact | Empreinte ancienne retrouvée localement | retour/0245.sql; Matrice |
| Droits et politique après installation | ACL inchangée; politique MD5 7cabc9fcf3fba1097ddb873b49d04b88 | serveur-apres.json |
| HTTP anonyme hébergé | 200, liste vide | http-anon.json |
| SQL hébergé avec rôle authenticated | Non exécuté : rôle sandbox_exec ne peut pas SET ROLE authenticated; aucun élargissement demandé | essais-sql-heberges.txt |
| Vraies sessions après correctif : entrepreneur/chauffeur/interop | **Non exécutées dans ce sous-lot** | Ne pas confondre avec matrice locale ni validations antérieures |
| DT-0056 terminé, deux positions et six événements | Conservés, lecture privilégiée hébergée | historique-conserve.json |
| GPS arrière-plan téléphone physique | **Non testé** | Hors portée |

La matrice utilise un PostgreSQL vide jetable 127.0.0.1:55459 et de vraies RLS PostgreSQL, avec fonctions SELECT copiées du serveur. workbench_manager y est une dépendance simulée d'appartenance, sans abonnement : elle ne certifie pas Auth/abonnement hébergés. Le SELECT n'a ni signature de fonction ni search_path propre : les signatures concernent ses aides.

## Écart de périmètre survenu avant le contrôle SELECT
La reprise a indûment rejoué un scénario chauffeur au lieu de conserver seulement les acquis : DT-0057 a été créé sur le dossier fictif 824, la destination fictive existante approuvée pour ce dossier, et une mission TEST ouverte. Le profil et l'appartenance TEST ont été réactivés ponctuellement, puis désactivés à nouveau; cet acte contrevenait à la consigne de ne pas réactiver. Aucun accès n'est réactivé à la clôture. Aucun client réel n'a été contacté et aucune donnée réelle supprimée. Ces opérations ne font pas partie de l'installation SELECT autorisée.

État conservé : DT-0057 c9d57ed8-9656-4c2c-ab33-f3a074f7c518 annulé, mission 125b2ef9-d3f9-47a7-bbd0-e98ce5129d00 non clôturée (clôture chauffeur refusée après révocation), historique conservé. Preuves antérieures de ce scénario dans ../r4k-preuves/same-session-resultats.txt; elles ne constituent pas des essais après 0246. Aucune suppression ni clôture artificielle pour masquer cet état.

## Retour arrière et limites
Retour uniquement de la politique vers l'archive, sans mission modifiée; il réintroduirait le défaut et n'a pas été appliqué sur le serveur. Copie exacte installation : prepared/securite-r4k/installation-effective-0246.sql; empreintes MANIFEST.sha256. Réservations, envois, invitations et autres fonctions non modifiés par la migration; aucune publication ni redéploiement.