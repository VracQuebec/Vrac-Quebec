# Finaliser le formulaire personnel de remblai

- Conserver le formulaire public existant comme référence : partager les sept étapes et les validations, sans modifier ses titres SEO ni ses contenus.
- Corriger les pertes possibles de précisions historiques, signaler les photos inaccessibles et refuser toute confirmation sans résultat d’enregistrement valide.
- Compléter les adaptations préparées de lecture et de modification du dossier exact, sans changement de permissions ni activation.
- Tester les données fictives, leur conservation, les refus entre deux clients et les affichages téléphone, tablette et ordinateur.
- Mettre à jour le rapport avec résultats réellement obtenus et ordre d’activation conditionnel.

## Détails techniques et limites
Les tests SQL s’exécutent uniquement sur PostgreSQL jetable en boucle locale. Les fonctions `exec01_projection(uuid,boolean)` et `exec01_dispatch(jsonb)` restent préparées et non appliquées. Aucun déploiement, publication, courriel réel, accès métier réel ou migration hébergée. L’activation reste bloquée sans validation serveur/stockage dans un environnement distinct et autorisation explicite.