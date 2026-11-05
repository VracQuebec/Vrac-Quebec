# Nettoyage des demandes d'essai — 2026-11-05

## Supprimées (50) — preuve : courriel fictif réservé et/ou nom d'essai
| N° | Nom | Courriel |
|---|---|---|
| 375, 376 | AUDIT Remblai Test | audit.remblai@example.com |
| 377 | AUDIT Depot Test | audit.depot@example.com |
| 379, 380 | Audit Handoff | audit.handoff@example.com |
| 842–846, 848 | TEST Vrac Essai | essai.vrac@test.invalid |
| 849–855, 860 | TEST Navigateur Vrac | essai.navigateur@test.invalid |
| 856 | TEST Navigateur Vrac | essai.reprise@test.invalid |
| 858, 859, 861, 862 | TEST FINAL SOUMISSION … | final.assistant@test.invalid |
| 864–870 | TEST FINAL REPRISE … | reprise.<jeton>@test.invalid |
| 871–884 | Essai Fictif | essai-final@test.invalid |
| 904, 905 | Essai Centralisation | essai-centralisation-mkt/-tr@test.invalid |
| 906 | Essai Centralisation Vrac | essai-centralisation-vrac@test.invalid |
| 910, 911 | TEST Client (VQ-2026-00011/12) | client-mkt@test.invalid |

UUID complets : sauvegarde privée `/mnt/documents/.lovable/nettoyage-essais-2026-11-05/submissions.json`.

## Éléments liés supprimés
15 dossiers JSC (DEM-2026-00056 à 00069, 00072) + 15 estimations + 15 soumissions de test; demande de dompe DT-0058 et son historique;
3 demandes de services (VQ-2026-00010/11/12) avec invitations, offres, attributions, commissions fictives, notes, automatismes et notifications;
247 notifications CRM, ~45 suivis (+ journaux), journaux d'audit/disponibilité, matériaux acceptés, liens et captures de courriel EXEC-01.
Aucun déclencheur de communication sur suppression; aucun contact, compte ni document partagé supprimé.

## Conservés
- Protégés par historique figé (suppression refusée par la base) : #773 Camille Fictif EXEC-01, #823, #824, #826, #827 TEST R4K, avec DT-0056/DT-0057, 2 missions chauffeur fictives, 1 carnet CPN.
- Ambigus : #891 « Test » et #892 « Diag » (juillet, sans courriel), #836 « kas », #863 « Kasandra Guay paquette ».
- Fichier fictif `essai/483d…/photo-fictive.jpg` (lié à #824).
- Facture fictive F-00002 / F-00001 (entreprises TEST, document financier émis) : non touchées.

## Vérification
771 vraies demandes : empreinte ligne par ligne identique avant/après; aucune renumérotation. Site publié : recherches TEST/Essai/invalid ne montrent que les 5 essais protégés.

## Prévention
Aucun environnement de test séparé : l'aperçu partage la base de production. Plus aucun test d'écriture en production tant qu'une base distincte n'existe pas.
