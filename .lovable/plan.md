# Plateforme SEO intelligente VracQuebec.ca

Objectif : rendre le moteur SEO local **entièrement administrable depuis le CRM** (fini les modifications dans `cities.ts` / `materials.ts`), et étendre la couverture à toutes les pages exigées (ville×matériau, usages, entrepreneurs, points de dépôt, demandes publiques, blog), avec maillage interne automatique, sitemap dynamique et SEO technique complet.

Le projet est très large. Je propose de le livrer en **6 phases**, chacune produisant une valeur immédiate et déployable. Vous validez phase par phase.

---

## Phase 1 — Fondation : Territoires & Matériaux gérés depuis le CRM

**But :** remplacer les fichiers `src/lib/seo/cities.ts` et `materials.ts` par des tables Supabase, avec CRUD dans `/admin/seo`.

### Base de données
- `seo_cities` : `slug`, `name`, `region`, `lat`, `lng`, `population`, `intro`, `neighbors` (uuid[]), `active` (bool), `sort_order`.
- `seo_materials` : `slug`, `name`, `short_name`, `keywords` (text[]), `use_cases` (jsonb), `pricing_hint`, `delivery_unit`, `related_materials` (uuid[]), `description`, `active`.
- `seo_material_uses` : matériau × usage (`terre-pour-gazon`, `gravier-pour-entree`…) pour les pages "par utilisation".
- Toutes protégées par RLS : lecture publique (`active = true`), écriture admin uniquement, avec `GRANT` explicites.
- Seed automatique : la migration copie le contenu actuel des fichiers TS dans les tables (aucune donnée perdue).

### Front CRM
- Nouvelle page `/admin/seo` avec 3 onglets : **Villes**, **Matériaux**, **Usages**.
- Tableaux avec recherche, activer/désactiver (soft delete), édition inline, réordonnancement.
- Formulaire d'ajout de ville avec **géocodage automatique** (Google Places déjà connecté) → remplit `lat`/`lng`.
- Sélecteur de villes voisines multi-select depuis la liste existante.

### Front public
- `src/lib/seo/cities.ts` et `materials.ts` deviennent de **simples wrappers** qui chargent depuis Supabase via un hook `useSeoData()` (cache React Query + fallback statique pour SSR/build).
- Les composants `LocalLanding`, `LocalIndex`, `LocalCityIndex` fonctionnent sans changement, mais lisent la source dynamique.
- Le résolveur `matchLocalSlug` devient async côté serveur / synchrone côté client (via cache).

### Sitemap
- `scripts/generate-sitemap.ts` lit **directement depuis Supabase** au moment du `prebuild` (via `SUPABASE_URL` + anon key). Toute ville/matériau actif est inclus automatiquement.

**Livrable Phase 1 :** vous ajoutez une ville depuis le CRM → toutes les pages SEO, le sitemap et les liens internes se mettent à jour au prochain déploiement, sans toucher au code.

---

## Phase 2 — Pages "par usage" + Calculateur intelligent

### Pages usages
- Nouveau template `/[usage-slug]` (ex : `/terre-pour-gazon`, `/gravier-pour-entree`).
- Contenu structuré : intro, matériau recommandé, calcul type, FAQ, CTA formulaire.
- Généré depuis la table `seo_material_uses` + croisement villes (variante `/terre-pour-gazon-quebec` en option).

### Calculateur (page dédiée + widget réutilisable)
- Formulaire Longueur × Largeur × Épaisseur → m³, tonnes, nombre de voyages (avec réglages par matériau : densité, capacité camion).
- Résultat + CTA "Faire une demande sur VracQuebec.ca" qui pré-remplit le questionnaire.
- Embarqué dans chaque page ville×matériau et chaque page usage.

---

## Phase 3 — Pages Entrepreneurs publiques

- Route `/entrepreneur/:slug` (ex : `/entrepreneur/transport-jsc`).
- Colonnes ajoutées à `entrepreneur_profiles` : `public_slug`, `bio`, `service_areas` (villes desservies), `materials_offered`, `photos[]`, `is_public`.
- Onglet "Page publique" dans la fiche entrepreneur du CRM pour éditer.
- SEO complet : H1, meta, JSON-LD `LocalBusiness`, formulaire de contact direct.

---

## Phase 4 — Points de dépôt publics + Demandes publiques

### Points de dépôt
- Nouvelle table `deposit_sites` (nom, adresse, matériaux acceptés, photos, conditions, municipalité, entrepreneur lié).
- CRUD dans le CRM, route publique `/depot/:slug`.

### Demandes publiques
- Nouveau champ `submissions.is_public` (opt-in client dans le formulaire remblai).
- Route `/demande/:slug` (ex : `/demande/gravier-0-3-4-levis-25-tonnes`) avec carte, détails anonymisés, bouton "Je peux répondre".
- Ajout au sitemap uniquement si `is_public = true` et statut actif.

---

## Phase 5 — Maillage interne intelligent + SEO technique

- Composant `<InternalLinks context={...} />` centralisé : injecte automatiquement villes voisines, matériaux similaires, demandes récentes, entrepreneurs liés, articles de blog liés — selon le contexte de la page.
- Génération auto des breadcrumbs à partir de la route.
- JSON-LD partout : `LocalBusiness`, `FAQPage`, `BreadcrumbList`, `Article`, `Product`, `Offer`.
- Audit et fix : `<link rel="canonical">` self-référent partout, `og:url` cohérent, `robots` par route, images `loading="lazy"` + `decoding="async"` déjà en place, WebP via `vite-imagetools` pour les assets locaux.

---

## Phase 6 — Blog SEO renforcé (déjà en place, ajustements)

Le blog CMS existe déjà. Ajustements :
- Lien automatique blog ↔ pages ville×matériau via tags (article "gravier à Québec" apparaît sur `/gravier-0-3-4-quebec`).
- Suggestions d'articles depuis chaque page SEO.
- Rien à reconstruire.

---

## Aspects techniques

- **Stack** : Supabase (nouvelles tables + RLS + GRANT), React Query pour le cache, react-helmet-async déjà présent, sitemap généré au build.
- **Performance** : les pages restent générées à la volée côté client (SPA), mais le sitemap contient toutes les URLs → Googlebot les découvre. Pas de génération de milliers de fichiers HTML.
- **Sécurité** : toutes les nouvelles tables suivent le pattern grant → RLS → policies. Lecture publique uniquement des champs non sensibles.
- **Rétrocompatibilité** : les URLs actuelles (`/terre-remplissage-quebec`, etc.) restent identiques.

---

## Deux décisions à confirmer avant de démarrer

1. **Par où commencer ?** Je recommande la **Phase 1** en premier (fondation admin des villes/matériaux) — elle débloque tout le reste. Confirmez-vous cet ordre, ou souhaitez-vous prioriser autre chose (ex : calculateur, pages entrepreneurs) ?
2. **Livraison** : je livre phase par phase avec validation entre chaque, ou vous voulez que j'enchaîne les 6 phases sans pause ?
