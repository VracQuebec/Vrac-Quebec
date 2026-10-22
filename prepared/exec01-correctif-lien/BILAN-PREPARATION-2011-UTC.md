# Bilan ciblé — suite de la demande du 22 octobre 2026, 20:11 UTC

## Livrables

Créés dans `prepared/exec01-correctif-lien/` :
- `MESSAGES-CLIENT-NON-INTEGRES.md` : textes français et points d’intégration future précis; aucune interface modifiée.
- `PROTOCOLE-HEBERGE-ISOLE-NON-EXECUTE.md` : prérequis, matrice réception Outlook/iPhone, sécurité et autorisations.
- `COMPTEURS-HISTORIQUES-ET-RETOUR-ARRIERE.md` : reconnaissance sans données privées, stratégie humaine non activée, preuves d’inverse et risque ambigu.
- `verification-preparation-locale.ts` : dix contrôles exécutables avec refus hors base loopback jetable et adresses fictives; aucun fournisseur courrier.
- Ce bilan.

`roadmap.md` : suivi documentaire ciblé actualisé. SQL préparé, référence SQL, interface publique, SEO et fonctions actives : inchangés.

## Tests exécutés aujourd’hui

1. **PostgreSQL local réel + adaptateur HTTP préparé et courrier capturé** : 54/54 tests, cinq fichiers, zéro ignoré, à 20:12:29 UTC. Commande :
```text
EXEC01B_LOCAL_TEST=1 bunx vitest run --no-file-parallelism src/test/remblai-correctif-15minutes.test.ts src/test/remblai-lien-personnel.test.ts src/test/remblai-installation-sql.test.ts src/test/remblai-exec01b.test.ts src/test/remblai-portal-errors.test.ts
```
2. **Contrôles locaux supplémentaires** : 10/10 avec
```text
EXEC01B_LOCAL_TEST=1 bun prepared/exec01-correctif-lien/verification-preparation-locale.ts
```
Empreintes initiale/corrigée, inverse octet pour octet, métadonnées/sentinelle inchangées, second inverse et dérive refusés, historique cinq/six sans date, date future, date passée ambiguë, révocation. Le contrôle ambigu réussit parce qu’il démontre le comportement indésirable; il n’autorise PAS le déploiement.
Première exécution du nouveau script : cinq contrôles puis erreur de qualification `digest`; corrigée vers `extensions.digest` dans la fixture seulement. Deuxième exécution complète : dix réussites, aucune erreur. Chaque base fictive créée est retirée par le harness; aucune restauration ni sauvegarde effectuée.

## Non testés dans cette suite

- Aucun test hébergé, JWT/Auth/Storage/passerelle/file complète; aucun environnement hébergé séparé identifié.
- Aucun vrai courriel, aucune réception Outlook, aucun vrai iPhone/Safari; aucune nouvelle simulation navigateur. Les captures de la validation précédente restent des preuves antérieures, pas des résultats rejoués aujourd’hui.
- Attente locale testée avec dates fictives; attente de 15 minutes réelles non chronométrée aujourd’hui.
- Logs hébergés et état actuel de production non examinés. Empreintes vérifiées contre la référence relevée auparavant, pas contre une nouvelle lecture de production.
- Liste réelle de sauvegardes et disponibilité de restauration non vérifiées.
- Textes préparés non rendus à l’écran; refus serveur générique ne fournit pas de compteur ou délai fiable.

## Verdict et risques

**Prêt pour poursuivre les tests locaux; tests hébergés bloqués par absence d’environnement distinct confirmé. Pas prêt à autoriser le déploiement.**
Risque bloquant : un ancien compteur avec date de code passée peut être automatiquement remis à zéro par la règle préparée. Aucun traitement réel réalisé. Avant déploiement, résoudre cette ambiguïté en préservant les données et sans réparation automatique non autorisée, puis repinner les empreintes et retester l’inverse si le SQL change.
Autres risques : ordre de livraison des courriels et renouvellements qui désactivent le lien utilisé; quota réseau réel non revérifié; réponses génériques; code consommé et liens révoqués non restaurés par inverse; sauvegarde non confirmée.

## Étapes et accords nécessaires

1. Confirmer un environnement existant réellement séparé; pas de création ni coût implicite.
2. Autoriser séparément toute création/souscription, installation SQL, déploiement TEST, fixtures hébergées ou nettoyage ciblé.
3. Autoriser explicitement un nombre limité d’envois Outlook à une boîte dédiée avant toute réception réelle.
4. Autoriser et retester tout futur correctif préparé pour états historiques ambigus; toute intervention sur dossiers réels réclame un accord spécifique, sans automatisme.
5. Fournir une preuve de sauvegarde disponible; autorisation distincte pour sauvegarde, export ou restauration par l’agent.
6. Après essais isolés concluants et intégration des messages autorisée : nouveau contrôle en lecture seule de production puis autorisations séparées pour application SQL, déploiement, publication et tests réels. Ne pas lancer de retour arrière sans accord spécifique.

**Aucune action en production, publication, migration hébergée, sauvegarde, export, restauration ni envoi réel effectué.** Les fichiers SQL de correction et d’inverse ont été exécutés uniquement dans des fixtures PostgreSQL locales jetables pour les tests demandés; aucune migration n’a été lancée ou enregistrée dans l’application.