# SEO Manager → Assistant SEO intelligent

Chantier unique livré en 7 modules cohérents, sans ajouter de pages inutiles. Tout vit dans `/admin/seo-manager` sous de nouveaux onglets, et repose sur l'infra déjà en place (`seo_pages`, `blog_posts`, `seo_gsc_metrics`, `seo_cities/materials/services`, Gemini via Lovable AI).

---

## Module 1 — Assistant SEO IA (recommandations)

Nouvel onglet **Assistant**. Un moteur qui scanne l'ensemble du site et pond des recommandations concrètes, priorisées, actionnables en un clic.

- Edge function `seo-assistant-scan` (Gemini 3 Flash) — orchestrateur qui lit :
  - `seo_pages` (score, mots, liens internes, priorité, statut Google)
  - `blog_posts` (fraîcheur, mots, articles reliés)
  - `seo_gsc_metrics` (impressions, position, CTR)
  - `seo_cities`, `seo_materials`, `seo_services` (couverture)
- Génère des `recommendations` typées : `thin_content`, `quick_win_gsc` (pos 8-20), `missing_internal_links`, `stale_blog`, `missing_city_page`, `missing_service_content`, `add_faq`, `low_ctr`, `orphan_page`.
- Chaque reco a : `page_id?`, `entity_type` (page/blog/city/material/service), `priority` (1-5), `impact_estimate`, `effort_estimate`, `title`, `rationale`, `action_type` (improve / regenerate / create / attach_links / update_meta), `payload jsonb`, `status` (open/dismissed/applied).
- UI : liste triée par priorité, filtres par type/entité, boutons **Appliquer** (déclenche `seo-improve-page` ou `seo-generate-page` selon `action_type`), **Ignorer**, **Voir la page**.

Table : `seo_recommendations`.

## Module 2 — Analyse concurrents

Nouvel onglet **Concurrents**. L'admin ajoute 1-N domaines concurrents.

- Table `seo_competitors` (domain, label, active, added_at).
- Table `seo_competitor_pages` (competitor_id, url, title, h1, meta_description, city_slug?, material_slug?, service_slug?, keywords text[], last_crawled_at).
- Edge function `seo-competitor-crawl` : récupère `sitemap.xml` + fetch max 100 pages/domaine, extrait title/H1/meta/mots-clés dominants, essaie d'associer city/material via nos slugs.
- Edge function `seo-competitor-gaps` : diff entre leurs combinaisons ville×matériau×service et les nôtres → génère des recos type `missing_city_page`, `missing_service_page`, `keyword_gap` (rangées dans `seo_recommendations`).
- UI : liste concurrents, top pages, tableau des gaps triable, bouton **Créer la page manquante** (préremplit le générateur SEO Manager).

## Module 3 — Idées automatiques hebdo

Cron hebdo `seo-weekly-ideas` (dimanche 22h) qui relance :
1. `seo-assistant-scan` (module 1)
2. `seo-competitor-gaps` (module 2)
3. Détection blog : articles > 180 j sans update, catégories sans nouvel article > 60 j
4. Injection dans `blog_post_ideas` (table existante) pour les nouveaux articles suggérés, et dans `seo_recommendations` pour tout le reste.

Notification légère dans l'onglet Assistant : badge "X nouvelles recommandations cette semaine".

## Module 4 — Tableau de bord santé SEO

Refonte de l'onglet **Vue d'ensemble** existant en véritable **Santé SEO** :

- Score global (moyenne pondérée des `seo_score` + bonus indexation + bonus CTR GSC), affiché /100 avec jauge.
- KPI : pages excellentes (≥85), à améliorer (65-84), faibles (<65), non indexées, orphelines (0 lien interne entrant), articles obsolètes.
- État sitemap (via `HEAD /sitemap.xml`), dernière exploration Google (max `google_last_checked_at`).
- Core Web Vitals + temps de chargement : appel PageSpeed Insights via edge function `seo-pagespeed` (clé publique Google, pas de secret utilisateur requis — sinon fallback "non configuré"). Stockage dans nouvelle table `seo_pagespeed_snapshots` (page_id, lcp, cls, inp, perf_score, fetched_at). Une mesure par jour sur la home + top 10 pages.
- Liens brisés & 404 : job `seo-linkcheck` qui parcourt `sitemap.xml`, teste chaque URL, log dans `seo_broken_links` (url, status, source_page, checked_at).

## Module 5 — Objectifs SEO

