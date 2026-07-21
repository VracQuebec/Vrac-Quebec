# Production SEO progressive — 4 vagues contrôlées

Objectif : publier des pages **haute qualité** au rythme recommandé (20-30 → 30-50 → +blog → ajustements GSC), avec un contrôle qualité automatique **avant** publication. On réutilise le SEO Manager existant, on n'ajoute que le pipeline de QA et l'ordonnancement par priorité.

---

## 1. Ordonnancement par priorité (dans le SEO Manager)

Nouvel onglet **File de production** dans `/admin/seo` qui affiche 4 files ordonnées par `seo_priority_score` :

- **P1 — Matériaux** : une page par matériau (`/materiaux/{slug}`), triée par popularité (impressions GSC + volume estimé).
- **P2 — Services** : une page par service (`/services/{slug}`).
- **P3 — Villes/secteurs** : une page par ville active (`/zones/{slug}`), triée par population × demande locale (`count_active_dumps_by_city`).
- **P4 — Combinaisons** : matériau × ville × service, triées par `seo_priority_score`.

Chaque file affiche : score, statut (draft/published), dernier QA, bouton **Générer & vérifier**.

## 2. QA automatique avant publication

Nouvelle edge function `seo-qa-check` (appelée automatiquement après `seo-generate-page` / `seo-improve-page`, avant passage en `published`). Vérifie 8 critères, retourne `{ score, checks[], blockers[] }` :

1. **Unicité** — similarité < 70 % (trigrammes/Jaccard) contre les autres `seo_pages` de la même famille.
2. **Qualité SEO** — 800-1500 mots, ≥ 4 H2, densité mot-clé principal 1-2 %, lisibilité (phrases < 25 mots en moyenne).
3. **Maillage interne** — ≥ 3 liens vers d'autres `seo_pages` ou `blog_posts` de la même ville/matériau.
4. **Title & Meta** — Title 40-65 car, Meta 140-160 car, mot-clé présent, non dupliqués.
5. **Schema.org** — JSON-LD `Service` ou `LocalBusiness` + `FAQPage` valides (parse test).
6. **FAQ** — ≥ 5 Q/R, réponses ≥ 40 mots, pas de duplicata.
7. **Liens connexes** — bloc "Guides & conseils" et "Autres villes / matériaux" non vides.
8. **CTA** — ≥ 2 CTA vers `/transport-request` ou `/#questionnaire`.

Blockers (score < 75, unicité échouée, meta hors bornes, Schema invalide) → page reste en `draft`, badge rouge et diff dans l'UI. Warnings (score 75-89) → publiable manuellement. ≥ 90 → auto-publiable.

Table `seo_qa_reports` (page_id, score, checks jsonb, blockers text[], warnings text[], checked_at).

## 3. Runner par vagues

Composant `WaveRunner` dans `AdminSeoManager.tsx` (onglet File de production). Une vague = 3 paramètres :
- taille max (25 / 40 / …),
- priorité cible (P1 / P2 / P3 / P4 ou "toutes"),
- seuil QA auto-publication (par défaut 90).

Boucle séquentielle : `seo-generate-page` → `seo-qa-check` → si score ≥ seuil, publier ; sinon garder en `draft`. Pause/reprise, retry sur 429/402, journal en direct.

Vagues préconfigurées (boutons) :

| Vague | Contenu | Volume |
|---|---|---|
| S1 | P1 (10 matériaux) + P2 (10 services) + top 10 P3 | 25-30 pages |
| S2 | P3 complet (villes restantes) + top 15 P4 | 30-45 pages |
| S3 | +30 combinaisons P4 haute priorité + 6 articles blog liés | ~35 items |
| S4 | Recos GSC (`quick_win_gsc`, `low_ctr`) + amélioration pages P1/P2 | variable |

## 4. Suivi hebdomadaire

Widget **Progression** dans l'onglet Assistant IA : nb de pages publiées cette semaine, score QA moyen, top blockers récurrents. Bouton **Ouvrir GSC** pour la revue S4.

---

## Détails techniques

**Migrations DB**
- `seo_qa_reports` (page_id fk, score int, checks jsonb, blockers text[], warnings text[], checked_at timestamptz)
- GRANT authenticated + service_role ; RLS admin-only.
- Ajout colonne `seo_pages.qa_last_score int`, `qa_last_checked_at timestamptz`, `qa_blockers text[]`.

**Edge functions**
- `seo-qa-check` : lit la page + Schema + FAQ + liens, calcule scores, appelle Gemini 3 Flash uniquement pour la similarité sémantique et une passe de lisibilité, écrit `seo_qa_reports` et met à jour `seo_pages`.
- `seo-generate-page` et `seo-improve-page` : ajout d'un flag `run_qa: true` qui enchaîne `seo-qa-check` et publie si score ≥ seuil passé en paramètre.

**Front**
- Nouvel onglet **File de production** dans `AdminSeoManager.tsx` avec 4 sous-listes + `WaveRunner`.
- `src/components/seo/QaReportBadge.tsx` (score + blockers cliquables).
- Réutilise `PriorityStars`, `RecommendationCard`.

**Aucun ajout côté public** (SeoLandingPage, routes, sitemap inchangés).

---

## Séquencement de livraison

1. Migration `seo_qa_reports` + colonnes `seo_pages`.
2. Edge `seo-qa-check` + intégration dans `generate`/`improve`.
3. Onglet File de production + `WaveRunner` + `QaReportBadge`.
4. Boutons vagues préconfigurés + widget progression.

Livraison en un chantier. Après ça tu lances toi-même vague S1 depuis l'UI quand tu veux.
