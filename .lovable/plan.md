# Réorganisation du centre d’accès aux dompes et des notifications

## Objectif
Rendre les deux fonctions du Super Admin immédiatement compréhensibles sur mobile, tablette et ordinateur, sans modifier les données, permissions ou règles métier existantes.

## Centre des demandes d’accès
- Conserver `transport_requests`, son historique, les statuts normalisés, les actions et la statistique serveur existants.
- Recomposer l’en-tête avec les indicateurs demandés, dont les états nécessitant une intervention.
- Remplacer la rangée actuelle par une navigation compacte par statut, avec sélection adaptée au mobile.
- Ajouter des filtres d’affichage sur les champs réellement disponibles; les filtres non soutenus par une donnée existante ne seront pas inventés.
- Garder des cartes sur mobile et un tableau limité aux colonnes essentielles sur les écrans larges.
- Transformer le panneau de détail en fiche structurée : résumé, entrepreneur, chantier, besoin, dompe, notes et historique.
- Présenter les changements de statut existants comme actions principales et ranger les actions secondaires sans en créer de nouvelles.

## Centre de notifications
- Conserver `crm_notifications` comme source unique, ses états de lecture/traitement, ses priorités et ses liens directs.
- Ajouter une classification d’affichage dérivée des types, catégories, entités et liens existants : Vrac, Remblai, Dompes, Transport, Soumissions, Système.
- Appliquer la hiérarchie visuelle : urgent, à traiter, non lu, récent, information.
- Afficher des compteurs contextualisés et des filtres simples dans la cloche et dans le centre complet.
- Regrouper visuellement les activités partageant une même entité quand la référence existante le permet, sans fusionner ni modifier les notifications.
- Au clic, conserver le marquage lu actuel et ouvrir le vrai élément lié.
- Déplacer les réglages techniques dans une zone secondaire afin de réduire le bruit.

## Validation
- Vérifier sans soumission ni création de données les deux interfaces aux largeurs 320, 390, 768, 1024, 1280 et 1920 px.
- Vérifier l’absence de texte vertical, débordement, chevauchement et bouton inaccessible.
- Exécuter les tests pertinents et contrôler le résultat de compilation.
- Rapporter les données non disponibles, les limites restantes et confirmer que rien n’a été publié.
