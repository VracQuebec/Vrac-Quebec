# Progression Finances

Mode de travail : un lot validé, puis publication confirmée avant le suivant. Publication déclenchée par ChatGPT, autorisée par l'utilisateur après chaque lot validé.
Abonnements, connexion bancaire et envois réels (courriel, texto, push) : jamais activés par ces travaux.

## FIN-08B — Encaissements reliés aux factures (2026-10-01)
- Réalisé et vérifié côté serveur (essais TEST annulés dans la même transaction) et par tests ciblés : 15/15 réussis, build de production code de sortie 0.
- Verrous : ajout et annulation verrouillent la facture puis l'encaissement (même ordre). Aucun essai concurrent réel exécuté (pas de deux sessions TEST isolées) : garantie par conception, non démontrée par essai.
- Idempotence : rejeu identique = même opération; même clé pour une requête différente ou une autre facture = refus explicite (P0409).
- Parcours réel ordinateur/mobile : NON VÉRIFIÉ.
- Publication : déclenchée par ChatGPT (autorisée par l'utilisateur) via deploy_project, commit 66c48051da3a33af44d6b9661f817535815e41a3, deployment_id b8603d72-b23a-4b59-a667-12189e737db6, statut reçu « pending ».
- Vérification 2026-10-01 03:09 UTC : https://vrac-quebec.lovable.app répond HTTP 302 → https://vracquebec.ca/ répond HTTP 200 (titre « Vrac Québec | Terre, Sable, Gravier & Remblai »). Preuve obtenue : site accessible et projet publié. NON prouvé : que le nouveau déploiement est terminé ni que la version servie correspond au commit 66c48051 — aucun accès au statut du déploiement, et le nom du fichier servi (index-A032Tyo-.js) ne permet pas de rattacher la version à un commit.
- Limites conservées : compte informatif seulement; trop-perçu isolé dans sa facture.

## FIN-08B — Constat de publication (2026-10-01)
- Déploiement e9e61f56-ab19-4f59-858f-1ac75608aa6b du HEAD a8c07b4 (code applicatif 66c48051) : interface Lovable constatée par ChatGPT vers 03:51 UTC, message « Votre site web a été mis à jour ». Constat rapporté, non vérifié par Lovable; l'interface réelle des Finances n'a pas été vérifiée.

## FIN-09A — Notes de crédit liées aux factures (2026-10-01)
- Réalisé : brouillon lié depuis une facture émise (motif obligatoire, lignes/quantités ou montant plafonné), aperçu serveur, émission explicite, numéro unique par entreprise (série NC-), PDF privé « NOTE DE CRÉDIT » rendu depuis instantanés (facture originale et son PDF inchangés).
- Solde : une source commune serveur (fin_invoice_balance) = brut figé − avoirs émis − encaissements actifs/antérieurs, plancher 0; trop-perçu / crédit disponible isolé, aucun remboursement ni mouvement bancaire. Facture entièrement créditée : entrée attendue retirée des prévisions (archivée).
- Vérifié côté serveur (entreprise TEST, tout annulé) : 1 149,75 − 400 − avoir 229,95 = 519,80; rejeu identique = un seul avoir; autre payload / même clé autre avoir = P0409; surcrédit refusé; trois crédits successifs = 1 000 + 50 + 99,75 exactement (résidu exact); facture payée créditée → trop-perçu 229,95 isolé; lignes mixtes TTC cumul = total facture; profil fiscal modifié sans effet sur l'avoir; lecture seule et autre entreprise refusées; aucune écriture directe accordée.
- Tests : 20/20 (5 FIN-09A + 4 FIN-08B + 2 FIN-08 + 9 FIN-07), compilation de production code 0.
- NON exécuté : essai concurrent réel (pas de deux sessions TEST isolées) — garantie par verrou commun facture, non démontrée. Parcours visuel réel ordinateur/mobile NON VÉRIFIÉ (test d'interface isolé seulement).
- Limites : pas d'annulation d'un avoir émis (aucune procédure traçable existante); pas de remboursement ni affectation du crédit disponible; conformité fiscale non certifiée.
- Sources de conception : Revenu Québec, Retours de biens et Réductions de prix (https://www.revenuquebec.ca/fr/entreprises/taxes/tpstvh-et-tvq/situations-particulieres-liees-a-la-tpstvh-et-a-la-tvq/retours-de-biens/ et .../reductions-de-prix/) : note identifiant vendeur et inscriptions, client, date, TPS/TVQ ajustées.
- Publication : EN ATTENTE (par ChatGPT après examen).

## À venir (selon les plans déjà convenus — rien de ceci n'est livré)
- FIN-09B : acomptes et facturation progressive. FIN-09C : récurrence et retenues. (FIN-09A avoirs ci-dessus.)
- FIN-10 à FIN-23.
- OPS-00 à OPS-13.
- AVIS-01 à AVIS-03.

Les états non vérifiés listés ci-dessus et dans les lots précédents ne doivent pas être annoncés comme livrés.
