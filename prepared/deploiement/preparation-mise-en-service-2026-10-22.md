# EXEC-01 — préparation ciblée de mise en service

Relevé du 22 octobre 2026, contrôles locaux terminés vers 21:20 UTC.
**Verdict : BLOQUÉ. Aucune autorisation d'exécution.**

## 1. Sauvegarde

Le propriétaire confirme qu'une sauvegarde de la base a été enregistrée. Son horodatage UTC n'est pas fourni et aucun outil disponible ne lit l'inventaire des sauvegardes. Son existence est donc déclarée par le propriétaire, pas vérifiée par l'agent. Aucun changement n'a été effectué pendant cette préparation ; une sauvegarde déjà achevée serait antérieure aux opérations futures, mais sa date exacte et sa pertinence doivent encore être confirmées.

Action manuelle : ouvrir **More → Database → Manage → Backups** et communiquer le timestamp UTC de la sauvegarde concernée. L'aperçu et le site publié partagent ici la même base. Ne pas lancer d'export ni de restauration.

Les snapshots quotidiens couvrent schéma et données, pas les fichiers de stockage. Une restauration globale perd les données écrites après le snapshot et rétablit aussi le schéma ; elle n'est pas le retour arrière de ce lot.

## 2. État hébergé constaté, lecture seule

- `public.exec01_dispatch(jsonb)` : propriétaire `postgres`, EXECUTE `postgres` et `service_role`, empreinte **2da0b80649cfacf5db57fe559adab3c2**.
- `public.exec01_dispatch_mail(jsonb,jsonb,boolean)` : empreinte **99da54e6fe02f7ad192bbecc3e355bee**, hors changement.
- Les cinq fonctions SQL `guard_*` ci-dessous sont absentes du catalogue au relevé.
- `guard_claim_id` est absent de `submissions` et `jsc_requests` ; les deux index proposés sont absents.
- `public_request_guard` existe, avec `id`, `scope`, `identity`, `fingerprint`, `payload`, `created_at` et ses trois index existants.
- RLS activée sur les trois tables. Les ACL de tables restent inchangées par les migrations proposées.
- Le code local actuel de `submit-parcours` appelle `runDedupedCreate`, pas `runClaimedCreate` : reprise heuristique par courriel/adresse, pas encore par identifiant exact.

Le catalogue ne prouve pas quelle version de code de fonction Edge est hébergée. Ne pas présenter les sources locales comme une lecture de cette version déployée.

## 3. Périmètre exact des opérations proposées

### M1 — `migration-anti-doublon-transactionnel-NON-APPLIQUEE.sql`

Crée ou remplace exactement :

1. `public.guard_validate_params(text,text,text,integer)`
2. `public.guard_check_and_log(text,text,text,jsonb,integer)`
3. `public.guard_claim(text,text,text,jsonb,integer,integer)`
4. `public.guard_complete(uuid,jsonb)`
5. `public.guard_release(uuid,text)`

Pour ces cinq signatures seulement : REVOKE ALL de `PUBLIC`, `anon`, `authenticated`, GRANT EXECUTE à `service_role`. Aucun droit de table, aucune politique RLS, aucun privilège par défaut modifié. Les quatre dernières fonctions sont SECURITY DEFINER ; toutes ont `search_path=public`.

L'application du fichier ne réécrit aucune ligne. Après activation et uniquement lors de nouvelles tentatives, les RPC créent/confirment/libèrent des réservations dans `public_request_guard`.

### M2 — `migration-guard-claim-id-NON-APPLIQUEE.sql`

- `public.submissions.guard_claim_id uuid`, nullable, sans défaut.
- `public.jsc_requests.guard_claim_id uuid`, nullable, sans défaut.
- `submissions_guard_claim_id_uq` sur `public.submissions(guard_claim_id)` WHERE non NULL.
- `jsc_requests_guard_claim_id_uq` sur `public.jsc_requests(guard_claim_id)` WHERE non NULL.
- Commentaires de ces deux colonnes seulement. Aucun GRANT, aucune RLS, aucune FK.

Aucun UPDATE, DELETE ni backfill : les demandes existantes restent intactes, nouvelle colonne NULL. Les index peuvent bloquer brièvement les écritures pendant leur construction ; durée réelle non mesurée.

