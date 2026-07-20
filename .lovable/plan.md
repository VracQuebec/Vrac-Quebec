# SEO Manager — Générateur intelligent de pages SEO

Un module admin unique (`/admin/seo-manager`) qui pilote la création à la demande de pages ville × matériau × service, avec IA, suggestions, tableau de bord et SEO technique — sans jamais créer les pages en masse tant qu'on ne clique pas sur "Générer".

## Périmètre initial (chargé en base au démarrage)

- **26 villes / arrondissements / secteurs** listés (Québec, Lévis, arrondissements, secteurs, municipalités environnantes).
- **12 matériaux** (terre propre, contaminée, végétale, remblai, gravier, sable, pierre, roche, béton, asphalte, brique, neige).
- **10 services** (transport vrac, dompe, recherche de dépôt, livraisons, excavation, nivellement, courtage).

Tout le reste s'ajoute ensuite depuis l'admin, sans toucher au code.

## Architecture

### Base de données (Lovable Cloud)

Nouvelles tables (RLS : lecture publique sur `active=true`, écriture admin uniquement) :

- `seo_services` — nom, slug, description, mots-clés, actif, ordre.
- `seo_pages` — la page générée : `city_id`, `material_id?`, `service_id?`, `slug` unique, `title`, `meta_description`, `h1`, `content` (HTML), `faq` (jsonb), `cover_image_url`, `status` (draft/published), `view_count`, `last_generated_at`, `ai_model`, `canonical`, `og_*`.
- `seo_generation_jobs` — job de génération : `combinations` (jsonb), `progress`, `status` (queued/running/paused/done/failed), `total`, `done`, `errors`, `created_by`.

`seo_cities` et `seo_materials` existent déjà — on ajoute simplement les colonnes manquantes (image_url, mots-clés déjà présents).

### Génération de contenu

Edge function `seo-generate-page` (Lovable AI, `google/gemini-3-flash-preview`) :
- Reçoit `{ city, material?, service? }`.
- Produit `title`, `meta_description`, `h1`, `h2/h3`, corps optimisé (unique, ~800-1200 mots), FAQ, ALT d'images, JSON-LD LocalBusiness + FAQPage + BreadcrumbList.
- Renvoie le tout structuré ; le client l'écrit dans `seo_pages`.
- Skip si `seo_pages` a déjà cette combinaison (garantie d'unicité par contrainte + vérif serveur).

### Rendu public

Nouvelle route `/:seoSlug` gérée par un composant `SeoLandingPage` :
1. Résout d'abord via `seo_pages.slug` (nouvelles pages générées à la demande).
2. Fallback sur le moteur `LocalLanding` existant (rétro-compatibilité des 340 pages actuelles).
3. Rend le HTML stocké + Helmet (title, description, canonical, OG, Twitter, JSON-LD) + breadcrumb + formulaire de demande Vrac Québec + bloc "pages reliées" (villes voisines, autres matériaux, autres services).

### Sitemap & robots

`scripts/generate-sitemap.ts` élargi pour inclure toutes les `seo_pages` publiées, en plus des combinaisons historiques. `robots.txt` inchangé.

## Interface `/admin/seo-manager`

Un seul écran avec onglets latéraux :

1. **Tableau de bord** — total, publiées, brouillons, générées aujourd'hui, top vues, à optimiser (pages > 90j sans mise à jour).
2. **Villes** — CRUD complet + import CSV/Excel + activation/désactivation.
3. **Matériaux** — CRUD + activation.
4. **Services** — CRUD + activation.
5. **Générateur** — sélecteurs multi (villes / matériaux / services) → aperçu :
   - Nombre à créer, déjà existantes, doublons ignorés, temps estimé.
   - Boutons : Générer / Pause / Reprendre. Barre de progression persistée dans `seo_generation_jobs` (reprise possible après refresh).
6. **Suggestions SEO** — liste automatique des combinaisons manquantes triées par potentiel (ville prioritaire × matériau prioritaire). Bouton "Créer" par ligne.
7. **Blog SEO** — bouton qui pousse des idées d'articles dans `blog_post_ideas` existant (réutilise l'infra blog déjà en place), avec des templates du type "Où domper de la terre à {ville} ?".

## Livraison en une passe

1. Migration : `seo_services`, `seo_pages`, `seo_generation_jobs` + GRANTs + RLS + trigger updated_at.
2. Edge function `seo-generate-page`.
3. Page `src/pages/AdminSeoManager.tsx` + sous-composants (Dashboard, Villes, Matériaux, Services, Générateur, Suggestions, Blog).
4. Hook `useSeoServices` (miroir de `useSeoData`).
5. Rendu public `src/pages/SeoLandingPage.tsx` + route dans `App.tsx` avant `LocalLanding`.
6. Sitemap élargi.
7. Lien "SEO Manager" dans la sidebar admin (remplace/complète l'actuel `/admin/seo`).

## Notes techniques

- Toute écriture dans `seo_pages` est idempotente (contrainte unique sur `slug`).
- La génération tourne côté client en boucle séquentielle (1 appel edge function par combinaison, ~5s chacune), avec `invokeWithFreshSession` pour survivre à un batch long. L'état du job est persistant → pause/reprise sans perte.
- Aucun prix inventé (règle déjà en place).
- Zéro page créée avant que l'utilisateur clique explicitement sur "Générer" ou "Créer".
