---
name: Capacités réelles de transport
description: Configurations de véhicules, poids à vide, charge utile calculée, capacité opérationnelle, règles de masse québécoises versionnées et densités estimées
type: feature
---
Lot 2 (additif, non branché au public) :
- `transport_vehicle_configs` : porteur 10 roues, porteur 12 roues, semi 2/3/4 essieux. Extensible par l'admin.
- `transport_weight_rules` : règles québécoises VERSIONNÉES (version, saison normale/dégel/spécial, groupe d'essieux, espacement, masse par groupe et totale, restrictions, permis spéciaux, effective_from/to, source réglementaire, last_verified_at, validation_status). Créées vides en `a_valider` — aucune limite légale inventée; un changement de norme se fait en données, jamais en code.
- `transport_vehicle_capacities` : par équipement réel — tares tracteur/remorque/ensemble, masse admissible, `payload_kg` GÉNÉRÉE (admissible − tare), capacité opérationnelle, volume + unité, source, validated_at, notes. Trigger `transport_capacity_guard()` : opérationnelle ≤ charge utile, charge utile > 0.
- `transport_material_densities` : min/moyenne/max, `is_estimate` true par défaut.

Règles : CHARGE UTILE = MASSE ADMISSIBLE − POIDS À VIDE RÉEL; deux véhicules de même configuration peuvent différer; capacité opérationnelle jamais > capacité légale calculée; densité = estimation (humidité, granulométrie, composition, compaction); voyages = quantité ÷ capacité, arrondi vers le haut.
Code : `src/lib/transport/capacity.ts` (calculs purs), `src/pages/AdminTransportCapacities.tsx` (`/admin/capacites-transport`, admin seulement), tests `src/test/transport-capacity.test.ts`.
Non branché : tarification publique, matching, /remblai, taxonomie publique.
