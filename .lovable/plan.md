# Copilote SEO intelligent — plan de livraison

Objectif : transformer le SEO Manager en un copilote qui décide seul quoi créer, améliorer, fusionner ou supprimer, et exécute via le moteur industriel déjà en place. Aucune duplication : tout réutilise `seo_optimization_*`, `seo_pipeline_*`, `seo_recommendations`, `seo_page_events`, `seo_gsc_metrics`, `seo_business_metrics`, `seo-optimize-worker/supervisor`.

Livraison en 4 phases indépendantes, chacune shippable et utilisable seule.

---

## Phase A — Fondations données (1 migration + 2 vues + 1 RPC)

But : brancher tous les signaux nécessaires aux scores et à l'IA, sans changer l'UI.

- Table `seo_page_scores` (1 ligne par page, rafraîchie) : seo, qa, business, traffic, conversion, competition, opportunity, computed_at. Formules déterministes documentées dans une fonction SQL `seo_recompute_page_scores(_page_id uuid default null)`.
- Vue matérialisée `seo_page_conversions_30d` : agrégat par `page_slug` depuis `seo_page_events` (view, phone, whatsapp, email, submission, cta). Refresh cron 15 min.
- Vue matérialisée `seo_gsc_deltas_28d` : delta position / clics / impressions vs 28j précédents par `page_id` depuis `seo_gsc_metrics`.
- Table `seo_opportunities` (unique source vérité pour la section « Opportunités »): type (new_city, new_material, new_combo, merge, duplicate, losing_positions, stagnant, high_impr_low_ctr, high_conversion), page_id/entity nullable, impact_score, effort_score, evidence jsonb, suggested_action, status (open/applied/dismissed), created_at.
- RPC `seo_executive_dashboard()` : agrège scores, conversions, GSC, top gains/pertes 30j, actions IA en attente. Un seul appel front.
- Tracking `email_click` déjà prévu → ajouté dans `src/lib/seo/tracking.ts` + boutons mailto publics.

## Phase B — Assistant IA stratégique + Opportunités (réutilise `seo-assistant-scan`)

But : remplacer les recommandations basiques actuelles par une analyse multi-signaux avec potentiel chiffré.

- Refonte de `supabase/functions/seo-assistant-scan/index.ts` (déjà existant) : consomme scores + GSC deltas + conversions + concurrents, produit des lignes dans `seo_opportunities` avec estimation chiffrée (recherches/mois via `seo_cities.population` × ratio catégorie, demandes potentielles via taux conv historique de la ville).
- Cron nocturne (pg_cron) `seo_nightly_scan` : rescore pages → scan opportunités → alimente la queue d'optimisation pour toute page `qa < 90` ou `opportunity_score >= 80`, sans intervention humaine (Phase D activera/désactivera le côté "création auto").
- Nouveau composant `src/components/seo/OpportunitiesPanel.tsx` : liste triée par impact/effort avec 5 actions par ligne (Créer / Optimiser / Fusionner / Supprimer / Ignorer). "Créer" et "Optimiser" pushent dans le moteur existant (`seo_optimization_start` ou `seo_pipeline_start('single_city',...)`).
- Nouveau composant `src/components/seo/StrategicAdvisor.tsx` : affiche le top 5 priorités avec cartes étoilées (★ à ★★★★★), potentiel, concurrence, impact estimé, bouton "Créer automatiquement".

## Phase C — Copilote page-par-page (scores, IA concurrentielle, prévisions)

But : donner à chaque page une vue "coach" complète.

- Nouveau composant `src/components/seo/PageScoreCard.tsx` : les 7 scores en radar + tendance 30j (depuis `seo_gsc_deltas_28d`).
- Refonte `seo-competitor-crawl` (existant) : pour chaque page, compare H1/H2/FAQ/mots/schema/images/maillage/intentions vs top 10 Google. Stocke dans `seo_competitor_pages` (existant, étendu si besoin). Le résultat alimente `competition_score` et `opportunity_score`.
- Nouveau composant `src/components/seo/CompetitorGapPanel.tsx` : « Ce qu'ont les concurrents / Ce qui manque / Ce qui peut être ajouté » + bouton unique « Optimiser automatiquement » qui déclenche `seo-optimize-worker` avec actions ciblées sur les gaps détectés.
- Nouveau composant `src/components/seo/SeoForecastChart.tsx` (Recharts) : projections 30/90/180/365j basées sur position actuelle × CTR courbe × trafic potentiel de la ville. Traduit en demandes/revenus via taux conv historique.

