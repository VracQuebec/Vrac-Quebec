
# Centre de connaissances Vrac Québec — Blogue CMS professionnel

Transformer `/blog` (actuellement un embed Soro) en un vrai CMS maison hébergé sur Lovable Cloud, prêt à accueillir 1 000+ articles, entièrement optimisé SEO.

## 1. Base de données (Lovable Cloud)

Nouvelles tables `public.*` avec RLS + GRANT :

- **`blog_categories`** — id, slug (unique), name, description, sort_order, parent_id (sous-catégories), icon, color. Pré-remplie avec les 14 catégories : Remblai, Terre, Sable, Gravier, Pierre, Excavation, Transport en vrac, Entrepreneurs, Propriétaires, Guides, Calculs, FAQ, Actualités, Réglementation.
- **`blog_authors`** — id, user_id (FK auth), name, slug, bio, avatar_url, title.
- **`blog_posts`** — id, slug (unique), title, excerpt, content (HTML/markdown), cover_image_url, gallery (jsonb array), category_id, author_id, status (`draft` | `published` | `scheduled` | `archived`), published_at, scheduled_at, meta_title, meta_description, og_image_url, canonical_url, reading_time_minutes, view_count, is_featured, is_popular, created_at, updated_at.
- **`blog_post_tags`** + **`blog_tags`** — étiquettes many-to-many.
- **`blog_post_related`** — table de jointure pour articles reliés manuels (fallback : reliés automatiques par catégorie/tags).
- **`blog_post_views`** — log léger pour compter les vues (agrégé dans `view_count`).

Policies : lecture publique (`anon` + `authenticated`) uniquement sur `status='published' AND published_at <= now()`. Écriture réservée aux admins via `has_role(auth.uid(), 'admin')`.

Nouveau bucket Storage `blog-media` (public) pour couvertures et galeries, avec optimisation via URL params.

## 2. Frontend public

### `/blog` — page d'accueil du Centre de connaissances
- Grande bannière hero « Centre de connaissances Vrac Québec » avec CTA vert « Faire une demande de remblai » et CTA secondaire « Déposer des matériaux ».
- **Barre de recherche** proéminente (recherche full-text sur title/excerpt/content via `to_tsvector` PostgreSQL, index GIN).
- **Boutons catégories** horizontaux scrollables (14 catégories).
- Section **Articles vedettes** (grille hero-grid, `is_featured=true`).
- Section **Articles populaires** (triés par `view_count`).
- Section **Articles récents** (chronologique).
- Section **Calculateurs** (cartes : tonnage, verges cubes, voyages de camion) — pointent vers `/blog/calculateurs/*`.
- Section **Guides pratiques** (filtre catégorie=Guides).
- Section **FAQ** (aperçu, filtre catégorie=FAQ).
- Pagination infinie / « Charger plus ».

### `/blog/categorie/:slug` — page catégorie
- En-tête catégorie, description, fil d'Ariane, grille d'articles paginée, filtres tags.

### `/blog/:slug` — page article
- Fil d'Ariane (Accueil › Blogue › Catégorie › Article).
- Titre H1, meta (auteur, date, temps de lecture, catégorie, vues).
- Image de couverture optimisée (lazy, srcset).
- Contenu riche rendu depuis HTML sanitizé.
- **Bouton partage Facebook** + Twitter/X + LinkedIn + copier lien.
- CTA sticky : « Faire une demande de remblai » (vert) et « Déposer des matériaux ».
- Section **Articles reliés** (3-4 articles auto-sélectionnés par catégorie/tags, override manuel possible).
- Incrémente `view_count` via edge function (débounce IP).

### `/blog/recherche?q=...`
- Résultats de recherche full-text avec surlignage.

## 3. SEO — l'atout central

- **`react-helmet-async`** installé, `HelmetProvider` monté dans `main.tsx`.
- Chaque route blog gère son propre `<title>`, `meta description`, `canonical`, `og:*`, `twitter:*`.
- **JSON-LD Schema.org** par page :
  - Blog root : `WebSite` + `SearchAction`.
  - Article : `Article` (headline, author, datePublished, dateModified, image, publisher).
  - Catégorie : `CollectionPage` + `BreadcrumbList`.
  - FAQ : `FAQPage` sur les articles de la catégorie FAQ.
