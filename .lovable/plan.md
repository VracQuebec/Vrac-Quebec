# Phase 5F — Génération contrôlée des 35 pages SEO P2

## Objectif
Créer uniquement les 35 pages P2 déjà autorisées dans le rapport 5D, toutes en brouillon, avec le même niveau d’exactitude, de différenciation et de validation visuelle que les 10 P1. Ne publier aucune page et ne toucher ni aux P1, ni aux 16 pages « À valider », ni aux données opérationnelles.

## Périmètre verrouillé
- Reprendre mot pour mot la liste des 35 URL de la section « P2 (35) » du rapport 5D; elles sont toutes de type **remblai**.
- Avant chaque création, confirmer que l’URL exacte et une intention équivalente sont toujours absentes, et qu’aucune page protégée n’est concernée.
- En cas de conflit ou d’incertitude, ne pas créer la page et l’inscrire « à revoir » dans le rapport.
- Exclure explicitement les 16 pages « À valider », les 10 P1, toute nouvelle combinaison et toute page de transport, livraison, courtage ou point de dépôt.

## Création des brouillons
- Extraire en lecture seule, ville par ville, uniquement les faits non personnels déjà enregistrés : type de besoin, projet décrit, matériaux, contraintes d’accès ou de terrain et contexte territorial validé.
- Rédiger une introduction, des sections, une FAQ et un appel à l’action propres à chaque ville, centrés sur la recherche d’une solution de remblai ou d’un site pouvant recevoir le matériau.
- Garder les pages concises lorsque les données sont minces; ne viser aucun nombre minimal de mots.
- Ne citer aucun client, adresse, entreprise, fournisseur, prix, distance, délai, volume, capacité, disponibilité, transport, livraison, partenaire ou statistique locale non validée.
- Créer chaque fiche avec le statut `draft`, `published_at` vide, `noindex` activé et un repère de lot `phase5f-p2`.

## SEO et différenciation
- Produire pour chaque page une URL, un title, une meta description et un H1 uniques; conserver la canonical automatique exacte `https://vracquebec.ca/<slug>`.
- Ajouter uniquement des liens internes pertinents et déjà publiés : page dompe distincte, page ville ou matériau utile, ressources générales et demande de recherche.
- Vérifier chaque destination et préserver la distinction entre « remblai » et « dompe » sans modifier les pages dompe.
- Mesurer la similarité sur l’introduction et le contenu principal entre les 35 P2, puis contre les 10 P1. Réécrire tout texte trop proche avant enregistrement; documenter le maximum final.
- Contrôler l’absence des promesses interdites liées au transport, à la livraison, à la disponibilité ou à une desserte garantie.

## Validation réelle
- Vérifier en base : 35 brouillons au maximum, aucun publié, aucune URL en double, titles/metas/H1 uniques, FAQ et liens valides, P1 inchangées.
- Prévisualiser chaque brouillon dans le véritable gabarit public sans changer son statut, à 1280 × 1800 et 390 × 844.
- Pour chaque page, confirmer H1, sections, FAQ, appel à l’action, liens, espacement, absence de bloc vide, texte coupé ou erreur de rendu.
- Vérifier ensuite que le site public, son sitemap et son maillage ne rendent aucune des nouvelles pages accessible ou indexable.

## Rapport et arrêt
- Créer `docs/audit/phase5f-generation-p2.md` avec le tableau demandé pour les 35 candidates, y compris les éventuelles exclusions et leur motif.
- Donner les totaux créés/non créés, la similarité maximale, le nombre à réviser et les confirmations d’absence de publication et de modification opérationnelle.
- Arrêter après cette phase, sans traiter les 16 pages « À valider » et sans publier.

## Détails techniques
- Aucune migration, nouvelle table, permission, règle d’accès ou modification de code métier.
- Les seules écritures autorisées sont les nouvelles fiches `seo_pages` P2 et le rapport d’audit.
- L’aperçu des brouillons utilisera une interception locale de leur lecture dans le navigateur; leur statut restera inchangé.
