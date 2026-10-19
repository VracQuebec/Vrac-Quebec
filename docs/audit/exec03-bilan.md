# EXEC-03 — secteurs et économies (19 octobre 2026)

## Livré dans le projet, non publié
- Même recherche `/entrepreneur/carte` : sélection de plusieurs villes/régions,
  rayon autour d’un chantier validé, polygone dessiné/éditable Google, Tout le Québec,
  filtres partagés par la liste et les marqueurs. Coordonnées et numéros existants préservés.
- Même `/entrepreneur/comparateur` : chantier d’origine, secteur mémorisé, filtres
  matériau/camion/disponibilité existants; distances et minutes inconnues à confirmer.
  Compatibilité de recherche n’est ni proposition acceptée ni réception autorisée.
- Simulation A/B exportable PDF : voyages totaux, aller, retour, attente par voyage,
  taux avec source/inclusions, frais totaux et différence B−A. Sources/dates/hypothèses
  conservées; modification manuelle d’une durée retire son attribution Google.
  Heures libérées, brut et net estimés; mesure réelle inconnue, aucune garantie.
- Préférences par utilisateur/entreprise : SQL préparé, membership actif vérifié,
  validation serveur complète; aucun double CRM ni nouvelle demande.
- Adaptateur serveur préparé (JWT approuvé, Routes et Places New via connexion
  existante); activation désactivée. Aucun fichier sous fonctions actives modifié.

## Vérifié réellement
- **17/17 tests ciblés** : villes/régions, frontière du polygone, rayon/changement
  d’origine, routes inconnues, cache/déduplication, 600 $ bruts et 350 $ nets après
  250 $ différentiels, entrée non authentifiée/origine refusée, même handler Cloud/local,
  préférences persistantes, entreprise/autre utilisateur refusés, membership révoqué,
  GET sans mutation et RPC direct malformé rejeté; polygone persistant.
- PostgreSQL isolé 17.9, base vide aléatoire, HTTP loopback Bun; même SQL de préférences
  préparé, uniquement utilisateurs/entreprises/chantiers/sites fictifs.
- Navigateur : deux villes sauvées → déconnexion/reconnexion → deux villes restaurées;
  rayon 2 km puis chantier Québec/Lévis; comparaison réelle lancée, deux résultats
  conservés avec « Distance à confirmer »; 12 × 20 ÷ 60 × 150 = **600 $**, **4 h**;
  serveur local relit ce calcul; export PDF téléchargé.
- 1280×1800 et 393×852 : captures inspectées, aucune erreur JavaScript ou débordement;
  **zéro tentative réseau externe** dans le parcours final (restriction locale avant React).
- Compilation/typecheck aperçu : dernier journal build OK; entrée serveur préparée
  vérifiée par Deno après empaquetage. Anciennes suites EXEC-01/02 non rejouées.

## Captures et reproduction
- [Secteurs ordinateur](exec03-preuves/sectors-desktop.png)
- [Rayon ordinateur](exec03-preuves/radius-desktop.png)
- [Secteur téléphone](exec03-preuves/sectors-mobile.png)
- [Économies téléphone](exec03-preuves/savings-mobile.png)
- [Économies ordinateur](exec03-preuves/savings-desktop.png)
- Script reproductible : `prepared/exec03/check_search.py`; instructions `prepared/exec03/README.md`.
  Paramètre local uniquement sur localhost : `?exec03=local`; session serveur obligatoire.
  Ce mode ne fonctionne pas sur la prévisualisation Cloud partagée.

## Schéma inspecté et seules validations d’activation
Métadonnées Cloud consultées **sans données personnelles** : get_entrepreneur_leads,
get_public_dumps, entcrm_role, signature is_approved_entrepreneur(_uid uuid), colonnes
submissions.city et jsc_company_members/company. Les résultats actuels exposent les
coordonnées publiques anonymisées mais **pas la ville** : search-sites.sql prépare cette
extension autorisée; elle n’est pas appliquée ni vérifiée en Cloud.

1. **Cloud isolé autorisé** : nécessaire pour appliquer preferences.sql/search-sites.sql
   et tester JWT/PostgREST/RLS/membership/visibilité réelle. Aucune écriture sur le serveur public.
2. **Google rendu, dessin, géocodage et routes** : non vérifiés, conformément aux limites
   du sandbox. Valider sur une origine déployée autorisée lors d’une activation séparée.
   Géocodage libre indisponible actuellement; le rayon utilise un chantier aux coordonnées
   validées. Région du référentiel partiel, pas une couverture municipale exhaustive.
3. **Installation autorisée du serveur préparé** : empaqueter entrepreneur-search,
   reprendre la connexion existante, vérifier coût et origine, puis retirer les verrous.
   Routes DRIVE ne certifie jamais camion lourd; adresses anonymisées rendent les durées
   approximatives. Cache et 25 candidates sont présents; fournisseur réel non appelé.
4. **Coordination détaillée** : exigences documentaires, mélange, quantités et fenêtres
   restent le contrôle transactionnel EXEC-02 au moment de proposer/réserver, pas un
   accord délivré par la recherche. Les validations Cloud EXEC-01/02 restent inchangées.

Aucune publication, migration partagée, communication à un contact réel, ni dépense.
Code réalisé et essais locaux distingués des fournisseurs/activation non vérifiés.