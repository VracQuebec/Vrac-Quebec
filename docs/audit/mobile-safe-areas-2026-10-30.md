# Zones de sécurité mobiles — 30 octobre 2026

## Cause et correction
Le viewport existant autorise le plein écran (`viewport-fit=cover`, barre iOS translucide); l’accueil, qui n’utilise pas la navigation universelle, ne réservait pas le haut sécurisé. Les témoins, panneaux et certains boutons flottants ne réservaient pas toutes les zones système. Plusieurs règles de panneaux utilisaient la hauteur du document plutôt que l’espace visible avec clavier.

Une protection unique du haut à l’accueil, des tokens de zones système communs et un observateur purement géométrique de visualViewport corrigent ces écarts. Les panneaux partagés et les commandes inférieures utilisent ces mesures; les actions de consentement restent visibles avec un corps défilant. Les commandes flottantes sont masquées pendant le choix de consentement ou le clavier. Le manifeste, les identifiants d’installation, le zoom et push-sw.js restent inchangés. Aucune écriture métier, permission ou consentement réel modifié.

## Preuves locales
- Chromium simulé : 320×667 sans encoche, 393×852 avec zones 59/34, 412×915 avec zones 24/24, paysage 852×393 avec côtés 59 et bas 21.
- Accueil, personnalisation des témoins, connexion et /acheter-materiaux : zéro débordement horizontal; boutons de consentement dans les zones sûres.
- Espace entrepreneur connecté en lecture seule : en-tête 108 px (zone simulée comprise), navigation basse 91 px, menu Plus entièrement dans l’écran après animation.
- CRM : compte fictif test-superadmin@test.invalid, menu ouvert et défilant, zéro débordement horizontal; aucune demande modifiée.
- Clavier simulé : espace visible 430 px, formulaire assistant et commande Envoyer visibles; texte fictif non envoyé.
- 27 tests ciblés réussis (consentement 15, installation 5, soumissions 5, visibleViewport 2); build OK. Analyse serveur avant publication : zéro critique, avis connus laissés inchangés.

## Limites
Simulations Chromium et zones injectées, pas appareils physiques iPhone/Android, Safari natif ou installation depuis l’écran d’accueil. Tous les écrans métier individuels ne sont pas parcourus; les corrections portent sur les coquilles et panneaux partagés. Aucune promesse de résultat physique.
Le worker ne cache pas les pages métier. Après publication, fermer complètement puis rouvrir l’application doit charger la version actuelle; aucun changement de manifeste ne justifie une réinstallation ni un effacement de données. Réouverture physique non vérifiée.

## Publication
Publication demandée à 20:57 UTC; deux contrôles espacés sur vracquebec.ca ont reçu HTTP 200 mais encore l’ancienne présentation (classes public-home/consent-panel absentes). Le déploiement n’est donc pas confirmé terminé. Aucun nouvel essai de consentement enregistré sur le site publié.
Vérifications locales complémentaires : 491×1072, 1280×1800 et paysage 667×320, boutons tous dans l’écran et aucun débordement horizontal.