# Audit responsive global du CRM

## Objectif
Rendre toute l’interface réellement lisible et utilisable de 320 à 1920 px, sans modifier les données, les permissions, les calculs, le comparateur ni les fonctions existantes. Tout reste sur TEST.

## Étapes
1. **Inventaire exhaustif**
   - Parcourir les 142 routes et les entrées de menus accessibles.
   - Examiner les 62 fichiers contenant des tableaux, ainsi que les listes, cartes, filtres, formulaires, fenêtres et panneaux.
   - Classer chaque défaut en critique, majeur ou mineur avec une preuve visuelle ou une cause précise dans l’interface.

2. **Correction prioritaire des accès aux dompes**
   - Remplacer le tableau compressé par des fiches verticales sur mobile.
   - Conserver le tableau complet sur tablette/ordinateur avec une largeur minimale et un défilement horizontal contrôlé lorsque nécessaire.
   - Garder toutes les informations et actions existantes inchangées.

3. **Corrections globales critiques et majeures**
   - Adapter les tableaux complexes selon leur usage : fiches mobiles ou défilement contrôlé.
   - Corriger les mots cassés, textes tronqués, boutons inaccessibles, grilles rigides et fenêtres dépassant l’écran.
   - Vérifier les menus, zones flottantes, cartes et formulaires, y compris le comportement au clavier mobile.
   - Réutiliser les composants existants et appliquer les corrections communes seulement lorsqu’elles sont sûres pour tous les écrans.

4. **Validation multi-format**
   - Tester 320, 360, 390, 430, 768, 1024, 1280 et 1920 px.
   - Vérifier visuellement les écrans corrigés et les parcours principaux connectés, sans soumettre de formulaire.
   - Détecter les débordements horizontaux, textes caractère par caractère, superpositions, fenêtres hors écran et actions inaccessibles.
   - Exécuter les tests automatisés pertinents et confirmer que l’application se construit sans erreur.

5. **Rapport final**
   - Fournir le nombre de pages auditées et les totaux par gravité.
   - Lister les pages corrigées, les problèmes restants, les largeurs testées et les résultats automatisés.
   - Confirmer explicitement : aucune donnée, permission, règle métier ou règle du comparateur modifiée; aucune publication.

## Limites
- Aucune amélioration esthétique hors correction responsive constatée.
- Aucun enregistrement, suppression, paiement, envoi ou publication.
- Si un défaut exige une modification fonctionnelle, arrêter cette correction et la signaler plutôt que changer la logique.
