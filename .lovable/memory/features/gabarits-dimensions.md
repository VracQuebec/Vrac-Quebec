---
name: Gabarits, dimensions et accessibilité
description: Lot 3 — configurations 6/10/12 roues et semi 2/3/4 essieux, dimensions réelles par véhicule, largeur miroir à miroir, longueur d'ensemble, règles de dimensions QC versionnées, marges opérationnelles, contraintes d'accès des demandes de remblai
type: feature
---
Lot 3 (additif, non branché au public) :
- Config ajoutée : `porteur_6_roues` (avec 10 roues, 12 roues, semi 2/3/4 essieux).
- `transport_vehicle_dimensions` : dimensions RÉELLES par véhicule en mètres (unité normalisée) — longueur, largeur carrosserie (sans rétroviseurs), débords miroirs, largeur miroir à miroir, hauteur, empattement, porte-à-faux, rayon/diamètre de braquage, garde au sol, blocs tracteur / semi-remorque (essieux, pivot d'attelage) et ensemble mesuré.
- `transport_dimension_typicals` : dimensions typiques par catégorie, toujours `DEFAULT_ESTIMATE`.
- `transport_dimension_rules` : limites QC VERSIONNÉES avec source/article/date/statut `a_valider` (hauteur 4,15 m; largeur 2,6 m générale et 2,5 m remorques; longueur porteur 12,5 m conditionnelle / 11 m générale; ensemble semi type 1 : 23,0 m et semi 16,2 m). Rétroviseurs EXCLUS de la largeur réglementaire.
- `transport_safety_margins` : marges de passage/hauteur configurables, `is_regulatory = false` (règle interne Vrac Québec).
- `submission_access_constraints` : contraintes d'accès par demande de remblai (largeur, hauteur libre, longueur pratique, manœuvre, virage, pente, surface, poids, pont/entrée étroite, obstacles en hauteur, portail, recul, camions acceptés 6/10/12/semi, notes chauffeur). Aucune demande existante modifiée.

Règles absolues : aucune dimension déduite du nombre d'essieux/roues; dimension typique ≠ limite légale; largeur réglementaire ≠ largeur de passage physique; longueur d'ensemble jamais = tracteur + semi (chevauchement au pivot); priorité ACTUAL_MEASURED > MANUFACTURER_SPEC > OPERATIONAL_ESTIMATE > DEFAULT_ESTIMATE; REGULATORY_LIMIT sert uniquement à la conformité.
Code : `src/lib/transport/dimensions.ts` (pur), onglet « Dimensions / Gabarits » de `/admin/capacites-transport`, tests `src/test/transport-dimensions.test.ts`.
Non branché : matching public, tarification, taxonomie publique, `/remblai`.
