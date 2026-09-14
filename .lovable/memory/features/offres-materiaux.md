---
name: Offres de matériaux (LOT 20)
description: Entité material_offers, géocodage abstrait, distance Haversine, branchement au moteur de matching interne
type: feature
---
- Table `material_offers` (admin RLS uniquement) : source_type, statut (draft/parsed/needs_confirmation/ready_for_matching/archived/fulfilled/cancelled), quantité, camion, matériau principal + secondaires + traces, granulométrie, déclarations environnementales, localisation (adresse/ville/secteur/lat/lng), disponibilité, rayon max, confiance et version du parser.
- Code : `src/lib/offers/{types,distance,geocoding,engine,api}.ts`; écran admin `/admin/offres-materiaux`.
- `GeocodingAdapter` : aucun fournisseur branché, fallback manuel; aucune coordonnée inventée.
- `geographicDistance` (Haversine) ≠ `routeDistance` (non disponible). Distance ≠ compatibilité matière; rayon dur seulement s'il est explicitement exprimé.
- `operationalScore` (priorisation) reste séparé de l'état de compatibilité du LOT 18.
- Drapeau `material_offers_v1` = false; aucune donnée historique convertie en offre.
