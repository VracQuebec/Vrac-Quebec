# Progression Finances

Mode de travail : un lot validé, puis publication confirmée avant le suivant. Publication déclenchée par ChatGPT, autorisée par l'utilisateur après chaque lot validé.
Abonnements, connexion bancaire et envois réels (courriel, texto, push) : jamais activés par ces travaux.

## FIN-08B — Encaissements reliés aux factures (2026-10-01)
- Réalisé et vérifié côté serveur (essais TEST annulés dans la même transaction) et par tests ciblés : 15/15 réussis, build de production code de sortie 0.
- Verrous : ajout et annulation verrouillent la facture puis l'encaissement (même ordre). Aucun essai concurrent réel exécuté (pas de deux sessions TEST isolées) : garantie par conception, non démontrée par essai.
- Idempotence : rejeu identique = même opération; même clé pour une requête différente ou une autre facture = refus explicite (P0409).
- Parcours réel ordinateur/mobile : NON VÉRIFIÉ.
- Publication : EN ATTENTE.
- Limites conservées : compte informatif seulement; trop-perçu isolé dans sa facture.

## À venir (selon les plans déjà convenus — rien de ceci n'est livré)
- FIN-09 : acomptes, facturation progressive et récurrente, retenues, avoirs.
- FIN-10 à FIN-23.
- OPS-00 à OPS-13.
- AVIS-01 à AVIS-03.

Les états non vérifiés listés ci-dessus et dans les lots précédents ne doivent pas être annoncés comme livrés.
