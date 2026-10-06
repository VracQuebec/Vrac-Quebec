# Espace Entrepreneur — audit et proposition premium

## Périmètre
Refonte de présentation uniquement, en TEST et sans publication. Aucun changement aux données, à l’authentification, aux rôles, aux permissions, aux règles RLS, aux calculs, aux formulaires ou à la logique de Ma flotte. Toutes les fonctions existantes restent accessibles.

## Audit en lecture seule : résultats

| Élément | Constat | Conséquence |
|---|---|---|
| Accueil | Entreprise répétée dans l’en-tête et le salut; phrase introductive peu utile | Hiérarchie diluée |
| Actions | Bouton vert pleine largeur, raccourcis volumineux, création également accessible par bouton flottant | Actions répétées et poids visuel excessif |
| Chantiers | Cartes hautes, adresse tronquée, statut occupant une colonne étroite | Le lieu principal se lit mal; peu de dossiers visibles |
| À traiter | Notifications non lues et actions de dossiers présentées ensemble | Une notification non lue ne prouve pas une action nécessaire |
| En-tête iPhone | Aucune prise en compte de la zone sécuritaire supérieure dans l’en-tête entrepreneur | Risque cohérent avec le masquage signalé en application installée |
| Menu Plus | Nombreux liens, descriptions répétées, contenu de 1 449 px dans une fenêtre de 851 px | Beaucoup de défilement; catégories essentielles peu immédiates |
| Ordinateur | Navigation latérale plus haute que la fenêtre observée | Derniers accès à vérifier et défilement à rendre explicite |
| Pages spécialisées | Finances possède 13 onglets; détails chantier avec plusieurs vues; carte avec positionnement supérieur fixe | Présentation dense et positions à harmoniser sans changer le fonctionnement |

**Vérifications réalisées :** accueil à 360 × 740, 393 × 852, 430 × 932, 768 × 1024, 1440 × 900 et 852 × 393; ouverture de Plus, Chantiers, Demandes, Transports et Notifications. Aucun débordement horizontal ni erreur JavaScript relevé dans ces parcours. En-tête de 65 à 69,5 px; navigation inférieure de 57 px.

**Limites importantes :** un contenu plus haut que sa fenêtre n’est pas, à lui seul, une preuve de débordement incontrôlé : Plus est actuellement défilant. L’émulation navigateur ne reproduit pas une vraie Dynamic Island ni les valeurs de zones sécuritaires d’un iPhone installé; leur validation physique reste nécessaire. Les essais n’établissent pas que toutes les fenêtres de toutes les pages sont exemptes de chevauchement.

## Nouvelle structure proposée

### Accueil
1. En-tête compact : Vrac Québec, notifications et accès au compte; entreprise affichée une seule fois dans le salut.
2. Quatre raccourcis courts sur une rangée : **Demande · Dompes · Transport · Matériaux**. Icônes et labels, surfaces neutres, vert limité à l’action principale. Les parcours existants sont réutilisés.
3. **Activité récente** : quelques dossiers réellement disponibles, présentés en lignes cliquables compactes; date d’activité existante, aucun événement inventé.
4. **À faire** : uniquement lorsqu’une action est effectivement requise selon les informations existantes. Les notifications non lues restent dans la cloche, sans devenir des urgences.
5. Accès textuels **Mes chantiers** et **Mes demandes**, sans nouveaux gros boutons.

### Chantiers et demandes
- Aperçu simple : lieu ou nom existant, matériau et quantité lorsqu’ils sont connus, petit statut lisible, référence si disponible.
- Adresse autorisée sur deux lignes plutôt que comprimée par un gros badge.
- Ligne entière cliquable; toutes les informations et actions actuelles conservées dans le détail.
- Ne pas inventer une unité, une adresse précise, une référence ou un statut; conserver les indications d’ambiguïté et de provenance existantes.

### Navigation
- Téléphone : **Accueil · Chantiers · Dompes · Transport · Plus**, cinq entrées maximum; icône et texte sélectionnés en vert, pas de grand fond vert.
- Tablette : même organisation, adaptée à la place disponible et à l’orientation.
- Ordinateur : navigation latérale regroupée et défilante, contenu à largeur maîtrisée; ne pas étirer les lignes sur tout l’écran.
- Création de demande accessible sans répétition simultanée de trois commandes dominantes.

### Menu Plus
| Groupe | Fonctions existantes |
|---|---|
| Travail et équipe | Tâches, Agenda, Punch et heures, Activités / coupons / voyages / services |
| Gestion | Mes demandes, Mon CRM, Finances, Notes de frais, Documents, Brouillons, Obligations et renouvellements, Assurances |
| Mon entreprise et compte | Profil et visibilité via le compte existant, Ma flotte, Notifications, Déconnexion |

Les liens existants non cités seront conservés dans le groupe approprié. Aucun nouvel écran Préférences ou Aide ne sera inventé. Les accès conditionnels conserveront leurs conditions actuelles.

## Direction visuelle proposée
**Lignes nettes, surfaces neutres et vert d’accent.** Conserver les polices sans serif de Vrac Québec; réduire les graisses répétées, les ombres, les grands arrondis et les espaces superflus. Sections sans cartes décoratives; petites surfaces uniquement pour les éléments individuels ou les fenêtres. Zones tactiles d’au moins 44 px, malgré des icônes et actions visuellement compactes. Feedback discret, sans animation décorative.

## Composants conservés
- Coquille entrepreneur et navigation existantes, retravaillées plutôt que remplacées par un second système.
- Fournisseur partagé de données, notifications, calculs de statut et regroupements explicites actuels.
- Boutons, fenêtres, feuilles mobiles, états de chargement / erreur / vide existants.
- Registre Ma flotte, relations entreprise–véhicules et permissions strictement inchangés.
- Tous les écrans spécialisés, fonctionnalités et parcours existants.

## Détails techniques de présentation
- Donner à la coquille entrepreneur la responsabilité unique des zones sécuritaires haute, basse et latérales; éviter les doubles compensations.
- Employer `100dvh` et des hauteurs maximales adaptées au viewport pour les feuilles et fenêtres, y compris en paysage.
- Harmoniser la hauteur réelle de l’en-tête et les positions collantes des pages internes, notamment la carte; supprimer les offsets arbitraires dans ce périmètre.
- Organiser les couches : contenu, en-tête / navigation, fond modal, fenêtre / feuille. Vérifier les contextes créés par les conteneurs, transformations et défilements.
- Réserver au contenu la hauteur réellement occupée par la navigation basse, zone sécuritaire incluse; garder la fin des listes et les actions accessibles.
- Limiter les changements des composants globaux afin de ne pas affecter le Super Admin.
- Aucune bibliothèque lourde ni requête supplémentaire pour remplir le design.

## Validation après approbation
- Petit téléphone, téléphone standard, iPhone à encoche simulée, tablette et ordinateur; portrait et paysage pertinents.
- Ouverture, navigation, défilement, retour, Plus, compte, chantiers, demandes, dompes, transport et accès Ma flotte.
- Fenêtres et feuilles existantes, fermeture, focus clavier, zones tactiles, longs textes, données absentes et états vides.
- Vérifier visuellement **en-tête → contenu → navigation basse**, avec valeurs de zones sécuritaires simulées et captures avant/après.
- Vérifier que le Super Admin reste inchangé et qu’aucun fichier métier ou donnée n’a été modifié.
- Fournir les résultats et distinguer les tests navigateur de la vérification sur iPhone réel.

## Décision attendue
Approuver cette structure avant toute implémentation. Aucune modification de l’application ou des données n’a été effectuée pendant l’audit.