# Générateur SEO — corrections préparées (NON EN SERVICE)

Ce dossier n'est pas déployé. Les fichiers en service restent ceux de `supabase/functions/`.

## Contenu
- `_shared/seo-link-guard.ts` — liens écrits par l'IA : seuls les liens vers une page SEO publiée sont gardés, sinon texte conservé sans lien.
- `_shared/seo-quality.ts` — variables non remplacées, descriptions vides/courtes, titres/descriptions en double, mesure de ressemblance (sans seuil).
- `_shared/seo-faq-offer.ts` — copie + `enforceOfferFaq` / `isForbiddenOfferFaq`.
- `_shared/seo-claims.ts` — copie identique (pour les tests).
- `seo-generate-page/index.ts` — générateur corrigé; `seo-generate-page.diff` — différence exacte avec la version du projet.

## Procédure de mise en service (à exécuter seulement après approbation)
1. Sauvegarde : copier `supabase/functions/seo-generate-page/index.ts` et `_shared/seo-faq-offer.ts` actuels dans `prepared/seo-generator/backup-<date>/`; noter la version déployée (date de déploiement dans les journaux).
2. Copier les fichiers préparés vers `supabase/functions/` (aucune migration nécessaire).
3. Tests sans IA ni écriture : `bunx vitest run src/test/seo-generator-prepared.test.ts` + tests SEO existants + simulation sur base fictive (`/tmp/simgen`).
4. Mettre en service uniquement `seo-generate-page` (l'outil FAQ automatique n'est pas concerné).
5. Vérification sans génération : appel sans session → 401; appel admin avec ville non active → 400 (refus avant tout appel IA); journaux sans erreur de démarrage.
6. Retour arrière : recopier la sauvegarde de l'étape 1 et remettre en service la fonction.
7. Pages publiées : la mise en service ne touche aucune page (le code n'agit qu'à l'appel); le nouveau code n'écrit jamais dans `seo_pages` pour une page publiée.
