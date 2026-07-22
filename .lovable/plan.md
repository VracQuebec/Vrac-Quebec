
# Refonte pipeline SEO — Génération ville par ville

Objectif : remplacer la génération "par vagues de N pages" par une **pipeline par ville**, séquentielle, contrôlable, reprise-après-crash, et scalable à plusieurs milliers de pages.

## 1. Modèle de données (migration)

Nouvelles tables :

- **`seo_pipeline_runs`** — un run global (ex. « Générer tout »).
  - `id`, `status` (queued/running/paused/stopped/completed/failed), `mode` (all_cities / single_city / retry_errors), `city_slugs[]`, `qa_threshold` (défaut 90), `max_retries` (défaut 3), `page_timeout_ms` (défaut 60000), progression agrégée, `created_by`, timestamps.

- **`seo_city_batches`** — un batch = une ville dans un run.
  - `id`, `run_id`, `city_slug`, `status` (queued/running/paused/qa/fixing/publishing/completed/failed), compteurs (`total`, `done`, `succeeded`, `failed`, `retries`), `sitemap_updated_at`, timestamps.

- **`seo_page_tasks`** — file d'attente unitaire (une page à faire).
  - `id`, `batch_id`, `city_slug`, `material_slug?`, `service_slug?`, `kind` (generate/qa/autofix/publish), `status` (queued/running/succeeded/failed/needs_retry/skipped), `attempts`, `last_error`, `page_id?`, `qa_score?`, `started_at`, `finished_at`, `next_attempt_at`.
  - Index unique partiel `(batch_id, city_slug, material_slug, service_slug, kind)` pour empêcher doublons.

Vue **`seo_pipeline_live_v`** : agrège run → batches → tasks pour le dashboard.

## 2. Orchestration (edge functions)

Remplace la logique « lancer 300 pages à la fois » par un **worker séquentiel** :

- **`seo-pipeline-orchestrator`** (nouvelle)
  - Idempotente. Appelée en boucle (client polling + cron watchdog).
  - Sélectionne le run actif non pausé, la prochaine ville `queued`, matérialise ses `seo_page_tasks` (matériaux × services de la ville, plus la page hub), passe le batch en `running`.
  - Pour cette ville : boucle **une page à la fois** — `generate` → `qa` → si score < seuil `autofix` → `qa` → `publish`. Chaque étape est une tâche persistée.
  - Timeout dur 60 s par page (via `Promise.race`) ; échec → `attempts++`, remis en queue avec back-off exponentiel jusqu'à `max_retries`, puis marquée `needs_retry`.
  - Quand toutes les tâches de la ville sont `succeeded`/`skipped`/`needs_retry` : régénère le sitemap (`seo-sitemap-refresh`) et passe le batch `completed`. Puis passe à la ville suivante.
  - Respecte `status = paused/stopped` à chaque itération (arrêt immédiat entre pages).

- **`seo-pipeline-supervisor`** (existante, étendue)
  - Cron 1 min : détecte tâches `running` > 90 s → repasse `queued`. Détecte runs `running` sans progression > 3 min → relance l'orchestrateur. Merge doublons.

- **`seo-sitemap-refresh`** (nouvelle, légère) — régénère `sitemap.xml` pour une ville / global.

Réutilise `seo-generate-page`, `seo-qa-check`, `seo-qa-autofix` existantes ; l'orchestrateur les appelle une par une.

## 3. RPC de contrôle (SQL)

- `seo_pipeline_start(mode, city_slugs, qa_threshold)` — crée run + batches `queued`.
- `seo_pipeline_pause(run_id)` / `seo_pipeline_resume(run_id)` / `seo_pipeline_stop(run_id)` / `seo_pipeline_cancel(run_id)`.
- `seo_pipeline_retry_errors(run_id | batch_id)` — repasse les `needs_retry`/`failed` en `queued` et reset `attempts`.
- `seo_pipeline_regenerate_city(city_slug)` — nouveau run mode `single_city`, force regénération.
- `seo_pipeline_republish_city(city_slug)` — crée batch avec tâches `publish` uniquement.
- `seo_pipeline_state_v2()` — snapshot complet pour le dashboard.

Admin-only (via `has_role`).

## 4. Reprise après crash

Aucun état en mémoire : tout vit dans `seo_pipeline_runs` / `seo_city_batches` / `seo_page_tasks`. Au démarrage l'orchestrateur reprend simplement la prochaine tâche `queued`. Les tâches `succeeded` ne sont jamais rejouées. Le cron supervisor garantit la relance même si personne n'a le dashboard ouvert.

## 5. Frontend — Centre de pilotage V2

Refonte de `src/components/seo/WaveRunner.tsx` → nouveau composant **`PipelineControlCenter.tsx`** :

- Header : bouton **🚀 Générer tout** + ⏸ Pause / ▶ Reprendre / ⏹ Arrêter / ↻ Relancer erreurs.
- Barre globale : ville en cours, pages faites / total, vitesse (p/min), ETA, réussites / échecs / retries, QA moyen.
- Liste des villes (une carte par ville) :
  - État visuel : ✅ 100 % • 🔄 62 % • ⏳ En attente • ⚠ Erreurs
  - Actions par ville : Voir logs, Pause, Reprendre, Regénérer, Republier, Voir erreurs.
- Onglet Logs (temps réel via Supabase Realtime sur `seo_page_tasks`).
- Onglet À reprendre (tâches `needs_retry`).

Nouveau hook `useSeoPipelineV2()` qui consomme `seo_pipeline_state_v2()` + Realtime.

Un **client-side poker** (fetch orchestrator toutes les 3-5 s pendant qu'un run est actif) déclenche la progression sans dépendre uniquement du cron.

## 6. Détails techniques

- Contrainte unique partielle `WHERE status IN ('queued','running')` sur `seo_page_tasks` pour empêcher doublons.
- Back-off : 5 s, 20 s, 60 s.
- Sitemap régénéré une seule fois par ville terminée, puis un rebuild global à la fin du run.
- Toutes les RPC/tables : GRANT approprié (`authenticated` pour lecture admin, `service_role` complet).
- Realtime activé sur `seo_pipeline_runs`, `seo_city_batches`, `seo_page_tasks`.
- Aucune modification des tables `seo_pages` existantes (compatibilité totale avec pages déjà publiées).

## 7. Migration douce

L'ancien `WaveRunner` reste accessible en mode legacy le temps de valider la V2, puis sera retiré dans une seconde passe.

## Fichiers touchés

- Migration : nouvelles tables, index, RPC, activation Realtime, GRANTs, cron supervisor.
- Nouvelles edge functions : `seo-pipeline-orchestrator/index.ts`, `seo-sitemap-refresh/index.ts`.
- Edge functions modifiées : `seo-pipeline-supervisor/index.ts`.
- Frontend : `src/components/seo/PipelineControlCenter.tsx` (nouveau), `src/lib/seo/useSeoPipelineV2.ts` (nouveau), intégration dans `src/components/seo/CommandCenter.tsx`.

Une fois ce plan approuvé, j'exécute la migration en premier (approbation séparée), puis les edge functions, puis l'UI.
