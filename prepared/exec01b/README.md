# EXEC-01B — serveur préparé, aucune activation publique

## Mise à jour EXEC-01C
Le schéma Cloud a été inspecté structurellement (pas de contacts). Les traitements et
le client désactivé sont adaptés aux champs existants, au vrai rôle `app_role`, aux
déclencheurs de disponibilité et au bucket **privé** `lead-photos`.
`schema.sql` et `quota.sql` servent au local et au futur Cloud sans variante SQL.
Les constats B ci-dessous restent historiques; le périmètre actuel, les limites corrigées
et les étapes précises sont dans [activation-checklist.md](activation-checklist.md).
Ne pas lire les projections vides ou le mapping des conditions matérielles de B comme
le comportement actuel : C lit `trips` explicitement lié, sépare `cpn_trips` reçu et
ne modifie plus les conditions documentaires avec les préférences propriétaire.

## Environnement effectivement utilisé
PostgreSQL 17.9 local, écoute `127.0.0.1:55439`, données dans `/tmp/exec01b/pg`; serveur HTTP Bun de test à `127.0.0.1:55440`, capture locale sans appel à un prestataire. Tous les contacts sont fictifs `@test.invalid`. Aucun client Cloud dans le serveur local. Ce n'est pas `?test=1` : les écritures SQL sont réellement persistées dans une base distincte.

Options examinées : le projet principal partage le serveur public; le brouillon existant « Tests isolés dompe et remblai » est disponible mais en retard et n'a pas été ouvert, accepté ou modifié. Aucune garantie de configuration gratuite n'a été présumée. Docker n'est pas disponible. PostgreSQL/Bun déjà installés ont permis le test sans nouvelle dépense.

## Code
- `schema.sql` : ajout de version/contact vérifié à `submissions`, conditions à `submission_fill_profile`, liens hachés/opérations/journal liés au dossier. RPC transactionnel `exec01_dispatch`, GRANT/RLS, historique immuable. Préparé seulement, appliqué uniquement à la base locale vide.
- `endpoint.ts` : validation Zod, projection limitée, vérification par code cryptographique, confirmation explicite, émission/renouvellement au contact stocké, aucune adresse fournie par le visiteur. GET inerte; aucun code TEST accepté dans ce mécanisme.
- `edge-entry.ts` : adaptateur Cloud préparé, JWT validé par `getUser` et rôle admin contrôlé serveur pour CRM/émission; capture uniquement, tout envoi réel refusé.
- `confirmation-hook.ts` : raccordement préparé à appeler après création du dossier par `submit-parcours`; fournit le contenu `client-confirmation` avec lien, état **prepared**. Le dispatcher existant doit envoyer ce message à la place de l'ancien, pas un second courriel. Les fonctions actives et leur modèle restent inchangés.
- `src/lib/remblai/isolated-client.ts` et ajustement minimal du portail existant : lecture/écritures HTTP locales, fragment retiré et secret en mémoire uniquement; mode local refusé sur un domaine public.

## Essais répétables
Base PostgreSQL locale vide accessible sur le port indiqué, compte local `lovable`. Ne jamais utiliser les variables PG du serveur géré. Commande ciblée :

```sh
EXEC01B_LOCAL_TEST=1 bunx vitest run src/test/remblai-exec01b.test.ts src/test/remblai-exec01-handler.test.ts
```

Chaque exécution crée une base locale aléatoire, applique `src/test/fixtures/exec01b-base.sql` puis `schema.sql`, et retire cette seule base d'essai à la fin. Sans opt-in, les 14 tests PostgreSQL sont ignorés explicitement, jamais annoncés comme exécutés. Le modèle de base est un sous-ensemble du schéma inspecté, pas une restauration intégrale de production. Roles/auth sont des fixtures locales; le chemin de validation JWT Cloud n'est pas testé sur un service hébergé.

Serveur navigateur utilisé : `/tmp/exec01b/harness.ts`; lancement `NODE_PATH=/dev-server/node_modules bun /tmp/exec01b/harness.ts`. `/harness/login` crée un cookie HttpOnly TEST local aléatoire; cette route n'existe pas dans l'adaptateur Cloud. `/harness/create` crée uniquement un dossier fictif et capture sa confirmation; `/harness/messages` donne accès à la boîte de capture à cette session locale. Le script `/tmp/browser/exec01b/check_flow.py` vérifie le parcours. Ces fichiers temporaires peuvent disparaître après la session.

Accès UI : `/portail/remblai?server=local#…` uniquement depuis le lien capturé; `/admin/apercu-suivi-remblai?server=local&requestId=…`, même dossier PostgreSQL, lecture CRM avec session locale. Les liens/ codes de capture ne doivent pas être copiés dans un rapport ou une capture d'écran. Aucun secret dans les journaux de tests.

## Limites honnêtes et activation ultérieure
- Vérifié : SQL/RPC réel + transport HTTP local + UI existante. Non vérifié : déploiement Deno Cloud, API PostgREST, véritable session admin hébergée, tous les triggers du schéma complet, prestataire d'envoi.
- La vue CRM TEST lit le même dossier réel **local**; l'administration Cloud normale n'est pas raccordée à cette base. Le mapping met à jour les colonnes déjà lues par le CRM ainsi que les profils/matériaux. Le rafraîchissement TEST est de deux secondes.
- La projection propositions/livraisons reste vide : `lead_trips` est un objet de suivi/facturation sans état de confirmation opérationnelle. Ne pas transformer une ligne de facturation ou une date en livraison confirmée. Raccordement à une autorité opérationnelle explicite encore nécessaire avant activation publique.
- Ancien dossier sans conditions : valeurs inconnues, pas de préautorisation. La projection détaillée des anciennes données historiques et validations de l'équipe nécessite un mapping complet avant activation; aucune donnée historique copiée ici.
- Photos : format de l'aperçu conservé; stockage privé/MIME/signatures non raccordés dans ce lot. Pas d'activation des photos réelles.
- Cinq erreurs de code bloquent le lien; émission de code espacée de 60 s; durée du code et vérification récente = 10 min; lien = 30 jours. Ces contrôles SQL partagés sont testés; pas de quota global par origine/IP ni primitive standard de limitation des tentatives. Revue anti-abus nécessaire avant exposition.
- Le courriel est capturé, **jamais envoyé réellement**. Pas de chemin prestataire réel activé. En cas d'échec de capture après émission SQL, un état de lien préparé peut rester sans message; l'outbox transactionnelle/idempotente du dispatcher existant doit être raccordée avant activation.

Étape ultérieure minimale : autoriser un environnement Cloud isolé, appliquer ce SQL uniquement là, empaqueter l'entrée Deno (imports `src` inclus au paquet), connecter le hook à `submit-parcours`/`client-confirmation` et le portail à la fonction, puis vérifier auth/CRM et triggers complets avec capture. L'activation publique reste une autorisation distincte, après résolution des limites ci-dessus. Aucun envoi, publication ou migration partagée effectué dans ce lot.

## Suite EXEC-02
Voir `docs/audit/exec02-bilan.md` et `prepared/exec02/` : harnais répétable PostgreSQL/HTTP fictif, captures, trois modes, registre lié aux dossiers et 20 tests ciblés. Les sources Cloud restent désactivées; utiliser le nouveau hook transactionnel seulement après raccordement du rendu/suppression/désabonnement gérés. Les limitations EXEC-01B listées plus haut sont historiques; le bilan EXEC-02 distingue celles résolues localement et celles restant hébergées.
