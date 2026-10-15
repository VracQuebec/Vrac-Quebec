# Feuille de route — Mission de correction de l'audit global (15 oct. 2026)

Source : /mnt/documents/audit-global-2026-10-15.md (22 constats classés P1–P3).
Contraintes : aperçu = même base que la production (confirmé) → aucune soumission réelle, aucune écriture de test, aucune notification réelle. Aucune publication sans autorisation. Les 1 281 meta_title SEO = chantier séparé, non touché.

## Lot 1 — Fiabilité des demandes
- [ ] P1-1 /acces-dompe : refus serveur maquillé en « en attente » (submitQueue.ts:282-296)
- [ ] P1-2 Achat vrac : échec courriel → ok:false alors que la demande est écrite (quote-submit + vrac/submit.ts)
- [ ] Vérifier conservation des saisies et anti-doublon (déjà en place : idempotence/empreinte)

## Lot 2 — SEO technique
- [ ] P1-3 Canonical du blogue pointe vers l'accueil (/blog, /blog/outils)
- [ ] P2-5 JSON-LD dupliqués sur pages générées (Service, BreadcrumbList, FAQPage ×2)
- [ ] P1-4 Soft 404 : dépend de l'hébergement (SPA) → documenter, noindex déjà en place

## Lot 3 — Intégrations et stabilité
- [ ] P2-7 SiteAssistant : erreur réseau réinitialise silencieusement la conversation
- [ ] P2-6 Modale GBP sans bouton Fermer
- [ ] P2-9 mailchimp-webhook / sitemap-live sans gestion d'erreur
- [ ] P2-8 ~47 appels externes sans timeout (traiter les plus exposés)

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
