# Qualité UI/PWA — passe complète responsive

## Objectif
Rendre l’application existante confortable sur téléphone, tablette et ordinateur, sans modifier les données, règles métier, calculs, permissions, formulaires ni intégrations.

## Constat de départ
- La structure responsive commune est déjà solide : zones sécuritaires iPhone, navigation mobile, fenêtres limitées à la hauteur de l’écran et tableaux communs défilables.
- La PWA est partielle : manifeste et invitation d’installation présents, mais installation non fiabilisée au chargement et icône Android « maskable » mal cadrée.
- Les risques confirmés concernent surtout les éléments flottants de l’accueil, les titres importants tronqués, certaines cartes très serrées à 320 px, quelques fenêtres de flotte en deux colonnes et des tableaux administratifs bruts.
- La première passe publique a couvert sept largeurs sans écriture de données. Les écrans connectés restent à vérifier avec une session d’essai.

## Travaux prévus
1. **Installation PWA**
   - Réutiliser le logo officiel existant pour générer les formats nets, dont une variante Android avec zone de sécurité et une icône Apple opaque.
   - Compléter le manifeste et enregistrer le service d’installation au chargement, sans ajouter de deuxième application ni de cache métier hors ligne.
   - Harmoniser favicon, icônes et écran d’ouverture avec le thème actuel.

2. **Fondations responsive communes**
   - Corriger les composants partagés qui tronquent des informations importantes ou forcent des rangées trop serrées.
   - Sécuriser les boutons, badges, titres, fenêtres, feuilles, formulaires et zones flottantes sur petits écrans.
   - Conserver le défilement horizontal uniquement lorsque le tableau l’exige réellement.

3. **Écrans prioritaires**
   - Accueil, connexion, espace entrepreneur et navigation.
   - Carte/recherche de dompes, fiche de dompe, comparateur et résultats, sans toucher au classement.
   - Demande d’accès/transport, matériaux, transports, demandes, profil, flotte et pages entrepreneur importantes.
   - Corriger uniquement la présentation des écrans concernés.

4. **Validation**
   - Tester à 320, 360, 390, 430, 768, 1280 et 1920 px.
   - Vérifier débordements, texte coupé, boutons inaccessibles, superpositions, fenêtres, zones sécuritaires et navigation.
   - Utiliser une session d’essai en lecture seule pour les pages connectées; ne soumettre aucun formulaire et ne modifier aucune donnée.
   - Exécuter les tests automatisés pertinents et confirmer l’état de compilation.

## Limites strictes
- Aucun changement de logique métier, base de données, permission, calcul, classement, API ou intégration.
- Aucun paiement, envoi, connexion bancaire ou publication.
- Si un défaut visuel exige réellement un changement fonctionnel, arrêter ce point et demander votre accord.

## Livrable
Rapport final séparant : améliorations, pages et largeurs testées, défauts trouvés/corrigés/restants, tests avant/après, confirmation d’absence de modification métier et de publication.