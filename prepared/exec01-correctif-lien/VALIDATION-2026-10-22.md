# EXEC-01 — validation préparée, aucune opération en production

## Fonction et portée exacte
`public.exec01_dispatch(p jsonb) RETURNS jsonb`.
Lecture seule le 22 octobre 2026 à 20:00:57 UTC et seconde lecture en fin de validation : empreinte MD5 PostgreSQL `2da0b80649cfacf5db57fe559adab3c2` inchangée.
Empreinte corrigée attendue : `447920fb7b5e8902f6cd2e9118c26ef5`.

Le correctif exige désormais trois remplacements dans cette seule fonction : garde commune code/verify/renew, condition de renouvellement, compteur du cinquième échec. Il ne serait donc plus honnête de le présenter comme une seule condition changée. Aucun changement de colonne, table, permission ou quota IP; lecture et actions restent identiques octet pour octet.

Après cinq codes erronés : compteur saturé à cinq, code effacé, vérification du lien invalidée. `code_expires_at` devient la fin du délai de 15 minutes depuis le cinquième échec. La double utilisation de cette date est discriminée par `failures>=5` et `code_hash=NULL`. Après délai, compteur remis à zéro et nouveau code requis; jamais réactivation d’un ancien code. Sixième tentative refusée sans prolonger le délai.
Renouvellement au contact enregistré inchangé; un lien/minute, cinq liens/24 h; anciens liens révoqués. Contact jamais vérifié : lecture refusée avant code. Contact déjà vérifié : consultation préservée via nouveau lien valide, mais actions avec confirmation et code de CE lien depuis moins de dix minutes.

## Fichiers
- `0231_renouvellement_premiere_verification.sql` : correction avec garde signature/empreinte/texte exact.
- `0231_retour_arriere_NON_APPLIQUE.sql` : inverse des trois blocs avec les mêmes gardes.
- `production-reference.sql` : définition lue, aucune donnée client ou secret; référence pour essais locaux uniquement.
- `prepared/exec01b/schema.sql` : même définition dans le modèle local.
- `src/test/remblai-correctif-15minutes.test.ts` : 17 tests nouveaux.
- Règles de projet, mémoire et feuille de route : limites durables et distinction préparation/production.

## Tests réels locaux
54/54 réussis, cinq fichiers, aucun désactivé. PostgreSQL réel vide et jetable sous `/tmp/exec-correctifs/pgdata`, 127.0.0.1:55439; contacts `.invalid`, aucun fournisseur mail.
17 nouveaux tests : 0/1/4/5/6 erreurs; délai exact 900 secondes et expiration; ancien code consommé; contact vérifié; révocation; renouvellement; 60 secondes/cinq liens par 24 h; quota réseau 30/minute; confirmation/code même lien récent; doubles requêtes; capture renouvellement; garde et inverse exact.
Suites existantes : première vérification, code faux/expiré, deux demandes même contact, croisement refusé, modification du dossier sans doublon, champs interdits, idempotence, courrier atomique, photos, historique immuable.
Première exécution parallèle : collision des rôles partagés de la base locale. Relance sans parallélisme de fichiers. Une entrée de test de modification sans conditions recevait correctement 400 : ajout des conditions pour tester réellement la révocation (403). Résultat final 54 réussis, zéro échec.

```text
EXEC01B_LOCAL_TEST=1 bunx vitest run --no-file-parallelism src/test/remblai-correctif-15minutes.test.ts src/test/remblai-lien-personnel.test.ts src/test/remblai-installation-sql.test.ts src/test/remblai-exec01b.test.ts src/test/remblai-portal-errors.test.ts
```

Inverse exécuté uniquement sur base locale fictive : définition restaurée à l’identique. Les gardes refusent seconde application, second inverse et modification inattendue du texte. Si signature, empreinte ou texte diffèrent : BLOQUÉ, jamais adaptation automatique.

