# Plan — Plateforme SEO unifiée

## 1. État actuel (analyse)

**SEO Local** : déjà supprimé lors du chantier précédent. Aucune référence restante dans `src/` ni `scripts/` (vérifié via `rg`). Les routes `/livraison`, `/livraison/:citySlug` et `/:material-city` pointent toutes vers les composants DB-driven du SEO Manager. **Rien à migrer, rien à supprimer côté SEO Local.**

**SEO Manager** (`/admin/seo`) : 8 onglets — Dashboard, Villes, Matériaux, Usages, Services, Générateur, Analyse, Suggestions. Gère cities/materials/uses/services/pages via 5 tables (`seo_cities`, `seo_materials`, `seo_material_uses`, `seo_services`, `seo_pages`). C'est déjà le cerveau SEO.

**Blogue** (`/admin/blogue`) : CMS autonome — posts, catégories, auteurs, idées, batch, éditeur IA. Aujourd'hui **déconnecté** du SEO Manager : les idées d'articles vivent dans `blog_post_ideas` sans lien vers `seo_cities` / `seo_materials` / `seo_services`, et les articles n'apparaissent pas dans le maillage interne des pages SEO.

**Doublons réels restants** : aucun onglet dupliqué. Le vrai gap est **l'isolation du blogue** vis-à-vis du SEO Manager.

## 2. Ce que je vais faire

### A. Connecter le blogue au SEO Manager
- Ajouter au blog admin un accès direct au SEO Manager (et vice-versa) : nouvel onglet **Blogue** dans `AdminSeoManager` qui liste les articles + statut, lien vers l'éditeur existant. Pas de duplication de code — juste des lectures et raccourcis.
- Ajouter sur `blog_posts` des colonnes de rattachement : `related_city_slugs text[]`, `related_material_slugs text[]`, `related_service_slugs text[]` (nullable, tableaux vides par défaut).
- Éditeur blog : trois multi-sélecteurs pour rattacher un article aux villes/matériaux/services du SEO Manager.
- Maillage bidirectionnel :
  - `SeoLandingPage.tsx` charge et affiche jusqu'à 3 articles de blog reliés (via `related_*_slugs`) dans un bloc "Guides & conseils".
  - Pages d'article (`BlogPost.tsx`) : bloc "Zones desservies / Matériaux liés" avec liens vers les pages SEO correspondantes.

### B. Suggestions d'articles pilotées par le SEO Manager
- Étendre l'onglet **Suggestions** existant : ajouter une section "Idées d'articles" qui, à partir des mots-clés déjà stockés sur `seo_materials.keywords` / `seo_services.keywords` et des combinaisons ville×matériau sans page publiée, propose des titres d'articles.
- Bouton **"Créer brouillon"** → insère dans `blog_posts` (status `draft`) avec les rattachements pré-remplis, puis ouvre l'éditeur.
- Bouton **"Générer avec IA"** → réutilise `blog-ai-generate` déjà en place.

### C. Générateur "Québec + Lévis + arrondissements + voisines" en un clic
- Nouveau bouton dans l'onglet **Générateur** : **"Générer pack Québec/Lévis"**.
- Sélectionne automatiquement les villes marquées `region IN ('Québec','Lévis')` + leurs voisines (`neighbors`) actives, croise avec tous les matériaux actifs, et lance la file de génération existante.
- Garde-fou anti-doublon : la table `seo_pages` a déjà `slug` unique — j'ajoute un `UNIQUE(city_slug, material_slug, service_slug)` explicite et le générateur skip les combinaisons existantes (déjà partiellement en place, à durcir).

### D. Nettoyage final
- Vérifier une dernière fois qu'aucune référence orpheline ne traîne (grep `local`, `SeoLocal`, `useSeoData`, etc.) — déjà propre, je re-confirme après les changements.
- Aucune table ni route à supprimer : le nettoyage majeur est déjà fait.

## 3. Détails techniques

**Migration DB** (une seule) :
```sql
ALTER TABLE public.blog_posts
  ADD COLUMN related_city_slugs text[] NOT NULL DEFAULT '{}',
  ADD COLUMN related_material_slugs text[] NOT NULL DEFAULT '{}',
  ADD COLUMN related_service_slugs text[] NOT NULL DEFAULT '{}';
CREATE INDEX blog_posts_related_cities_idx ON public.blog_posts USING gin (related_city_slugs);
CREATE INDEX blog_posts_related_materials_idx ON public.blog_posts USING gin (related_material_slugs);
ALTER TABLE public.seo_pages
  ADD CONSTRAINT seo_pages_combo_unique UNIQUE (city_slug, material_slug, service_slug);
```

**Fichiers touchés**
- `src/pages/AdminSeoManager.tsx` — nouvel onglet Blogue + section "Idées d'articles" dans Suggestions + bouton "Pack Québec/Lévis" dans Générateur.
- `src/pages/AdminBlogEditor.tsx` — 3 multi-sélecteurs de rattachement.
- `src/pages/SeoLandingPage.tsx` — bloc "Guides & conseils" (articles reliés).
- `src/pages/BlogPost.tsx` — bloc "Pages SEO liées".
- `src/lib/blog/types.ts` — types mis à jour après migration.

**URLs existantes** : aucune URL publique ne change. Blogue reste sous `/blogue/*`, pages SEO sous `/:slug`, index sous `/livraison/*`.

## 4. Ce que je NE fais pas
- Pas de fusion visuelle blogue↔SEO (le CMS blog garde son UI dédiée) — trop invasif pour un gain nul.
- Pas de refonte du générateur IA existant (contenu, FAQ, Schema.org, breadcrumb, CTA sont déjà en place depuis la Phase 1).
- Pas de Google Search Console (Phase 3 du plan précédent, hors scope ici).

## 5. Questions

1. **Rattachement blog↔SEO** : je propose que ce soit **manuel via l'éditeur** (l'admin coche ville/matériau/service). OK ou tu veux que l'IA propose automatiquement les rattachements à la génération ?
2. **Pack Québec/Lévis** : je génère **une page par matériau × ville** (~10 matériaux × ~15 villes = ~150 pages). Sans service, sauf si tu veux aussi croiser avec les services (×10 → ~1500 pages).
