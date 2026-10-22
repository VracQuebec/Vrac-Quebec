# Vrac Québec Simple — bilan de préparation à l’activation

> **Bilan historique de 22:57 UTC, supersédé pour l’état courant** par `VALIDATION-COMPLETE-ET-AUTORISATIONS.md` : nouveaux défauts corrigés, composition à cinq étapes/sept gardes, 196 tests Vitest + 3 Deno + 10 contrôles. Validation hébergée et interface unknown restent bloquées. Ne pas utiliser les anciennes empreintes finales et l’ordre à quatre étapes ci-dessous pour activer le paquet actuel.

Date : 22 octobre 2026, essais locaux terminés à 22:55 UTC. Aucun déploiement, publication, migration hébergée, écriture de production, changement de droits, courrier réel ou ressource payante.

## Verdict
**PRÊT POUR LES TESTS ISOLÉS.** Paquet autonome et SQL réversible préparés, contrôles locaux réussis. **Pas prêt pour validation finale ni activation de production** : environnement complet distinct absent/non prouvé, stockage/identité/file hébergés non testés, date de sauvegarde et restauration non vérifiées, stratégie historique à approuver.

## 1. Fichiers modifiés ou créés
- `prepared/exec01b/endpoint.ts` : refus d’envoi non atomique hors capture locale, origine locale contrôlée, résultat de capture seulement.
- `prepared/remblai-formulaire/formulaire-NON-APPLIQUE.sql` : présence/type de version et opération, vérification du lien exact avant lecture et rejeu de photos.
- `prepared/remblai-formulaire/composition.ts` : générateur uniquement pour loopback jetable vérifié, composition des références réelles et inverses.
- `prepared/remblai-formulaire/references/` : catalogue daté et six définitions originales exactes, avec empreintes.
- `prepared/remblai-formulaire/sql-compose/` : activation transactionnelle non appliquée, inverse complet, quatre inverses d’étapes et toutes empreintes.
- `prepared/remblai-formulaire/serveur/` : dix modules autonomes Deno, test de deux cas, manifeste SHA-256 et règles. Aucune dépendance à `src/` à l’exécution ; versions npm épinglées. L’entrée conserve les drapeaux et l’adaptateur atomique du projet actuel. Aucun fichier copié vers `supabase/functions/`.
- `src/test/remblai-original-form.test.ts`, `src/test/remblai-composition.test.ts`, `src/test/remblai-exec01b.test.ts` : sécurité, reprise, concurrence et compatibilité des références exactes ; capture locale explicitée dans l’ancien test.
- `prepared/remblai-formulaire/test-local.sh`, `test-liens-local.sh` : deux clusters vides détruits après essais, jamais de connexion hébergée.
- `STRATEGIE-ANCIENS-LIENS.md`, `ENVIRONNEMENT-ET-MATRICE-ISOLEE.md`, ce bilan, `RAPPORT.md`, `ACTIVATION-ET-VALIDATION-ISOLEE.md`, `AGENTS.md`, `roadmap.md`.

Aucune page publique, texte public, URL ou donnée SEO changé dans cette session.

## 2. Défauts corrigés dans la préparation
1. **Lien du courriel initial encore limité à 30 jours** : il contourne le dispatcher et est créé par `exec01_enqueue_confirmation`. Ajout de son changement exact de durée à la composition, sans changement de file/destinataire/idempotence. Les deux chemins réels de création retrouvés sont couverts pour les nouveaux liens.
2. **Version SQL nulle pouvait contourner `<>`** : l’absence, null, type incorrect et opération incomplète sont refusés avant mutation.
3. **Contact déjà vérifié ≠ nouveau lien vérifié** : la lecture nécessite désormais la vérification de CE lien. Une réponse sauvegardée rejouée via autorisation de photos exige aussi le code récent de CE lien, avant retour de données.
4. **Envoi séparé après mutation** : impossible hors environnement local capture-only. Sans adaptateur atomique, refus avant toute écriture ; renouvellement ne peut plus révoquer le lien puis échouer dans un envoi séparé.
5. **SQL par fragments sans inverse complet** : composition à états intégralement épinglés ; droits/propriétaire/type/search_path et droits effectifs contrôlés à chaque étape. Toute divergence bloque. Inverses par étape et inverse intégral testés, aucune restauration de droits.
6. **Paquet serveur non autonome** : dépendances locales fermées, versions npm épinglées, contrôle TypeScript Deno du vrai point d’entrée réussi (pas seulement un bundle JavaScript).

