# Module 4 — Moteur financier Transport JSC

Version : `financial-engine-1.0.0`. Consomme la sortie du module 3 (trajets) et
produit **tous** les montants d'une soumission. Aucun PDF, aucun courriel,
aucune écriture en base : le moteur retourne un objet complet.

## Architecture (indépendante de l'interface)

| Fichier | Rôle |
|---|---|
| `financial/settings.ts` | Registre des paramètres financiers (`jsc_settings`). Paramètre requis absent = erreur explicite. |
| `financial/charges.ts` | Registre déclaratif des suppléments et frais fixes (7 bases de calcul). |
| `financial/index.ts` | `computeFinancials()` : temps facturable, matériau, transport, charges, marge, taxes, total, explications. |
| `quote-financial` (edge) | Endpoint admin de validation : trajets + finances, trace complète. |

## Aucune valeur codée

Tout provient de l'administration : `jsc_settings` (arrondis, minimum facturable,
marge, suppléments, frais, montant minimum, transport taxable), `jsc_trucks`
(capacité, taux horaire), `jsc_materials` (prix/tonne, taxable, carrière assignée),
`jsc_taxes` (TPS/TVQ, ordre, composition).

Nouveaux paramètres : `min_billable_minutes`, `distance_surcharge_per_km`,
`trip_fee_amount`, `environmental_fee_per_tonne`, `administration_fee_amount`,
`transport_is_taxable`.

Ajouter une règle = une ligne dans `DEFAULT_CHARGE_DEFINITIONS` + un paramètre admin.
Aucune modification du moteur.

## Enchaînement du calcul

1. Temps brut (module 3) → arrondi `time_rounding_minutes` → plancher `min_billable_minutes`.
2. Matériau = tonnage × prix/tonne (carrière et fournisseur assignés).
3. Transport = minutes facturables ÷ 60 × taux horaire du camion retenu.
4. Suppléments (% ou $/km, $/voyage, $/tonne, $/soumission) et frais fixes.
5. Marge = `margin_percent` × (matériau + transport + charges).
6. Montant minimum de commande si configuré.
7. Taxes dans l'ordre configuré, base ajustée si matériau ou transport non taxable.
8. Total.

## Transparence

`explanation[]` détaille chaque ligne (`label`, `detail`, `amount`, `type`) :
matériau, transport, chaque supplément, marge, sous-total, chaque taxe, total.

## Validation

32 tests automatisés (`src/test/vqos-financial-engine.test.ts` + module 3).
Scénarios réels Transport JSC (Pierre concassée 0-3/4 à 15 $/t, 150 $/h, carrière
Saint-Nicolas) :

| Quantité | Camion | Voyages | Temps facturable | Matériau | Transport | Sous-total | Total |
|---|---|---|---|---|---|---|---|
| 15 t | 10 roues | 1 | 90 min (minimum) | 225,00 $ | 225,00 $ | 517,50 $ | 595,00 $ |
| 30 t | 12 roues | 2 | 120 min | 450,00 $ | 300,00 $ | 862,50 $ | 991,66 $ |
| 54 t | 12 roues | 3 | 175 min | 810,00 $ | 437,50 $ | 1 434,63 $ | 1 649,46 $ |

Marge 15 %, TPS 5 %, TVQ 9,975 %. Le minimum de 1 h 30 s'applique correctement,
le transport est calculé sur les minutes exactes (jamais sur les heures affichées).