Nouvelle table `seo_goals` (label, metric_type enum: indexed_pages / organic_clicks_month / avg_ctr / keyword_rank / submissions_month, target_value, deadline, current_value, updated_at).

- UI onglet **Objectifs** : liste + progression (barre), création/édition.
- Fonction `seo-goals-refresh` (cron quotidien) qui recalcule `current_value` selon le `metric_type` :
  - `indexed_pages` → `count(seo_pages where google_index_status = 'indexed')`
  - `organic_clicks_month` → sum clicks 28d dans `seo_gsc_metrics`
  - `avg_ctr` → moyenne CTR 28d
  - `keyword_rank` → position d'un mot-clé cible (top_queries)
  - `submissions_month` → `count(submissions where created_at > now() - 30d)`

## Module 6 — Priorisation intelligente

Enrichissement du calcul de `priority` déjà en place :

- Nouvelle fonction SQL `seo_priority_score(page_id)` intégrant :
  - volume estimé (population ville × poids matériau)
  - concurrence (nombre de concurrents ayant la même combo dans `seo_competitor_pages`)
  - difficulté (GSC : position moyenne actuelle)
  - potentiel trafic (impressions 28d si déjà indexée)
  - potentiel client (matériau taxable + type de demande fréquent dans `submissions`)
- Recalcul auto à chaque `seo-assistant-scan`.
- Nouveau bloc **Top 10 actions les plus rentables** en tête de l'onglet Assistant (tri par `impact_estimate / effort_estimate`).

## Module 7 — Performance & garde-fous

- Toutes les fonctions IA/crawl s'exécutent côté edge (aucun poids client).
- Onglet Assistant charge en lazy (`React.lazy`) et pagine les recos (25/page).
- Les tables nouvelles ont des index sur `status`, `priority`, `page_id`.
- Cache 24h côté DB pour PageSpeed et crawl concurrents (pas de re-fetch inutile).
- Aucun ajout de dépendance npm côté front ; côté edge, uniquement `fetch` + `deno-dom` pour parser HTML concurrents.

---

## Détails techniques

**Migrations DB**
- `seo_recommendations`, `seo_competitors`, `seo_competitor_pages`, `seo_goals`, `seo_pagespeed_snapshots`, `seo_broken_links`
- Fonction SQL `seo_priority_score`
- GRANT authenticated + service_role, RLS admin-only sur toutes

**Edge functions (nouvelles)**
- `seo-assistant-scan` — génère les recommandations
- `seo-competitor-crawl` — sitemap + fetch pages concurrents
- `seo-competitor-gaps` — diff → recos
- `seo-weekly-ideas` — cron hebdo (orchestrateur)
- `seo-pagespeed` — PageSpeed Insights
- `seo-linkcheck` — vérif liens
- `seo-goals-refresh` — recalcul objectifs

**Front (dans `AdminSeoManager.tsx`)**
- Nouveaux onglets : **Assistant**, **Concurrents**, **Objectifs**
- Refonte onglet **Vue d'ensemble** → **Santé SEO**
- Composants : `src/components/seo/RecommendationCard.tsx`, `CompetitorTable.tsx`, `GoalCard.tsx`, `HealthScoreGauge.tsx`

**Cron**
- `seo-weekly-ideas` : dimanche 22h
- `seo-goals-refresh` + `seo-pagespeed` : quotidien 03h
- `seo-linkcheck` : hebdo lundi 04h

---

## Séquencement

1. Migrations DB + fonction `seo_priority_score` (module 6 côté DB)
2. Module 4 (Santé SEO) — refonte visuelle immédiate
3. Module 1 (Assistant) — cœur du système
4. Module 2 (Concurrents)
5. Module 5 (Objectifs)
6. Module 3 (Idées hebdo) — cron qui orchestre 1+2
7. Module 7 (perfs) — audit final, lazy-load, index

Livraison en un seul chantier, sans validation intermédiaire.

## Questions

1. **PageSpeed** : j'utilise l'API publique Google (quota gratuit 25k/j). OK sans clé, ou tu veux qu'on ajoute une clé dédiée plus tard ?
2. **Concurrents** : je limite à **5 domaines max** et **100 pages/domaine** pour éviter les abus / lenteurs. OK ?
3. **Cron hebdo** : dimanche 22h te convient, ou tu préfères un autre créneau ?
4. **Objectifs par défaut** : je pré-crée les 5 objectifs de ton message (500 pages indexées, 1000 clics/mois, CTR 5 %, top 10 sur mots-clés cibles, 100 soumissions/mois) ?
