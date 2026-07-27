# Audit SEO complet de Vrac Québec

Livraison en deux temps : (1) un **rapport d'audit** basé sur une inspection réelle du code, de la base et des pages publiées ; (2) une **implémentation** des modules manquants (Diagnostic, Correcteur auto, Monitoring, Tableau SEO branché sur données réelles). Aucune modification ne sera appliquée avant que le rapport d'audit soit validé par toi.

---

## Étape 1 — Rapport d'audit (aucune modif code)

Je produis un rapport Markdown affiché en chat + sauvegardé dans `/mnt/documents/seo-audit-YYYYMMDD.md`, couvrant :

- **Architecture** : routes React (`src/App.tsx`), routes publiques vs privées, pages SEO dynamiques (`SeoLandingPage`, `ZoneCityIndex`, blog), Edge Functions SEO, robots.txt, sitemap generator, headers HTTP servis par Lovable hosting, canonical / meta robots / OG / JSON-LD / Schema par type de page.
- **Vérification live** de N pages publiées (échantillon 30 + toutes les erreurs) via `fetch` HTTP : status, canonical, meta robots, title, H1, description, JSON-LD, OG, Twitter, breadcrumb, temps de réponse.
- **Sitemap** : diff entre `seo_pages(status=published)` DB et `sitemap.xml` (manquants, doublons, URLs privées, lastmod).
- **Robots.txt** : règles bloquantes, présence sitemap, exceptions par bot.
- **Google Search Console** : test réel via connecteur (`sites.list`, `searchAnalytics`) — indique si connecté et propriété vérifiée, sinon marque "non configurée".
- **Base SEO** : compteurs réels par catégorie (publiées, brouillons, noindex, sans canonical, sans H1, sans description, contenu faible < seuil, doublons de title/description, orphelines par analyse du maillage).
- **Anomalies** classées 🔴 / 🟠 / 🟢 avec origine, gravité, correction proposée.

## Étape 2 — Implémentation (après validation du rapport)

### 2.1 Diagnostic SEO Intelligent
- Nouvelle Edge Function `seo-diagnostic-scan` : boucle sur `seo_pages` publiées, fait `HEAD/GET` sur `https://vracquebec.ca/{slug}`, parse HTML (title, H1, meta robots, canonical, JSON-LD, OG), cross-check avec sitemap + robots + DB. Stocke résultats dans nouvelle table `seo_diagnostic_findings`.
- Bouton **Analyser maintenant** dans `AdminSeoManager` → lance la fonction en tâche de fond, progression realtime.
- Tableau des findings avec 🟢/🟠/🔴, filtre par catégorie, explication + suggestion.

### 2.2 Correcteur automatique
- Edge Function `seo-autofix` : corrige uniquement méta / canonical / meta robots / sitemap / maillage / pages orphelines / liens cassés, JAMAIS le contenu. Idempotente, journalisée dans `seo_diagnostic_findings.fixed_at`.
- Bouton **Corriger automatiquement** avec dry-run + confirmation.

### 2.3 Sitemap toujours à jour
- Trigger DB sur `seo_pages` (INSERT/UPDATE/DELETE) → notifie une Edge Function `seo-sitemap-refresh` qui régénère `public/sitemap.xml` **au niveau CDN** en écrivant dans le storage bucket public + fallback : `predev`/`prebuild` déjà en place.
- Alternative retenue si trigger CDN indisponible : route dynamique `/sitemap.xml` servie par une Edge Function qui lit la DB en direct → toujours frais.

### 2.4 Robots.txt
- Vérification que la config actuelle est correcte, ajout d'une règle explicite `Allow: /` pour tous, `Sitemap:` présent, aucun `Disallow` sur `/`, `/blog`, ou routes SEO.

### 2.5 Google Search Console — affichage réel
- `useSeoStats` + Command Center : détectent l'absence de connexion GSC (`GOOGLE_SEARCH_CONSOLE_API_KEY` manquant OU `sites.list` vide) et affichent **"Search Console non configurée"** au lieu de zéros. Bouton "Configurer" ouvrant le connecteur.

### 2.6 Tableau SEO branché sur données réelles
- Nouvelle RPC `seo_health_dashboard()` retournant : publiées, brouillons, indexées (via `seo_gsc_metrics`), sans canonical, sans H1, sans description, noindex, HTTP erreurs (via `seo_diagnostic_findings`), redirections, contenu faible, doublons, orphelines.
- `CommandCenter` remplace les compteurs statiques par cette RPC.

### 2.7 Monitoring horaire
- Cron pg_cron toutes les heures → `seo-diagnostic-scan` en mode léger (delta uniquement) + `seo-gsc-sync` + `seo-linkcheck`.
- Nouvelles alertes dans `admin_notifications` (déjà existant) : nouvelles erreurs, désindexations, sitemap invalide.

---

## Détails techniques

- **Fichiers créés** : `supabase/functions/seo-diagnostic-scan/index.ts`, `supabase/functions/seo-autofix/index.ts`, `supabase/functions/seo-sitemap-refresh/index.ts` (optionnel), `src/components/seo/DiagnosticPanel.tsx`, `src/components/seo/AutofixButton.tsx`, `src/lib/seo/useDiagnostic.ts`.
- **Migrations** : table `seo_diagnostic_findings` (page_id, category, severity, message, suggested_fix, fixed_at, detected_at), fonction `seo_health_dashboard()`, cron horaire.
- **Fichiers modifiés** : `src/pages/AdminSeoManager.tsx`, `src/components/seo/CommandCenter.tsx`, `scripts/generate-sitemap.ts` (nettoyage lastmod), `public/robots.txt` si nécessaire.
- **Non modifié** : CRM, comptes entrepreneurs, calendrier, blog CMS, dispatch, facturation.

## Livrables

1. Rapport d'audit complet (chat + fichier).
2. Après validation : migrations + Edge Functions + UI Diagnostic/Autofix/Monitoring + tableau SEO réel.
3. Test final : scan sur 100 % des pages, rapport de conformité, liste résiduelle triée par gravité.

Confirme et je démarre par l'audit (étape 1, sans modification de code).
