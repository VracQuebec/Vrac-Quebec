---
name: Gestion de la flotte V2 (multi-entreprise)
description: Évolution V2 du module /admin/flotte — isolation par entreprise, unités génériques, compteurs automatiques, travaux à faire, dépenses, tableau de bord de contrôle
type: feature
---
Base V1 conservée (voir `mem://features/gestion-flotte`). V2 ajoute :

Multi-entreprise : `company_id` sur `trucks`, `fleet_maintenance`, `fleet_repairs`, `fleet_inspections`, `fleet_parts`, `fleet_costs` et toutes les tables V2 ; RLS `public.fleet_can_access(company_id)` (admin OU membre actif de `jsc_company_members`). Aucune isolation faite côté frontend.

Nouvelles tables : `fleet_meter_readings` (historique compteurs, trigger `fleet_apply_meter_reading` : jamais de recul sauf `is_correction`), `fleet_work_items` (travaux/problèmes, regroupement par `occurrences`), `fleet_expenses` (trigger `fleet_sync_expense_cost` : pas de double comptabilisation quand liée à un entretien/réparation), `fleet_part_refs`, `fleet_service_programs`, `fleet_inspection_templates`.

Unités génériques : colonne `category` (15 catégories, `UNIT_CATEGORIES` dans `src/lib/fleet/v2.ts`), `admin_status` (actif/inactif/vendu/archive) SÉPARÉ de `ops_status` (disponible/en_operation/a_surveiller/au_garage/hors_service) ; numéro d'unité unique par entreprise (`idx_trucks_unit_number_company`). Configuration, identification mécanique et acquisition dans la fiche.

Code : `src/lib/fleet/v2.ts` (référentiels, `buildDashboard`, `maintenanceDue` date OU km OU heures, `inspectionPointsFor` selon le type d'unité), `src/components/fleet/FleetDialogsV2.tsx` (Dépense, Travail à faire, Relevé de compteur). Tableau de bord V2 : À surveiller / État de la flotte / Entretiens / Réparations / Inspections / Aujourd'hui / Prochaines échéances / Coûts avec variation vs mois précédent. Fiche véhicule : onglets Résumé (mode « Au garage »), Dépenses, Compteurs ajoutés.

Règles : une lecture de compteur saisie dans une inspection/entretien/réparation/dépense met à jour le véhicule automatiquement ; couleur jamais seule (toujours texte) ; mobile prioritaire ; archivage plutôt que suppression.
