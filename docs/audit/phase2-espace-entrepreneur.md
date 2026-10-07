# Phase 2 — optimisation de l’espace entrepreneur

## État

Présentation appliquée en TEST, sans publication et sans démarrer une autre phase. Validation fonctionnelle limitée aux parcours disponibles pour le compte connecté; l’isolation croisée A/B n’est pas certifiée par ces tests.

## Changements

- **Compte / entreprise** : sections distinctes pour le nom utilisateur existant, le courriel authentifié, le rôle informatif et les coordonnées professionnelles. « À compléter » remplace les renseignements manquants, sans les inventer. La fiche professionnelle complémentaire lit seulement les appartenances actives explicites et une fiche partenaire existante; aucune création automatique. Si plusieurs entreprises existent, aucune n’est choisie arbitrairement.
- **Navigation** : Accueil, puis groupes Opérations, Planification, Mon entreprise, Mes ressources et Compte. Les cinq entrées mobiles Accueil / Chantiers / Dompes / Transport / Plus restent présentes. Les destinations existantes sont conservées; Services, Voyages et Coupons ouvrent des onglets sur la route activités existante. Mon compte et Préférences ciblent des sections du compte existant.
- **Activités** : voyages, coupons et services séparés visuellement; requêtes et actions existantes conservées. Aucun voyage n’est assimilé à une demande ou à un coupon.
- **Chantiers** : états affichés par le résumé existant; un sens ambigu demeure explicitement à préciser, même si matériau/quantité sont connus.
- **Fiche publique** : logo déjà public, secteurs desservis et localisation existants; vérifications uniquement lorsque le statut public les atteste. Aucun téléphone, courriel ou adresse privée ajouté.
- **Dompes** : dans la liste uniquement, disponibilité déclarée et ancienneté/confirmation de cette disponibilité sont deux informations distinctes. Une disponibilité manquante n’est pas présentée comme confirmée. Le badge conserve la couleur de prudence existante. Le rendu et les interactions de la carte, ses coordonnées, marqueurs et fenêtres n’ont pas été modifiés.
- **Agenda** : vérification seulement. Les associations existantes client / chantier / tâche et les lectures par entreprise restent intactes; aucun nouveau lien métier ni événement créé.

## Contrôles réellement exécutés

- 98 tests automatiques réussis dans huit suites : chantiers, demandes, profils, visibilité, confidentialité partenaire, opérations et source des dompes.
- Dernier signal de compilation : `build OK`.
- Navigateur authentifié : accueil, compte, chantiers, activités/Voyages, activités/Coupons, activités/Services et agenda ouverts sans erreur JavaScript.
- Navigation mobile : menu Plus ouvert, destinations recensées; Coupons puis Voyages sélectionnés, paramètres et onglet actif confirmés.
- Formats 320 × 667, 393 × 852 et 1440 × 1000 : accueil, compte, chantiers et coupons sans débordement horizontal. Vérifications desktop supplémentaires en 1280 × 1800.
- Dompes : 469 résultats et 469 éléments de liste, carte chargée, confirmation séparée rendue pour 466 éléments, première fiche ouverte; aucun débordement sur 393 × 852 et aucune erreur JavaScript.
- Les captures consultées représentent de véritables pages, pas des maquettes.
- Toutes les écritures REST et fonctions non explicitement autorisées en lecture ont été bloquées pendant les parcours. L’appel préexistant `fleet_ensure_my_company` a été bloqué durant les contrôles de l’agenda, afin de ne pas créer de société à la visite.

## Contrôles structurels et limites

- Routes et nouveaux liens confrontés à l’arborescence existante; aucune route créée, supprimée ou renommée.
- Fiche publique et complément professionnel examinés dans le code : pas d’exposition privée ajoutée, pas d’appel de création automatique dans le nouveau complément.
- Agenda : filtres company_id et associations CRM examinés structurellement. Aucun événement existant dans la plage affichée du compte testé; le parcours d’un événement lié n’a donc pas été exécuté.
- Isolation A/B : contrôles structurels seulement. Aucun test croisé authentifié réalisé avec deux entreprises distinctes; des sessions approuvées pour ces entreprises sont nécessaires. Aucun faux compte créé et aucune politique modifiée.
- Fiche publique avec logo et vérification : contrôle de source et tests confidentialité, pas de parcours complet de chaque variante de fiche réelle.
- Appareil physique, PWA iPhone et clavier iOS : non disponibles dans cet environnement; validation physique à confirmer.

## Périmètre préservé

Accueil validé non modifié. Carte, coordonnées et logique cartographique intactes. Aucun changement de base, données, RLS, permissions, rôles, authentification, fonctions serveur, API, Super Admin, Ma flotte ou calculs métier. Aucun formulaire soumis, aucune publication et aucune autre phase engagée.