# Plan : Moteur SEO Complet pour Vrac Québec

Ce chantier étend le SEO Manager existant en 6 modules. Vu l'ampleur, je propose de le livrer en **3 phases** validées séparément — la phase 1 pose les fondations dont dépendent les phases 2 et 3.

---

## Phase 1 — Fondations & Génération Enrichie

**Contenu enrichi (edge function `seo-generate-page` v2)**
- Contenu 800-1500 mots (vs 600-1200)
- FAQ ville+service spécifique (6-8 questions au lieu de 4)
- Génération auto : balises ALT contextuelles pour images, Open Graph + Twitter Cards, meta-description optimisée
- Schema.org enrichi : LocalBusiness + Service + FAQPage + BreadcrumbList + Article
- Section CTA adaptée (Devis / Appel / Formulaire) selon le service
- Extraction automatique de metrics à l'insertion : word_count, h1/h2/h3 count, keyword density

**Maillage interne intelligent**
- Nouveau champ `internal_links` (jsonb) sur `seo_pages`
- Algorithme : chaque page reçoit 5-8 liens vers (a) même ville / autres services, (b) même service / villes voisines, (c) matériau lié
- Composant `<InternalLinksBlock>` rendu en bas des pages publiques
- Breadcrumb component réutilisable avec Schema.org

**Sync automatique Dompes ↔ SEO**
- Trigger DB : à l'INSERT/UPDATE d'une `submission` de type dompe, marquer la page SEO de la ville comme `needs_refresh = true`
- Section "Points de dépôt actifs" injectée dynamiquement sur les pages ville (compte + zones desservies, sans exposer d'adresses privées)
- Bouton "Régénérer les pages impactées" dans le SEO Manager

---

## Phase 2 — Analyse SEO & Suggestions IA

**Module "Analyse SEO" par page**
- Nouvelle table `seo_page_analytics` (score, word_count, internal/external links, h1/h2/h3, keyword_density, meta_description_length, errors[], suggestions[])
- Edge function `seo-analyze-page` : parse le contenu, calcule un score /100 pondéré (contenu 30, structure 20, meta 15, liens 15, keywords 20)
- Onglet "Analyse" dans le SEO Manager avec tableau triable + drill-down par page
- Badges visuels : Excellent (85+) / Bon (65-84) / À améliorer (<65)

**Module "Suggestions IA"**
- Edge function `seo-suggestions` (Gemini 2.5) qui analyse : combinaisons manquantes prioritaires, villes/services absents avec fort volume, mots-clés longue-traîne détectés, sujets de blogue liés
- Nouvel onglet "Suggestions" avec cartes par catégorie et bouton "Créer" one-click
- Rafraîchissement hebdomadaire automatique via cron

---

## Phase 3 — Calendrier & Google Search Console

**Calendrier de publication naturelle**
- Nouvelle table `seo_publication_schedule` (page_id, scheduled_at, status)
- UI : choix du rythme (5/10/20/50 pages / semaine), répartition automatique lun-mer-ven aux heures ouvrables
- Cron `seo-publish-scheduled` qui passe les pages `draft → published` selon le calendrier
- Vue calendrier mensuelle avec drag & drop

**Intégration Google Search Console**
- Connecteur GSC déjà disponible côté Lovable (documenté)
- Nouvelle page/onglet "Search Console" : impressions, clics, CTR, position moyenne (7j / 28j / 3 mois)
- Top pages, top requêtes, pages à optimiser (position 8-20 = quick wins)
- Nécessite que l'utilisateur autorise la connexion GSC + valide le domaine vracquebec.ca

---

## Détails techniques

**Nouvelles tables**
```
seo_page_analytics    (page_id, score, metrics jsonb, errors[], suggestions[], analyzed_at)
seo_publication_schedule  (page_id, scheduled_at, published_at, status)
seo_ai_suggestions    (type, payload jsonb, priority, dismissed, created_at)
```

**Nouvelles colonnes `seo_pages`**
- `internal_links jsonb`, `word_count int`, `needs_refresh bool`, `last_analyzed_at timestamptz`

**Edge functions**
- `seo-generate-page` v2 (enrichie)
- `seo-analyze-page` (nouveau)
- `seo-suggestions` (nouveau)
- `seo-refresh-dumps` (nouveau, appelée par trigger DB)

**Fichiers front principaux**
- `src/pages/AdminSeoManager.tsx` — ajout onglets Analyse / Suggestions / Calendrier / Search Console
- `src/pages/SeoLandingPage.tsx` — rendu Breadcrumb + InternalLinks + Dumps actifs
- `src/components/seo/` — nouveaux composants réutilisables

---

## Question de séquencement

Je recommande de commencer par la **Phase 1** (fondations qui améliorent immédiatement toutes les pages) puis d'enchaîner. Confirme-moi :

1. Est-ce que je démarre par la Phase 1 complète (~1 gros commit) ?
2. Pour Google Search Console : est-ce que tu veux que je te guide pour connecter le connecteur GSC dès maintenant, ou on le fait au moment de la Phase 3 ?
3. Pour les "dompes" sur les pages publiques : afficher un compteur agrégé par ville (ex. "12 points de dépôt actifs") sans jamais exposer d'adresse — OK ?
