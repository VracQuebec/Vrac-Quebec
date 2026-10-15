# Feuille de route — Mission de correction de l'audit global (15 oct. 2026)

Source : /mnt/documents/audit-global-2026-10-15.md (22 constats classés P1–P3).
Contraintes : aperçu = même base que la production (confirmé) → aucune soumission réelle, aucune écriture de test, aucune notification réelle. Aucune publication sans autorisation. Les 1 281 meta_title SEO = chantier séparé, non touché.

## Lot 1 — Fiabilité des demandes
- [x] P1-1 /acces-dompe : refus serveur → état « rejeté » honnête (submitQueue.ts + TransportRequest.tsx). Testé : 3 tests unitaires + E2E navigateur avec refus simulé (toast rouge, saisie conservée, aucune confirmation).
- [x] P1-2 Achat vrac : demande enregistrée + courriel en échec → confirmation avec numéros et mention « courriel non envoyé » (submitResult.ts + submit.ts + QuoteCard + AchatVrac). Testé : 6 tests unitaires. Modification serveur quote-submit préparée (ok:true + email_sent:false) — NON déployée (déploiement = production, attend autorisation). Le client gère aussi l'ancienne réponse 502.
- [x] Anti-doublon et conservation des saisies : déjà en place (idempotence, verrous), confirmés par les tests.

## Lot 2 — SEO technique
- [x] P1-3 Canonical du blogue : déjà corrigée dans l'aperçu (lot précédent non publié) — vérifié sur /blog, /blog/outils, /blog/guides, /blog/faq, /blog/categorie/remblai : toutes auto-référencées. Le site EN LIGNE reste défectueux jusqu'à publication.
- [x] P2-5 JSON-LD : déduplication des pages générées déjà présente dans l'aperçu (vérifié /gravier-quebec : chaque type une fois) ; doublon WebSite résiduel sur /blog retiré ce lot (Blog.tsx) — revérifié : plus aucun type en double sur 6 pages.
- [~] P1-4 Soft 404 : bloqué par l'hébergement (SPA statique renvoie 200 pour toute route ; le code 404 ne peut pas être émis côté applicatif). Atténuation déjà en place et revérifiée : page 404 rendue avec noindex. Option réelle : migration vers le gabarit SSR — décision de l'utilisateur.

## Lot 3 — Intégrations et stabilité
- [x] P2-7 SiteAssistant : erreur transitoire ne supprime plus le jeton ni la conversation; message « Connexion instable » affiché et effacé au retour du réseau (aperçu, publié au prochain déploiement)
- [x] P2-6 Modale GBP : bouton Fermer visible avec aria-label + rôle dialog ajoutés
- [x] P2-9 mailchimp-webhook : try/catch global, journal d'erreur, 500 explicite (Mailchimp retente), comparaison du secret par empreinte SHA-256; sitemap-live : try/catch, 503 no-store au lieu d'une 500 brute/XML vide — PRÉPARÉ, NON DÉPLOYÉ
- [x] P2-8 : helper _shared/http.ts (fetchWithTimeout) appliqué aux 8 chemins les plus exposés (Google Routes/géocodage/matrice, IA assistant/soumission, courriels internes ×3); ~39 autres appels (cron SEO, GBP/GA4, Mailchimp sortant) restent sans délai — PRÉPARÉ, NON DÉPLOYÉ. Syntaxe validée esbuild (10/10); deno check signale 2 erreurs de typage préexistantes hors périmètre.

## Lot 4 — Sécurité
- [ ] P2-12 CSP / X-Frame-Options : configuration hébergement → documenter précisément
- [ ] Vérifier absence de secrets côté client (déjà confirmé par l'audit)
- [ ] Comparaison secret Mailchimp non en temps constant (faible)

## Lot 5 — Données et logique métier
- [ ] P2-11 28 groupes de doublons remblai : rapport seulement, aucune modification sans autorisation
- [ ] P2-10 Divergence aperçu camion recommandé client/serveur : documenter

## Lot 6 — Accessibilité et qualité
- [ ] P3 1 champ sans libellé sur /soumission et /materiaux
- [ ] P3 cibles tactiles < 24 px (amélioration ciblée, sans changer l'identité visuelle)
- [ ] P3 numéro public en dur dans ~7 fichiers (factoriser via public-phone.ts)

## Rapport final
- [ ] Rapport vérifiable avec statuts par constat (corrigé et testé / test incomplet / en attente / bloqué)
