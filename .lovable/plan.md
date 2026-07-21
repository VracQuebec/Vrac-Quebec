
# Optimisation finale du SEO — Chaîne de production automatisée

Le Centre de Pilotage devient un vrai pipeline industriel : une source de vérité, du recalcul automatique, et un mode "Générer → Vérifier → Publier" par vagues.

## 1. Source unique de vérité (stats cohérentes)

Créer un unique moteur de stats côté serveur :

- **Edge function `seo-stats`** (GET) → retourne un objet unique consommé par toutes les cartes du dashboard :
  - `pages_total`, `pages_published`, `pages_draft`, `pages_needs_fix`
  - `cities_covered / cities_total`, `materials_covered / materials_total`, `services_covered / services_total`
  - `combinations_created / combinations_possible`
  - `qa_avg`, `seo_avg`, `gsc_impressions`, `gsc_clicks`, `gsc_position`
- Cache court (60s) via table `seo_stats_cache` (colonnes : `key`, `payload jsonb`, `computed_at`).
- Toutes les vues (CommandCenter, CoverageOverview, StrategicReport) lisent cette seule source via un hook `useSeoStats()`.

## 2. Recalcul automatique

- **Trigger DB** sur `seo_pages` (INSERT/UPDATE/DELETE) → `UPDATE seo_stats_cache SET stale = true`.
- Le hook `useSeoStats()` invalide et refetch dès qu'une mutation SEO se produit (canal Realtime `seo_pages`).
- Chaque edge function d'écriture (`seo-generate-page`, `seo-qa-autofix`, `seo-publish-wave`, suppression) marque le cache stale en fin d'exécution.

## 3. Correction des erreurs actuelles

Audit ciblé des "Load failed" et incohérences :

- Wrapper `invokeSeo(name, body)` centralisé (dans `src/lib/seo/api.ts`) :
  - retry x2 sur erreur réseau ;
  - lecture propre du corps d'erreur ;
  - toasts homogènes ;
  - typage strict des retours.
- Remplacer tous les `supabase.functions.invoke(...)` du module SEO par ce wrapper.
- Ajouter `ErrorBoundary` local autour de chaque carte du CommandCenter → une carte en erreur ne casse pas le tableau de bord, elle affiche "Réessayer".
- Fixer les états Loading/Empty/Error explicites sur chaque carte.

## 4. Moteur de validation avant publication

Nouvelle edge function **`seo-validate-page`** (réutilise la logique de `seo-qa-check`) qui retourne :

```
{ valid: boolean, score: number, blockers: [...], warnings: [...] }
```

Vérifie : contenu, meta title/description, H1/H2, URL, liens internes, Schema.org, images alt, duplication (trigrammes), score QA ≥ seuil (par défaut 80).

Les pages qui échouent restent en `status='draft'` avec `qa_blockers` renseigné, et apparaissent dans un onglet **À corriger**.

## 5. Publication par vagues

Nouvelle table **`seo_waves`** :

```text
id | name (S1/S2/S3) | description | priority | active
```

Chaque page a déjà `wave` (colonne existante à ajouter si absente : `wave text`).

Nouvelles edge functions :

- **`seo-publish-wave`** — publie toutes les pages `draft` d'une vague qui passent `seo-validate-page` (seuil configurable). Renvoie un rapport détaillé.
- **`seo-generate-wave`** — génère toutes les combinaisons manquantes d'une vague en file d'attente (utilise `seo-generate-page` en boucle contrôlée avec `p-limit`-style concurrency=3).
- **`seo-pipeline-run`** — orchestrateur "Générer → Vérifier → Corriger → Publier" pour une vague ou toutes.

## 6. File d'attente + progression

Table **`seo_generation_jobs`** (déjà existante) enrichie :

- `wave`, `mode` (`generate`/`validate`/`publish`/`pipeline`), `total`, `processed`, `succeeded`, `failed`, `status`, `started_at`, `finished_at`, `report jsonb`.

UI : composant **`WaveRunner`** :

- boutons **Générer S1 / S2 / S3 / Toutes**, **Publier S1/…/Toutes**, **Pipeline complet**.
- toggle **Générer → Vérifier → Publier automatiquement**.
- barre de progression live (Realtime sur `seo_generation_jobs`), ETA calculée depuis la vitesse moyenne.
- reprise automatique : si `status='running'` et pas de heartbeat > 60s, relance à partir de `processed`.

Traitement côté serveur en batches (concurrence 3, timeout par page, retry x2), pour tenir 500+ pages.

## 7. Rapport de vague

À la fin de chaque exécution, `seo-pipeline-run` écrit dans `strategic_reports` :

- générées, publiées, brouillons, refusées, erreurs
- QA moyen, SEO moyen, durée
- résumé IA (Gemini) des améliorations apportées

Affiché en modal auto à la fin du job + archivé dans l'onglet Rapports.

## 8. UI — Centre de Pilotage V3

- Nouvelle carte en tête : **Pipeline SEO** avec les 4 gros boutons de vagues + toggle auto.
- CommandCenter branché sur `useSeoStats()` (une seule source).
- Onglet **À corriger** listant les pages non conformes avec bouton "Corriger auto" (utilise `seo-qa-autofix`).
- Toutes les cartes : Loading / Empty / Error propres, plus jamais de "Load failed" nu.

## Détails techniques

- **Migration DB** : `seo_waves`, `seo_stats_cache`, colonnes `wave`, `qa_blockers` (si absentes), trigger d'invalidation cache, GRANTs authenticated/service_role, RLS admin-only.
- **Edge functions nouvelles** : `seo-stats`, `seo-validate-page`, `seo-publish-wave`, `seo-generate-wave`, `seo-pipeline-run`. Toutes admin-only (JWT + `has_role`).
- **Concurrency** : `Promise.all` par lots de 3, `AbortSignal.timeout(60_000)` par page.
- **Realtime** : abonnement `seo_generation_jobs` et `seo_pages` pour rafraîchir dashboard + progress.
- **Idempotence** : `seo-pipeline-run` accepte un `job_id` pour reprise.
- **Wrapper client** : `src/lib/seo/api.ts` + `src/lib/seo/useSeoStats.ts`.
- **UI** : `src/components/seo/WaveRunner.tsx`, `src/components/seo/PipelineReport.tsx`, `src/components/seo/NeedsFixList.tsx`.

## Étapes de livraison

1. Migration DB (vagues, cache, colonnes, trigger, RLS/GRANT).
2. Edge functions : `seo-stats`, `seo-validate-page`.
3. Edge functions vagues : `seo-generate-wave`, `seo-publish-wave`, `seo-pipeline-run`.
4. Wrapper client `invokeSeo` + hook `useSeoStats` + Realtime.
5. Refactor CommandCenter/CoverageOverview/StrategicReport → source unique + ErrorBoundary.
6. UI `WaveRunner` + toggle auto + progression + rapport final.
7. Onglet **À corriger** avec autofix en masse.