## Phase D — Dashboard exécutif + Autopilot

But : une vue Jonathan et un interrupteur "il roule seul".

- Nouvelle page/onglet `src/components/seo/ExecutiveDashboard.tsx` (onglet **Pilotage** existant, remplace le contenu actuel dupliqué). Consomme `seo_executive_dashboard()` : KPI, top gains/pertes 30j, actions IA en attente, alertes.
- Nouveau composant `src/components/seo/AutopilotPanel.tsx` : switch on/off + réglages (seuil QA, budget IA quotidien, plafond pages/jour, catégories autorisées). Stocké dans table `seo_autopilot_config` (singleton).
- Edge function `seo-autopilot-tick` (cron 15 min) : si autopilot ON, lit les opportunités open, filtre selon budget/plafond, push dans le moteur (`seo_optimization_start` pour optimisations, `seo_pipeline_start` pour créations). Publie uniquement les pages qui passent `qa >= threshold`. 100% via l'orchestrator existant, zéro pipeline parallèle.
- Journal autopilot visible dans le dashboard (nouvelle vue `seo_autopilot_actions` alimentée par les runs déclenchés).

## Nettoyage & architecture

- Aucune nouvelle table qui doublonne : réutilisation stricte de `seo_optimization_*`, `seo_pipeline_*`, `seo_recommendations` (renommé en interne au profit de `seo_opportunities` pour clarifier — migration de compat).
- `AdminSeoManager.tsx` : les 5 onglets restent (Pilotage, Pages, Couverture, Intelligence, Contenu). Pilotage = ExecutiveDashboard + Autopilot. Intelligence = StrategicAdvisor + Opportunities + CompetitorGap. Pages = liste + PageScoreCard + Forecast quand une page est sélectionnée.
- Toute logique lourde reste server-side (edge functions + RPC). Le front ne fait que lire.
- Multi-entreprises futur : chaque nouvelle table porte déjà `created_by` / prête à recevoir un `tenant_id` sans casser les policies existantes (ajouté nullable maintenant, backfill plus tard).

---

## Détails techniques

**Migrations (une par phase, atomiques)**
- Phase A : `seo_page_scores`, `seo_opportunities`, vues matérialisées, RPC `seo_recompute_page_scores`, `seo_executive_dashboard`, trigger de refresh scores sur update `seo_pages`, GRANT + RLS admin-only + service_role.
- Phase D : `seo_autopilot_config`, cron `seo_nightly_scan` et `seo-autopilot-tick`.

**Edge functions**
- Refonte : `seo-assistant-scan`, `seo-competitor-crawl`.
- Création : `seo-autopilot-tick`, `seo-scores-refresh` (batch nightly, appelle la RPC).
- Aucune fonction ne double le moteur — toutes appellent `seo_optimization_start` / `seo_pipeline_start`.

**Frontend nouveaux composants**
`ExecutiveDashboard`, `StrategicAdvisor`, `OpportunitiesPanel`, `PageScoreCard`, `CompetitorGapPanel`, `SeoForecastChart`, `AutopilotPanel`.

**Tracking**
- Ajout `email_click` dans `logSeoEvent` + wiring sur tous les `mailto:` publics.

---

## Ordre de livraison recommandé

1. **Phase A** (fondations) — livrable seul, débloque tout le reste.
2. **Phase B** (assistant + opportunités) — apporte immédiatement de la valeur, l'utilisateur voit des priorités chiffrées.
3. **Phase C** (copilote page) — approfondit l'analyse par page.
4. **Phase D** (dashboard exécutif + autopilot) — automatise ce que les phases 1-3 ont rendu visible.

Chaque phase est mergeable indépendamment et laisse la plateforme utilisable. Confirme la Phase A pour que je commence, ou demande-moi de réorganiser.
