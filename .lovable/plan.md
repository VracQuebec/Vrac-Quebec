# Refonte de l'Espace entrepreneur — une seule application

## Objectif
Transformer les pages entrepreneur actuelles (tableau de bord, demandes, chantiers, carte, comparateur, assistant, réseau, compte, notifications) en un produit unique, organisé autour du chantier, avec la même logique sur téléphone, tablette et ordinateur.

Rien n'est supprimé : toutes les adresses actuelles continuent de fonctionner, aucune donnée n'est effacée, l'espace administrateur et les pages publiques ne sont pas touchés.

## Ce que l'entrepreneur verra

**Une navigation unique**
- Téléphone : barre fixe en bas — Accueil, Chantiers, Demandes, Carte, Plus.
- Tablette paysage et ordinateur : menu latéral permanent avec les mêmes sections plus Comparateur, Réseau, Avis, Mon compte.
- Un seul en-tête partout : retour/menu à gauche, titre au centre, notifications (avec pastille) et profil à droite.

**Un accueil orienté action**
Salutation, actions rapides (Nouvelle demande / Trouver une dompe / Demander un transport), mes chantiers, « À faire », activité récente. Plus de longue page d'accueil dense.

**Le chantier comme fil conducteur**
- Liste de chantiers en cartes (lieu, nombre de demandes, transports, statut).
- Dossier de chantier : aperçu, demandes, sites, transports, activité, actions. Tout ce qu'on lance depuis un chantier garde l'adresse, le matériau et la demande déjà saisis.

**Les demandes clarifiées**
Une seule liste filtrable (Toutes / En cours / En attente / Terminées). Chaque carte indique le chantier, le type, le statut, la date et la prochaine action. Les deux circuits techniques existants restent, mais sont nommés et distingués clairement.

**Un parcours guidé** pour créer une demande, en étapes courtes avec progression visible, au lieu d'un grand formulaire.

**Une chronologie réelle** (demande créée → site sélectionné → transport → suivi), construite uniquement à partir des événements réellement enregistrés.

**Carte et comparateur simplifiés**
Carte plein écran, bouton « Filtres » qui ouvre un panneau, fiche de site en panneau glissant avec un bouton « Sélectionner » qui ramène au chantier. Comparateur présenté comme un outil de décision (recommandation en tête, critères ensuite).

**Notifications, profil et réseau**
Un seul centre de notifications avec pastille, chaque avis renvoyant à l'objet concerné. Un seul écran de profil séparant clairement informations privées et informations publiques. Réseau présenté comme annuaire professionnel, sans inventer favoris/messagerie.

## Détails techniques

- Nouvelle coquille `EntrepreneurAppShell` (en-tête + navigation basse mobile + sidebar desktop + zones sûres iOS), remplaçant `EntrepreneurShell` et les en-têtes ad hoc du tableau de bord.
- Contexte React `EntrepreneurDataProvider` : chargement unique du profil, des rôles, des demandes, des transports et des notifications, partagé par toutes les pages (fin des rechargements répétés). Cache mémoire + revalidation.
- Contexte de parcours (`ChantierContext`) transporté via l'état de navigation et l'URL (`?chantier=`), consommé par la carte, le comparateur et l'assistant pour préremplir adresse/matériau/quantité.
- Chantiers : conservés tels quels (regroupement calculé) en source par défaut, plus une table `entrepreneur_chantiers` légère (nom, adresse, statut, notes) qui **référence** les demandes existantes sans les dupliquer, avec RLS `auth.uid()` et GRANT. Les regroupements calculés sans enregistrement restent affichés.
- Chronologie alimentée par `transport_requests`, statuts et tables d'événements existantes ; aucun événement inventé.
- Bibliothèque partagée de composants entrepreneur : carte, badge de statut, état vide/chargement/erreur, panneau glissant, barre d'actions — sur les jetons de couleur existants (vert/noir), aucune couleur en dur.
- Règles de matériau/camion/distance factorisées dans un module partagé utilisé par la carte, le comparateur et l'assistant.
- Accès : toutes les routes entrepreneur passent par la même garde (connecté + rôle entrepreneur ou admin). `/demande-transport` conserve son accès public actuel mais affiche la coquille entrepreneur uniquement pour les entrepreneurs connectés.
- Compatibilité : toutes les routes actuelles (`/entrepreneur/*`, `/espace-entrepreneur`, `/entrepreneur/comparateur`, etc.) restent valides, redirigées vers les nouveaux écrans quand nécessaire.

## Déroulement

1. Coquille de navigation + design system entrepreneur + états standards.
2. Contexte de données partagé et préremplissage du contexte chantier.
3. Nouvel accueil.
4. Chantiers (liste + dossier + table légère).
5. Demandes (liste unifiée + parcours guidé + chronologie).
6. Carte, comparateur, assistant.
7. Transport et suivi reliés au chantier.
8. Notifications, profil, réseau, avis.
9. Adaptation iPad (deux colonnes en paysage) et ordinateur.
10. Tests : les 5 scénarios demandés, aux 10 largeurs, avec captures réelles, plus vérification des tests automatisés existants.

## Hors périmètre
Administration, CRM, SEO, pages publiques, marketplace : aucune modification.
