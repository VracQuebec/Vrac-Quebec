# EXEC-01 — bilan du 19 octobre 2026

## EXEC-01C — intégration désactivée, pas une activation terminée
- **Intégré au projet** : adaptateur Cloud désactivé du portail existant; panneau dormant
  dans la fiche CRM normale; même `submissions` et profil. Sources serveur/SQL/courriel
  restent `prepared/exec01b`, hors déploiement automatique. Photos privées préparées,
  liens et codes serveur, projection sans identité entrepreneur, voyages explicitement liés.
- **Compatible avec ce qui a été inspecté** : colonnes/contraintes/RLS/GRANT, rôle admin
  approuvé, déclencheur réel de disponibilité, bucket `lead-photos` privé, file courriel,
  liens `trips` et `cpn_trips`. Métadonnées lues seulement, aucune donnée personnelle copiée.
- **Vérifié isolément** : 25 tests ciblés réussis (14 traitements modifiés B + 11 nouveaux C),
  dont quota concurrent, photos avant/après autorisation, MIME, signature 120 s,
  non-écrasement documentaire, pas de confirmation implicite, autre dossier inaccessible.
  PostgreSQL loopback + mêmes SQL préparés; capture uniquement, aucun prestataire.
  Navigateur : courriel capturé → code aléatoire → restant 600 m³ + photo → même CRM →
  voyage planifié affiché honnêtement; photo réellement chargée, aucun débordement 360 px,
  aucune erreur JS. Captures inspectées `/tmp/browser/exec01c/{portal-mobile,portal-desktop,crm-desktop}.png`.
- **Types et compilation** : aperçu `build OK`; types de l'entrée Deno vérifiés sur source
  normalisée avec imports locaux explicites (sans exécution). Bundle produit en `/tmp`.
  Un `deno check` sur le bundle JavaScript nommé `.ts` a initialement échoué car esbuild
  retire les types; contrôle corrigé sur les sources, réussi. Aucun échec masqué.
- **Non activé/non vérifié** : vraie session/JWT et PostgREST, tous les déclencheurs Cloud,
  Storage API réelle, envoi réel et atomicité émission de lien/file courriel, proxy du quota,
  autorisations de réception EXEC-02. Causes et manipulations minimales :
  `prepared/exec01b/activation-checklist.md`.

Les 121 empreintes des fonctions actives sont identiques avant/après; aucun déploiement,
migration publique, changement de permission, envoi, génération ou synchronisation.
EXEC-01 **n'est pas déclaré terminé** : adapté aux structures inspectées et testé localement,
mais activation hébergée et garantie transactionnelle du courriel encore requises.

## Complément EXEC-01B
Serveur local PostgreSQL 17.9 + HTTP Bun réellement exécuté, base vide distincte et contacts fictifs seulement. Détails techniques et limites : `prepared/exec01b/README.md`. SQL transactionnel, liens/code hachés, actions et historique du même dossier local, hook de confirmation et entrée Cloud préparés. Aucun changement des fonctions actives ni du serveur partagé.

Parcours Playwright à 1280 px puis 360 px : demande fictive créée → confirmation capturée → lien sans fuite du fragment → code aléatoire capturé → restant 750 à 600 m³ → même dossier CRM local → pause/reprise → révocation et lecture refusée (403). Double clic : un événement; trois événements avant révocation; aucune erreur JS ni débordement mobile. Captures inspectées dans `/tmp/browser/exec01b/{portal-desktop,portal-mobile,crm,email-redacted}.png`, preuves sans jeton dans `results.json`. Courriel **capturé en test**, pas envoyé réellement.

Les tests ciblés SQL ont été exécutés avec `EXEC01B_LOCAL_TEST=1` : **40 tests réussis, 3 fichiers, aucun échec** (14 SQL/endpoint EXEC-01B, 4 handler, 22 règles de domaine EXEC-01). Journal : `/tmp/exec01b/final-tests.log`. Les 121 fichiers sous `supabase/functions` ont conservé leurs empreintes SHA-256. La validation Cloud/JWT/PostgREST et les raccordements prestataire/propositions/livraisons/photos réelles restent non vérifiés; la base fixture n'est pas le schéma complet de production. Ne pas présenter ce lot comme une activation CRM Cloud terminée.

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

## Suite EXEC-02 (19 octobre 2026)
Coordination/réservations développées et validées localement : 20 tests ciblés, navigateur trois modes et même dossier CRM. Activation hébergée désactivée; branchement courriel géré, mesures voyages, scheduler et proxy restent à activer. Bilan et preuves : [EXEC-02](exec02-bilan.md). Les limites historiques ci-dessus restent des constats de leurs lots, pas un bilan de l’activation actuelle.
