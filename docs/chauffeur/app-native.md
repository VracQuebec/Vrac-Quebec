# Application chauffeur iOS / Android — préparation

Statut : **préparé, non compilé, non signé, non essayé sur appareil.** L'aperçu web et la page /chauffeur ne sont pas une application native validée.

## Prêt côté serveur
- `drv_points` : `recorded_at` (constatation appareil, jamais futur), `received_at` (réception serveur), `accuracy`, `kind` (position, arrivee, depart, arret, pause, reprise, interruption), `client_id`, `source`.
- `drv_points_batch(mission, points[], source)` : lot ≤ 500, idempotent par `client_id` (rejeu de la file hors réseau = aucun doublon), refus si mission inactive ou d'un autre chauffeur.
- Missions : `drv_mission_start/end` existants (consentement explicite, comptes/entreprises/permissions existants).
- Un arrêt détecté est une observation : il ne confirme ni voyage ni heures payables (le punch et les coupons restent les sources).

## Étapes hors Lovable (poste avec Xcode / Android Studio)
1. Exporter le projet vers GitHub, `npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android @capacitor-community/background-geolocation @capacitor/preferences @capacitor/network`.
2. `npx cap init "Vrac Chauffeur" ca.vracquebec.chauffeur --web-dir dist`, `npx cap add ios`, `npx cap add android`.
3. iOS : `UIBackgroundModes = location`, `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription` (finalité : suivi de mission seulement), `allowsBackgroundLocationUpdates` pendant la mission, `showsBackgroundLocationIndicator = true`.
4. Android : `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`; service de premier plan avec notification permanente « Suivi de mission actif ».
5. Démarrer le watcher uniquement après `drv_mission_start`; l'arrêter à pause/fin (aucune collecte hors mission).
6. File locale (Preferences) : chaque point reçoit un UUID `client_id`; envoi par `drv_points_batch` au retour du réseau; suppression locale seulement après réponse.
7. Interruption (permission retirée, service tué) : point `interruption` à la reprise; dernière position affichée avec son heure (America/Toronto).
8. Signature : compte Apple Developer et clé Play Console requis (payants — en attente de décision).

## Essais physiques à faire (non réalisés)
Écran verrouillé 30 min · arrière-plan · mode avion puis retour · économie d'énergie (iOS Low Power, Android Doze) · permission « Toujours » retirée · arrêt forcé. Noter pour chacun : points reçus/attendus, doublons (attendu 0), délai de rattrapage, % batterie/heure.

## Limites connues
iOS/Android peuvent suspendre ou espacer les positions (Doze, arrêt forcé = suivi stoppé jusqu'à réouverture). Consommation estimée non mesurée. Conservation des positions à fixer (proposition : 12 mois) et à afficher au chauffeur avec les finalités.