- **Fil d'Ariane** JSON-LD `BreadcrumbList` sur toutes les pages internes.
- **Sitemap dynamique** : nouveau `scripts/generate-sitemap.ts` (predev/prebuild) qui lit les articles publiés depuis Supabase et génère `public/sitemap.xml` avec toutes les URLs (`/blog`, catégories, articles). `BASE_URL = https://vracquebec.ca`.
- **robots.txt** : ajout `Sitemap: https://vracquebec.ca/sitemap.xml`.
- Images : `loading="lazy"`, `decoding="async"`, `width`/`height`, alt obligatoire à la saisie.
- URLs propres, slugs kebab-case, redirections 301 si slug change (colonne `previous_slugs`).
- Preconnect Supabase déjà en place.

## 4. Admin CMS (`/admin/blogue`)

Restreint aux admins. Interface pro :

- **Liste** des articles avec filtres (statut, catégorie, auteur, recherche), tri, actions bulk.
- **Éditeur** (drawer plein écran) :
  - Titre, slug auto-généré éditable, extrait, contenu riche (TipTap ou react-quill).
  - Upload image de couverture + galerie (Storage `blog-media`, redimensionnement côté client avant upload via canvas).
  - Sélecteur catégorie + sous-catégorie + tags (création à la volée).
  - Auteur, date de publication, planification (`scheduled_at`).
  - **Onglet SEO** : meta_title, meta_description, canonical, og_image, aperçu Google/Facebook.
  - **Onglet Articles reliés** : recherche + sélection manuelle (sinon auto).
  - Temps de lecture calculé automatiquement (mots/200).
  - **Sauvegarde automatique** (debounce 3 s, indicateur « Enregistré »).
  - Statut : Brouillon / Publié / Planifié / Archivé.
  - Bouton **Dupliquer**.
  - Aperçu en direct dans nouvel onglet.
- **Gestion catégories** — CRUD, réordonnancement.
- **Gestion tags** — fusion, renommage.
- **Statistiques** — vues par article, articles top.
- Ajout entrée sidebar `Admin` → « Blogue ».

Edge function `cron-publish-scheduled-posts` (pg_cron toutes les 5 min) qui bascule `scheduled` → `published` quand `scheduled_at <= now()`.

## 5. Design

Direction retenue : **Hero + grille**, adapté à l'identité Vrac Québec (vert `#7ED321` sur noir `#111111`, DM Sans / Plus Jakarta Sans déjà en place). Style construction/transport : accents diagonaux, badges catégories colorés, cartes avec ombres douces, coins arrondis 12-16px, images en ratio 16:9. Boutons CTA verts pleins pour « Faire une demande de remblai », noirs outline pour « Déposer des matériaux ». Responsive mobile-first.

## 6. Migrations & routes

- Retirer l'embed Soro de `Blog.tsx`.
- Nouvelles routes lazy dans `App.tsx` : `/blog`, `/blog/categorie/:slug`, `/blog/:slug`, `/blog/recherche`, `/admin/blogue`, `/admin/blogue/editer/:id?`.
- Lien « Blogue » ajouté au footer et à l'admin sidebar.

## Détails techniques

- Full-text search : `tsvector` généré (French config) sur title+excerpt+content, index GIN, requête `websearch_to_tsquery`.
- Compteur de vues : edge function `blog-track-view` (rate-limit 1 vue / IP / article / 6h) plutôt qu'UPDATE direct pour éviter écritures côté client.
- Sanitization HTML : `dompurify` côté client au rendu, whitelist sur upload.
- Optimisation images : redimensionnement côté client à 1920px max avant upload, WebP quand supporté.
- Aucune écriture au schéma `auth`, uniquement `public`.

## Ce qui n'est PAS inclus dans ce plan
- Génération de contenu d'articles (à faire séparément une fois la structure en place).
- Newsletter / abonnement email.
- Commentaires.
- Version multilingue (FR uniquement pour l'instant).

Une fois la structure livrée, on pourra générer les premiers articles par lots via un flux dédié.
