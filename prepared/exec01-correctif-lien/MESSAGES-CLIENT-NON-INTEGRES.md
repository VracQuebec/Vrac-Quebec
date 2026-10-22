# Messages client — préparés seulement

Aucun texte intégré à l’interface, aucun courriel envoyé. Phrases courtes, paragraphes distincts, sans adresse client, identifiant, code ou jeton interpolés.

## Textes proposés

**Information préventive, visible avant la saisie**
« Après cinq codes incorrects, la vérification est bloquée pendant 15 minutes. Un sixième essai ne prolonge pas ce délai. Après l’attente, demandez un nouveau code. »

**Refus générique actuel — ne pas annoncer un blocage confirmé**
« Code incorrect, expiré ou vérification temporairement bloquée. Après cinq codes incorrects, attendez 15 minutes à partir du cinquième essai, puis demandez un nouveau code. Réessayer ne prolonge pas ce délai. »

**Blocage confirmé, seulement si une future réponse sûre permet de le distinguer**
« Cinq codes incorrects ont été saisis. Attendez 15 minutes à partir du cinquième essai. Un nouvel essai ne prolonge pas l’attente. »

**Après l’attente — instruction, pas promesse de déblocage**
« Après les 15 minutes, demandez un nouveau code. Le code précédent ne peut plus être utilisé. »
Bouton existant à conserver : « Recevoir un code » ou « Renvoyer un code ».

**Avant renouvellement**
« Demander un nouveau lien désactive les anciens liens de cette demande. Utilisez seulement le plus récent. »

**Renouvellement accepté**
« Un nouveau lien a été demandé pour l’adresse courriel de votre demande. Les anciens liens ne fonctionnent plus. Ouvrez le nouveau courriel pour continuer. »
Ne pas dire « reçu » ou garantir l’arrivée du courriel après une simple mise en file.

**Renouvellement refusé, sans divulguer sa cause exacte**
« Le nouveau lien ne peut pas être demandé pour le moment. Si vous avez saisi cinq codes incorrects, attendez 15 minutes. Les demandes de lien sont limitées à une par minute et cinq sur 24 heures. Un lien désactivé ne peut pas être réutilisé. »

**Courriel absent**
« Vérifiez les courriels indésirables et vos autres dossiers de messagerie. Si vous avez demandé plusieurs codes ou liens, utilisez seulement le plus récent. Évitez les demandes répétées. Si rien n’arrive, contactez Vrac Québec au 819-592-3495. »

**Problème persistant / compteur historique**
« Si le problème continue après l’attente et une nouvelle demande de code, contactez Vrac Québec au 819-592-3495. Ne transmettez jamais votre code ni votre lien personnel. »

**Panne réseau**
« La connexion a été interrompue. Vérifiez votre réseau, puis réessayez. Avant une nouvelle modification, vérifiez si la précédente a été enregistrée. »
Éviter « non enregistré » lorsque la réponse a été perdue après validation serveur.

## Fichiers d’intégration future — aucun modifié

| Fichier | Point exact actuel | Texte à intégrer après autorisation |
|---|---|---|
| `src/pages/RemblaiFollowup.tsx` | `requestCode()`, lignes 99–102 | Refus générique, attente, courriel absent; ne pas orienter uniquement vers renouvellement pendant blocage |
| Même fichier | `verify()`, lignes 103–106 | Refus générique, sixième essai, nouveau code après attente |
| Même fichier | Section première vérification ligne 135 et section avant modification ligne 142 | Information préventive et aide courriel; courts paragraphes dans les régions accessibles existantes |
| Même fichier | Appel `service.renew(...)`, ligne 134 | Avertissement avant renouvellement et message après acceptation |
| Même fichier | `commit()`, ligne 112 et gestionnaire `run()` | Panne réseau sans prétendre connaître le résultat, saisies conservées et même clé d’opération pour reprise |
| `src/lib/remblai/cloud-client.ts` | `cloudPortalCall()`, lignes 10–23; `renew`, ligne 30 | Messages génériques centralisés, aide attente et plafonds; jamais corps de requête ni erreur brute |

Les lignes sont des repères de la version examinée; les noms des fonctions sont la référence durable. Ne modifier aucun titre, URL, contenu public ni autre module.

## Limites d’intégration

Le serveur renvoie actuellement un refus générique (`denied` / HTTP 403) pour plusieurs causes. Ne pas déduire un délai restant ou un compteur serveur depuis les seuls essais du téléphone; ne pas démarrer un compte à rebours de 15 minutes au sixième essai. Le message préventif et le refus conditionnel fonctionnent sans nouvelle réponse serveur. Une réponse dédiée ou une échéance fiable exigerait une conception et une autorisation distinctes, sans informations privées et après validation du lien.

Sur mobile : paragraphes empilés, pas d’alerte modale imposée pour chaque essai, `role="alert"` pour le refus et `role="status"` pour la progression, boutons désactivés pendant l’appel, aucune donnée sensible dans un libellé. Ces consignes ne constituent pas une vérification de rendu : l’interface n’a pas été modifiée.