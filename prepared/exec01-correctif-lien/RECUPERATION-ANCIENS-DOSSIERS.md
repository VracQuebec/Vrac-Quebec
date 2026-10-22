# Récupération manuelle des anciens dossiers bloqués — procédure préparée, NON exécutée

Aucun dossier réel lu ni modifié. Aucune requête SQL de réinitialisation préparée. La règle corrigée laisse ces dossiers bloqués volontairement : ce document décrit la seule voie de sortie, humaine et dossier par dossier.

## Principes

- Aucune réparation automatique ni groupée; un état ambigu reste bloqué.
- Ne jamais restaurer un ancien code, réactiver un lien révoqué ou inventer une date de blocage.
- Une seule personne autorisée (administrateur) agit; une seconde approuve.

## Étapes

1. **Demande entrante** : le client appelle ou texte le 819-592-3495. Aucune action par courriel entrant seul.
2. **Identité par canal approuvé** : rappel au numéro déjà enregistré au dossier (pas celui fourni pendant l’appel s’il diffère) et confirmation de deux éléments connus du dossier (ex. ville du chantier, matériau). Jamais demander ni dicter un code ou un lien.
3. **Vérification du dossier** depuis le CRM existant : le dossier existe, n’est pas fermé, l’adresse courriel enregistrée est inchangée (vérifiée visuellement, non recopiée). Constater l’état du lien : bloqué ancien, bloqué récent (forme cohérente, attendre 15 min), révoqué, expiré.
4. **Décision** : si l’état n’est pas clairement l’ancien blocage, ou si un élément d’identité ne concorde pas → refus, aucune action, consigner « refusé – identité/état non concordant ».
5. **Autorisation explicite** de l’approbateur, horodatée, avant toute nouvelle émission.
6. **Action unique** : émettre un nouveau lien par la fonction administrative existante (`issue`), qui révoque les anciens et envoie à l’adresse enregistrée seulement. Respect des limites (1/min, 5/24 h). Aucune modification directe des compteurs.
7. **Confirmation** : le client confirme réception; il demande lui-même son code. Sinon, ne pas renvoyer en boucle.

## Trace d’audit (sans donnée sensible)

Champs autorisés : date UTC, identifiant interne du dossier, rôle de l’agent et de l’approbateur, canal (« rappel téléphone enregistré »), résultat (accordé/refusé), motif court.
Interdits : code, jeton, lien, hash, adresse courriel, numéro de téléphone, contenu de l’échange.
Le journal doit être en ajout seulement (journal existant `audit_log`/`request_followup_events`; aucun nouveau tableau préparé).

## Hors périmètre

Inventaire agrégé des liens bloqués en production : requête SELECT documentée dans `COMPTEURS-HISTORIQUES-ET-RETOUR-ARRIERE.md`, non exécutée, autorisation de lecture requise.