Conservation déjà préparée et revalidée : anciennes descriptions sans marqueur inchangées, JSON null des photos remplacé par références historiques réelles, aucune photo privée hors dossier, barrière des fichiers en suppression, erreur sans faux succès, rejeu sans doublon, fermeture avec historique et statut commercial inchangés. Aucun comportement commercial nouvellement appliqué ; changements de durée et protection sont proposés seulement. Géocodage après adresse changée reste à valider en isolé.

## 3. Définitions et droits réels vérifiés en lecture seule
Références récupérées au catalogue à 22:45–22:47 UTC ; fidélité UTF-8/MD5 contrôlée. Ce ne sont pas des sauvegardes de base et elles ne contiennent pas de demandes.

Dernier contrôle en lecture seule à 22:57 UTC : les trois empreintes originales et ACL de production restent identiques ; aucune définition préparée n’a été appliquée.

| Fonction | Empreinte originale réelle | Empreinte préparée finale |
|---|---|---|
| `public.exec01_dispatch(jsonb)` | `2da0b80649cfacf5db57fe559adab3c2` | `0e22563a8ea2559e52cd7717d02921f9` |
| `public.exec01_projection(uuid,boolean)` | `e4cec3f904e15ec6ef264a22f71298c1` | `effd16af586b2222d7a16c1ce2fcc8fe` |
| `public.exec01_enqueue_confirmation(jsonb)` | `7262c4525163637476d42b57c8b63c82` | `6a85648de113e2c2c2b8aaf3c1bb9705` |

Trois retours jsonb, propriétaire postgres, SECURITY DEFINER ; dispatcher et confirmation search_path public/extensions, projection public. ACL observée `{postgres=X/postgres,service_role=X/postgres}` ; exécution effective anon/authenticated refusée, service_role autorisée. Aucune permission modifiée. Aucun ajout de table, colonne, index, policy ou backfill proposé dans la composition.

Dépendances exactes archivées et non modifiées : `exec01_dispatch_mail(jsonb,jsonb,boolean)` → dispatcher (empreinte `99da54e6fe02f7ad192bbecc3e355bee`), `exec01_photo_manage(jsonb)` (`797eadff98c2eca9cf750a29464524c2`), `exec01_quota(text)` (`49e2fbbcd39780e7fb7ff2e113dd553d`). `has_role(uuid,app_role)` existe, retourne boolean, SECURITY DEFINER public et empreinte `6e055322eaad390f6c2c3ef45fec6857` ; définition complète non archivée par ce lot puisqu’aucun changement proposé. Les droits plus larges de cette seule fonction de vérification ne sont pas reproduits sur les fonctions privées.

Appelants identifiés : point d’entrée projet `submission-owner-portal` → dispatcher, dispatch_mail, photo_manage, quota, has_role ; service de confirmation existant → enqueue_confirmation ; dispatcher → projection. Le catalogue SQL cible retrouve les deux créateurs réels. Les appels dynamiques externes et l’égalité du paquet projet avec le paquet réellement hébergé sont **non vérifiés** : obtenir l’archive exacte du déploiement précédent avant activation/retour serveur. Ne pas présenter une lecture du projet comme preuve du binaire hébergé.

Stockage : bucket `lead-photos` observé **privé**, 10 Mio, types historiques JPEG/PNG/WebP/HEIC/HEIF ; aucun réglage modifié. L’édition préparée reste limitée à JPEG/PNG/WebP, 4 Mo, signature 120 secondes et référence canonique. Les politiques détaillées du stockage réel et leur parcours complet ne sont pas certifiés par cette lecture de bucket.

## 4. Tests réellement exécutés
| Exécution | Résultat | Nature et limites |
|---|---|---|
| `test-local.sh`, 22:55 UTC | 85 réussis, 0 échec, 24 ignorés dans ce passage | Contrats + PostgreSQL loopback 55438 ; original-form 38 cas dont 21 SQL, composition 8 cas |
| `test-liens-local.sh`, 22:53 UTC | 54 réussis, 0 échec, aucun ignoré | PostgreSQL loopback 55439 ; inclut les 24 cas ignorés dans le premier passage |
| Contrôle historique de préparation | 10/10 réussis | Inverse 0231 exact, dérive et compteurs historiques ambigus refusés |
| Deno du paquet autonome | Types du point d’entrée réussis, 2 tests réussis | Aucun démarrage du serveur, aucune connexion Cloud, permissions réseau non accordées aux tests |
| Navigateur local | 3 formats réussis | Sept étapes/champs comparés au public, préremplissage, courriel protégé, photos et saisies après réouverture, validation invalide refusée, zéro erreur/débordement |

