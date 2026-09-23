# Refonte du portail entrepreneur — une demande = un dossier

## Objectif

Transformer l’espace entrepreneur en application opérationnelle centrée sur les demandes, sans modifier le moteur de dompes, la géolocalisation, les approbations, les permissions, les données existantes ni le SEO.

La navigation principale devient : **Accueil · Mes demandes · Trouver une dompe · Transports · Mon entreprise · Notifications**. Les chantiers restent un regroupement secondaire des demandes. L’historique est absorbé par les filtres de « Mes demandes ».

## Architecture cible

```text
Accueil
├── Résumé des demandes
├── À traiter
├── Demandes récentes
└── Actions rapides

Mes demandes
├── Toutes / En cours / En attente / Terminées / Annulées
└── Dossier d’une demande
    ├── Chantier et besoin
    ├── Dompes demandées, chacune avec sa décision
    ├── Transports associés
    └── Activité réelle disponible

Trouver une dompe
├── Informations du chantier
├── Matériau, quantité et camion
├── Carte + liste synchronisées
├── Comparaison des mêmes résultats
└── Sélection / demande d’accès

Transports
├── Nouvelle demande de transport
├── Demandes en cours
├── Soumissions réellement disponibles
└── Dossiers terminés

Mon entreprise
├── Informations privées
├── Profil public
└── Visibilité activée / désactivée

Notifications
└── Chaque avis ouvre directement le dossier concerné
```

## Mise en œuvre

### 1. Navigation et structure

- Simplifier la barre latérale ordinateur et la barre inférieure mobile autour des six sections finales.
- Garder toutes les anciennes adresses fonctionnelles :
  - `/entrepreneur/historique` redirige vers le filtre approprié de « Mes demandes ».
  - `/entrepreneur/comparateur` reste accessible, mais devient l’étape de comparaison du parcours « Trouver une dompe ».
  - `/entrepreneur/chantiers` et ses détails restent accessibles comme vues secondaires de regroupement.
- Ajouter `/entrepreneur/demandes/:id` pour ouvrir un dossier précis.
- Ajouter `/entrepreneur/transports` comme vue dédiée des données de transport déjà disponibles.

### 2. Modèle de présentation partagé

- Construire côté interface une vue unifiée des demandes existantes, sans nouvelle table ni écriture de données.
- Normaliser uniquement l’affichage des statuts : en attente, en cours, terminée, annulée ou refusée.
- Relier chaque carte à son dossier exact plutôt qu’à une page générique.
- Centraliser les compteurs, filtres et cartes afin que l’accueil, la liste et les chantiers montrent les mêmes informations.

### 3. Nouvel accueil professionnel

- Saluer avec le nom de l’entreprise.
- Afficher les compteurs « En cours », « En attente » et « Terminées ».
- Construire « À traiter » à partir des notifications et états réels, avec liens directs vers les dossiers.
- Remplacer « Rien ne vous attend » par l’état positif demandé : « Tout est à jour ».
- Afficher les demandes récentes sous forme de dossiers informatifs.
- Proposer quatre actions nettes : Nouvelle demande, Trouver une dompe, Demander du transport, Voir mes demandes.

### 4. Mes demandes et dossier complet

- Enrichir la liste avec type, chantier, matériau/service, quantité, date, statut, nombre de dompes et ouverture du dossier.
- Ajouter les filtres : Toutes, En cours, En attente, Terminées, Annulées.
- Créer le détail d’une demande avec : référence, statut, chantier, besoin, quantité, date, dompes demandées et transports associés.
- Réutiliser exclusivement `get_submission_sites` pour les dompes du dossier.
- Afficher l’adresse réelle seulement lorsque le serveur la retourne pour une relation demande + dompe approuvée.
- Afficher le motif d’un refus lorsqu’il existe ; aucune adresse pour les états refusé ou en attente.

### 5. Trouver une dompe et comparateur intégré

- Conserver `getEligibleEntrepreneurDumpSites()` comme source unique inchangée.
- Présenter la recherche comme un parcours continu : chantier → matériau → quantité → camion → résultats → comparaison → sélection.
- Garder carte et liste alimentées par le même tableau filtré.
- Faire de la comparaison une vue/étape naturelle du même parcours, sans recréer les calculs ni le moteur.
- Conserver uniquement les positions publiques approximatives dans la carte, la liste et les calculs avant approbation.

### 6. Transports, chantiers, notifications et entreprise

- Créer une section Transports à partir des demandes et soumissions réellement présentes ; aucun contenu simulé.
- Garder les chantiers comme regroupements calculés qui ouvrent leurs demandes, sans en faire une deuxième boîte de demandes.
- Réutiliser le centre de notifications existant et améliorer les liens pour cibler `/entrepreneur/demandes/:id` lorsque l’identifiant est disponible.
- Réorganiser « Mon entreprise » en deux zones explicites : Informations privées et Profil public, avec contrôle de visibilité existant.

### 7. Direction visuelle et adaptation aux écrans

- Conserver la palette Vrac Québec noir/vert et les jetons existants.
- Adopter une esthétique de centre d’opérations sobre : densité maîtrisée, titres forts, cartes rectangulaires compactes, statuts lisibles, aucune section décorative vide.
- Ordinateur : barre latérale stable, contenu principal large, dossiers en deux colonnes lorsque pertinent.
- iPad : navigation et grilles adaptées au portrait/paysage, cibles tactiles confortables.
- Téléphone : barre inférieure simple, onglets défilables, cartes en une colonne, aucune action masquée.
- Utiliser les composants de boutons et contrôles existants, sans créer de conventions visuelles parallèles.

## Invariants de sécurité

- Aucun changement backend, migration, politique d’accès ou fonction serveur.
- Aucun changement au moteur d’admissibilité, à la géolocalisation, aux positions publiques/réelles, à la carte admin, aux décisions par dompe ou aux notifications serveur.
- Aucune adresse ou coordonnée réelle reconstituée, calculée ou demandée directement par l’interface.
- Avant approbation, l’interface n’affiche que les données publiques déjà renvoyées par le serveur.
- Après retrait d’approbation, le prochain chargement du dossier dépend à nouveau de la réponse serveur et masque immédiatement l’adresse.
- Aucun changement aux demandes historiques, aux routes publiques, au SEO ou aux générateurs SEO.

## Validation

- Tests automatisés des transformations de statut, filtres, liens de dossier et états des dompes.
- Suite de tests existante complète et vérification des types.
- Parcours navigateur avec de vraies sessions entrepreneur et administrateur : création, réception CRM, approbation/refus par dompe, notification, divulgation et retrait.
- Contrôle réseau : aucune adresse/coordonnée réelle avant approbation.
- Vérification que carte, liste, recherche et comparaison utilisent toujours la source unique existante.
- Contrôle visuel et fonctionnel aux formats téléphone (420 px), iPad portrait, iPad paysage et ordinateur.
- Aucune publication automatique à la fin de la refonte.
