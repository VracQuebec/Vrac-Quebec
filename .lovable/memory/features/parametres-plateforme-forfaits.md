---
name: Paramètres plateforme & catalogue commercial (CRM-01)
description: Route /admin/plateforme (administration globale Vrac Québec), tables platform_* (forfaits, abonnements, secteurs, journal), séparation plateforme vs back office entreprise
type: feature
---
**Séparation obligatoire** :
- `/admin/plateforme` (`src/pages/AdminPlatformSettings.tsx`) = Administration Vrac Québec : organisations, secteurs, forfaits/abonnements, notifications, intégrations, activité globale. Le bouton « Paramètres plateforme » du CRM pointe ici.
- `/admin/jsc` = back office de l'entreprise sélectionnée (Transport JSC), accès conservé et explicite (« Back office de l'entreprise »).

**Tables** (admin only via `has_role('admin')`, lecture entreprise via `fleet_can_access`) : `platform_plans`, `platform_subscriptions`, `platform_sectors`, `platform_company_sectors` (multi-secteurs), `platform_change_log` (auteur, date, périmètre). Trigger `platform_plans_guard` : un forfait sans prix, description ou fonctionnalité ne peut pas passer à `active`.

**Règles** : un prix absent = « À définir », jamais 0 $. Une source absente = « À configurer », jamais un faux 0. Périodes métier en America/Toronto. Forfait `entrepreneur-pro` en brouillon, prix non fixé. Aucun paiement, abonnement réel ni restriction commerciale activés.

Code : `src/lib/platform/plans.ts` (pur : complétude, matrice disponible/activée/incluse, MRR), `src/lib/platform/api.ts` (accès données + journal), tests `src/test/platform-plans.test.ts`.
