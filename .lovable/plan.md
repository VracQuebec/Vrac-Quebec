# Fiabilisation complète du pipeline SEO

Objectif : un système de production unique, cohérent en temps réel, sans doublon ni blocage.

## 1. Source de vérité unique (`seo_pipeline_state`)

Nouvelle vue matérialisée + RPC `seo_pipeline_state()` qui agrège en un seul appel :
- job actif (une seule ligne max, verrou applicatif),
- stats live (pages générées/publiées, couverture, QA moy., score SEO, gain estimé),
- métriques de progression (vitesse pages/min, ETA, étape en cours),
- 5 derniers jobs terminés (archivés).

Le Centre de pilotage (`CommandCenter`), `StrategicReport`, `WaveRunner` et `useSeoStats` liront tous **uniquement** cette RPC. Suppression des sources parallèles pour éliminer les incohérences.

## 2. Déduplication garantie

- Contrainte `UNIQUE` partielle sur `seo_generation_jobs (mode, wave) WHERE status = 'running'` — impossible d'avoir deux jobs actifs identiques.
- Lors du `launch()`, `INSERT ... ON CONFLICT DO NOTHING` puis retour du job existant si conflit ; toast "Un job identique tourne déjà".
- Purge auto au démarrage : les jobs `running` dont `last_progress_at < now() - 3 min` passent en `failed_with_retries` avant tout nouveau lancement.

## 3. Rapports en temps réel

`seo-strategic-report` (et son affichage) intègre le job actif :
- ajoute `in_progress.pages_generating`, `in_progress.percent`, `in_progress.eta_seconds` au payload,
- projections recalculées avec les pages déjà générées dans le job courant (jamais "0 nouvelles pages" pendant un run).

Rafraîchissement automatique du rapport toutes les 10 s tant qu'un job tourne (via Realtime sur `seo_generation_jobs`).

## 4. Synchronisation automatique par page

Dans `seo-pipeline-run`, après **chaque** page traitée (succès ou échec) :
- appel `refresh_seo_aggregates()` (RPC légère qui met à jour `seo_pages` compteurs + `seo_goals` progrès + moyennes QA/score),
- broadcast Realtime sur `seo_generation_jobs` déclenche le re-fetch côté client de `useSeoStats`.

Résultat : couverture, objectifs, QA moyenne et recommandations bougent en direct.

## 5. Historique propre

- Trigger `seo_jobs_dedupe_history` : à la clôture d'un job, tous les jobs antérieurs de même `(mode, wave)` en état terminal sont supprimés sauf le plus récent.
- La liste "Derniers rapports" du `WaveRunner` lit une vue `seo_recent_jobs_v` qui déduplique par `(mode, wave)` et garde la dernière ligne.

## 6. Progression réelle

Nouvelles colonnes calculées côté RPC :
- `pages_remaining = total - done`,
- `pages_per_minute` (moyenne glissante sur `progress_samples` JSONB, échantillon ajouté à chaque page),
- `eta_seconds = pages_remaining / pages_per_minute * 60`,
- `current_step` déjà présent.

`WaveRunner` affiche : `24/27 · 3 restantes · 4.2 p/min · ~45 s restants · étape : publication`.

## 7. Auto-réparation

Cron `pg_cron` toutes les 60 s → `seo-pipeline-supervisor` (nouvelle edge function) qui :
- détecte doublons `running` et fusionne (garde le plus avancé, marque l'autre `superseded`),
- relance les jobs bloqués (>90 s sans progression) via l'action `watchdog` existante,
- ré-arme les pages "blocked" une fois par heure automatiquement,
- purge les logs > 200 entrées par job.

Aucun bouton manuel nécessaire ; le superviseur tourne en tâche de fond.

## Détails techniques

**Migration SQL** (`supabase/migrations/…_seo_pipeline_unification.sql`) :
- `ALTER TABLE seo_generation_jobs ADD progress_samples jsonb DEFAULT '[]'::jsonb, pages_per_minute numeric, eta_seconds int`.
- `CREATE UNIQUE INDEX seo_jobs_one_running ON seo_generation_jobs(mode, wave) WHERE status = 'running'`.
- `CREATE VIEW seo_recent_jobs_v` (DISTINCT ON `(mode, wave)` ordre `started_at DESC` sur états terminaux).
- Trigger `seo_jobs_dedupe_history_trg` sur `AFTER UPDATE OF status`.
- RPC `seo_pipeline_state()` — SECURITY DEFINER admin only, retourne `jsonb` unifié.
- RPC `refresh_seo_aggregates()` — met à jour `seo_goals.current_value` + counters.
- GRANT EXECUTE aux `authenticated` (protégée par `has_role` admin en interne).

**Edge functions** :
- `seo-pipeline-run/index.ts` : après chaque page, push d'un sample `{at, done}` dans `progress_samples`, calcul `pages_per_minute` + `eta_seconds`, appel `refresh_seo_aggregates`.
- Nouvelle `seo-pipeline-supervisor/index.ts` : logique auto-repair ci-dessus.
- `seo-strategic-report/index.ts` : lit le job actif et injecte `in_progress` dans le payload.

**Frontend** :
- `src/lib/seo/useSeoStats.ts` : bascule sur `supabase.rpc('seo_pipeline_state')` ; conserve l'ancien fallback si RPC indispo.
- `src/components/seo/WaveRunner.tsx` : affiche restant / p.min / ETA ; lit `seo_recent_jobs_v` pour l'historique ; bloque le lancement si conflit dédupliqué.
- `src/components/seo/CommandCenter.tsx` et `StrategicReport.tsx` : consomment `in_progress` du state unifié.

**Cron** (via `supabase--insert`, pas migration — contient URL/anon) :
`select cron.schedule('seo-pipeline-supervisor', '1 minute', $$ select net.http_post(...) $$);`

## Ordre d'exécution

1. Migration SQL (schéma + RPC + vue + triggers + index unique).
2. Edge functions : mise à jour `seo-pipeline-run`, `seo-strategic-report` ; création `seo-pipeline-supervisor`.
3. Cron via insert tool.
4. Frontend : `useSeoStats`, `WaveRunner`, `CommandCenter`, `StrategicReport`.
5. Vérification build.

## Hors périmètre

- Refonte de la génération de contenu (`seo-generate-page`) : inchangée.
- Nouveaux critères QA : inchangés.
- UI du blog / Assistant entrepreneur : inchangés.
