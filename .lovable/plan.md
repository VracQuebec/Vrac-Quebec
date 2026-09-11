# Refonte produit — Espace entrepreneur Vrac Québec

Une seule application métier, pensée téléphone d'abord, déclinée iPad et ordinateur. Aucune donnée, fonctionnalité, route ou page publique supprimée.

---

## 1. Architecture UX cible

Trois piliers : **Mon activité**, **Mes chantiers**, **Mes demandes**. Le chantier est le fil conducteur.

```text
ENTREPRENEUR → CHANTIER → DEMANDE → RECHERCHE → SITE → TRANSPORT → SUIVI → HISTORIQUE
```

Sections finales : Accueil · Chantiers · Demandes · Carte · Comparateur · Réseau · Avis · Notifications · Profil. Tout le reste (historique, annuaire, aide) vit dans « Plus » sur mobile, dans la barre latérale sur grand écran. Seules les fonctionnalités réellement disponibles aujourd'hui apparaissent au menu — rien n'est inventé.

## 2. Navigation mobile

- Barre fixe en bas, 5 entrées : **Accueil · Chantiers · Demandes · Carte · Plus**, icône + libellé, zone tactile 44 px, respect des zones sûres iOS.
- En-tête unique : à gauche retour ou menu, au centre le titre/contexte (ex. « Chantier Résidence ABC »), à droite cloche avec pastille + avatar profil.
- « Plus » = feuille glissante : Comparateur, Réseau, Avis, Historique, Mon compte, Aide, Déconnexion.
- Bouton d'action flottant contextuel (nouvelle demande) sur Accueil et Chantiers.
- Retour toujours contextuel : depuis la carte ouverte à partir d'un chantier, on revient au chantier, pas à l'accueil.

## 3. Navigation iPad

- **Portrait** : identique au mobile mais en grille 2 colonnes pour les cartes, feuilles glissantes plus larges, barre du bas conservée.
- **Paysage** : barre latérale compacte (icônes + libellés) et vue à deux colonnes — `Carte | Résultats`, `Liste demandes | Détail`, `Chantier | Activité`. Le détail s'ouvre à droite sans quitter la liste.

## 4. Navigation desktop

Barre latérale permanente (Accueil, Mes chantiers, Mes demandes, Carte, Comparateur, Réseau, Avis, Mon compte), en-tête supérieur avec fil d'Ariane, recherche, notifications, profil. Mises en page 2–3 colonnes (liste / détail / activité). Même logique et mêmes composants que le mobile.

## 5. Nouveau tableau de bord

Écran court, orienté action :
1. Salutation + « Voici ce qui se passe aujourd'hui ».
2. **Actions rapides** : Nouvelle demande · Trouver une dompe · Demander un transport.
3. **À faire** — uniquement les éléments qui attendent l'entrepreneur (demande à confirmer, site à choisir, transport à valider). Masqué si vide.
4. **Mes chantiers** — 3 cartes max + « Voir tout ».
5. **Activité récente** — 5 derniers événements réels, cliquables vers l'objet.

