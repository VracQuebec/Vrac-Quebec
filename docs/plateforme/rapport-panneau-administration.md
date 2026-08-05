# Rapport final — Panneau d'administration Vrac Québec OS

## Accès
`/admin/configuration-soumissions` — « Panneau d'administration » (réservé aux administrateurs).
Les soumissions restent aussi consultables sur `/admin/soumissions` (même composant, même source).

## Modules livrés
| # | Module | Onglet | Source de vérité |
|---|--------|--------|------------------|
| 1 | Matériaux (ajout, modification, archivage, activation, photo, description, prix/tonne, catégorie, densité, taxable) | Matériaux | `jsc_materials` |
| 2 | Catégories de matériaux | Catégories | `jsc_material_categories` |
| 3 | Carrières (nom, adresse, GPS, type, fournisseur, temps de chargement, activation) | Carrières | `jsc_pickup_locations` |
| 4 | Approvisionnement (matériau ↔ carrière) | Approvisionnement | `jsc_material_prices` |
| 5 | Fournisseurs (coordonnées, téléphone, courriel, notes, matériaux fournis) | Fournisseurs | `jsc_suppliers` |
| 6 | Camions (type, capacité, tonnage max, tarif horaire, actif) | Camions | `jsc_trucks` |
| 7 | Taxes TPS/TVQ | Taxes | `jsc_taxes` |
| 8 | Paramètres opérations + financiers | Paramètres | `jsc_settings` |
| 9 | Demandes (statut, client, matériau, quantité, estimation, date, notes, recherche, filtres, export Excel + PDF) | Demandes | `jsc_quotes` |
| 10 | Tableau de bord (soumissions, ventes estimées, matériaux, secteurs, conversion, graphiques 12 mois) | Tableau de bord | `jsc_quotes` |
| 11 | Validation technique du moteur | Validation | moteur |

## Paramètres financiers administrables (appliqués par le moteur `jsc-1.4.0`)
`min_trip_minutes`, `loading_time_minutes`, `unloading_time_minutes`, `buffer_time_minutes`,
`time_rounding_minutes`, `rounding_method`, `price_rounding_decimals`, `margin_percent`,
`administration_fee_amount`, `environmental_fee_per_tonne`, `fuel_surcharge_percent`,
`distance_surcharge_per_km`, `trip_fee_amount`, `quote_validity_days`, `base_location_id`.

Ordre de calcul : matériau + transport → frais (carburant, kilométrage, voyage, environnement,
administration) → marge → sous-total → taxes → total. Un paramètre non configuré vaut 0 :
aucun impact sur les calculs existants.

## Architecture
- Aucun doublon : le CRUD passe par le composant unique `ResourceManager`, les demandes par `QuotesBoard`
  (réutilisé par la page Soumissions et l'onglet Demandes), le tableau de bord lit le même hook `useQuotes`.
- Aucune valeur métier codée : tout provient des tables `jsc_*`.
- Toute modification est lue au prochain appel du moteur (`quote-engine`, `quote-submit`, `quote-assistant`).
- Suppression = archivage (`archived_at`) avec journal d'audit, jamais de perte d'historique.

## Vérifications
- Typecheck TypeScript : OK.
- Tests : 21/21 réussis (dont 12 sur le moteur JSC).
- Fonctions edge redéployées : `quote-engine`, `quote-submit`, `quote-assistant`.
