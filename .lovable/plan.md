
# Moteur SEO local Vrac Québec — Pages Ville × Matériau

Créer un générateur de pages d'atterrissage locales, une par combinaison **ville × matériau**, limité au territoire actuel (Québec, Lévis + 32 municipalités environnantes). Objectif : dominer les recherches locales type « terre remplissage Québec », « gravier 0-3/4 Lévis », « sable Beauport ».

## 1. Données de référence (source unique)

Deux fichiers TypeScript en dur, pas de BD — pour rester rapide, versionné, et facile à étendre.

**`src/lib/seo/cities.ts`** — 34 villes autorisées. Chaque entrée :
- `slug` (kebab-case, ex. `quebec`, `saint-romuald`, `l-ancienne-lorette`)
- `name` (affichage, ex. `Québec`, `L'Ancienne-Lorette`)
- `region` (`Québec` | `Lévis` | `Portneuf` | `Jacques-Cartier` | `Côte-de-Beaupré` | `Chaudière-Appalaches` | `Wendake`)
- `postalPrefix[]` (ex. `["G1", "G2"]` pour Québec) — utile pour matcher les leads existants
- `neighbors[]` (3–5 slugs de villes proches, alimentent le maillage interne)
- `lat`, `lng` (centroïde, pour JSON-LD + carte statique)
- `population` (indicatif, pour prioriser la génération)

**`src/lib/seo/materials.ts`** — matériaux couverts, avec variantes SEO :
- `slug` (ex. `terre-remplissage`, `gravier-0-3-4`, `sable`, `pierre-concassee`, `remblai`, `terre-tamisee`, `mg-20`, `mg-56`, `pierre-nette`, `poussiere-de-pierre`)
- `name`, `shortName`
- `keywords[]` (variantes : `terre de remplissage`, `remblai propre`, etc.)
- `useCases[]` (nivellement, drainage, base de patio, remplissage de terrain…)
- `pricingHint` (fourchette /verge ou /tonne, générique)
- `deliveryUnit` (`verge cube` | `tonne`)
- `heroImage` (chemin dans `src/assets/seo/`)
- `relatedMaterials[]` (2–3 slugs pour maillage)

Un helper `getAllowedCombinations()` renvoie le produit cartésien, filtré par une liste blanche optionnelle si on veut restreindre certaines combinaisons.

## 2. Route dynamique unique

**Format d'URL retenu :** `/{materiau}-{ville}` (ex. `/terre-remplissage-quebec`, `/gravier-0-3-4-levis`, `/sable-beauport`).

Une seule route React Router `"/:localSlug"` avec un **résolveur strict** :
1. Parse le slug → tente de matcher `{materialSlug}-{citySlug}` avec la liste des matériaux et villes autorisées (longest-match sur le matériau car certains slugs contiennent des tirets).
2. Si match → rend `LocalLanding`.
3. Sinon → passe au fallback existant (`NotFound`).

La route est ajoutée **avant** `*` mais **après** toutes les routes nommées (`/blog`, `/admin/*`, etc.) pour ne pas les intercepter. Une garde `RESERVED_TOP_LEVEL_SLUGS` (blog, admin, login, entrepreneur, remblai, depot, contact, etc.) court-circuite le résolveur.

**Pourquoi pas `/materiau/ville` ou `/ville/materiau` ?** L'utilisateur a montré des exemples plats (`/terre-remplissage-quebec`). C'est aussi ce qui performe le mieux localement (mots-clés dans le slug, une seule profondeur).

## 3. Composant `LocalLanding`

**`src/pages/LocalLanding.tsx`** — page unique, contenu 100 % dynamique depuis `city` + `material` :

- **`<Helmet>`** :
  - `title` : `{Matériau} à {Ville} — Livraison en vrac | Vrac Québec` (<60 car.)
  - `meta description` : phrase locale avec prix indicatif et CTA (<160 car.)
  - `canonical` : `https://vracquebec.ca/{materiau}-{ville}`
  - `og:*` + `twitter:*` cohérents
  - **JSON-LD** : `LocalBusiness` (avec `areaServed` = la ville), `BreadcrumbList`, `FAQPage` (3–5 Q/R générées depuis le matériau)
