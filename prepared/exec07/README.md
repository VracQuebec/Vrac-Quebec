# EXEC07 — reproduction isolée uniquement

Le harnais réutilise `createPunchLocal`/`createFinanceLocal`, exige `EXEC05_LOCAL_TEST=1 EXEC06_LOCAL_TEST=1 EXEC07_LOCAL_TEST=1`, PostgreSQL loopback **127.0.0.1:55439**, cluster jetable sous `/tmp/exec-correctifs/`, rôles de fixture authenticated/anon/service_role. Crée une base unique `template0`, vérifie isolation avant chargement et avant suppression; aucune connexion Cloud.

Après démarrage du cluster jetable explicite :
```
EXEC05_LOCAL_TEST=1 EXEC06_LOCAL_TEST=1 EXEC07_LOCAL_TEST=1 bun prepared/exec07/harness.ts
```
Ouvrir `http://localhost:8080/entrepreneur/aide?help_test=local`. 55447 loopback seulement; CSP Vite interdit sorties externes. Sessions TEST uniquement, aucun login réel. Arrêt SIGTERM/SIGINT supprime la base du harnais. Ne jamais charger 0159, appeler AI, reminder sweep ou notification provider.

Reproduction navigateur : copier `check_help.py` et `network_proof.py` dans `/tmp/browser/exec07/`, démarrer harnais neuf pour chacun (le premier garde un pointage ouvert), lancer Python. Captures et preuve DB fictive restent dans ce dossier. Le navigateur utilise 1280×1800 puis 393×852. Configuration de créneau explicitement TEST par `/configure-slots` (propriétaire fictif); exemples dans le script, dates futures à adapter lors d’une reprise ultérieure.

Tests ciblés :
```
EXEC05_LOCAL_TEST=1 EXEC06_LOCAL_TEST=1 EXEC07_LOCAL_TEST=1 bunx vitest run src/test/exec07-help.test.ts src/test/exec07-local.test.ts src/test/exec06-time.test.ts
```

Autres parcours liés : EXEC03 serveur 55440; finances EXEC05 55445; punch EXEC06 55446, chacun avec son harnais et flags existants, pas remplacés par de la production. Déclaration publique et flotte : articles/scripts, pas d’action de démo réelle. Harnais mono-opérateur : ne pas ouvrir des identités différentes dans plusieurs onglets. Sources TEST non déployables comme endpoint de production; l’intégration hébergée doit passer par les writers autorisés de conversation et l’agenda existants.