**Total : 139 tests Vitest distincts réussis + 2 tests Deno + 10 contrôles supplémentaires.** Aucun cas de ces suites ciblées reste ignoré après les deux exécutions. Les échecs intermédiaires de montage local (rôles créés en parallèle, connexion transactionnelle, test de capture non marqué local et unité inconnue de fixture) ont été corrigés ; ils ne sont pas présentés comme échecs de production.

SQL exécuté uniquement dans deux clusters locaux vides et détruits. Reprises après commit perdu, erreur annulée avant commit, versions nulles/périmées, modifications simultanées identiques/distinctes, refus interclient et fermeture conservatrice vérifiés. La composition a aussi exécuté une copie exacte de l’émetteur initial avec une **file locale simulée**, sans fournisseur de courrier, une seule entrée et un seul lien permanent.

Copies des résultats conservées dans `preuves/`. Captures navigateur : `/tmp/browser/remblai-final/` (script/résultats locaux, toutes sorties externes bloquées). Les formats sont simulés, pas un vrai iPhone/tablette. Le dépôt mémoire navigateur ne valide pas le serveur hébergé.

## 5. Blocages et coûts
- Environnement hébergé complet distinct : **non disponible/non prouvé**, aucune ressource créée. Matrice prête dans `ENVIRONNEMENT-ET-MATRICE-ISOLEE.md`.
- Auth/JWT de la cible, API réelle, upload/signature/lecture privée et file capturée hébergés : **non testés**.
- Exécution du paquet Deno avec les adaptateurs hébergés et en-tête de passerelle IP fiable : **non testée**.
- Archive exacte du paquet serveur précédemment déployé, drapeaux et origine hébergés : **non vérifiés**.
- Sauvegarde : déclarée enregistrée par le propriétaire le 22 octobre ; heure UTC/date du snapshot réel **non vérifiées**. Inventaire inaccessible aux outils.
- Restauration du snapshot et fichiers de stockage : **non vérifiés**. Retour des fonctions sur base jetable ≠ restauration de sauvegarde hébergée.
- Liens historiques : dates enregistrées inchangées. Décision requise entre renouvellement sécurisé et prolongation ciblée autorisée ; jamais réinitialisation automatique des compteurs ambigus.
- Courriel réel, réception Outlook/Safari iPhone, code réel et géocodage après édition : **non testés**, restent à autoriser séparément.

Nouvelle infrastructure facturée : aucune créée. Option ordinateur/CI existant : zéro nouvelle instance Cloud si capacité déjà incluse, frais CI/équipement non mesurés. Option Cloud distinct : coût variable en crédits, estimation chiffrée non vérifiée ; budget/plafond et accès requis avant création. Aucun achat engagé ; consommation normale des outils non assimilée à coût nul.

## 6. Sauvegarde et interventions du propriétaire
La documentation Cloud indique une sauvegarde automatique quotidienne, rétention environ 14 jours, base/schema/données seulement, pas fichiers de stockage. Aucun outil ici ne lit la liste réelle ; aucune sauvegarde/export/restauration lancés.

Avant autorisation : ouvrir **More → Database → Manage → Backups** sur Live, relever la date UTC réelle antérieure à l’opération et son environnement. Ne pas appeler la déclaration actuelle une preuve vérifiée. La restauration UI remplace la base du même projet, perd les écritures postérieures et peut rendre le code incompatible ; elle n’est pas un retour ciblé et ne doit pas servir de test de production.

Vérifier la restauration séparée après autorisation explicite dans une destination indépendante ; aucun export de données privées ni import de sauvegarde préparé/exécuté ici. L’option de copie réelle nécessiterait une autorisation spécifique et une stratégie confidentialité ; les tests fonctionnels doivent rester fictifs. Les objets Storage sont exclus des snapshots ; la disponibilité d’une conservation autorisée distincte des fichiers doit être vérifiée sans téléchargement automatique.

