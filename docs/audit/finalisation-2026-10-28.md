# Finalisation du lot surveillance / témoins / miniatures — 2026-10-28

## Surveillance quotidienne (installée, autorisée)
- Installée : migration 0248 (seuils, relevés, fonction) + tâche `platform-capacity-snapshot-daily` à 08:10 UTC (04:10 Toronto), 1 exécution/jour, 1 ligne/jour.
- Taille logique de la base (`pg_database_size`) séparée de l'occupation réelle du disque. Disque réel et mémoire vive : **non mesurables automatiquement** depuis la base; colonnes `disk_used_pct`/`ram_used_pct` laissées vides et listées dans `unmeasured`; chaque alerte le rappelle.
- Gravité dans la clé d'alerte : passage attention → critique = nouvelle alerte urgente (testé, transaction annulée).
- Alerte marquée traitée alors que le problème persiste : un rappel « persiste après traitement », au plus un par jour (testé, transaction annulée).
- Premier relevé réel : base 5 071 752 339 o, journal des tâches 4 567 326 720 o, fichiers 459 136 707 o; une alerte « Journal des tâches planifiées » (> 2 Go) dans la cloche admin.
- Aucune purge. Retour arrière : `cron.unschedule('platform-capacity-snapshot-daily')`, puis retrait des deux tables et de la fonction.

## Témoins et politique (aperçu)
- Google Maps décrit d'après le code : chargé dans le navigateur aux champs d'adresse/cartes (IP, caractères saisis), adresses envoyées par nos serveurs pour géocodage et distances; ni nom, ni courriel, ni téléphone.
- Politique marquée « Brouillon incomplet — non finale »; liste des 7 informations à fournir en tête.
- Durée Analytics : **non vérifiée**. Accès existant en lecture des rapports seulement; lire le réglage aurait demandé un nouveau déploiement de fonction. Étapes : Google Analytics → Admin (roue) → propriété Vrac Québec → Collecte et modification des données → Conservation des données → noter « Conservation des données d'événements » (2 ou 14 mois).
- Essais navigateur (téléphone 390×844, ordinateur 1280×1800) : bandeau visible, aucune requête GA avant choix, Personnaliser ouvre le panneau (mesure désactivée par défaut), boutons 44 px sur téléphone, Accepter charge GA + témoins `_ga`, retrait via « Témoins » efface les témoins et aucune requête GA ensuite, même en faisant défiler.
- Défauts corrigés : (1) le bouton « Besoin d'aide? » recouvrait « Accepter » sur ordinateur; (2) l'accueil et le blogue n'avaient pas de lien « Témoins » (retrait impossible); (3) un événement déjà en file pouvait partir après le retrait → rechargement de la page au retrait.

## Miniature d'une ancienne photo fictive (serveur, compte TEST A)
- Photo fictive 3000×2000 (95 710 o) déposée sans miniature, liée au client TEST `08b5ae3a…` (fichier `7fc942bb-a868-4db1-a96b-110b2e221621`). Conservée, non supprimée.
- Deux traitements simultanés : 1 créée + 1 réutilisée; relance : ignorée; 1 seul objet miniature; original identique (SHA-256).
- Anonyme : original et miniature refusés. TEST B (autre entreprise) : fiche invisible, téléchargement, lien signé, dépôt et modification refusés.
- Le bouton de l'écran CRM n'a pas été cliqué; l'essai utilise la même fonction et les mêmes appels.

## Tableau d'essais téléphone (à remplir)
| # | Appareil (modèle, système) | Réseau (Wi-Fi / 4G / 5G, barres) | Fichier | Taille | Durée d'envoi (s) | Durée d'ouverture (s) | Remarques |
|---|---|---|---|---|---|---|---|
| 1 |  |  | Photo prise par l'appareil |  |  |  |  |
| 2 |  |  | PDF ~1 Mo |  |  |  |  |
| 3 |  |  | PDF ~15 Mo |  |  |  |  |
| 4 |  |  | 3 photos à la fois |  |  |  |  |
| 5 |  |  | Ouverture miniature CRM puis original |  |  |  |  |
