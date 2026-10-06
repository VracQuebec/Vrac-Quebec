# Refonte de l’Espace Entrepreneur — validation TEST

## Présentation livrée
- Accueil centré sur l’entreprise, quatre raccourcis, les dossiers récents et une section « À faire » conditionnelle.
- Aucune notification non lue ni attente de réponse d’une dompe n’est présentée comme une tâche à accomplir.
- Les dossiers clos et annulés ne sont pas présentés dans « À faire ».
- Navigation mobile conservée à cinq entrées; fonctions secondaires regroupées dans Plus, sans suppression des accès existants.
- En-tête compact, zones sécuritaires haut/bas et latérales, viewport dynamique; navigation desktop défilante séparément.
- Cartes et statuts compacts, filtres neutres; sélecteur Finances sur téléphone conservant les treize sections.
- Installation toujours accessible dans Plus; flotte inchangée fonctionnellement, ajustement de grille sur les plus petits écrans uniquement.

## Vérifications effectuées
| Vérification | Résultat |
|---|---|
| Accueil 360×740, 393×852, 430×932 | Pas de débordement horizontal |
| Tablette 768×1024 | Navigation et contenu contenus dans la largeur |
| Ordinateur 1440×900 | Navigation latérale et activité chargée; pas de débordement |
| Paysage 852×393 | Header et navigation persistants; contenu défilant |
| Chantiers, demandes, transports, notifications | Pages ouvertes avec session existante; pas d’erreur JavaScript observée |
| Ouverture d’une fiche chantier | Fiche ouverte; pas de débordement |
| Recherche de dompes | Page et carte affichées sans erreur JavaScript |
| Menu Plus | Hauteur bornée au viewport; contenu défilant, fermeture accessible après défilement |
| Simulation zones iPhone haut 59 px / bas 34 px | Header déplacé sous la zone simulée; réserve inférieure 106 px |
| Défilement au bas, zones simulées | Bas du contenu 745,25 px; haut de la navigation 761 px: contenu dégagé |
| Tests de non-régression | 32 tests réussis: chantiers, demandes entrepreneur, activité et Finances |
| Compilation observée | Dernier signal disponible « build OK » |

## Garde-fous
Aucun fichier backend, migration, table, rôle, permission, règle RLS ou donnée CRM modifié pour cette refonte. Aucune nouvelle bibliothèque ajoutée. Aucun calcul ni algorithme de recherche modifié. Les tests navigateur bloquent les écritures et n’ont enregistré aucune donnée. Une session de contrôle a été créée pour le compte du demandeur, sans changer ses droits.

La présentation conditionnelle de l’accueil réutilise les libellés et états des demandes existantes; les champs absents ne sont pas remplis par des valeurs fictives. Aucune fusion de dossiers.

## Limites explicites
Les dimensions iPhone et les zones sécuritaires ont été simulées dans Chromium, pas vérifiées dans Safari sur un iPhone physique en PWA installée. Les interactions clavier système et Dynamic Island réelles restent à confirmer sur appareil. Les fenêtres métier Finances et flotte n’ont pas été ouvertes avec enregistrement de données; leur logique et leurs autorisations sont conservées. La navigation de tous les modules secondaires n’a pas fait l’objet d’une validation fonctionnelle exhaustive.

Rien publié.