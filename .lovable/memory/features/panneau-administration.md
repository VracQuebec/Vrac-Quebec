---
name: Panneau d'administration complet
description: Console admin /admin/configuration-soumissions (matériaux, catégories, carrières, fournisseurs, camions, taxes, paramètres financiers, demandes, tableau de bord)
type: feature
---
Panneau d'administration unique : `/admin/configuration-soumissions` (`src/pages/AdminSoumissionConfig.tsx`).
Onglets : Tableau de bord (`AdminOverview`), Demandes (`QuotesBoard` — filtres, notes internes, export Excel/PDF),
Matériaux, Catégories, Carrières, Fournisseurs, Approvisionnement, Camions, Taxes, Paramètres (opérations + financiers), Validation.
CRUD générique via `ResourceManager` + définitions dans `src/lib/jsc/soumission-config.ts`. Aucun doublon.
Moteur `jsc-1.4.0` applique les charges administrables : margin_percent, administration_fee_amount,
environmental_fee_per_tonne, fuel_surcharge_percent, distance_surcharge_per_km, trip_fee_amount (0 si non configuré).
Rapport : `docs/plateforme/rapport-panneau-administration.md`.
