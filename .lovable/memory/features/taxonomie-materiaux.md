---
name: Taxonomie matériaux (dompes)
description: Catalogue canonique, alias, relations demande↔matériau, conditions et file de validation pour les demandes de remblai
type: feature
---
Fondation additive (Phase A–D appliquée, population NON exécutée) :
- `material_catalog` (15 matériaux canoniques), `material_aliases` (alias orthographiques + composites), `material_review_terms` (termes ambigus jamais convertis).
- `submission_accepted_materials` (vide), `material_review_queue`, `submission_material_conditions`, `submission_environmental_info`, `material_action_log`.
- Fonctions : `material_normalize_text`, `material_resolve`, `material_normalization_preview` (admin/service_role).

Règles métier non négociables :
- « Remblai / remplissage / autre / je ne suis pas certain / n'importe quoi / mélangé » = usage ou imprécision, JAMAIS un matériau.
- Ne jamais fusionner : Terre ≠ Terre mélangée ≠ Terre tamisée; Pierre ≠ 0-3/4 ≠ 3/4 net ≠ Poussière de pierre; Roches ≠ Roches concassées.
- Absence d'un matériau ≠ refus : stances `accepted` / `refused` / `unknown`.
- Les champs historiques (`materials`, `other_material`, description, notes) restent la source de rollback et ne sont jamais écrasés.
- Aucune bascule des surfaces publiques/matching tant que l'utilisateur n'a pas autorisé la population.

Préparation évolutive (lot 2026-09-13, non activée) :
- `material_families` : familles + sous-familles (terres, sables, granulats, remblai, roche, béton/maçonnerie, asphalte, organique, spéciaux, à qualifier), gérables par l'admin (ajout/renommage/ordre/désactivation).
- `material_catalog.family_id` : lien facultatif vers la famille (nullable).
- `submission_accepted_materials` reste la relation many-to-many demande ↔ matériaux acceptés (une demande peut accepter plusieurs matériaux).
- Vue `material_matching_candidates` (service_role uniquement) : préparation du futur moteur (localisation, disponibilité, matériaux/familles acceptés). Non branchée aux surfaces publiques.
