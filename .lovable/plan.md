
# Refonte SEO Manager — Plateforme de pilotage professionnelle

Objectif : transformer le SEO Manager actuel (fonctionnel mais fragmenté) en un outil unifié, sans doublons, avec QA transparent, corrections en 1 clic (page + site), suggestions priorisées, projections de couverture, suivi de conversions par page, conseiller IA hebdomadaire, et pipeline scalable.

L'infra existe déjà en grande partie (pipeline V2, QA autofix, mesh blog, business metrics, events, recommandations). Ce plan **consolide** au lieu de reconstruire.

---

## 1. Nettoyage du tableau de bord (source unique)

- Supprimer les compteurs redondants dans `CommandCenter.tsx`, `CoverageOverview.tsx`, `WaveRunner.tsx`, `HealthScoreGauge.tsx`.
- Une seule RPC `seo_dashboard_v2()` retourne : totaux (pages, publiées, drafts, needs-fix), QA moyen, couverture (villes/matériaux/services/combos), pipeline actif, top 10 recos, projections, conversions 30j.
- Nouveau layout `AdminSeoManager.tsx` avec 5 onglets seulement : **Pilotage · Pages · Couverture · Suggestions · Conseiller IA**. Retirer les onglets qui recoupent (Conversions fusionne dans Pilotage, Waves fusionne dans Pilotage).

## 2. Score QA transparent

- Refondre `seo-qa-check` avec **11 critères pondérés** (contenu, H1, H2, title, meta desc, OG, FAQ, schema.org, liens internes, longueur, duplication, optimisation locale ville+matériau).
- Chaque critère renvoie `{ id, label, weight, passed, score, details, fixable }`.
- Stocker le détail dans `seo_pages.qa_breakdown jsonb`.
- Nouveau composant `QaBreakdown.tsx` : liste visuelle « pourquoi cette note », avec badges verts/rouges par critère.

## 3. Bouton « Corriger automatiquement » (par page)

- Un seul CTA sur chaque ligne + dans la fiche page.
- Enchaîne : QA → autofix ciblé sur critères ratés (métadonnées, FAQ, contenu, liens internes, OG) → re-QA → sauvegarde.
- Étend `seo-qa-autofix` pour couvrir Open Graph et schema.org (manquants aujourd'hui).
- Feedback temps réel : progression + nouveau score.

## 4. « Optimiser tout le site » (global)

- Nouveau bouton dans Pilotage → lance un run `seo_pipeline_start('optimize_all')`.
- Sélectionne toutes les pages publiées avec `qa_last_score < 90` OU métadonnées manquantes OU < 5 liens internes.
- Traitement en lot via l'orchestrator existant (pas de nouveau moteur).
- Progression visible dans `PipelineControlCenter`.

## 5. Suggestions intelligentes (top 10)

- Utiliser la table `seo_recommendations` existante.
- Nouveau composant `TopActionsPanel.tsx` : 10 recos triées par `impact/effort` avec priorité, trafic estimé, difficulté.
- Bouton « Appliquer » par reco (déjà via `RecommendationCard`).
- Job hebdo `seo-suggest-pages` (existe) recalcule.

## 6. Couverture territoriale avec projections

- Étendre `seo_dashboard_stats` pour calculer, pour chaque item manquant :
  - pages générables = N combinaisons
  - impressions estimées = population × ratio search × CTR moyen catégorie
  - clics estimés = impressions × CTR pos moyenne
- Nouveau composant `CoverageProjections.tsx` : par bloc (villes / matériaux / services / combos / articles) : « +X pages · +Y impr/mois · +Z clics/mois ».
- CTA « Créer ces N pages » → lance la génération ciblée.

## 7. Suivi réel des conversions par page

- La table `seo_page_events` existe déjà (view, phone_click, whatsapp_click, submission, cta_click).
- Ajouter tracking `email_click` dans `logSeoEvent` + boutons courriel du site public.
- Nouvelle vue matérialisée `seo_page_conversions_30d` : par page → views, phone, whatsapp, email, submissions, ratio conv.
- Colonne « Conversions » dans la table des pages + agrégat dans Pilotage.

## 8. Conseiller IA hebdomadaire

- Nouvelle table `seo_advisor_reports` (weekly digest).
- Edge function `seo-advisor-weekly` (pg_cron dimanche 6h) qui utilise Gemini pour produire :
  - résumé de la semaine (delta pages, QA, trafic)
  - problèmes détectés
  - pages à créer / améliorer
  - villes/matériaux/articles à ajouter
  - gain SEO estimé
- Nouvel onglet **Conseiller IA** : dernier rapport + historique + bouton « Générer maintenant ».

## 9. Performance (scalabilité milliers de pages)

L'infra est déjà là : `seo_pipeline_runs`, batches, tasks, watchdog, cron supervisor. Ajustements :
- Index manquants sur `seo_pages(status, qa_last_score)`, `seo_page_events(page_slug, created_at)`.
- Pagination serveur dans la table des pages (actuellement client-side).
- Cache mémoire 30s côté RPC dashboard.
- Batch size dynamique dans l'orchestrator selon la charge.

---

## Détails techniques

**Migrations SQL**
- `seo_pages.qa_breakdown jsonb`
- `seo_advisor_reports` (id, generated_at, summary, issues, opportunities, estimated_gain, report_md)
- Vue matérialisée `seo_page_conversions_30d` + refresh cron 15 min
- Index perf
- RPC `seo_dashboard_v2()` + `seo_coverage_projections()`

**Edge functions**
- Refonte `seo-qa-check` (critères pondérés + breakdown)
- Extension `seo-qa-autofix` (OG + schema.org)
- Nouvelle `seo-advisor-weekly`
- Mode `optimize_all` dans `seo-pipeline-orchestrator`

**Frontend**
- `AdminSeoManager.tsx` : 5 onglets, layout consolidé
- Nouveaux : `QaBreakdown.tsx`, `TopActionsPanel.tsx`, `CoverageProjections.tsx`, `AdvisorPanel.tsx`
- Retrait : composants doublons (compteurs répétés)
- Table pages : pagination serveur, colonne Conversions, bouton « Corriger » unifié
- Tracking `email_click` ajouté à `src/lib/seo/tracking.ts` + boutons mailto sur pages publiques

---

## Livraison en 3 phases

1. **Consolidation** (nettoyage doublons, RPC unique, QA breakdown, bouton corriger unifié) — base saine.
2. **Intelligence** (projections couverture, top actions, tracking conversions étendu, optimize_all).
3. **Conseiller IA + perf** (rapport hebdo, index/pagination/cache).

Chaque phase est livrable indépendamment et laisse le module utilisable.
