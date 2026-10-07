# Phase 3A — Flux Chantiers / Demandes

## A. Périmètre appliqué

- Correction d'affichage seulement, sans migration ni modification du backend.
- Aucune donnée, table, permission, rôle, règle d'accès, authentification, route, carte ou logique métier de transport/voyage modifiée.
- Les pages actives réutilisent toujours le fournisseur entrepreneur commun.

## B. Sens du besoin

- `recevoir`, `évacuer` et `acheter/livrer` restent distincts.
- Aucun sens n'est déduit du seul type `remblai`, du matériau, de la quantité ou de la localisation.
- Si le sens est inconnu mais qu'un matériau ou une quantité existe : **Sens à confirmer**.
- Si le sens, le matériau et la quantité sont absents : **Informations à compléter**.
- Seule une évacuation explicitement établie déclenche la recherche de dompe.

## C. États affichés

- Les variantes réelles avec accents et espaces sont normalisées pour l'affichage seulement.
- Les valeurs observées comme `nouveau`, `soumission envoyée`, `soumission acceptée`, `paiement effectué`, `en attente de livraison`, `archivé` et `perdu` ont un libellé et un classement explicites.
- `archivé`, `perdu`, `annulé` et `refusé` apparaissent comme dossiers fermés; ils ne sont jamais renommés « Terminé ».
- Un état inconnu conserve son texte source et reste « à confirmer », sans être inventé.

## D. Étape visible du parcours

L'étape est calculée en lecture seule depuis les preuves déjà autorisées :

1. demande créée;
2. recherche de solution;
3. site choisi ou validé;
4. transport explicitement lié;
5. exécution seulement si le transport lié est réellement `en_cours`;
6. dossier fermé avec son vrai motif.

Une adresse semblable, une ville, un matériau ou des coordonnées ne créent aucun lien. Aucun voyage n'est déclaré lié à un transport, car cette relation n'existe pas dans les données disponibles. L'écran indique donc que l'information de voyage n'est pas disponible dans ce suivi plutôt que d'affirmer « aucun voyage ».

## E. Lectures et duplications

- Demandes et transports continuent d'être chargés une fois dans le fournisseur commun des pages entrepreneur.
- La fiche demande transmet maintenant le transport déjà chargé au bloc de détail, ce qui évite une seconde consultation du même lien.
- Les anciens composants non routés n'ont pas été refactorisés ni supprimés.

## F. Sécurité et absence d'écriture

- Aucun nouvel appel d'écriture n'a été ajouté.
- Vérification authentifiée avec un compte existant : uniquement les consultations RPC et tables déjà utilisées; aucune écriture REST, aucune fonction métier d'écriture et aucune soumission de formulaire.
- Aucune donnée de test créée ou nettoyée.

## G. Validation

- Tests ciblés : 70 réussis sur 70.
- Suite complète : 1 832 réussis, 13 ignorés préexistants, aucun échec.
- Vérification de types : réussie.
- Compilation automatique : réussie.
- Rendu authentifié vérifié sur 393×852, 320×667 et 1440×1000 : liste et fiche accessibles, libellé de sens visible, aucun débordement horizontal.
- Les avertissements d'accessibilité de boîtes de dialogue financières apparaissant dans la suite complète sont préexistants et hors périmètre.

## H. Résultat et limites

- Le parcours affiché s'arrête au niveau maximal réellement prouvé par demande, site et transport explicite.
- Aucun rattachement de voyage supplémentaire n'est tenté.
- Aucun test croisé entreprise A/B n'a été exécuté, cette phase ne changeant pas l'isolation ni les règles d'accès.
- Environnement TEST uniquement. Publication : NON.