Interventions requises : désigner/autoriser cible isolée et budget ; confirmer date/possibilité de restauration ; fournir archive serveur antérieure exacte sans secrets ; approuver traitement des anciens liens et changements proposés ; autoriser séparément SQL, déploiement, publication et essai réel. Ne pas demander ni exposer des clés privées Cloud.

## 7. Procédure d’activation conditionnelle — aucune étape exécutée sur Live
1. **Autoriser et prouver l’environnement isolé**. Initialiser uniquement cette cible après autorisation, sans données réelles, courrier/SMS externe interdits ; exécuter la matrice complète avec stockage/JWT/file réels de test. Tout cas manquant maintient le blocage final.
2. **Geler le paquet** : types Deno, tests, manifeste SHA-256, archive du serveur hébergé antérieur exact et dépendances/drapeaux contrôlés. Vérifier aucune modification publique/SEO non approuvée incluse dans une future publication.
3. **Confirmer la sauvegarde antérieure et la restauration possible**, sans opération Live ; faire approuver la stratégie historique et le budget. Une sauvegarde datée ne certifie pas Storage.
4. **Après autorisation SQL distincte** : relire les trois définitions, types, propriétaires, ACL et droits effectifs, ainsi que dépendances/colonnes/contraintes ; toute divergence = arrêt, aucun ajustement automatique. Appliquer une seule composition transactionnelle `sql-compose/ACTIVATION-NON-APPLIQUEE.sql` : 0231 renouvellement/blocage → durée nouveaux liens → formulaire → durée confirmation initiale. Chaque transition vérifie l’état intégral avant/après. Ne pas appliquer en plus les prototypes historiques séparés.
5. **Contrôle SQL sans demande réelle** : trois empreintes finales, propriétaire, retour jsonb, droits/search_path exacts, aucune permission/table/index modifiée. Les demandes existantes et leurs échéances ne sont pas mises à jour. Si échec dans transaction, annuler ; si divergence après commit, arrêter avant déploiement.
6. **Après autorisation de déploiement distincte** : installer seulement le paquet serveur validé et ses dépendances, conserver courrier atomique et drapeaux approuvés. Vérifier origine/CORS, IP fiable, absence de connexion TEST/Live croisée, stockage privé et contrats disponibles. Ne pas copier les sources préparées en chemins actifs avant cette autorisation.
7. **Après autorisation de publication distincte** : publier uniquement l’interface approuvée compatible avec le serveur ; aucune publication SEO/accessoire implicite. Une interface seule n’est pas une activation fonctionnelle.
8. **Après autorisation de test réel** : une demande dédiée, un seul destinataire fourni, consentement d’envoi explicite ; vérifier lien/dossier/code/édition/relecture. Aucune fusion ni suppression de demande client ; toute suppression de fixture doit être séparément autorisée, identifiants exacts seulement.

### Arrêt immédiat et retour arrière exact
Fuite interclient, droits plus larges, secret journalisé, faux succès, champ protégé modifié, perte historique/photo, isolation incertaine, mail externe de test, dérive SQL, dépendance/empreinte manquante ou absence de sauvegarde/restauration vérifiée : arrêter, maintenir accès non activé et ne pas poursuivre la séquence.

Avant commit SQL : rollback de la transaction, aucune étape partielle. Après commit et après autorisation de retour : restaurer d’abord le paquet précédent exact/accès approuvé, puis utiliser l’inverse adapté à l’état réellement présent. Le complet n’accepte que les trois empreintes finales ; les inverses partiels doivent se jouer dans l’ordre 04 → 03 → 02 → 01. L’inverse 03 préserve les correctifs durables 01/02 si ceux-ci doivent rester. Ne pas restaurer l’original ancien par-dessus un correctif durable installé ultérieurement : en cas de nouvelle référence, arrêt et nouveau retour ciblé préparé.

Les inverses restaurent UNIQUEMENT les définitions modifiées ; aucune instruction GRANT/REVOKE, table/RLS, échéance enregistrée ou demande. Vérification intégrale des empreintes et droits après chaque inverse ; les données fictives conservées localement prouvent cette portée, pas la restauration hébergée. Les liens déjà créés `infinity` restent permanents et révocables : aucune date inventée ni raccourcissement automatique.

**Attente d’une autorisation distincte avant toute intervention de production.**