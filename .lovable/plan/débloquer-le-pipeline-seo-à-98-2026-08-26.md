# Débloquer le pipeline SEO à 98 %

## Diagnostic confirmé

- Les **32 pages restantes sont réelles** : 27 emplacements ont leur dernière tentative en `needs_retry` et 5 sont actuellement `queued`; aucune page restante n’est sans historique.
- Les « 499 tâches » ne représentent pas le travail restant : **498 tâches `queued` appartiennent à des runs déjà terminés ou annulés**. Parmi elles, **473 correspondent déjà à des pages publiées**. Le tableau de bord les compte à tort parce qu’il additionne toutes les tâches `queued/running`, sans limiter au run actif ni à un emplacement réellement manquant.
- Il n’y a actuellement **aucune tâche `running` ni verrou bloqué**. Le cron, le superviseur et l’orchestrateur répondent bien.
- Le run courant progresse ville par ville et ne contient que les pages manquantes, mais ses compteurs démarrent à `0/0` tant que les lots suivants ne sont pas matérialisés; cela produit un état visuel trompeur.
- La cause principale des échecs est `AI response incomplete (< 800 words or malformed)`; un cas est un timeout de 45 s.
- Cause technique du cycle d’échec : une réponse IA incomplète est mise en cache avant validation. Les tentatives suivantes relisent instantanément cette même réponse invalide, retournent 502, puis épuisent les essais sans véritable nouvelle génération.
- Le watchdog existant remet bien une tâche `running` de plus de 90 secondes en attente, mais il ne nettoie pas la file historique et ne distingue pas clairement un pipeline actif d’un pipeline partiellement terminé ou bloqué.

## Corrections à appliquer

### 1. Assainir la file sans supprimer de données

- Conserver tout l’historique, mais reclasser les anciennes tâches `queued` rattachées à des runs terminés/annulés en état terminal approprié (`skipped` si la page existe déjà, `cancelled` sinon).
- Faire compter la file uniquement à partir des tâches actionnables du run actif et d’emplacements encore manquants.
- Ajouter une protection pour qu’une page existante/publiée soit toujours terminale, même si une ancienne tentative a échoué.
- Empêcher la création de tâches concurrentes en doublon pour un même emplacement.

### 2. Corriger les reprises et les blocages

- Lors d’une nouvelle tentative après réponse invalide, contourner la réponse IA mise en cache afin d’obtenir une vraie nouvelle génération.
- Conserver le backoff borné et les trois tentatives; exposer clairement timeout, réponse invalide et autres erreurs.
- Renforcer le watchdog : détecter les tâches `running` sans progression, les remettre en attente et poursuivre les autres tâches admissibles sans bloquer le lot entier.
- Finaliser automatiquement un lot/run quand il n’a plus aucune tâche réellement active; utiliser `PARTIELLEMENT TERMINÉ` si des erreurs terminales subsistent, et `BLOQUÉ — ACTION REQUISE` si du travail reste mais aucun traitement actif ne progresse.

### 3. Unifier les compteurs avec l’état réel

- Étendre la source de vérité serveur afin qu’elle retourne : progression publiée/planifiée, file active réelle, tâche réellement traitée, tâches bloquées, erreurs terminales et emplacements restants.
- Calculer `1536 / 1568` depuis les emplacements actuels, indépendamment des anciens journaux de tâches.
- Ne montrer `EN COURS` que lorsqu’un worker traite réellement une tâche récente ou qu’une tâche active est admissible dans le run courant.
- Remplacer le `0 / 0` par les compteurs réels du run ou par l’état partiel/bloqué approprié.

### 4. Rendre les 30/32 cas compréhensibles et réparables

- Ajouter une liste globale détaillée des erreurs/restantes avec : ville, matériau ou service, type de page, statut, message, dernière tentative et nombre de tentatives.
- Ajouter `Régénérer` sur chaque emplacement, sans toucher aux pages déjà publiées.
- Conserver l’action groupée, mais la limiter strictement aux emplacements encore manquants et réellement en erreur; ignorer ceux déjà actifs ou publiés.
- Rafraîchir automatiquement chaque ligne pendant son traitement et refléter le résultat réel en base.

## Validation

- Ajouter des tests déterministes pour les états : page réussie, échouée, bloquée, en attente et déjà publiée.
- Vérifier qu’une réponse invalide n’est pas réutilisée au retry et qu’un timeout est récupérable.
- Tester une nouvelle génération sur un emplacement réellement manquant, une régénération individuelle et un petit lot d’erreurs, sans jamais régénérer les 1 536 pages publiées.
- Vérifier en base et dans les journaux que les tâches passent correctement de `queued` à `running`, puis `succeeded` ou `needs_retry`, qu’aucune tâche bloquée n’arrête la file, et que les totaux UI correspondent exactement aux emplacements réels.
