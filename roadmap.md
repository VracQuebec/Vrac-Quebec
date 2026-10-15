# Feuille de route — Mission de correction de l'audit global (15 oct. 2026)

Source : /mnt/documents/audit-global-2026-10-15.md (22 constats classés P1–P3).
Contraintes : aperçu = même base que la production (confirmé) → aucune soumission réelle, aucune écriture de test, aucune notification réelle. Aucune publication, aucun déploiement serveur sans autorisation. Les 1 281 meta_title SEO = chantier séparé, non touché.

## Lot 1 — Fiabilité des demandes (terminé)
- [x] P1-1 /acces-dompe : refus serveur → état « rejeté » honnête. Testé E2E navigateur avec refus simulé.
- [x] P1-2 Achat vrac : demande enregistrée + courriel en échec → confirmation avec numéros. 6 tests unitaires. Serveur PRÉPARÉ, NON DÉPLOYÉ.
- [x] Anti-doublon et conservation des saisies confirmés.

## Lot 2 — SEO technique (terminé)
- [x] P1-3 Canonical blogue : correct dans l'aperçu (6 pages vérifiées); site en ligne défectueux jusqu'à publication.
- [x] P2-5 JSON-LD : déduplication vérifiée, doublon WebSite retiré (Blog.tsx).
- [~] P1-4 Soft 404 : bloqué par l'hébergement (SPA, 200 partout). noindex en place. Option SSR = décision utilisateur.

## Lot 3 — Intégrations (terminé)
- [x] P2-7 SiteAssistant : conversation conservée sur erreur transitoire.
- [x] P2-6 Modale GBP : bouton Fermer + rôle dialog.
- [x] P2-9 mailchimp-webhook + sitemap-live : PRÉPARÉS, NON DÉPLOYÉS.
- [x] P2-8 fetchWithTimeout sur 8 chemins exposés; ~39 autres sans délai — Lot 6.

## Lot 4 — Sécurité et confidentialité
- [ ] Audit RLS/policies : remblai, dompes, entrepreneurs, admin (requêtes lecture seule)
- [ ] Isolation entrepreneur ↔ entrepreneur (vérification côté serveur)
- [ ] Secrets/jetons exposés côté client ou journaux
- [ ] En-têtes CSP / X-Frame-Options / frame-ancestors (hébergement → documenter)
- [ ] Comparaison secret Mailchimp non en temps constant (faible) — vérifier correctif Lot 3

## Lot 5 — Données et logique métier
- [ ] P2-11 28 groupes de doublons remblai : rapport lecture seule seulement
- [ ] Prévention doubles soumissions nouvelles demandes (code + serveur)
- [ ] P2-10 Divergence aperçu camion client/serveur : documenter
- [ ] Vérifications parcours dompe/remblai : filtres, distances, cohérence (lecture seule)

## Lot 6 — Accessibilité, compatibilité, régression
- [ ] P3 champ sans libellé /soumission et /materiaux
- [ ] P3 cibles tactiles < 24 px (ciblé)
- [ ] P3 numéro public en dur ~7 fichiers → public-phone.ts
- [ ] ~39 appels externes sans délai d'expiration : protection si approprié (PRÉPARÉ, non déployé)
- [ ] Régression lots 1–5 : tests automatisés + navigateur (360/768/1280)
- [ ] Routes valides/inexistantes, canoniques, JSON-LD revérifiés

## Rapport final
- [ ] Bilan des six lots : statuts, fichiers, tests, limites, dépendances, déploiements en attente