- **Fil d'Ariane** : Accueil › Livraison en vrac › {Ville} › {Matériau}
- **Hero** : H1 unique `{Matériau} livré à {Ville}`, sous-titre localisé, 2 CTA (« Demander une soumission », « Voir les prix »).
- **Sections** (toutes injectent le nom de la ville dans le texte pour éviter le duplicate content) :
  - « Pourquoi choisir Vrac Québec à {Ville} » (3 arguments : livraison locale rapide, camions adaptés, prix transparents)
  - « Utilisations du {matériau} » (`useCases` du matériau)
  - « Prix indicatifs à {Ville} » (fourchette + note « soumission gratuite »)
  - « Zone de livraison » — mini-carte statique Google (image, pas d'interactif) centrée sur `city.lat/lng`, avec les `neighbors` listés
  - **Formulaire de demande** — réutilise `RemblaiForm` / `Questionnaire` existant, pré-rempli avec `defaultCity` et `defaultMaterial`
  - « FAQ {matériau} à {ville} » (4 questions générées, réponses courtes) → alimente `FAQPage` JSON-LD
  - **Maillage interne** :
    - « Autres matériaux à {Ville} » → liens vers les 4–5 autres matériaux dans la même ville
    - « {Matériau} dans les villes voisines » → liens vers `city.neighbors` avec le même matériau
    - Lien vers 2–3 articles de blogue pertinents (query `blog_posts` filtrée par tag/catégorie du matériau)
  - CTA final sticky mobile

**Contenu unique par page** : le template concatène ville + matériau + `useCases` + FAQ, ce qui donne 400–600 mots réellement différents entre chaque page (assez pour éviter le near-duplicate ; on n'auto-génère pas d'IA au premier jet — on pourra en ajouter plus tard).

## 4. Pré-remplissage du formulaire

`RemblaiForm` accepte déjà des valeurs initiales via son state interne. On ajoute deux props optionnelles :
- `defaultMaterial?: string`
- `defaultCity?: string`

`LocalLanding` les passe au montage. Aucune modification de la logique de soumission. Un champ caché `source_landing_slug` est envoyé avec la soumission (nouvelle colonne `submissions.source_landing_slug TEXT NULL`) pour tracer quelles pages convertissent.

## 5. Sitemap & robots

`scripts/generate-sitemap.ts` déjà en place. On ajoute :

```ts
import { CITIES } from "../src/lib/seo/cities";
import { MATERIALS } from "../src/lib/seo/materials";
for (const m of MATERIALS) for (const c of CITIES)
  entries.push({ path: `/${m.slug}-${c.slug}`, changefreq: "monthly", priority: "0.7" });
```

Rien à faire côté `robots.txt` — `Allow: /` couvre déjà tout, et le `Sitemap:` pointe vers `vracquebec.ca/sitemap.xml`.

## 6. Micro-migration BD

Une seule migration légère :
- `ALTER TABLE public.submissions ADD COLUMN source_landing_slug TEXT NULL;`
- Aucune nouvelle table, aucune policy à changer (colonne écrivable via la policy INSERT publique existante).

## 7. Navigation & découvrabilité interne

- Nouvel index **`/livraison`** listant toutes les villes couvertes (34), groupées par région, chaque ville liant vers `/livraison/{ville}` → mini-hub qui liste tous les matériaux disponibles dans cette ville.
- Le pied de page principal reçoit un bloc « Zones desservies » avec les 8–10 villes principales (Québec, Lévis, Beauport, Charlesbourg, Sainte-Foy, Sillery, Cap-Rouge, Saint-Romuald, Saint-Nicolas, Pont-Rouge).
- Chaque `LocalLanding` obtient un lien de retour vers `/livraison/{ville}`.

## 8. Ce qui n'est PAS inclus (mais préparé pour plus tard)

- Pas de génération IA de contenu long (les templates suffisent pour 34 × ~10 = 340 pages uniques). On pourra brancher `blog-ai-generate` plus tard sur un endpoint `local-ai-enrich` qui écrit un paragraphe long dans une nouvelle table `local_page_content` — la route lira ce contenu s'il existe, sinon utilisera le template. Pas fait ce tour-ci.
- Pas d'admin UI pour éditer les pages : la source de vérité reste les fichiers TS. Ajouter/retirer une ville = éditer `cities.ts`.
- Pas d'extension hors territoire : la garde stricte dans le résolveur empêche toute URL type `/sable-montreal` de rendre — elle tombe en 404.

## 9. Fichiers touchés

**Nouveaux**
- `src/lib/seo/cities.ts`
- `src/lib/seo/materials.ts`
- `src/lib/seo/matchSlug.ts` (résolveur + garde)
- `src/pages/LocalLanding.tsx`
- `src/pages/LocalCityIndex.tsx` (hub par ville : `/livraison/:citySlug`)
- `src/pages/LocalIndex.tsx` (index global : `/livraison`)
- `src/components/seo/LocalHero.tsx`, `LocalFaq.tsx`, `LocalInternalLinks.tsx`

**Modifiés**
- `src/App.tsx` — 3 routes ajoutées (`/livraison`, `/livraison/:citySlug`, `/:localSlug`), la dernière juste avant `*`
- `src/components/RemblaiForm.tsx` — accepte `defaultMaterial`, `defaultCity`
- `src/pages/Index.tsx` — bloc « Zones desservies » dans le footer
- `scripts/generate-sitemap.ts` — ajoute les URLs générées
- Migration Supabase — colonne `source_landing_slug`

## Détails techniques

- **Aucune donnée user-controlled n'atteint le résolveur** : on ne rend `LocalLanding` que si le split matche exactement une paire matériau/ville de la whitelist.
- **`react-helmet-async`** est déjà monté (`main.tsx`), rien à installer.
- **Carte statique** : Google Static Maps via URL signée côté client — clé `VITE_GOOGLE_MAPS_KEY` déjà présente. Fallback : image locale de la région si pas de clé.
- **Images matériau** : on réutilise `src/assets/` existant (terre, sable, gravier, remblai). Une image = tous les couples de ce matériau ; l'unicité vient du texte, pas de l'image (acceptable pour Google).
- **Performance** : `LocalLanding` en `React.lazy()` comme les autres pages, code-split individuel.
- **Sitemap** : ~340 URLs générées + les 10 déjà présentes → sous les 5000 URLs recommandées, pas besoin de sitemap index.

Une fois validé, je code tout dans l'ordre : données → résolveur/route → template `LocalLanding` → hubs `/livraison` → migration `source_landing_slug` → sitemap → footer.
