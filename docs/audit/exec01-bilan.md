# EXEC-01 — bilan du 19 octobre 2026

## Livraison en aperçu uniquement — activation réelle non terminée

- Suivi personnel TEST : `/portail/remblai?test=1`.
- Vue dossier CRM TEST, même identifiant fictif : `/admin/apercu-suivi-remblai?test=1`.
- Scénarios : ajouter `&scenario=ancien`, `expire`, `revoque`, `autre-dossier` au suivi TEST.
- Sans `test=1`, l'accès réel est explicitement désactivé.

Conditions structurées complètes, quantités/unité d'origine, matériaux et mélanges, véhicules/accès, horaires, présence, consignes, photos locales, trois préférences de réception, validations séparées, consentement promotionnel explicite. Confirmation par code fictif, modifications explicites, pause/reprise/confirmation/fermeture, revalidation après modification, historique et dédoublonnage du double clic.

## Existant inspecté

`submissions`, profils/conditions/environnement liés, `set_dompe_availability`, journal de disponibilité, `submit-parcours`, modèle `client-confirmation`, partage de soumissions `/s/:token`, portails authentifiés. Composants UI et palette existants réutilisés. Aucun de ces objets serveur n'est modifié ni déployé.

## Vérifications réellement exécutées

- Vitest : 72 tests réussis, 5 fichiers, zéro échec (26 EXEC-01 et 46 régressions demandes/interpréteur).
- Playwright : lecture après rechargement sans mutation; code fictif; modification restant 750 → 600 m³; mise à jour dans une seconde fenêtre CRM TEST; double clic = un événement et une seule version; pause/reprise/confirmation/fermeture; préférence préautorisée sans livraison; lien expiré/révoqué/mauvais dossier; ancien dossier incomplet; aperçu du courriel; absence de débordement à 360/768/1280 px; accès réel désactivé.
- Zéro erreur JavaScript dans ce parcours. Requêtes externes bloquées dans le navigateur de test.
- Captures inspectées : `/tmp/browser/exec01/{mobile,desktop,crm,email,legacy}.png`. Journal navigateur : `/tmp/browser/exec01/results.log`.
- Aucun test d'envoi réel, de données CRM hébergées, de RLS/migration, de quota distribué ou de concurrence entre serveurs n'a été exécuté.

## Limites et dépendances

Voir `prepared/exec01/README.md` pour les raccordements précis. L'environnement aperçu partage le serveur réel : sans environnement backend TEST isolé, les essais Cloud et la synchronisation réelle sont bloqués. Le transport serveur est préparé et testé localement, non déployé. Le courriel actif n'a pas reçu le bouton; seul l'aperçu TEST l'affiche. Le prestataire d'envoi n'a pas été vérifié ni sollicité. Les liens et codes fictifs sont simulés en mémoire; le stockage local n'est pas une sécurité pour des contacts réels.

L'émission de lien, sa livraison au contact réellement vérifié, le quota global partagé, le stockage privé des photos et le raccordement CRM réel restent à réaliser dans un serveur isolé autorisé. La limitation à 5 échecs de code testée localement ne constitue pas une protection anti-abus distribuée.

Aucune publication, fonction active, migration, permission, donnée métier, génération, synchronisation, demande réelle, communication ou paiement n'a été touché dans EXEC-01.