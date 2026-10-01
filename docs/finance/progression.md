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

## À venir (selon les plans déjà convenus — rien de ceci n'est livré)
- FIN-09 : acomptes, facturation progressive et récurrente, retenues, avoirs.
- FIN-10 à FIN-23.
- OPS-00 à OPS-13.
- AVIS-01 à AVIS-03.

Les états non vérifiés listés ci-dessus et dans les lots précédents ne doivent pas être annoncés comme livrés.
