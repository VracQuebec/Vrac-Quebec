---
name: Super Admin Vrac Québec & multi-entreprises (flotte)
description: Architecture multi-tenant de Gestion de la flotte — isolation par company_id, rôles entreprise, mode support Super Admin, journal avec origine de l'action
type: feature
---
Deux niveaux de permissions :
- **Plateforme** : SUPER ADMIN VRAC QUÉBEC = rôle `admin` (`public.has_role`) → accès à TOUTES les entreprises.
- **Entreprise** (`jsc_company_members.role`) : `proprietaire`, `gestionnaire`, `mecanicien`, `chauffeur`, `comptabilite`.

Fonctions SQL (SECURITY DEFINER, `search_path = public`) : `fleet_can_access(company_id)` (lecture), `fleet_member_role(company_id)`, `fleet_can_manage(company_id)` (proprietaire/gestionnaire/mecanicien : entretiens, réparations, inspections, travaux, compteurs, coûts), `fleet_can_administer(company_id)` (proprietaire/gestionnaire : unités, dépenses, pièces, programmes, gabarits). Chauffeur : lecture + insertion inspections/relevés. Comptabilité : lecture + insertion dépenses. Politiques RLS séparées SELECT / INSERT / UPDATE / DELETE sur `trucks` et toutes les tables `fleet_*` — l'isolation n'est JAMAIS faite côté frontend.

Journal : `crm_audit_log` reçoit `company_id` et `origin` (`entreprise` | `support_vrac_quebec`), lisible par les membres de l'entreprise concernée. Toute action d'un Super Admin est marquée « Support Vrac Québec » dans la fiche véhicule (onglet Journal).

Code : `src/lib/fleet/tenant.ts` (`getActiveCompanyId`, `setActiveCompanyId`, `scoped(query)`, `withCompany(row)`, `actionOrigin()`, `useFleetTenant(isAdmin, ready)`, `COMPANY_ROLES`), `src/components/fleet/FleetTenantBar.tsx` (`CompanySwitcher`, `SupportBanner` — bandeau « MODE SUPPORT VRAC QUÉBEC — Entreprise : [Nom] »). Toutes les lectures de `src/lib/fleet/api.ts` et `v2.ts` passent par `scoped()`, toutes les créations par `withCompany()`. Entreprise active persistée dans `localStorage` (`vq.fleet.company`).

Règle permanente : chaque nouvelle fonction de la flotte se conçoit selon deux perspectives — utilisateur de l'entreprise ET Super Admin Vrac Québec.
