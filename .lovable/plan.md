# Phase 3A — correction du flux chantiers / demandes

## Objectif
Corriger uniquement la représentation calculée du parcours entrepreneur, sans migration, écriture, changement de sécurité, route, carte, transport ou voyage.

## Mise en œuvre
1. **Centraliser les règles d’affichage**
   - Normaliser uniquement en mémoire les statuts réellement présents, y compris accents, espaces et anciennes formes techniques.
   - Distinguer clairement : nouvelle, en traitement, active/confirmée, en attente d’exécution et fermée sans appeler « terminé » un dossier archivé ou perdu.
   - Afficher « Sens à confirmer » quand matériau ou quantité existe mais que la direction manque; afficher « Informations à compléter » lorsque les renseignements essentiels manquent réellement.

2. **Calculer le parcours sans écrire en base**
   - Produire l’étape la plus avancée prouvée par la demande, le site sélectionné/validé et le transport explicitement lié.
   - Ordre affiché : Demande → Recherche de solution → Site choisi → Transport → Exécution.
   - Garder une étape neutre quand aucune relation existante ne permet de conclure; ne pas déclarer de voyage ou d’exécution sans preuve déjà accessible.

3. **Appliquer ces règles aux écrans existants**
   - Harmoniser la liste des chantiers, l’accueil, la liste des demandes et les détails chantier/demande.
   - Conserver référence, matériau, quantité, adresse, ville, date, état, direction et site lorsqu’ils existent.
   - Afficher les relations demande ↔ site et demande ↔ transport déjà chargées; ne créer ni recopier aucune relation.

4. **Réutiliser la lecture commune existante**
   - Brancher les anciens modules entrepreneur encore actifs sur le fournisseur commun déjà en place lorsque leur écran est sous ce fournisseur.
   - Garder leurs fonctions de chargement autonomes pour les usages/tests hors fournisseur, sans modifier les fonctions serveur.
   - Éviter les nouveaux appels individuels de transport quand la relation est déjà présente dans la lecture commune.

## Validation
- Ajouter des tests unitaires couvrant : direction vide/connue, informations absentes, les sept statuts demandés, site présent/absent, transport présent/absent et absence de preuve de voyage.
- Vérifier qu’ouvrir les écrans n’émet aucune écriture.
- Tester les parcours réels en 393×852, 320×667 et desktop : listes, détails, relations, défilement et absence de débordement.
- Contrôler les tests ciblés, les tests existants et l’état de compilation.

## Limites maintenues
- Aucun changement de données, table, migration, RLS, permission, authentification, route ou fonction serveur.
- Aucun changement aux tables ou à la logique des voyages, à la logique de transport, à la carte des dompes, ni au design général de l’accueil.
- Aucune publication.