Les blocs actuels (résumé d'activité, profil réseau, réseau, sites recommandés, grille de 7 cartes) sont conservés mais déplacés : résumé fusionné dans « À faire », profil vers Profil, sites recommandés dans le dossier chantier, réseau dans Réseau.

## 6. Structure « Mes chantiers »

**Aucune nouvelle table ne sera créée.** La refonte utilise la vue calculée existante (regroupement des demandes par lieu), telle qu'elle fonctionne aujourd'hui.

- Liste en cartes verticales : lieu, ville, nombre de demandes, nombre de transports, badge de statut, bouton Ouvrir.
- Filtres : En cours / Terminés / Tous. Recherche par lieu ou ville.
- **Dossier chantier** : en-tête (lieu, adresse, statut) puis onglets Aperçu · Demandes · Sites · Transports · Activité, et barre d'actions collante : Nouvelle demande · Trouver une dompe · Demander un transport.
- Pas de création, renommage ni archivage de chantier dans cette refonte : ces actions supposeraient une entité persistée.

**Si une véritable entité chantier devenait nécessaire plus tard** (pour nommer un chantier, l'archiver, y attacher des documents ou regrouper des demandes à des adresses différentes), je présenterai une proposition distincte, à approuver séparément, précisant : la raison exacte, les données reliées (référence facultative depuis les demandes, jamais de copie), les relations conservées, la clé anti-doublon (adresse normalisée + utilisateur), le fait qu'aucune demande existante ne serait modifiée, le traitement des demandes sans chantier (elles restent visibles via le regroupement calculé) et la garantie d'intégrité (ajout seulement, aucune écriture destructive). Rien de tout cela ne sera fait sans votre accord explicite.

## 7. Relation chantier → demande → site → transport

Le chantier reste une clé calculée (lieu/adresse normalisée) portée par les demandes existantes ; site et transport restent rattachés à la demande d'origine, comme aujourd'hui. Depuis n'importe quel objet on remonte au chantier en un geste. Aucune donnée n'est réécrite pour établir ces liens.


## 8. Unification des demandes

Deux circuits techniques existent (soumission initiale et demande d'accès/transport). Ils sont conservés en base mais présentés dans **une seule liste** avec un type explicite :
- « Demande de matériau » (soumission initiale)
- « Demande d'accès à une dompe »
- « Demande de transport »

Filtres : Toutes · En cours · En attente · Terminées. Chaque carte : chantier, type, statut, date, **prochaine action**. Vocabulaire de statut unifié et lisible (les valeurs anciennes restent normalisées pour l'affichage).

## 9. Recherche de dompes

Aujourd'hui trois entrées (carte, comparateur, assistant). Après refonte : **une seule intention « Trouver une dompe »**, qui ouvre la carte avec le contexte du chantier, et propose « Comparer les sites » comme vue alternative des mêmes résultats. Mêmes règles de compatibilité matériau/camion et même calcul de distance pour les trois surfaces (module partagé).

## 10. Carte

Carte plein écran, un doigt (déjà en place). Barre supérieure : recherche d'adresse + bouton **Filtres** (panneau glissant : matériau, disponibilité, volume, type de camion, distance). Résultats en carrousel bas sur mobile, colonne latérale sur iPad paysage/desktop. Fiche de site en feuille glissante : nom, distance, compatibilité, matériaux, disponibilité, infos, bouton **Sélectionner** qui renvoie au chantier/demande.

## 11. Comparateur

Outil de décision : recommandation en tête (« Meilleur choix » + raison), puis tableau/cartes comparatives (distance, compatibilité, matériau, camion, disponibilité). Maximum 3 sites côte à côte sur mobile via défilement, tableau complet sur desktop. Bouton Sélectionner identique à celui de la carte.

## 12. Assistant intelligent

Deux parcours clairement distincts, à partir du même moteur :
- **Parcours public** (`/demande-transport`, visiteur non connecté) : fonctionnement actuel intégralement conservé, aucune donnée privée, aucun élément de l'espace entrepreneur.
- **Parcours entrepreneur connecté** : l'assistant s'ouvre dans la coquille de l'application, avec le contexte entrepreneur + chantier + demande + site + transport déjà connu, et ne repose pas les questions déjà répondues.

Dans les deux cas : étapes courtes, barre de progression, une question par écran sur mobile. Le brouillon persistant et la file d'envoi actuels sont conservés.

## 13. Transport

Suite logique du chantier : site sélectionné → « Demander un transport » → récapitulatif prérempli → vérification → confirmation → suivi. Le transport reste lié au chantier et à la demande d'origine. Les règles de tarification et la validation côté serveur ne changent pas.

## 14. Notifications

Un seul centre (fusion du bloc du tableau de bord et de `/notifications`). Pastille sur la cloche, liste groupée par jour, filtres Non lues / Toutes, action « Tout marquer comme lu ». Chaque notification pointe vers l'objet concerné (demande, site, transport), pas vers une page générique.

## 15. Suivi chronologique

Chronologie verticale dans chaque demande/transport, alimentée **uniquement** par les événements réellement enregistrés : demande créée, site sélectionné, site validé, transport en traitement, livraison, terminé, annulé. États : fait (✓), en cours (●), à venir (○). Aucune donnée inventée ; une étape sans horodatage réel s'affiche sans heure.

## 16. Profil et paramètres de l'entreprise

Un seul écran, sections : **Mon entreprise · Coordonnées · Camions · Profil public · Visibilité · Confidentialité · Préférences (notifications)**. Séparation visuelle nette « Privé — visible par vous seul » / « Public — visible dans l'annuaire », avec aperçu du profil public. Remplace la double présentation actuelle (Mon compte + Profil réseau), en conservant les deux sources de données.

## 17. Réseau professionnel

Annuaire : recherche, filtres (métier, région, matériaux), cartes de profils, fiche publique. Aucune fonctionnalité inventée : favoris, messagerie, notation et collaboration ne sont pas ajoutés, mais la structure des cartes et de la fiche prévoit leur emplacement pour plus tard. Les protections de confidentialité actuelles restent inchangées.

## 18. États (chargement, vide, erreur, succès, attente)

Composants standards réutilisés partout : squelettes de chargement (jamais d'écran blanc), état vide illustré avec action proposée, état d'erreur avec message clair + « Réessayer », confirmations en toast, badges d'état cohérents (en attente, accepté, en cours, terminé, refusé, annulé, indisponible).

## 19. Conservation du contexte

Contexte de parcours porté par l'URL (`?chantier=…&demande=…`) et l'état de navigation, lu par la carte, le comparateur, l'assistant et le transport. Les champs déjà connus sont préremplis et affichés en rappel (« Chantier Résidence ABC — Québec »). Retour arrière toujours vers l'écran d'origine.

## 20. Permissions et accès

Une garde unique pour toutes les routes entrepreneur : session valide + rôle entrepreneur ou admin, sinon redirection vers la connexion. Aucune route privée accessible depuis une autre entrée. `/demande-transport` reste **publiquement accessible** aux visiteurs non connectés, exactement comme aujourd'hui ; la coquille entrepreneur et toute donnée privée n'apparaissent que pour un entrepreneur connecté. Les règles RLS existantes ne sont ni assouplies ni modifiées.

## 21. Stratégie responsive

Points de rupture : 320 / 375 / 390 / 430 (mobile), 768 / 820 (iPad portrait), 1024 (iPad paysage), 1280 / 1440 / 1920 (desktop). Mobile d'abord, grilles fluides, zones sûres iOS, cibles tactiles ≥ 44 px, aucun tableau brut sur mobile (cartes), feuilles glissantes au lieu de grandes fenêtres. Critère de réussite : l'expérience, pas seulement l'absence de débordement.

## 22. Composants réutilisables

`EntrepreneurAppShell` (en-tête + barre basse + barre latérale), `BottomSheet`, `AppCard`, `StatusBadge`, `Timeline`, `QuickActions`, `FilterSheet`, `SiteCard`, `RequestCard`, `ChantierCard`, `EmptyState`, `ErrorState`, `LoadingSkeleton`, `SectionHeader`, `ActionBar`. Tous bâtis sur les jetons de couleur existants (vert/noir), aucune couleur en dur.

Réutilisés tels quels : carte Google et sa logique un doigt, comparateur (calculs), assistant (moteur et file d'envoi), annuaire, listes de demandes, notifications, profil réseau.

## 23. Performance

- Un seul fournisseur de données (`EntrepreneurDataProvider`) : profil, rôles, chantiers, demandes, transports, notifications chargés une fois et partagés.
- Cache mémoire + revalidation en arrière-plan, plus de rechargement complet à chaque page.
- Calculs de distance/compatibilité mémoïsés dans le module partagé.
- Chargement différé de la carte, du comparateur et de l'assistant.
- Squelettes plutôt qu'écrans vides ; transitions courtes (150–200 ms).

## 24. Tests

Les 5 scénarios demandés (nouvel entrepreneur, entrepreneur existant, notification → objet, recherche libre, retour contextuel) joués en navigateur automatisé aux 10 largeurs, avec captures réelles. Plus : vérification de types, suite de tests existante (414 tests), contrôle qu'aucune route ne renvoie d'erreur, et test « utilisateur naïf » sur les 7 questions clés (« où sont mes chantiers ? », etc.).

---

## Constats de l'audit repris dans la refonte

**Doublons actuels** : deux circuits de demandes ; trois entrées vers la recherche de dompes ; deux présentations du profil ; deux centres de notifications ; en-têtes multiples ; calculs de distance/compatibilité dupliqués ; chargements répétés des mêmes données sur le tableau de bord.

**Parcours à fusionner** : demandes (une liste, types explicites) · recherche de dompes (carte + comparateur = deux vues d'un même résultat) · notifications · profil/compte.

**Fonctionnalités déplacées** : profil réseau → Profil ; sites recommandés → dossier chantier ; historique → « Plus » ; résumé d'activité → « À faire » de l'accueil. La carte « Mes favoris » actuelle, qui n'est qu'un espace réservé sans fonctionnalité, est retirée du menu (aucune donnée concernée) plutôt que présentée comme disponible.

**Données communes conservées** : entrepreneur, chantier, demande, site, transport restent le même objet partout ; aucune donnée parallèle créée.

**Relations conservées** : demande ↔ chantier, site ↔ demande, transport ↔ demande, notification ↔ objet, historique ↔ transport.

**Risques identifiés et parades** :
- Rattachement d'anciennes demandes à un chantier → correspondance non destructive, la demande reste visible même sans chantier.
- Rupture de la file d'envoi de l'assistant → réutilisation du module existant sans modification.
- Perte d'accès à une page déplacée → toutes les anciennes adresses restent valides et redirigent.
- Régression de permissions → garde unique, RLS inchangée, tests d'accès non connecté.
- Régression responsive administration/public → périmètre strictement limité à l'espace entrepreneur.

---

## Phases de livraison

1. **Fondations** — coquille de navigation, design system entrepreneur, états standards.
2. **Données** — fournisseur unique, cache, contexte de parcours.
3. **Accueil** — nouveau home orienté action.
4. **Chantiers** — liste + dossier, à partir du regroupement calculé existant, sans nouvelle table ni migration.
5. **Demandes** — liste unifiée, filtres, cartes, prochaine action.
6. **Création guidée** — parcours en étapes avec progression.
7. **Carte** — plein écran, filtres en panneau, fiche de site.
8. **Comparateur** — vue décisionnelle partagée avec la carte.
9. **Assistant** — intégration contextuelle.
10. **Transport et chronologie** — suite du chantier, suivi visuel.
11. **Notifications** — centre unique, pastille, liens directs.
12. **Profil et réseau** — écran unifié privé/public, annuaire.
13. **iPad et desktop** — deux colonnes, barre latérale.
14. **Tests et validation** — scénarios, 10 largeurs, captures, tests automatisés.

Aucune modification de l'administration, du CRM, du SEO, des pages publiques ni de la place de marché.
