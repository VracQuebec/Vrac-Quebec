# Refonte finale du portail entrepreneur — espace de travail par chantier

## Objectif

Transformer le portail en outil de gestion de chantiers cohérent, où demandes, dompes, transports et activité restent reliés au même dossier, sans modifier le moteur de dompes ni aucune règle métier ou de sécurité.

La navigation principale reste : **Accueil · Demandes · Dompes · Transports · Mon entreprise · Notifications**. Les chantiers deviennent le fil conducteur de ces pages, sans créer de nouvelle structure de données.

## Expérience cible

```text
Accueil
├── Nouvelle demande et actions rapides
├── Mes chantiers actifs
└── À traiter

Chantier
├── Résumé réel : lieu, matériau, quantité, date, statut
├── Demandes
├── Dompes et décisions propres à chaque demande
├── Transports associés
└── Activité disponible

Demandes / Dompes / Transports
└── Chaque élément conserve un lien clair vers son chantier
```

## Mise en œuvre

### 1. Fondation de présentation centrée chantier

- Enrichir la vue calculée existante des chantiers avec des résumés uniquement dérivés des demandes déjà chargées : matériau principal, quantité, nombre de demandes, statut et dernière activité.
- Ajouter des fonctions d’association côté interface pour retrouver le chantier d’une demande et rapprocher un transport d’un chantier avec les identifiants existants lorsque disponibles, puis avec le rapprochement prudent déjà utilisé.
- Ne jamais fusionner deux chantiers sur une simple proximité géographique; conserver les clés fiables actuelles.
- Centraliser les libellés et liens afin que l’accueil, les listes et les détails présentent les mêmes informations.

### 2. Accueil comme centre de pilotage

- Conserver le salut avec le nom réel de l’entreprise et l’action dominante « Nouvelle demande ».
- Garder les trois actions rapides demandées : trouver une dompe, demander du transport, voir les demandes.
- Remplacer « Demandes récentes » et les compteurs administratifs par « Mes chantiers », avec cartes compactes montrant lieu, matériau, quantité, nombre de demandes, statut et dernière activité.
- Afficher d’abord les chantiers actifs et offrir un accès à tous les chantiers.
- Limiter « À traiter » aux états et notifications qui nécessitent réellement une action, avec lien direct vers le bon dossier.
- Garder l’installation de l’application comme bloc secondaire; son comportement actuel masque déjà le bloc après installation ou « Plus tard ».

### 3. Dossier chantier complet

- Recomposer le détail du chantier autour d’un en-tête opérationnel et de quatre sections cliquables : Demande, Dompe, Transport, Activité.
- Montrer uniquement les valeurs existantes : matériau, quantité, adresse/zone du chantier, date, statut et événements réels.
- Ouvrir la demande exacte, la recherche contextualisée, le transport associé ou l’activité depuis chaque section.
- Réutiliser les décisions par dompe et la divulgation progressive existantes; une adresse réelle de dompe ne sera rendue que si la réponse sécurisée l’autorise déjà.
- Préremplir les nouvelles actions depuis le chantier actif sans créer de nouvelle logique métier.

### 4. Demandes et transports reliés au chantier

- Transformer les cartes de demandes pour afficher explicitement « Chantier — lieu », service, matériau, quantité, date, statut et action « Voir le dossier ».
- Conserver les filtres Toutes, En cours, En attente, Terminées et Annulées.
- Ajouter dans le détail d’une demande un lien de retour vers son chantier calculé.
- Présenter les transports avec leur chantier, type, camion, date et statut lorsque ces données existent réellement.
- Pour l’état vide, afficher l’appel demandé vers une demande de transport contextualisée au chantier actif.
- Ne pas inventer un lien pour les anciens transports lorsqu’aucune donnée existante ne permet une association fiable; ils restent visibles comme dossiers indépendants.

### 5. Dompes et comparateur contextualisés

- Conserver strictement `getEligibleEntrepreneurDumpSites()` comme source unique et ne modifier ni son admissibilité, ni ses résultats, ni ses données géographiques.
- Lorsque le chantier actif possède une position, centrer d’abord la carte sur sa zone et présenter la recherche comme « Dompes compatibles avec votre chantier ».
- Appliquer par défaut le matériau du chantier comme contexte visuel/filtre modifiable, sans transformer la disponibilité en critère d’admissibilité.
- Ajouter un mode explicite « Voir toutes les dompes » qui restitue la vue provinciale actuelle.
- Proposer les tris Distance routière, Compatibilité et Disponibilité seulement lorsque leurs données sont réellement disponibles; un tri ne supprimera jamais une dompe admissible.
- Recomposer le comparateur avec un résumé lisible du chantier, de l’adresse, du matériau, du camion et de la quantité; les informations manquantes seront demandées en langage simple.
- Conserver les calculs, la sélection, les positions publiques et le workflow d’accès existants inchangés.

### 6. Mon entreprise et notifications

- Réorganiser « Mon entreprise » en trois sections nettes : Informations privées, Profil public, Visibilité.
- Afficher uniquement les champs réellement pris en charge aujourd’hui; aucun logo, service, secteur ou description ne sera inventé si la source actuelle ne les fournit pas.
- Maintenir l’adresse complète exclusivement dans la zone privée et conserver la localisation publique limitée déjà calculée.
- Renforcer les liens des notifications pour ouvrir le dossier de demande ou de chantier correspondant lorsque l’identifiant existe; sinon conserver leur destination actuelle sûre.

### 7. Direction visuelle et formats d’écran

- Conserver les couleurs, composants et typographies Vrac Québec.
- Réduire les cartes décoratives et les grands espaces au profit de rangées d’information compactes, statuts lisibles et actions proches du contexte.
- Conserver la barre latérale sur iPad paysage et ordinateur.
- Garder une navigation inférieure compacte sur téléphone et tablette portrait.
- Vérifier les textes longs, les listes, la carte et les onglets sans défilement horizontal.

## Invariants non négociables

- Aucun changement de base de données, migration, règle d’accès, fonction serveur ou statut.
- Aucun changement au moteur de dompes, à sa source unique, à l’admissibilité « en attente de livraison » ou au traitement de la disponibilité.
- Aucun changement aux positions publiques/réelles, à l’anonymisation, au rayon, à la carte administrateur ou au moteur de recommandation.
- Aucun changement au workflow d’approbation par dompe, aux notifications serveur ou à la révocation d’accès.
- Aucune adresse/coordonnée réelle de dompe affichée ou reçue avant autorisation serveur.
- Aucun reclassement des demandes historiques, aucune donnée inventée, aucun changement SEO ou publication automatique.

## Validation

- Ajouter des tests de présentation pour les résumés de chantier, associations demande/chantier, filtres et liens contextuels.
- Vérifier les types et exécuter la suite complète de tests, notamment les tests du moteur unique et des décisions par dompe.
- Avec une session entrepreneur réelle, vérifier : création d’une demande, retour depuis l’accueil, ouverture du chantier, recherche de dompe, demande d’accès, transport, notifications et profil.
- Vérifier avant/après approbation que l’adresse réelle de la dompe suit exclusivement la réponse sécurisée existante, puis que le retrait la masque de nouveau.
- Inspecter les requêtes réseau de la carte, du comparateur et des dossiers pour confirmer l’absence de coordonnées/adresses réelles avant approbation.
- Contrôler visuellement iPhone, Android équivalent, iPad portrait/paysage et ordinateur, sans débordement horizontal.
- Fournir un rapport final séparant clairement les changements UX, les invariants non touchés, les tests réels et les limites dues aux données existantes.
