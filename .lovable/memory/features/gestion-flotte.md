---
name: Gestion de la flotte (back-office)
description: Module interne /admin/flotte — véhicules (trucks), entretiens, réparations, inspections, pièces, coûts; réutilise le calendrier et les notifications existants
type: feature
---
Module STRICTEMENT interne (aucune page publique). Route `/admin/flotte` (onglets Tableau de bord · Véhicules · Entretien · Réparations · Inspections · À faire bientôt · Historique · Coûts) et fiche `/admin/flotte/vehicule/:id`.

Réutilisation obligatoire — aucun doublon :
- Véhicules = table `trucks` enrichie (make, model, year, unit_number, vin, odometer_km, engine_hours, service_status).
- Calendrier = `calendar_events` existant + colonnes `vehicle_id`, `fleet_ref_type` (entretien/reparation/inspection/echeance), `fleet_ref_id`. Une date future crée/actualise l'événement via `syncCalendarEvent`.
- Notifications = `crm_notify`/`crm_resolve` avec `dedupe_key` `fleet:<type>:<id>:<seuil>`; RPC `fleet_scan_due()` balaie les échéances (date ou km).
- Chauffeurs = `drivers`; permissions = rôle `admin` (`has_role`).

Tables : `fleet_maintenance`, `fleet_repairs` (a_diagnostiquer/a_planifier/planifiee/en_reparation/terminee), `fleet_inspections` (checks jsonb ok/surveiller/probleme), `fleet_parts`, `fleet_costs` (alimentée par trigger, base de la future rentabilité).
Code : `src/lib/fleet/api.ts`, `src/components/fleet/FleetDialogs.tsx`, `src/pages/AdminFleet.tsx`, `src/pages/AdminFleetVehicle.tsx`.
