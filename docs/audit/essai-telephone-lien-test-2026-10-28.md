# Lien téléphone TEST A — installé 2026-10-28 (aperçu seulement)
- Fonction `test-phone-link` + table `test_phone_tokens` (migration 0249, empreintes SHA-256 seulement, accès serveur uniquement).
- Pages /admin/essai-telephone et /essai-telephone présentes seulement dans l'aperçu; origines autorisées : aperçu et localhost (pas le site publié).
- Essais : admin 200 + QR; second navigateur connecté à test-a-proprietaire@test.invalid → /entrepreneur/crm; réemploi 410; après 125 s 410; non-admin 403; anonyme 401; autre origine 403; email imposé ignoré; jeton inventé 410; aucun jeton dans les journaux ni dans les requêtes sortantes; expiration enregistrée 120 s.
## Désactivation à la fin des essais
1. Supprimer la fonction `test-phone-link` (déploiement retiré).
2. Retirer les deux routes de src/App.tsx et les pages AdminTestPhone/TestPhoneRedeem.
3. Conserver la table vide de sens (commentée DEPRECATED) ou la retirer après autorisation.
