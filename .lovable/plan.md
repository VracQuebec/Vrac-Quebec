# Vrac Québec OS — Plan directeur

Objectif : transformer la plateforme en OS d'exploitation complet **sans jamais recréer de module existant**. Chaque phase livre de la valeur seule et est validée avant la suivante.

---

## PHASE 1 — Audit (rapport, aucun code)

### Ce qui existe déjà et fonctionne
- **Auth & rôles** : `useAuthReady`, `useUserRoles`, table `user_roles` + enum `app_role (admin, user, entrepreneur)`, fonctions `has_role`, `is_approved_entrepreneur`.
- **CRM Demandes** : `submissions` (61 col), `transport_requests` (33 col), `lead_notes`, `lead_statuses`, `submission_audit_log`, `transport_request_history`. Pages : `Admin.tsx`, `AdminTransportRequests.tsx`, `AdminData.tsx`.
- **Entrepreneurs** : table `entrepreneurs` + `entrepreneur_profiles`, espace connecté complet (`EntrepreneurDashboard`, `Demandes`, `Favoris`, `Historique`, `Compte`, `Carte`).
- **Facturation** : `payments`, `expenses`, `lead_trips` (numérotation auto, taxes), `BillingOverview`, `BillingSection`.
- **Calendrier opérationnel** : `calendar_events`, `trucks`, `drivers`, `AdminCalendar` + `FleetManager`, `EventModal`, `EventBlock`.
- **Dompes** : représentées via `submissions` (availability_status, truck_types_allowed, remaining_capacity, opening_hours, accessibility, materials). RPC `get_public_dumps`, `get_entrepreneur_leads`, `count_active_dumps_by_city`.
- **Blacklist** : `blacklist_entries`, `blacklist_history`, `is_blacklisted`, page `AdminBlacklist`.
- **SEO industriel** : 20+ tables (`seo_pages`, `seo_cities`, `seo_materials`, `seo_opportunities`, `seo_pipeline_runs`, `seo_optimization_runs/tasks`, `seo_page_scores`, `seo_qa_reports`, `seo_gsc_metrics`, `seo_pagespeed_snapshots`, etc.), 15 edge functions SEO, pipeline + optimisation + QA + advisor + copilote (`CopilotDashboard`, `PipelineControlCenter`, `OptimizationEngine`, `WaveRunner`, `CommandCenter`).
- **Blog CMS + mesh IA** : `blog_posts`, `blog_seo_links`, `blog_mesh_runs/batches`, workers/supervisor.
- **Google** : GA4 (`ga4_*`), GSC (`seo_gsc_metrics`), PageSpeed, page `AdminGoogleIntegrations`, crons quotidiens.
- **IA & économie** : `ai_cache`, `ai_call_log`, `ai_settings`, `AdminAiEconomy`, hook `callAIChatCached`.
- **Emails** : queue pgmq + templates + suppression + unsubscribe.
- **Cartes** : `AdminMap`, `DispatchPanel`, Google Maps loader partagé.

### Ce qui est incomplet
- **Clients (payeurs finaux)** : pas de table `clients` dédiée ; les infos vivent éclatées dans `submissions`, `transport_requests`, `payments`. Historique fusionné inexistant.
- **Transporteurs** : `drivers`/`trucks` couvrent la flotte JSC interne, mais **pas de table `carriers`** pour transporteurs externes (assurances, permis, tarifs, géoloc temps réel, disponibilité déclarée).
- **Dompes** : sont des `submissions` ; pas d'entité `dumps` propre avec photos, tarifs par matériau, historique de voyages agrégé, notation.
- **Répartition/dispatch** : `DispatchPanel` fait de l'affectation manuelle ; pas de moteur de matching automatique demande ↔ transporteur ↔ dompe avec scoring/coût/distance.
- **Notifications** : emails OK, mais pas de centre de notifications in-app ni de rappels planifiés multi-canaux.
- **Tableau exécutif** : `AdminBusinessIntelligence` et `seo_executive_dashboard()` existent mais fragmentés — pas d'écran KPI unique temps réel (CA, profit, conversions, alertes) qui agrège CRM + SEO + GA4 + GSC.
- **IA opérationnelle globale** : `bi-daily-brief` couvre business, `seo-assistant-scan` couvre SEO, mais aucun assistant transverse détectant transporteurs inactifs / dompes bientôt pleines / clients à relancer.

