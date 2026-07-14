
# Moteur SEO local automatisé — VracQuebec.ca

Objectif : transformer VracQuebec.ca en plateforme SEO locale automatisée qui génère, met à jour et relie automatiquement des milliers de pages pertinentes (villes × matériaux × usages, entrepreneurs, points de dépôt, demandes publiques, blog), gérée à 100 % depuis le CRM, sans jamais inventer de prix.

## Règle absolue : aucun prix

- Suppression complète de la notion de "prix indicatif" partout dans le moteur SEO (colonne DB, champs admin, sections publiques, FAQ, JSON-LD).
- Un prix ne pourra un jour apparaître que s’il provient d’un fournisseur/entrepreneur via un champ explicite qu’on ajoutera plus tard.
- Le CTA reste "Faire une demande" / "Je peux fournir ce matériau" — jamais un prix.

**Fait dans cette phase :** migration qui `DROP COLUMN pricing_hint` sur `seo_materials` + suppression de toutes les références front (`LocalLanding`, hook, admin, sitemap, JSON-LD). Le champ tombe partout d’un coup.

---

## Phase 1 — Fondation admin (déjà en place, à finir proprement)

Ce qui existe : tables `seo_cities`, `seo_materials`, `seo_material_uses`, page `/admin/seo`, hook `useSeoData`, sitemap dynamique.

Ce que je termine dans cette phase :
- Retrait total du "prix indicatif".
- Onglet **Usages** enrichi dans `/admin/seo` : liste globale, activation, réordonnancement, choix des matériaux compatibles (many-to-many via `seo_material_uses`), champ "sort_order" par usage.
- Sitemap dynamique déjà branché sur la BD — je vérifie qu’il inclut les usages et les combinaisons usage×ville quand elles sont actives.
- CRUD ville : géocodage automatique (Google Places déjà connecté) pour remplir `lat/lng` sans copier-coller.

**Livrable :** vous ajoutez une ville, un matériau ou un usage depuis le CRM → toutes les URLs SEO correspondantes existent au prochain déploiement, sans code.

---

## Phase 2 — Pages "usage" + Calculateur intelligent

### Pages usages
- Nouvelle route publique `/[usage-slug]` (ex. `/entree-de-cour`, `/piscine`, `/drain-francais`).
- Croisements automatiques :
  - **usage × matériau** → `/gravier-entree-de-cour`
  - **usage × ville** → `/entree-de-cour-quebec`
  - **usage × matériau × ville** → `/gravier-entree-de-cour-quebec`
- Chaque page : H1, meta, texte unique généré (voir Phase 2b), FAQ contextuelle, Schema.org, breadcrumb, Google Map de la ville, liens vers matériaux compatibles, villes voisines, entrepreneurs qui desservent, demandes ouvertes, points de dépôt, articles de blog liés.
- Deux CTA : **Faire une demande** (préremplit le questionnaire) et **Je peux fournir ce matériau** (formulaire fournisseur).

### Calculateur intelligent
- Composant réutilisable `<MaterialCalculator />` : longueur × largeur × épaisseur → m³, tonnes (densité par matériau), nombre de voyages (par capacité de camion configurable).
- Embarqué sur chaque page ville×matériau, usage, et usage×matériau×ville.
- Page dédiée `/calculateur` avec sélecteur de matériau et lien vers le formulaire.

### Phase 2b — Génération automatique de contenu + FAQ (Lovable AI)
- Edge function `seo-generate-page-content` (Gemini 2.5 Flash via Lovable AI Gateway) : à la création d’une ville/matériau/usage, génère et stocke un texte 300–500 mots **unique** par combinaison, dans une table `seo_page_content` (`slug`, `content_html`, `faq_json`, `generated_at`).
- Régénération à la demande depuis le CRM (bouton "Régénérer" par page).
- FAQ dynamique : 4–6 questions générées selon ville/matériau/usage, injectées dans le HTML et le JSON-LD `FAQPage`.

---

## Phase 3 — Pages entrepreneurs publiques

- Colonnes ajoutées à `entrepreneur_profiles` : `public_slug`, `is_public`, `bio`, `service_area_city_ids`, `material_ids`, `photos[]`, `services[]`.
- Onglet **Page publique** dans la fiche entrepreneur du CRM.
- Route `/entrepreneur/:slug` (ex. `/entrepreneur/transport-jsc`) avec présentation, services, territoires desservis (chips vers pages ville), matériaux offerts (chips vers pages matériau), photos, contact, JSON-LD `LocalBusiness`.
- Section "avis" : structure prête, source à décider (interne ou Google via connector) — je marque le placeholder plutôt que d’inventer des avis.

---

## Phase 4 — Points de dépôt publics + Demandes publiques

