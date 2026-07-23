# Plateforme SEO industrielle & réduction 60-90% des crédits IA

Objectif : rendre le maillage et l'optimisation capables de traiter des milliers de pages/articles, avec une règle stricte "IA seulement pour la rédaction/réécriture/sémantique complexe" et un cache permanent des réponses IA.

Livraison en 4 phases indépendantes, chacune shippable seule. Aucune duplication : on réutilise le pattern déjà rôdé du Pipeline SEO (`seo_pipeline_runs` + `seo-optimize-worker` + supervisor cron).

---

## Phase 1 — Moteur de maillage industriel (Blog ↔ SEO)

Remplace `blog-mesh-analyze` monolithique par un moteur à batches, sans IA.

**DB (migration)**
- `blog_mesh_runs` : ajout `status` (queued/running/paused/completed/failed/cancelled), `total_batches`, `done_batches`, `total_items`, `done_items`, `speed_per_min`, `last_progress_at`, `mode` (full/incremental/single_post/single_page), `error`.
- `blog_mesh_batches` : `run_id`, `kind` (`posts`|`pages`), `item_ids uuid[]`, `status`, `attempts`, `error`, `started_at`, `finished_at`.
- `blog_posts.mesh_content_hash text`, `seo_pages.mesh_content_hash text` : SHA-256 du contenu normalisé. Skip si inchangé.
- RPCs `blog_mesh_start(mode, item_ids?)`, `blog_mesh_pause/resume/cancel/retry_errors(run_id)`, `blog_mesh_state()`.
- Trigger : quand un `blog_posts` ou `seo_pages` est modifié → invalide son hash + enqueue un mini-run incrémental (juste cet item + ses voisins pertinents).

**Edge functions**
- Refonte `blog-mesh-analyze` → `blog-mesh-worker` : réclame 1 batch (25 posts ou 50 pages), calcule les liens **de manière déterministe** (voir Phase 2), écrit `blog_seo_links`, met à jour hash + `mesh_score`. Se relance jusqu'à batch vide.
- `blog-mesh-supervisor` (cron 1 min) : watchdog, relance runs bloqués, retry auto ≤ 3.

**UI**
- Refonte `src/pages/AdminBlogMesh.tsx` : contrôles Start/Pause/Reprendre/Annuler/Relancer erreurs, progression temps réel (batches, items, ETA, items/min), journal 50 derniers items.

## Phase 2 — Maillage 100% déterministe (zéro IA)

Le maillage actuel appelle l'IA pour matcher blog↔SEO. On remplace par un scoring pur algo :

- **Tokenisation** : titre + h2/h3 + slug + tags → tokens normalisés (unaccent, stopwords FR).
- **Score de similarité** : TF-IDF léger + boost si ville/matériau/service détectés dans les deux entités (regex sur les slugs `seo_cities/materials/services`).
- **Règles de placement** : max 6 liens sortants/article, ancre = titre H2 du contenu cible, dédoublonnage par slug cible.
- **Cache** : hash contenu → si inchangé, réutilise `blog_seo_links` existant.
- Résultat : `blog-mesh-worker` n'appelle plus jamais l'IA. Économie ≈ 100% des crédits actuellement dépensés sur le maillage.

Suppression de tout appel `ai.gateway.lovable.dev` dans `blog-mesh-*`, `seo-suggest-pages` (remplacé par SQL), `seo-assistant-scan` (déjà en cours de refonte — on finalise en pur SQL sur `seo_page_scores` + `seo_gsc_deltas_28d`).

## Phase 3 — Cache IA permanent + regroupement d'appels

Objectif : ne jamais refaire deux fois le même appel IA, et regrouper H1+meta+FAQ+résumé+mots-clés+schema dans **un seul** prompt.

**DB**
- `ai_response_cache` : `cache_key text primary key` (sha256 de `{function}:{model}:{prompt_hash}:{schema_version}`), `response jsonb`, `model text`, `tokens_in int`, `tokens_out int`, `cost_credits numeric`, `hit_count int`, `created_at`, `last_used_at`.
- `ai_usage_log` : 1 ligne par appel (feature, page_id, model, tokens, credits, cache_hit bool, batch_id, run_id).
- Vue `ai_usage_daily_v` / `_weekly_v` / `_monthly_v` (par feature, par page, par batch, économies via cache).

**Edge shared**
- `supabase/functions/_shared/ai-cache.ts` : `callAiCached(feature, prompt, schema, mode)` → check cache → sinon appel → écrit cache + log. Regroupe automatiquement les schémas connus.
- Refactor `seo-qa-autofix`, `seo-improve-page`, `blog-ai-generate`, `seo-generate-page` pour passer par ce helper, avec **1 seul appel groupé** pour toutes les métadonnées d'une page.

**UI**
- Nouveau `src/components/seo/AiCostDashboard.tsx` (onglet Pilotage) : crédits aujourd'hui/semaine/mois, par feature, par page, appels évités par cache, économies.

## Phase 4 — Traitement incrémental + estimation + modes

**Incrémental**
- Skip automatique dans tous les workers : `qa_score >= 95`, `content_hash inchangé`, `already_optimized_at > content_updated_at`.
- Les runs `blog_mesh_start('incremental')` et `seo_optimization_start(force_all=false)` ne prennent que les items modifiés depuis leur dernier run.

**Estimation avant lancement (RPC)**
- `estimate_run(kind, filter)` retourne : pages concernées, pages ignorées (skip incrémental), appels IA estimés, crédits estimés, durée estimée. Appelé par tous les boutons Start → modale de confirmation.

**3 modes globaux**
- Table singleton `ai_mode_config` : `mode` ('economy'|'standard'|'quality'), seuils (`qa_skip_above`, `cache_ttl_days`, `group_calls_bool`, `use_ai_for_metadata_bool`).
- Economy (défaut) : cache obligatoire, regroupement max, IA uniquement rédaction longue.
- Standard : équilibre (règles actuelles).
- Quality : autorise appels séparés fine-grain.
- Switch dans `AiCostDashboard`, lu par tous les workers.

---

## Détails techniques

**Nouvelles tables** : `blog_mesh_batches`, `ai_response_cache`, `ai_usage_log`, `ai_mode_config` (+ colonnes hash sur `blog_posts`/`seo_pages`).
**Refonte** : `blog-mesh-analyze` → `blog-mesh-worker` + supervisor. `seo-qa-autofix`, `seo-improve-page`, `blog-ai-generate` passent par `_shared/ai-cache.ts` avec appels regroupés.
**UI** : refonte `AdminBlogMesh.tsx`, nouveau `AiCostDashboard.tsx` intégré dans `AdminSeoManager.tsx` onglet Pilotage.
**Sécurité** : RLS admin-only + service_role sur toutes les nouvelles tables, GRANT explicites.
**Multi-entreprises** : `tenant_id` nullable prêt sur toutes les nouvelles tables.

## Ordre recommandé

1. **Phase 1** — Moteur de maillage à batches (débloque la mise à l'échelle immédiate).
2. **Phase 2** — Bascule maillage en 100% déterministe (économie massive tout de suite).
3. **Phase 3** — Cache + regroupement (économie sur tout le reste).
4. **Phase 4** — Incrémental + estimation + modes (dernière couche d'optimisation + contrôle utilisateur).

Chaque phase est mergeable seule. Confirme pour que je démarre la Phase 1, ou dis-moi de réordonner / fusionner.