### M3 — renouvellement EXEC-01, opération distincte

`0231_renouvellement_premiere_verification.sql` change trois blocs de `public.exec01_dispatch(jsonb)` uniquement. Pas de table, index, permission ni règle RLS modifiés. Empreinte attendue après : **e9d8b2ad33d864aa7a3ba881e78b82cc**.

Compatible structurellement avec M1/M2 : utilise `submission_portal_links` et le dossier associé, pas `guard_claim_id`. Le renvoi idempotent de confirmation n'est pas le renouvellement du portail. L'application du correctif ne traite aucun dossier historique ; les états ambigus restent refusés lors des appels futurs.

## 4. Retour arrière et raisons d'arrêt

### M1 : preuve limitée, retour actuel insuffisant pour autoriser

Le bloc commenté supprime les cinq fonctions. Dans l'état relevé elles sont toutes absentes ; ce retrait peut donc revenir à leur absence initiale, après retour du code. Mais il ne restaure ni définition ni ACL si une fonction existe au prochain relevé. L'ancien code local utilise déjà `guard_check_and_log` et repasse en protection non atomique quand elle est absente. Le plan ancien ne tient pas compte de ce risque.

Les 55 contrôles PostgreSQL vérifient le retrait et la conservation du journal dans une base fictive initialement vide, pas la restauration d'une ancienne fonction hébergée ni le bon fonctionnement d'un ancien appelant. **Ne pas exécuter ce retour en l'état comme garantie de continuité.** Préparer un paquet de code précédent exact et un inverse gardé par l'état initial avant toute autorisation.

### M2 : retrait non destructif mais protection perdue

Revenir au code précédent avant tout retrait d'index. Conserver colonnes et valeurs. Le bloc commenté ne restaure pas exactement le schéma initial et n'a pas été retesté comme inverse dédié dans cette session. Ne pas le lancer.

### M3 : inverse exact validé localement

`0231_retour_arriere_NON_APPLIQUE.sql` exige l'empreinte corrigée et rétablit octet pour octet `2da0b80649cfacf5db57fe559adab3c2`, avec métadonnées et fonction témoin inchangées. Dérive ou second inverse : refus sans changement. Il ne révoque pas les nouveaux liens et ne restaure pas les données modifiées pendant l'exploitation.

### Autres blocages concrets

- L'intégration durable est un guide, pas un paquet complet : `submit-parcours` doit encore écrire l'identifiant de réservation et remplacer `findOrphan` par une recherche exacte qui refuse aussi les erreurs de lecture. Ne pas copier du code incomplet dans `supabase/functions/`.
- Le délai préparé de 600 secondes ne démontre pas une protection absolue si une ancienne exécution reste active au-delà : des réservations différentes peuvent chacune produire une demande. La durée maximale hébergée et le cas de reprise tardive restent à valider.
- Les événements historiques sans état ne sont pas reconnus comme doublons pendant la transition de 30 minutes. Prévoir une transition contrôlée plutôt que promettre zéro doublon.
- Horodatage de sauvegarde non communiqué ; réception effective et Outlook/Safari iPhone non testés.

## 5. Ordre exact proposé — non exécutable avant levée des blocages

