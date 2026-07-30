---
name: Modèle de données Vrac Québec OS
description: Entités officielles (jsc_*), relations, numérotation configurable et journal d'audit central du Sprint 1.5
type: feature
---
Modèle de données central (Sprint 1.5) — référence : `docs/plateforme/modele-de-donnees.md`, ERD `docs/plateforme/erd-vrac-quebec-os.mmd`.

Référentiel : jsc_companies (transporteurs), jsc_trucks, jsc_drivers, jsc_suppliers, jsc_pickup_locations, jsc_material_categories, jsc_materials, jsc_material_prices, jsc_zones, jsc_transport_rates, jsc_taxes, jsc_settings.
Flux commercial : jsc_clients → jsc_requests → jsc_estimates → jsc_quotes → jsc_orders → jsc_invoices + jsc_invoice_lines.
Traçabilité : jsc_audit_log (entity_type, entity_id, context) + fonction jsc_log_event(action, entity_type, entity_id, label, context) pour les calculs et décisions moteur.

Règles : champs communs id/company_id/is_active/archived_at/archived_by/created_at/updated_at; jamais de suppression; numérotation via jsc_next_number() avec préfixes et padding stockés dans jsc_settings (numbering_*_prefix, numbering_padding); accès admin (jsc_can_manage) + service_role.
Toute nouvelle fonctionnalité doit réutiliser ces entités, pas en créer de parallèles.
