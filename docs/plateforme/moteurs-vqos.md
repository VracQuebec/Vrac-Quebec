# Vrac Québec OS — Decision Engine & Calculation Engine

Le cœur technologique de la plateforme. Deux services indépendants, sans aucune
dépendance à l'interface utilisateur. Toute estimation, soumission, commande,
répartition ou automatisation doit passer par eux : aucun autre module n'a le
droit d'effectuer ses propres calculs.

## Fichiers

```text
supabase/functions/_shared/vqos/core.ts               types, conversions, arrondis, paramètres admin
supabase/functions/_shared/vqos/decision-engine.ts    DÉCIDE (aucun prix)
supabase/functions/_shared/vqos/calculation-engine.ts CALCULE (aucune décision)
supabase/functions/_shared/vqos/index.ts              orchestrateur runQuote()
supabase/functions/quote-engine/index.ts              API HTTP (tous canaux)
src/lib/jsc/engine.ts                                 client applicatif getQuote()
```

## Decision Engine

Entrée : matériau, quantité, unité, adresse (ou coordonnées), filtres optionnels
transporteur / fournisseur. Il identifie le matériau, retient les lignes de prix
valides, sélectionne les lieux de chargement qui offrent réellement le matériau,
obtient les distances Google Maps en un seul appel matriciel, retient les camions
de **tous** les transporteurs, choisit le tarif applicable (camion+zone > camion >
zone > générique, filtré par plage de distance) et calcule le nombre de voyages.

Sortie : une liste de `TransportPlan` (matériau, fournisseur, lieu de chargement,
transporteur, camion, tarif, voyages, distance, temps de conduite, temps de
chargement/déchargement/fixes) plus une trace de décision. Aucun prix.

## Calculation Engine

Entrée : un `TransportPlan` + paramètres administrateur + taxes.
Calcule : premier voyage, voyages suivants, temps fixes, plancher et arrondis,
heures facturées, kilométrage total, coût de transport (horaire / km / voyage /
forfait, avec minimums), coût du matériau, surcharge carburant, surcharge de zone,
marge, taxes (ordre et composition configurables) et total.

## Décision finale

L'orchestrateur chiffre **toutes** les combinaisons puis retient celle au **coût
total livré le plus bas** — jamais la distance seule. Les options écartées sont
conservées dans le bloc technique.

## Résultat

```text
public    : matériau, quantité, tonnage, voyages, durée, adresse,
            sous-total, taxes, total
technical : plan retenu (fournisseur, transporteur, camion, tarif),
            détail des temps, détail des coûts, marge, coût d'achat,
            toutes les options évaluées, trace de décision, paramètres utilisés
```

Le moteur retourne uniquement des données. L'API expose `public` à tous et
`technical` uniquement aux administrateurs.

## Paramètres (aucune valeur codée en dur)

Tout provient des tables `jsc_*` : matériaux, prix, fournisseurs, transporteurs
(`jsc_companies`), camions et capacités, tarifs, zones, taxes, lieux de
chargement, et les réglages `jsc_settings` de la catégorie moteur :
`time_rounding_minutes`, `min_trip_minutes`, `price_rounding_decimals`,
`margin_percent`, `fuel_surcharge_percent`. Un paramètre manquant produit une
erreur explicite, jamais une valeur par défaut silencieuse.

## Évolutivité

Ajouter un transporteur, un fournisseur, un lieu de chargement, un type de camion,
une zone ou un modèle de tarification se fait uniquement par les paramètres
administrateur : aucun changement de code, aucune logique spécifique à Transport JSC.