### Ce qui est redondant / à fusionner
- Trois entrées "demande" : `submissions` (form public), `transport_requests` (assistant entrepreneur), `lead_trips` (facturation). → À unifier via une **vue `crm_deals_v`** + FK cohérentes, sans rupture.
- `Admin.tsx`, `AdminTransportRequests.tsx`, `AdminData.tsx` : trois listes CRM parallèles → à réunir sous un **CRM unique** avec filtres par source.
- Deux dashboards SEO/BI (`AdminBusinessIntelligence` + `CopilotDashboard`) → à réunir dans le **Cockpit exécutif** Phase 5.
- Signup entrepreneur : `signup-entrepreneur` **et** `create-entrepreneur` → garder un seul, l'autre devient wrapper.

### Ce qui manque réellement
1. Entités **`clients`**, **`carriers`**, **`dumps`** (+ leurs vues d'historique).
2. **Moteur de dispatch** (fonction Postgres + edge worker) avec scoring distance/capacité/tarif/blacklist.
3. **Centre de notifications** in-app + rappels planifiés.
4. **Cockpit exécutif** unique temps réel.
5. **Assistant opérationnel IA** transverse (économe, s'appuie sur `ai_cache`).

---

## PHASE 2 — CRM unifié (Clients / Entrepreneurs / Transporteurs / Dompes)

**Réutilise** : `submissions`, `entrepreneurs`, `drivers`, `trucks`, `payments`, `lead_notes`, `lead_trips`, `blacklist_entries`, `AdminMap`, `EntrepreneursAdmin`, `BillingSection`, `useLeadStatuses`.

**Ajoute** (migrations minimales, non destructives) :
- Table `clients` (nom, entreprise, contacts multiples, adresses, tags) + FK optionnelle depuis `submissions.client_id`, `transport_requests.client_id`, `payments.client_id`. Backfill depuis les colonnes existantes.
- Table `carriers` (transporteur externe : raison sociale, contacts, zones, assurance/permis/expirations, tarifs, note, actif). Lien optionnel `trucks.carrier_id`, `drivers.carrier_id`.
- Table `dumps` (dérivée de `submissions` type=dompe : nom, propriétaire → `entrepreneurs.id`, matériaux acceptés, tarifs par matériau JSONB, capacité totale/restante, photos[], accès, équipements, note). Migration en 2 temps : d'abord création + backfill lecture seule via vue `dumps_v`, puis bascule.
- Table `documents` polymorphe (`owner_type`, `owner_id`, url, type, expires_at) pour assurances/permis/photos — s'appuie sur Supabase Storage existant.
- Table `activities` polymorphe (appel, courriel, note, rappel) — étend `lead_notes` sans le supprimer.
- Vues : `crm_clients_v`, `crm_carriers_v`, `crm_dumps_v`, `crm_deals_v` (union submissions + transport_requests + lead_trips).

**UI** :
- Nouvelle section `/admin/crm` avec 4 onglets (Clients, Entrepreneurs, Transporteurs, Dompes) + fiche 360°. Réutilise `EntrepreneursAdmin` pour l'onglet entrepreneurs, `AdminMap` pour la carte dompes, `BillingSection` dans fiches Client.
- Les pages `Admin.tsx` / `AdminTransportRequests.tsx` sont **conservées** et pointées comme "vue Demandes" du CRM.

**Impact** : additif, aucune régression sur RLS existantes (nouvelles tables ont leurs propres policies scopées admin + owner).

---

## PHASE 3 — Moteur de répartition automatique

**Réutilise** : `transport-distance-matrix`, `google-geocode`, `AdminMap`, `DispatchPanel`, `calendar_events`, `is_blacklisted`, tarifs `carriers`, disponibilité `submissions.availability_status`.

**Ajoute** :
- Fonction Postgres `match_transport_request(_id uuid)` → renvoie top N (transporteur, dompe, distance km, coût estimé, score) en filtrant blacklist + capacité + matériau + type de camion + disponibilité.
- Table `dispatch_proposals` (request_id, carrier_id, dump_id, score, cost, status draft/sent/accepted/rejected/expired).
- Edge function `dispatch-auto` : orchestre le matching, appelle Distance Matrix (déjà capée 500 destinations), crée les propositions, notifie via email queue existante.
- Écran `DispatchPanel` étendu : bouton "Suggestions IA" affichant les propositions ; acceptation crée automatiquement un `calendar_event` + met à jour statut.

**Impact** : aucun changement de contrat public ; edge function protégée JWT + rôle admin.

---

## PHASE 4 — Assistant IA opérationnel

**Réutilise** : `_shared/ai-cache.ts` (`callAIChatCached`), `ai_settings` (Max Economy), `bi-daily-brief`, `seo-assistant-scan`, `seo_opportunities`.

**Ajoute** :
- Edge function `ops-assistant-scan` (déterministe d'abord, IA en dernier recours + cache) qui détecte :
  transporteurs inactifs 30j, dompes >80 % pleines, clients sans commande 60j, secteurs non desservis (croisement GSC/GA4/submissions), demandes en attente >24h, expirations documents.
- Table `ops_findings` (kind, severity, entity, payload, suggested_action, status) — équivalent opérationnel de `seo_opportunities`.
- Cron `pg_cron` quotidien 06:00.
- Panneau "Actions recommandées" injecté dans le Cockpit (Phase 5) et notifications in-app.

**Impact** : réutilise 100 % de l'infra IA existante ; consommation crédits ~0 grâce au cache + logique déterministe.

---

## PHASE 5 — Cockpit exécutif unique

**Réutilise** : `seo_executive_dashboard()`, `seo_dashboard_stats()`, `ai_economy_stats()`, `ga4_daily_summary`, `seo_gsc_metrics`, `payments`, `lead_trips`, `AdminBusinessIntelligence` (retiré ou redirigé).

**Ajoute** :
- RPC unique `exec_cockpit_stats(_range text)` qui agrège CA, profit, demandes/soumissions/voyages/livraisons, actifs (clients/entrepreneurs/transporteurs/dompes), KPIs SEO/GA4/GSC, top alertes `ops_findings`.
- Page `/admin` refondue en cockpit temps réel (realtime channels sur `submissions`, `transport_requests`, `payments`, `ops_findings`). Les anciens accès restent via la navigation.

---

## PHASE 6 — Automatisations & Notifications

**Réutilise** : queue pgmq emails, pg_cron, `email_send_log`, `resend`.

**Ajoute** :
- Table `notifications` in-app (user_id, kind, title, body, url, read_at).
- Table `reminders` (owner, due_at, channel: email|inapp, payload, status) + worker cron.
- Rappels automatiques : soumissions sans réponse, propositions expirant, documents transporteurs qui expirent, factures impayées.
- Cloche de notifications globale dans le shell admin + entrepreneur.

---

## PHASE 7 — Qualité (transverse à chaque phase)

- Avant : `rg` sur symboles touchés, revue RLS/GRANT, tests ciblés.
- Après : `tsgo`, tests vitest existants, vérif Playwright sur pages critiques (`/admin`, `/admin/crm`, `/entrepreneur`), nettoyage exports morts.
- Chaque migration inclut `GRANT` + policies + trigger `touch_updated_at`, jamais destructive.

---

## Détails techniques transverses

```text
Ordre d'exécution recommandé :
Phase 1  ── rapport (livré ci-dessus)
Phase 2  ── migrations clients/carriers/dumps/documents/activities + vues + UI CRM
Phase 3  ── match_transport_request + dispatch-auto + DispatchPanel v2
Phase 4  ── ops-assistant-scan + ops_findings + cron
Phase 5  ── exec_cockpit_stats + refonte /admin
Phase 6  ── notifications + reminders + cloche
```

Règles invariables :
- Aucune table `public.*` sans GRANT + RLS + policies.
- Réutiliser `has_role`, `is_approved_entrepreneur`, `is_blacklisted`.
- Réutiliser `callAIChatCached` pour tout appel IA (Max Economy respecté).
- Ne jamais modifier `src/integrations/supabase/client.ts` ni `supabase/config.toml` sans nécessité fonctionnelle.
- Aucune régression des routes/URLs existantes ; les anciennes pages restent accessibles pendant la migration progressive.

---

## Prochaine étape

Confirme-moi par quelle **phase** tu veux qu'on commence (recommandation : **Phase 2 — CRM unifié**, qui débloque les phases 3 à 6). Je présenterai alors un sous-plan détaillé (tables exactes, policies, composants réutilisés) avant d'écrire la première ligne de code.