1. Terminer et tester les copies de fonctions **dans `prepared/` seulement**, avec reprise par identifiant exact, courriel idempotent et erreurs de lecture refusées. Préparer les copies précédentes exactes et le retour gardé M1/M2. Pas de changement à `quote-submit` sans inclusion explicite dans le périmètre autorisé.
2. Obtenir le timestamp UTC de sauvegarde et l'autorisation écrite, préciser M1, M2, M3 et fonction(s) concernée(s).
3. Relever à nouveau les catalogues, ACL et empreintes. Toute divergence : arrêt, aucune adaptation automatique.
4. Appliquer M1 via l'outil de migration Lovable Cloud, nom `exec01_anti_doublon_transactionnel`, contenu du fichier SQL **verbatim**. L'outil gère la transaction ; ne pas appliquer avec psql ni un exécuteur sans transaction.
5. Vérifier les cinq signatures et droits ; puis appliquer M2 via le même outil, nom `exec01_guard_claim_id`, SQL **verbatim** ; vérifier colonnes et index.
6. Si M3 est autorisé, appliquer séparément le fichier préparé verbatim via l'outil de migration, nom `exec01_renouvellement_premiere_verification` ; vérifier l'empreinte corrigée et ACL inchangées.
7. Seulement après ces preuves, reporter les copies préparées validées dans les sources actives de `submit-parcours` et du helper partagé requis. **Les fonctions Lovable Cloud sont déployées automatiquement lors des modifications de leurs sources actives.** Il n'y a pas de commande manuelle CLI à lancer ni de déploiement global à préparer. Ne toucher à `send-transactional-email` que si un changement ciblé validé y est effectivement nécessaire.
8. Contrôles de catalogue et journaux existants ci-dessous, sans appeler les RPC métier. Publication de l'interface : autorisation distincte, aucun SEO ni contenu public modifié dans ce lot.
9. Essai contrôlé avec l'adresse fournie par le propriétaire : autorisation distincte avant création et envoi. Aucun nettoyage de dossier réel implicite.

Cet ordre est une préparation, pas une commande à exécuter maintenant. Aucun code utilisant la colonne ne doit atteindre les sources actives avant M2 vérifiée ; aucun déploiement global d'autres modules issu de l'ancien plan.

## 6. Contrôles sans création de demande réelle

Lire les catalogues uniquement ; ne pas appeler `guard_claim`, `exec01_dispatch` ou un endpoint d'envoi comme test de fumée.

```sql
SELECT p.oid::regprocedure::text AS signature,
       pg_get_userbyid(p.proowner) AS owner, p.proacl, p.proconfig,
       md5(pg_get_functiondef(p.oid)) AS fingerprint,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS server_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
('guard_validate_params','guard_check_and_log','guard_claim',
 'guard_complete','guard_release','exec01_dispatch','exec01_dispatch_mail');

SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='public'
AND table_name IN ('submissions','jsc_requests') AND column_name='guard_claim_id';

SELECT tablename,indexname,indexdef FROM pg_indexes
WHERE schemaname='public' AND indexname IN
('submissions_guard_claim_id_uq','jsc_requests_guard_claim_id_uq');
```

Attendus : cinq signatures exactes, anon/auth EXECUTE faux et serveur vrai ; deux colonnes UUID nullables sans défaut et deux index uniques partiels exacts. Comparer ACL des trois tables au relevé préalable ; aucune différence autorisée. Pour M3, comparer empreinte, propriétaire et ACL aux valeurs ci-dessus.

Lire ensuite uniquement les journaux existants expurgés : aucun `guard.fallback_active`, `guard.complete_failed`, erreur de colonne absente ou erreur 42501. L'absence d'événements sans trafic **ne prouve pas** le parcours complet ni la réception d'un courriel.

## 7. Tests réellement exécutés cette session

- Vitest anti-doublon/ordre/code : **49/49** (5 fichiers).
- Vitest confirmation honnête et quote-submit : **16/16** (2 fichiers).
- PostgreSQL jetable `concurrence-pg.sh` : **55/55**.
- PostgreSQL jetable `claim-id-pg.sh` : **31/31**.
- PostgreSQL jetable `remblai-correctif-15minutes.test.ts` : **30/30**.
- `verification-preparation-locale.ts` : **10/10**, inverse exact et historique ambigu inchangé.

Total : **191 contrôles réussis**, répartis entre tests simulés, SQL réel local et contrôles de préparation. Un premier lancement du test renouvellement a échoué avant les tests sur les droits du lanceur ; relance corrigée réussie, sans changement de sources.

Non testés : nouveau paquet complet de fonction durable (non assemblé), déploiement hébergé, retour opérationnel M1/M2 avec ancien code, réception effective Outlook, Safari iPhone réel et durée maximale d'exécution hébergée. Aucun test navigateur nouveau cette session.

**Les demandes réelles, leurs liens, les permissions et les 1 281 titres SEO sont intacts : aucune écriture hébergée effectuée. Aucun courriel, sauvegarde, export, restauration, migration, déploiement ou publication lancé.**