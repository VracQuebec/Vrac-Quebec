
# Centre de Pilotage SEO V2 — Copilote IA

Refonte du SEO Manager en directeur SEO virtuel : chaque donnée devient une action. Livré en 6 phases pour rester stable en production.

---

## Phase 1 — QA intelligent par page

**Objectif** : remplacer le score opaque par une checklist détaillée + correction auto.

- Étendre `seo-qa-check` pour retourner ~10 vérifications explicites, chacune avec `status` (`ok` | `warn` | `fail`), `label`, `detail`, `fixable` (bool), `fix_action` (clé) :
  - Longueur contenu, FAQ complète, H1-H6, maillage interne, images (nombre + alt), meta description, Schema.org, mots-clés secondaires, CTA, unicité.
- Nouveau composant `QaChecklist.tsx` dans le dialog `ImproveDialog` : affiche chaque item avec icône ✅/⚠/❌ + explication.
- Bouton **« Corriger automatiquement »** → nouvelle edge function `seo-qa-autofix` qui, pour chaque `fix_action`, appelle Lovable AI (`google/gemini-3-flash-preview`) pour régénérer uniquement le fragment concerné (FAQ, meta, images alt, mots-clés, liens internes) et re-run QA.

## Phase 2 — Suggestions intelligentes (anti-cannibalisation)

**Objectif** : recommandations validées avant d'apparaître.

- Nouvelle edge function `seo-suggest-pages` qui, pour chaque combo `(city, material|service)` manquant :
  1. vérifie que la ville + matériau/service existent et sont `active`;
  2. vérifie qu'aucune `seo_pages` publiée ne cible déjà cette combo (anti-doublon);
  3. calcule un score cannibalisation (similarité titre + slug vs pages existantes de la même ville);
  4. estime potentiel (population × facteur matériau), difficulté (KDI moyen depuis `seo_gsc_metrics` + concurrents), temps de création, priorité (1–5).
- Persiste dans `seo_recommendations` avec un `payload` enrichi.
- Le composant `RecommendationCard` affiche : Potentiel, Trafic estimé, Difficulté, Temps, Priorité, Justification.

## Phase 3 — Analyse SEO complète + rapport stratégique

**Objectif** : le bouton **Analyser maintenant** produit un rapport hebdomadaire actionnable.

- Nouvelle edge function `seo-strategic-report` qui chaîne :
  - `seo-gsc-sync` (impressions, clics, positions, CTR)
  - `seo-linkcheck` (erreurs, orphelines)
  - `seo-pagespeed` (Core Web Vitals)
  - `seo-assistant-scan` (thin content, quick wins, stale)
  - `seo-suggest-pages` (Phase 2)
- Agrège en un `strategic_reports` (nouvelle table) : `{ pages_to_create, pages_to_refresh, links_to_add, qa_to_fix, blog_to_publish, projected_impressions_gain, projected_clicks_gain }`.
- Composant `StrategicReport.tsx` affiche le rapport en tête du Command Center.

## Phase 4 — Valeur d'affaires du SEO

**Objectif** : indicateurs business, pas seulement SEO.

- Nouvelle table `seo_business_metrics` (snapshot mensuel) : `organic_visitors`, `ads_equivalent_value`, `seo_submissions`, `seo_conversion_rate`, `estimated_revenue`, `cost_per_submission`, `roi`.
- Alimentée par edge function `seo-business-metrics-refresh` (cron mensuel) qui croise `seo_page_events` + `submissions` (via `lead_source`) + CPC moyen GSC.
- Nouveau bloc **Valeur SEO** dans le Command Center avec 8 KPI cards.

## Phase 5 — IA proactive quotidienne

**Objectif** : file de priorités générée chaque jour.

- Cron quotidien étendu (`seo-weekly-ideas` → renommé `seo-daily-priorities`) qui :
  1. relance scan + suggest + strategic-report;
  2. sélectionne les 5 actions à plus fort ROI (impact × facilité);
  3. écrit dans `seo_recommendations` avec `is_daily_priority = true`.
- Nouveau bloc **Priorités du jour** en haut du Command Center (top 5 cartes).

## Phase 6 — Carte de couverture territoriale

**Objectif** : voir d'un coup d'œil le territoire couvert.

- Composant `CoverageMap.tsx` : carte Google Maps avec un marqueur/heatmap par ville, couleur = % de matériaux couverts.
- Panneau latéral : `Territoire couvert %`, `Matériaux %`, `Services %`, `Combinaisons X / Y`.
- Utilise `seo_cities`, `seo_materials`, `seo_services`, `seo_pages` (comptage combos existants).

---

## Détails techniques

**Nouvelles tables (migration)** :
- `strategic_reports` (id, generated_at, payload jsonb, created_by uuid, RLS admin).
- `seo_business_metrics` (id, period_month date, kpis jsonb, RLS admin).
- Colonne `seo_recommendations.is_daily_priority boolean default false`.
- Étendre `seo_qa_reports.checks` (jsonb déjà présent) — pas de migration.

**Nouvelles edge functions** :
- `seo-qa-autofix` (admin, appelle Lovable AI par fragment)
- `seo-suggest-pages` (admin/cron)
- `seo-strategic-report` (admin, orchestre les scans)
- `seo-business-metrics-refresh` (cron mensuel)
- `seo-daily-priorities` (cron quotidien, remplace weekly-ideas)

**Frontend (`src/pages/AdminSeoManager.tsx` + `src/components/seo/`)** :
- `QaChecklist.tsx`, `StrategicReport.tsx`, `BusinessMetricsBlock.tsx`, `DailyPriorities.tsx`, `CoverageMap.tsx`.
- Le bouton **Analyser maintenant** appelle `seo-strategic-report` (spinner + toast progression).
- Le bouton **Corriger automatiquement** dans `ImproveDialog` appelle `seo-qa-autofix`.

**IA** : Lovable AI Gateway avec `google/gemini-3-flash-preview` (fallback `gemini-2.5-pro` pour rapport stratégique).

**Sécurité** : toutes les nouvelles fonctions vérifient `has_role(admin)` sauf appels cron (`Lovable-Context: cron` + service role).

---

## Ordre de livraison suggéré

1. Migration DB (tables + colonne).
2. Phase 1 (QA + autofix) — impact immédiat visible.
3. Phase 2 (suggestions filtrées).
4. Phase 3 (rapport stratégique).
5. Phase 5 (priorités quotidiennes, réutilise 2+3).
6. Phase 4 (valeur business).
7. Phase 6 (carte couverture).

Confirme et je commence par la migration + Phase 1.
