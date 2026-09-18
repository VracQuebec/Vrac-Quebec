# Correctif mobile — Entrepreneurs du CRM

## Résultat attendu
- Réserver la section existante aux super administrateurs, sans modifier les données ni les règles métier.
- Afficher des cartes lisibles sous 768 px et conserver un tableau lisible sur ordinateur.
- Placer la liste avant l’historique de visibilité, replié par défaut.
- Ajouter recherche globale, tris, filtres de statut/visibilité et pagination avec critères conservés dans l’URL.
- Conserver la fiche et toutes les actions existantes; rendre téléphone et courriel cliquables.

## Mise en œuvre
- Étendre uniquement les champs déjà disponibles dans les données entrepreneurs (ville, visibilité réseau, types de camions).
- Construire une liste unique filtrée et triée avant pagination, utilisée à la fois par les cartes et le tableau.
- Ajouter des contrôles tactiles, un état sans résultat et une pagination stable.
- Clarifier l’historique : entreprise, ancien état → nouvel état, date, auteur, identifiants dans les détails.
- Employer les composants de boutons existants et supprimer tout risque de débordement horizontal.

## Vérification
- Tester 360, 390, 430, 768 et 1440 px.
- Vérifier texte long, données absentes, badges, recherche sans résultat, pagination et ouverture de fiche.
- Capturer une vue mobile et une vue ordinateur en prévisualisation.
- Ne pas publier en production.
