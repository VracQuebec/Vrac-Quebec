# Évolution du SEO Manager — 4 modules

Livraison en un seul chantier cohérent, en 4 modules.

---

## Module 1 — Tableau de bord SEO enrichi

Nouvel onglet **Pages** dans `/admin/seo` avec un tableau triable/filtrable listant toutes les pages générées. Colonnes :

- Titre + slug (lien vers la page publique)
- Score SEO (badge coloré : vert 85+, ambre 65-84, rouge <65)
- Mots (word_count)
- Statut Google (Indexée / En cours / Non indexée / Inconnu — via GSC ou mention "non connecté")
- Créée le
- Mise à jour le
- Liens internes (nombre)
- Articles reliés (nombre d'articles de blogue rattachés à la même ville/matériau/service)
- Priorité (étoiles, cf. module 3)
- Actions : Voir · Améliorer · Éditer

Filtres : score, statut, priorité, ville, matériau. Tri sur chaque colonne. Recherche plein texte.

## Module 2 — IA « Améliorer cette page »

Bouton **Améliorer cette page** sur chaque ligne et dans l'éditeur.

Nouvelle edge function `seo-improve-page` (Gemini 3 Flash) qui :

- réécrit le contenu en gardant le sujet et la structure,
- enrichit les FAQ (6-8 questions locales),
- optimise `meta_title`, `meta_description`, `og:*`,
- régénère `internal_links` à partir des villes/matériaux/services actuels,
- recalcule `word_count`, `h1/h2/h3 count`, `keyword_density`, `seo_score`.

Diff visuel (avant / après) avec bouton **Appliquer** ou **Annuler**. Aucun écrasement automatique.

## Module 3 — Priorité SEO (étoiles 1-5)

Nouvelle colonne `priority` (1-5) sur `seo_pages`.

Calcul automatique à la création et lors de l'amélioration IA, basé sur :

- volume estimé de la combinaison ville × matériau (population + centralité),
- présence de « dompes » actives dans la ville (compte remblai/dépôt),
- proximité de Québec/Lévis (0-30 km),
- absence de concurrence indexée sur la longue traîne.

Rendu :  ⭐⭐⭐⭐⭐ Très prioritaire → ⭐ Très faible. L'admin peut forcer manuellement une note (verrou 🔒). Tri par priorité dans le tableau de bord.

## Module 4 — Google Search Console

Connecteur Lovable **Google Search Console** (déjà disponible côté plateforme).

Flow :

1. Nouvelle sous-section « Search Console » dans le tableau de bord avec un CTA **Connecter Google Search Console** (dispatch `standard_connectors--connect`).
2. Vérification de propriété via méta-tag (`googleSiteVerification` injecté dans `index.html` par l'admin en un clic ; jeton récupéré via l'API Site Verification).
3. Edge function `seo-gsc-sync` (cron quotidien) qui appelle :
   - `/webmasters/v3/sites/{siteUrl}/searchAnalytics/query` — impressions, clics, CTR, position (7j / 28j / 3 mois) par page et par requête,
   - `/v1/urlInspection/index:inspect` — statut d'indexation par page.
4. Stockage dans une nouvelle table `seo_gsc_metrics` (page_id, période, clicks, impressions, ctr, position, top_queries jsonb, index_status).
5. Vue « Search Console » : top pages, top requêtes, pages en position 8-20 (quick wins), CTR anormalement bas.
6. Le statut Google du tableau (module 1) et la priorité (module 3) intègrent ces données une fois connecté.

---

## Détails techniques

**Migrations DB**
- `seo_pages` : `priority int` (1-5, default 3), `priority_locked bool`, `google_index_status text`, `google_last_checked_at timestamptz`.
- Nouvelle table `seo_gsc_metrics` (page_id, period, clicks, impressions, ctr, position, top_queries jsonb, index_status, fetched_at).
- Nouvelle table `seo_page_improvements` (page_id, before jsonb, after jsonb, applied bool, created_at) pour l'historique IA.

**Edge functions**
- `seo-improve-page` (nouveau) — Gemini 3 Flash, réécriture + méta + liens + score.
- `seo-gsc-sync` (nouveau) — synchronisation quotidienne GSC via connecteur gateway.
- `seo-gsc-verify` (nouveau) — génère le jeton `google-site-verification` et déclenche la vérification.

**Front**
- `src/pages/AdminSeoManager.tsx` — nouvel onglet **Pages** (tableau enrichi), sous-section **Search Console**, bouton **Améliorer** partout.
- `src/components/seo/PagesTable.tsx` (nouveau) — tableau triable/filtrable.
- `src/components/seo/ImproveDialog.tsx` (nouveau) — diff avant/après + Appliquer.
- `src/components/seo/PriorityStars.tsx` (nouveau) — affichage + édition manuelle.
- `src/components/seo/GscConnect.tsx` (nouveau) — CTA de connexion + vérification.
- `index.html` — insertion conditionnelle du méta-tag `google-site-verification` (lu depuis un secret / une table de config).

**Connecteur**
- `google_search_console` via `standard_connectors--connect` (gateway Lovable, aucun secret manuel).

---

## Séquencement proposé

1. Migration DB + colonnes priorité + tables métriques / historique
2. Tableau de bord enrichi (module 1) + priorité (module 3) — visuel immédiat
3. IA « Améliorer » (module 2) — edge function + dialog diff
4. Connexion Google Search Console (module 4) — connecteur + sync + vue

Je peux tout enchaîner sans validation intermédiaire, ou marquer une pause après le tableau/priorité si tu veux valider le rendu avant d'attaquer l'IA et GSC.

## Questions avant exécution

1. **Sync GSC** : cadence journalière (00h) OK, ou tu veux hebdo pour économiser des appels ?
2. **Amélioration IA** : par défaut je propose un **diff à valider** (jamais d'écrasement auto). Tu confirmes ce comportement, ou tu préfères un mode « appliquer directement » avec sauvegarde dans l'historique ?
3. **Priorité** : le calcul auto se base sur population + dompes + distance. Tu veux ajouter d'autres critères (ex. saisonnalité, budget publicitaire) ?
4. **Search Console** : je pars sur le connecteur Lovable natif (aucune clé à saisir, OAuth géré). OK ?
