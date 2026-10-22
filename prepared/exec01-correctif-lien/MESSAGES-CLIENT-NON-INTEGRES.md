# Messages client — préparés seulement (mise à jour 22 octobre 2026, 20 h 45 UTC)

Rien n’est intégré à l’interface; aucun courriel envoyé. Phrases courtes pour mobile (une idée par ligne). Jamais de code, jeton, adresse courriel, identifiant de dossier ou détail interne interpolé. Aucun message n’annonce une réussite tant que le serveur n’a pas répondu positivement.

## Contrainte technique à connaître

La règle serveur actuelle et la version corrigée répondent seulement `denied` (refus générique), sans nombre d’essais restants ni motif. Tant qu’aucune réponse distincte n’est approuvée et déployée, l’interface doit utiliser les **messages génériques (G)**. Les **messages précis (P)** ne s’affichent que si une future réponse serveur sûre les distingue (modification non préparée, à autoriser séparément). Le nombre restant ne serait renvoyé qu’après un code erroné sur un lien valide, jamais pour un lien inconnu ou révoqué.

## 1. Code erroné

- **P** « Code incorrect. Il vous reste {n} essai(s) avant un blocage de 15 minutes. » ({n} = 1 à 4, seul chiffre interpolé)
- **G** « Code incorrect ou expiré. Vérifiez le dernier code reçu. Après cinq codes incorrects, la vérification est bloquée 15 minutes. »

## 2. Cinquième erreur — blocage de 15 minutes

- **P** « Cinq codes incorrects ont été saisis. Par sécurité, la vérification est bloquée pendant 15 minutes. »
- **G** utilise le message 1 G (le blocage n’est pas confirmé par le serveur).

## 3. Nouvel essai pendant le blocage

- **P** « La vérification est encore bloquée. Attendez la fin des 15 minutes. Réessayer ne prolonge pas l’attente. »
- **G** « Vérification impossible pour le moment. Si vous avez saisi cinq codes incorrects, attendez 15 minutes avant de réessayer. »

## 4. Fin du blocage

« Le délai est terminé. Demandez un nouveau code : l’ancien ne peut plus être utilisé. »
Bouton existant : « Recevoir un code ». Ne pas écrire « débloqué » avant que la demande de code réussisse.

## 5. Lien révoqué ou expiré

« Ce lien n’est plus valide. Il a peut-être été remplacé par un lien plus récent ou il a expiré. Utilisez le dernier courriel reçu ou demandez un nouveau lien. »
Après demande : « Si la demande est acceptée, un nouveau lien sera envoyé à l’adresse courriel de votre demande. » (formulation conditionnelle : la réponse ne confirme pas l’envoi effectif).

## 6. Ancien dossier bloqué (état ambigu)

« Nous ne pouvons pas rétablir l’accès automatiquement pour cette demande. Pour votre sécurité, une vérification par notre équipe est nécessaire. Appelez ou textez le 819-592-3495. »
Note : côté client, ce cas ressemble au refus 3 G tant que le serveur ne le distingue pas. Afficher le numéro public après deux refus consécutifs plutôt que d’affirmer un état ambigu.

## Erreur réseau

« Connexion impossible. Rien n’a été modifié. Vérifiez votre réseau, puis réessayez. »
(vrai seulement si la requête n’a pas reçu de réponse; sinon utiliser le refus générique.)

## Emplacements d’intégration future (non modifiés)

`src/pages/RemblaiFollowup.tsx` (états vérification / refus / renouvellement) et `src/lib/remblai/cloud-client.ts` (classement des erreurs). Intégration seulement après autorisation.
