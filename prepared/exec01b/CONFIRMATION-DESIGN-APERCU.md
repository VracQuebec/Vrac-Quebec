# Courriel remblai — refonte visuelle non déployée

Rendu : `confirmation-email.ts`, appelé seulement par la fonction de présentation existante `confirmationMessage` dans `endpoint.ts` préparé. Aucun changement du gestionnaire d’envoi, destinataire, génération de jeton, RPC, paramètres ou fichier actif. La copie autonome du serveur n’est pas remplacée dans ce lot ; ce rendu doit être intégré à un futur paquet uniquement après accord.

Objet et contenu français demandés, blanc/vert exact #7DD520/noir/neutres, icône officielle `public/icons/icon-192.png` associée au nom de marque. Logo en image existante, texte lisible même si images bloquées. Coordonnées publiques réellement configurées : 819-592-3495 et vracquebec.ca, aucune adresse postale/courriel inventée.

Tables de présentation, largeur fluide/max 600 px, Arial/Helvetica, styles inline, structure Outlook conditionnelle et bouton avec mso-padding-alt ; sans flex/grid, police/CSS externe ni effet complexe. Aucun nouveau parcours/URL de suivi produit : URL fournie conservée octet pour octet avant échappement HTML. Une URL manquante/invalide ne crée aucun bouton trompeur. Noms absents et variables brutes remplacés par « Bonjour, », données échappées.

## Désabonnement : limite non masquée
Le courriel actuel `confirmationMessage(to,name,url)` ne reçoit aucune URL de désabonnement. Le jeton reste dans l’enveloppe existante gérée par la file/fournisseur, inchangé ; sa transformation en lien visible ou en lien d’en-tête n’a pas été vérifiée par un envoi réel. Le rendu accepte facultativement une URL existante fournie, sans construire de jeton ni inventer de route. **Le pied de page de désabonnement visible final reste à vérifier/raccorder au mécanisme existant avant activation**, avec autorisation distincte si cela exige de modifier l’adaptateur. Les aperçus n’affichent pas de lien inventé.

## Validation exécutée
- 5 tests ciblés réussis : destinataire/URL inchangés, confidentialité du contenu, variables absentes, échappement, URL dangereuse refusée et URL de désabonnement fournie conservée.
- Régression `test-local.sh` : 91 réussis, 0 échec, 24 ignorés pour suites nécessitant le second cluster (non relancées dans ce lot). SQL local jetable uniquement.
- 6 rendus Chromium inspectés : téléphone 390 px, tablette 768 px, ordinateur 1280 px ; nom long et variables manquantes, logo visible et aucun débordement. Lien du bouton fictif fourni par le harnais, jamais ouvert ni envoyé. Captures sous `/tmp/browser/courriel-confirmation/`.
- Pas de test réel Outlook/Gmail/Apple Mail, pas d’iPhone/Android physique, pas d’envoi réel. La compatibilité est préparée, pas certifiée par le navigateur.

Aucun déploiement, publication, changement serveur actif, permission, demande réelle, CRM ou SEO. Le sujet en production reste inchangé tant que cette préparation n’est pas activée.