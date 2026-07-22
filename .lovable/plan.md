# Maillage intelligent Blogue ↔ SEO

Objectif : connecter automatiquement les 200 articles du blogue aux bonnes pages SEO (ville/matériau/service), maintenir le maillage à chaque nouvel ajout, et fournir un tableau de bord avec un bouton unique « Analyser et rattacher ».

## 1. Base de données (migration)

Nouvelle table `blog_seo_links` (source unique du maillage) :
- `blog_post_id` → `blog_posts.id`
- `seo_page_id` → `seo_pages.id`
- `relevance_score` (0–100)
- `match_reasons` (jsonb : ville, matériau, service, mots‑clés)
- `link_direction` (`both` / `blog_to_seo` / `seo_to_blog`)
- `auto_generated` (bool), `confirmed_by_admin` (bool)
- Contrainte unique (blog_post_id, seo_page_id)
- RLS admin only + GRANT

Nouvelle table `blog_mesh_runs` (historique + rapport) :
- `stats` jsonb (analysés, reliés, orphelins, liens créés, opportunités)
- `orphan_post_ids` uuid[], `opportunities` jsonb
- `status`, `started_at`, `finished_at`, `error`

Ajout à `blog_posts` :
- `mesh_analyzed_at timestamptz`
- `mesh_score int` (score de rattachement 0–100)

RPC `blog_mesh_stats()` (admin) → { total, linked, orphan, links_total, opportunities, avg_mesh_score }.

## 2. Edge function `blog-mesh-analyze`

Un seul endpoint qui accepte `{ post_ids?: uuid[], mode: 'all' | 'orphans' | 'single' }`.

Algorithme (sans appel LLM par défaut, rapide et déterministe) :
1. Charger toutes les `seo_pages` publiées avec `city_slug`, `material_slug`, `service_slug`, `title`, `meta_description`.
2. Charger les articles ciblés (titre + excerpt + contenu texte + tags + catégorie).
3. Normaliser (unaccent, lowercase) et scorer chaque paire :
   - +40 si ville détectée dans texte article
   - +30 si matériau détecté
   - +20 si service détecté
   - +10 par mot‑clé partagé (max 20)
   - bonus si présent dans titre
4. Garder les paires ≥ seuil (par défaut 45), max 5 pages SEO par article.
5. Upsert dans `blog_seo_links` (auto_generated=true, ne pas écraser les `confirmed_by_admin`).
6. Nettoyer les anciens liens auto devenus non pertinents.
7. Identifier orphelins et produire opportunités (article sans page SEO cible → suggérer création page ville/matériau manquante ; page SEO sans article → suggérer nouveau sujet).
8. Écrire un `blog_mesh_runs`.

Option `useAi=true` (fallback) : appelle Lovable AI (`google/gemini-3.6-flash`) uniquement sur les articles à score faible pour proposer un rattachement ou un plan d'amélioration.

## 3. Injection automatique des liens internes

- **SEO → Blogue** : `SeoLandingPage.tsx` charge via `blog_seo_links` les 3–6 articles reliés à la page et les affiche dans `InternalLinksBlock`.
- **Blogue → SEO** : `BlogPost.tsx` affiche un bloc « Pages liées » en fin d'article (pages SEO reliées).
- **Articles connexes** : `fetchRelatedPosts` étendu pour compléter avec des articles partageant les mêmes pages SEO quand la catégorie ne suffit pas.

Aucune modification du HTML stocké des articles : les liens sont rendus au moment de l'affichage (pas de pollution du contenu).

## 4. Trigger de maintenance

Trigger AFTER INSERT/UPDATE sur `blog_posts` et `seo_pages` → marque `mesh_analyzed_at = null` pour re‑scan au prochain run. Un cron optionnel (toutes les nuits) rattrape les articles non analysés.

## 5. Tableau de bord `/admin/blogue/maillage`

Nouvelle page (lien depuis `AdminBlog.tsx` header) affichant :
- 5 KPI cards : Articles reliés / Orphelins / Liens créés / Opportunités / Score moyen de maillage
- Bouton principal **« Analyser et rattacher automatiquement tous les articles »** (déclenche `blog-mesh-analyze` mode=all, progression realtime via `blog_mesh_runs`).
- Onglet **Orphelins** : liste des articles sans lien, avec suggestions IA (bouton « Générer suggestion »).
- Onglet **Opportunités** : pages SEO sans article + articles sans page SEO adéquate.
- Onglet **Historique** : derniers runs et leurs rapports.

## 6. Sécurité

- Toutes les mutations passent par la edge function (JWT admin obligatoire).
- Nouvelles tables : RLS admin uniquement, `GRANT` service_role + authenticated (SELECT) pour lecture publique nécessaire sur `blog_seo_links` (utilisé côté site public pour afficher les liens).

## Détails techniques

- Fichiers nouveaux :
  - `supabase/migrations/<ts>_blog_seo_mesh.sql`
  - `supabase/functions/blog-mesh-analyze/index.ts`
  - `src/pages/AdminBlogMesh.tsx`
  - `src/lib/blog/mesh.ts` (helpers front)
- Fichiers modifiés :
  - `src/App.tsx` (route `/admin/blogue/maillage`)
  - `src/pages/AdminBlog.tsx` (bouton d'accès)
  - `src/pages/SeoLandingPage.tsx` (bloc articles reliés)
  - `src/pages/BlogPost.tsx` (bloc pages SEO reliées)
  - `src/lib/blog/queries.ts` (fetchRelatedSeoPages, fetchPostsBySeoPage)
- Modèle IA : `google/gemini-3.6-flash` via LOVABLE_API_KEY, uniquement pour suggestions/opportunités, pas pour le scoring de base (déterministe et gratuit).
- Perf : batch de 25 articles par itération dans la edge function, `EdgeRuntime.waitUntil` pour longs runs, écritures groupées.