### Points de dépôt
- Nouvelle table `deposit_sites` (nom, slug, adresse, `city_id`, matériaux acceptés, conditions, photos, entrepreneur lié, `active`, `is_public`).
- CRUD dans `/admin/seo/depots`.
- Route publique `/depot/:slug` : carte, photos, matériaux acceptés, entrepreneurs liés, demandes récentes de la zone.

### Demandes publiques
- Champ `submissions.is_public` (opt-in dans le formulaire remblai/dépôt).
- Route `/demande/:slug` (ex. `/demande/terre-remplissage-quebec-40-tonnes`) : ville, matériau, quantité, description anonymisée, carte, date, bouton **Je peux répondre à cette demande** (crée une soumission fournisseur reliée).
- Sitemap inclut uniquement `is_public = true` et statut actif.

---

## Phase 5 — Maillage interne intelligent + SEO technique complet

- Composant central `<InternalLinks context={...} />` qui, selon la page (ville / matériau / usage / entrepreneur / demande / dépôt / article), injecte automatiquement :
  - villes voisines, matériaux reliés, usages compatibles, entrepreneurs desservant la zone, demandes ouvertes, points de dépôt proches, articles de blog liés, calculateur.
- Breadcrumbs auto depuis la route.
- JSON-LD systématique : `LocalBusiness`, `Service`, `FAQPage`, `BreadcrumbList`, `Article`, `Place`.
- Canonical self-référent, `og:url` cohérent, meta robots par route, images `loading="lazy" decoding="async"` (déjà en place), conversion WebP via `vite-imagetools` pour les assets locaux, alt automatique basé sur (matériau, ville, usage).
- `robots.txt` propre + `sitemap.xml` dynamique déjà géré, étendu aux nouvelles routes.

---

## Phase 6 — Blog SEO renforcé (existe déjà, ajustements)

- Le CMS blog + IA + plan éditorial 250 idées existent.
- Ajustements :
  - Tags automatiques `city:*` et `material:*` sur chaque article.
  - Injection auto d’articles pertinents dans les pages SEO (ville, matériau, usage) via `<InternalLinks />`.
  - Injection auto de blocs "Voir aussi" (pages ville/matériau) dans les articles selon leurs tags.

---

## Architecture technique

```text
CRM (/admin/seo)
   │  villes / matériaux / usages / entrepreneurs / dépôts / demandes / articles
   ▼
Tables Supabase (source unique de vérité)
   │  seo_cities, seo_materials, seo_material_uses,
   │  entrepreneur_profiles(+public), deposit_sites, submissions(is_public),
   │  seo_page_content (contenu IA + FAQ mis en cache)
   ▼
Hook client useSeoData() + resolveLocalSlug() (cache + fallback)
   │
   ▼
Templates React (SPA)         Sitemap generator (prebuild)
   LocalLanding                  ├── ville
   LocalCityIndex                ├── matériau × ville
   LocalIndex                    ├── usage
   UsageLanding                  ├── usage × matériau
   UsageCityLanding              ├── usage × ville
   UsageMaterialCityLanding      ├── entrepreneur
   EntrepreneurPage              ├── dépôt
   DepositPage                   ├── demande publique
   PublicRequestPage             └── blog
   Blog*
```

- **Génération** : pages rendues à la volée côté client (SPA). Le sitemap contient toutes les URLs → Googlebot les découvre. Pas de milliers de fichiers HTML à builder.
- **Contenu unique** : mis en cache dans `seo_page_content`, généré une fois par combinaison via Lovable AI (Gemini 2.5 Flash), régénérable.
- **Performance** : cache React Query côté client, lazy loading des routes, `vite-imagetools` pour WebP, préchargement du hero.
- **Sécurité** : chaque nouvelle table publique suit `CREATE TABLE → GRANT → ENABLE RLS → POLICY`. Écriture admin uniquement, lecture publique restreinte aux champs non sensibles (jamais d’emails, jamais de tokens).
- **Rétrocompatibilité** : les URLs actuelles restent identiques (`/terre-remplissage-quebec`, etc.).

---

## Deux décisions à confirmer avant de démarrer

1. **Ordre de livraison.** Je propose : Phase 1 (finir : retrait prix + usages CRM + géocodage) → Phase 2 (usages + calculateur + IA de contenu) → Phase 3 (entrepreneurs) → Phase 4 (dépôts + demandes publiques) → Phase 5 (maillage + SEO technique) → Phase 6 (blog). Confirmez-vous cet ordre ?
2. **Rythme.** Je livre phase par phase avec validation entre chaque (recommandé, chaque phase est déployable seule), ou vous voulez que j’enchaîne tout d’un trait ?