## Navigateur et simulations
Chromium réel, aperçu avec HTTP local et courrier capturé en mémoire : lien expiré → renouvellement → mauvais/bon code → consultation mobile/ordinateur → pause avec confirmation → panne simulée puis double clic réussi. Un dossier, un événement, anciens liens refusés. Fragment retiré, aucun code/jeton observé dans la console. Largeurs 390 et 1280 sans débordement. Scripts et captures temporaires : `/tmp/browser/exec01-final`.
L’interface de coordination EXEC-02 appelle un endpoint distinct absent de ce harness et affiche une erreur locale : hors couverture, non activée. Aucune requête externe autorisée.
Ce n’est PAS un essai iPhone réel, Safari ou Outlook. Aucune réception réelle dans une boîte; aucune vérification de redirection www dans cette tâche. Les pannes réseau sont simulées. JWT/Cloud, déclencheurs complets et fournisseur restent à vérifier en environnement distinct.

## Risques résiduels
- Compteurs historiques >=5 sans date connue restent refusés : analyse/correction ciblée nécessiterait autorisation, aucune réparation automatique de production.
- Les messages actuels ne décrivent pas encore les 15 minutes : préparer leur modification avant publication; interface non modifiée ici, conformément au périmètre prepared/tests.
- Quota réseau SQL local testé, raccordement passerelle réelle non retesté; traitement actif inchangé.
- Sauvegarde récente non confirmée : liste réelle inaccessible.

## Protocole manuel isolé Outlook/iPhone — non exécuté
1. Fournir un environnement réellement distinct et sans dossiers clients, avec mail de test limité à une boîte dédiée; jamais la production comme substitut.
2. Autoriser séparément toute création payante et tout envoi de test; tout vrai envoi est actuellement interdit.
3. Dossier fictif uniquement, contenu capturé contrôlé avant envoi autorisé.
4. Ouvrir le renouvellement reçu dans Outlook sur vrai iPhone, Safari, Chrome et ordinateur; vérifier URL sans exposer jetons dans les preuves.
5. Vérifier anciens/nouveaux liens, codes, cinq erreurs/délai, renvoi, deux dossiers, actions confirmées, panne/reprise et absence de doublon.
6. Lire le même dossier dans le CRM administrateur TEST, contrôler conditions et historique; examiner journaux sans révéler secrets.

## Sauvegarde — étapes manuelles, aucune opération lancée
Dans la liste réelle Backups de Lovable Cloud : relever date/heure et fuseau, convertir en UTC; état terminé, disponibilité pour restauration, rétention et taille affichée. Si taille absente : NON CONFIRMÉE, obtenir l’information sans lancer d’export. Capture sans secrets et portée explicitement confirmée. La seule date antérieure déclarée était le 19 octobre 2026 à 04:41:30 UTC : disponibilité actuelle non confirmée, pas une preuve récente.
- Base : structure et données selon portée affichée, à confirmer; les références SQL ne sauvegardent pas les octets des photos.
- Code : sources et fonctions déployées à conserver séparément.
- Photos : objets de stockage à sauvegarder séparément.
- Secrets : configuration sécurisée/procédure de rétablissement distinctes; jamais de valeurs dans les rapports ou captures.

## Autorisations nécessaires
Avant toute opération proposée : nouvelle lecture seule de signature/empreinte/texte; toute divergence = BLOQUÉ. La garde répète le contrôle au moment de l’application.
Exigent une autorisation explicite : sauvegarde/export/restauration par l’agent; environnement payant; traitement des compteurs historiques; application SQL/fonction préparée; retour arrière; modification données/permissions/RLS; déploiement; publication; création de dossier hébergé; envoi effectif, même boîte TEST. Aucun effectué en production ici.
Ordre futur proposé : preuve sauvegarde disponible → tests intégration isolée/Outlook → messages préparés → autorisation du périmètre → nouvelle lecture empreinte → correction ciblée et publication seulement si autorisées → contrôles autorisés. Jamais retour arrière ni restauration automatique.

Verdict : prêt pour poursuivre les tests isolés; pas prêt à déclarer le parcours réel Outlook validé ni à déployer sans autorisation.