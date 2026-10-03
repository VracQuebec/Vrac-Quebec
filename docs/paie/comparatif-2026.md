# Paie 2026 — essais comparatifs (Québec)

Statut : **moteur NON validé**. Les comparaisons WebRAS (Québec) et T4127/PDOC (fédéral) n'ont pas pu être exécutées
dans l'environnement Lovable (outils officiels interactifs). Le paramètre `validated` reste `false`.

## Ce qui est vérifié
- Cotisations (RRQ, RRQ2, RQAP, AE Québec) : résultats attendus calculés à la main depuis les paramètres du mandat — **écart 0**.
- Parité moteur navigateur (`src/lib/payroll/engine.ts`) / moteur serveur (`public.pay_calc`) sur 9 cas — **écart 0**.

## Ce qui reste à comparer
Impôt fédéral et impôt du Québec : saisir les mêmes données dans WebRAS et PDOC, reporter les montants ci-dessous.
Éléments encore manquants qui produiront un écart attendu : montant canadien pour emploi (fédéral), déduction des
travailleurs (Québec), crédits Québec liés aux cotisations; montant personnel fédéral variable et formule FSS
intermédiaire dérivés, à confirmer.

## Données communes
26 paies/an, employeur ordinaire, masse salariale 800 000 $ (sauf mention), TD1/TP-1015.3 de base, CNESST non fourni.

| Cas | Brut période | RRQ / RRQ2 | AE | RQAP | Impôt fédéral | Impôt Québec | Net | FSS · Normes | Écart serveur/navigateur |
|---|---|---|---|---|---|---|---|---|---|
| Paie régulière (26 paies, 2 000 $) | 2000 | 117.52 / 0 | 26 | 8.6 | 142.05 | 175.34 | 1530.49 | 33 · 1.2 | 0 |
| Faible rémunération (26 paies, 120 $) | 120 | 0 / 0 | 1.56 | 0.52 | 0 | 0 | 117.92 | 1.98 · 0.07 | 0 |
| Prime de 5 000 $ avec paie de 2 000 $ | 2000 + prime 5000 | 432.52 / 0 | 91 | 30.1 | 726.55 | 983.84 | 4735.99 | 115.5 · 4.2 | 0 |
| Franchissement des plafonds (cumul 72 000 $, paie 4 000 $) | 4000 | 168.3 / 56 | 0 | 17.2 | 458.98 | 546.1 | 2753.42 | 66 · 2.4 | 0 |
| Au-delà du plafond RRQ2 (cumul 84 000 $, paie 4 000 $) | 4000 | 0 / 40 | 0 | 17.2 | 458.98 | 546.1 | 2937.72 | 66 · 2.4 | 0 |
| Reprise des cumuls en cours d'année (cumul repris 40 000 $) | 3000 | 180.52 / 0 | 39 | 12.9 | 290 | 358 | 2119.58 | 49.5 · 1.8 | 0 |
| Changement d'année (cumuls remis à zéro en 2026) | 4000 | 243.52 / 0 | 52 | 17.2 | 458.98 | 546.1 | 2682.2 | 66 · 2.4 | 0 |
| FSS progressif (masse 3 M$) | 2000 | 117.52 / 0 | 26 | 8.6 | 142.05 | 175.34 | 1530.49 | 48.35 · 1.2 | 0 |
| Secteur inconnu (FSS manquant) | 2000 | 117.52 / 0 | 26 | 8.6 | 142.05 | 175.34 | 1530.49 | manquant · 1.2 | 0 |

## Résultats attendus des cotisations (calcul manuel) — écart
- Paie régulière 2 000 $ : RRQ (2 000 − 3 500/26) × 6,30 % = 117,52 ✓; AE 2 000 × 1,30 % = 26,00 ✓; RQAP 8,60 ✓.
- Faible rémunération 120 $ : sous l'exemption de 134,62 $ → RRQ 0 ✓; AE 1,56 ✓; RQAP 0,52 ✓.
- Plafonds : cumul RRQ 4 311 $ → reste 168,30 $ jusqu'à 4 479,30 ✓; RRQ2 (76 000 − 74 600) × 4 % = 56 ✓; AE déjà au maximum 895,70 → 0 ✓.
- Au-delà de 85 000 $ : RRQ2 limité à 416 − 376 = 40 ✓.
- Changement d'année : cumuls 2025 ignorés, plafonds 2026 repartent de zéro ✓.

## Comparaison officielle à remplir
| Cas | WebRAS impôt QC attendu | Obtenu | Écart | PDOC impôt fédéral attendu | Obtenu | Écart |
|---|---|---|---|---|---|---|
| Paie régulière 2 000 $ | à saisir | 175,34 | — | à saisir | 142,05 | — |
| Faible rémunération 120 $ | à saisir | 0 | — | à saisir | 0 | — |
| Prime 5 000 $ | à saisir | 983,84 | — | à saisir | 726,55 | — |
| Plafonds franchis | à saisir | 546,10 | — | à saisir | 458,98 | — |
| Reprise des cumuls | à saisir | 358,00 | — | à saisir | 290,00 | — |
