## Objectif

Faire passer le générateur SEO de la version "test 39 villes Québec/Lévis" à une couverture territoriale complète, entièrement pilotée par la base, avec un pipeline industriel reprenable et un rapport final vérifiable.

## État actuel (constaté)

- `seo_cities` contient 39 villes actives, sans région / MRC / type / population structurés.
- `seo_pages` = 618 pages, majoritairement `draft`, alimentées par `seo_pipeline_runs` + `seo_city_batches` + `seo_page_tasks`.
- Orchestrateur serveur (`seo-pipeline-orchestrator`) + supervisor + cron déjà en place, verrou distribué, watchdog, garde-fous IA (min 400 mots).
- Sitemap régénéré depuis `seo_pages.status='published'`.

Ce qu'il manque : structure territoriale complète, ingestion massive des municipalités, tableau de bord de couverture, rapport final auto, garde-fous "≥ 800 mots" et non-régression des pages déjà publiées.

---

## Plan d'exécution

### 1. Modèle territorial enrichi (migration DB)

Ajouter à `public.seo_cities` :

- `arrondissement text`, `mrc text`, `region_admin text`, `province text default 'QC'`
- `territory_type text` (`ville` | `arrondissement` | `quartier` | `secteur` | `municipalite`)
- `parent_slug text` (référence vers ville parente pour les arrondissements / quartiers)
- `seo_priority int default 50` (0-100)
- `served boolean default true` (desservi par Vrac Québec)
- `last_generated_at timestamptz`

Index sur `(active, served, seo_priority desc)` et `(parent_slug)`.

### 2. Ingestion complète des municipalités desservies

Insertion idempotente (`INSERT ... ON CONFLICT (slug) DO UPDATE`) des territoires listés par l'utilisateur :

- Ville de Québec + 6 arrondissements + tous les quartiers cités.
- Ville de Lévis + secteurs (Charny, Saint-Romuald, Saint-Nicolas, Pintendre, Breakeyville, Saint-Jean-Chrysostome, Saint-Étienne, Lauzon…).
- Ceinture : Boischatel, L'Ange-Gardien, Beaupré, Château-Richer, Sainte-Anne-de-Beaupré, Saint-Ferréol-les-Neiges, Stoneham-et-Tewkesbury, Shannon, Lac-Beauport, Lac-Delage, Sainte-Brigitte-de-Laval, Saint-Augustin-de-Desmaures, Wendake, Donnacona, Pont-Rouge, Portneuf, Fossambault-sur-le-Lac, Sainte-Catherine-de-la-Jacques-Cartier, Saint-Raymond.
- Chaque entrée : `territory_type`, `parent_slug` (le cas échéant), `region_admin`, `mrc`, `seo_priority` calculé par population.

### 3. Combinatoire de génération pilotée par la base

- `seo_pipeline_start` mis à jour : charge automatiquement toutes les villes `active=true AND served=true`, triées par `seo_priority DESC, population DESC`.
- Pour chaque ville, `seo_city_batches` génère les tâches attendues : hub ville + N matériaux + M services + pages livraison / dompes / transport, avec `INSERT ... ON CONFLICT DO NOTHING` pour ne jamais dupliquer.
- Nouvelle fonction `seo_pipeline_plan_expected(city_slug) → int` : renvoie le nombre de pages attendues pour la ville (référence "total prévu").

### 4. Reprise et checkpoints (renforcement)

- `seo_page_tasks.status` normalisé à l'ensemble : `pending | processing | completed | failed | skipped`.
- Colonnes déjà présentes utilisées comme checkpoint (`attempts`, `next_attempt_at`, `finished_at`).
- `seo_pipeline_resume` : garantit qu'on ne rejoue jamais un `completed` (déjà le cas), documenté et testé.
- `seo_pipeline_start(_force_regenerate=false)` : skip toute ville dont toutes les pages sont `published` et `word_count >= 800`.
- Bouton **Régénérer** (déjà existant) reste le seul moyen de forcer le retraitement.

### 5. Garde-fous qualité renforcés

- `seo-generate-page` : seuil relevé à **≥ 800 mots** (au lieu de 400) pour publication ; sinon 502 retryable.
- `seo-qa-check` : marque `needs_refresh=true` si `word_count < 800`, `meta_title` vide, `meta_description` vide, `canonical` manquant, `jsonld` manquant, FAQ absente, ou < 3 liens internes.
- Job de sanity nocturne (cron déjà existant) : recompte `word_count`, détecte slugs en doublon, boucles `needs_retry > 5`, batches inactifs > 15 min.

### 6. Tableau de bord "Couverture territoriale"

Nouveau composant `src/components/seo/TerritorialCoverage.tsx` branché dans `AdminSeoManager.tsx`, alimenté par une RPC `seo_territorial_coverage()` qui renvoie :

- Totaux : municipalités, arrondissements, quartiers, secteurs.
- Pages prévues / générées / publiées / indexables / restantes.
- Progression et QA moyenne par ville (tableau triable).
- Vitesse (pages/min), ETA, coût IA cumulé (via `ai_economy_stats`).
- Historique des runs.

### 7. Lancement du batch complet + rapport final

- Déclenchement d'un `seo_pipeline_start('all_cities')` post-migration.
- Nouvelle RPC `seo_final_report(run_id)` produisant le JSON exigé :
  villes couvertes, arrondissements, quartiers, pages prévues / générées / publiées / indexées, QA moyenne, mots moyens, échecs restants, recommandations.
- Modal "Rapport final" dans le Command Center + export copiable.

### 8. Sitemap & Search Console

- `scripts/generate-sitemap.ts` déjà limité à `status='published'` → confirmé, aucun changement.
- Ajout d'une vérification post-run : compte `published` vs URLs dans le sitemap ; alerte si écart.
- Rappel dans le rapport final : resoumettre le sitemap depuis GSC (action humaine, non automatisable côté Cloudflare/GSC).

---

## Détails techniques

**Migrations SQL (dans l'ordre) :**

1. `ALTER TABLE public.seo_cities ADD COLUMN ...` (colonnes territoriales).
2. `INSERT ... ON CONFLICT (slug) DO UPDATE` pour toutes les municipalités listées.
3. `CREATE OR REPLACE FUNCTION public.seo_territorial_coverage()` (SECURITY DEFINER, admin-only).
4. `CREATE OR REPLACE FUNCTION public.seo_final_report(_run_id uuid)` (SECURITY DEFINER, admin-only).
5. Mise à jour `seo_pipeline_start` pour intégrer `served=true` et le tri par priorité.

**Edge functions modifiées :**

- `seo-generate-page/index.ts` : seuil `words < 800`.
- `seo-qa-check/index.ts` : marquer `needs_refresh` si sous-standards.

**Frontend :**

- `src/components/seo/TerritorialCoverage.tsx` (nouveau).
- `src/components/seo/FinalReportModal.tsx` (nouveau).
- `src/pages/AdminSeoManager.tsx` : nouvel onglet "Couverture territoriale" + bouton "Rapport final".

**Aucun changement** au verrou distribué, watchdog, cron, backoff 429/50x — déjà validés.

---

## Livrables

- 39 → ~80+ territoires actifs et servis, couvrant toutes les municipalités listées.
- Pipeline capable de traiter l'ensemble sans intervention, avec reprise garantie.
- Dashboard couverture + rapport final exportable.
- Rapport texte détaillé livré dans le chat après le premier batch complet.

**Non inclus** (nécessite action humaine ou clés externes) : validation par GSC réel, désactivation Bot Fight Cloudflare, indexation Google (délai naturel).
