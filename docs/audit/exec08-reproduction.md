# EXEC-08 — sources fictives reproductibles, sans nouvelle simulation

Ce document **n’autorise pas** la reprise des harnais comme substitut à Auth/PostgREST/Storage. Aucun harnais relancé pendant EXEC-08. Les commandes suivantes décrivent les outils existants pour recréer une preuve locale limitée **si ce périmètre est de nouveau autorisé**; la certification A–E attend une stack complète.

## Précontrôle des anciennes fixtures
Jamais utiliser les PG* gérés ou leurs URL. Les fixtures exigent un PostgreSQL local sur `127.0.0.1:55439`, data_directory sous `/tmp/exec-correctifs/`, compte `lovable`, rôles locaux authenticated/anon/service_role. Préparer un cluster **vide** avec initdb/pg_ctl de la version installée, appartenant à un utilisateur non root; pas de dump/restore de données réelles. Les adaptateurs vérifient leur isolation avant CREATE DATABASE; ne pas supprimer ces gardes.

Chaque base est UUID unique, template0. Identités, dossiers/clients et contacts `@test.invalid` créés par les builders existants. Manifestes de sources/SQL sous `exec08-preuves/source-manifest.json` : comparer empreintes avant de reproduire. Désactiver sorties externes (CSP/egress), absence fournisseurs/push/cron; un paramètre TEST seul ne démontre pas l’isolation.

## Inventaire de reproduction déjà présent
| Lot / chaîne | Entrée conservée | Fictif minimal recréé / portée |
|---|---|---|
| 01 et 02, A/B | `prepared/exec02/harness.ts`, `check_coordination.py`, `check_deliveries.py`; `src/test/fixtures/exec01b-base.sql`, `exec02-base.sql`; `remblai-exec01c.test.ts`, `remblai-exec02.test.ts` | Dossier remblai et offres/voyages fictifs, boîte capture, login TEST; mêmes SQL prepared. **Pas formulaire réel ni Auth hébergée** |
| 03, B recherche | `prepared/exec03/harness.ts`, `check_search.py`, `entrepreneur-exec03.test.ts`, README | Membres/chantiers/secteurs/références fictifs; aucun Google simulé |
| 04, C | `prepared/exec04/harness.ts`, `local-db.ts`, `local-fixture.sql`, `marketplace-exec04.test.ts`, `exec04-screen-completion.test.ts` | Réseau/partenaire/entente et événement TEST; finance contrat simplifié. Pas certification finances complètes |
| 05, D | `prepared/exec05/harness.ts`, `local-db.ts`, `local-base.sql`, `invoices.sql`, `exec05-integration.test.ts` | Deux entreprises, propriétaire/client/compte; migrations réelles sélectionnées, exclut 0118/19/20, Storage mémoire/file fixture. Les UUID sont nouveaux à chaque exécution |
| 06, E | `prepared/exec06/harness.ts`, `local-db.ts`, `schema.sql`, `exec06-integration.test.ts` | Réutilise finances + deux employés/lecture, auth.users **fixture minimale**, punch/paie migrations originales. Pas connexion réelle |
| 07, aide | `prepared/exec07/harness.ts`, `local-db.ts`, `check_help.py`, `network_proof.py`, README | Réutilise 05/06, conversations/agenda avec notifications exclues; slots futurs configurés TEST. Pas writer hébergé |

Tests sans base réalisés en EXEC-08 :
```sh
bunx vitest run src/test/exec08-document.test.ts src/test/exec05-rules.test.ts src/test/exec07-help.test.ts
```
Préparation sans exécution serveur :
```sh
bun prepared/exec01b/package.ts
deno check --config /tmp/exec01c-package/deno.json /tmp/exec01c-package/prepared/exec01b/edge-entry.ts
bun prepared/exec03/package.ts
deno check /tmp/exec03-package/prepared/exec03/edge-entry.ts
bun prepared/exec04/package.ts
deno check --config /tmp/exec04-package/deno.json /tmp/exec04-package/prepared/exec04/edge-entry.ts
```

Anciennes commandes (pas lancées EXEC-08; n’utiliser que cluster précontrôlé) :
```sh
EXEC01B_LOCAL_TEST=1 bun prepared/exec02/harness.ts
EXEC01B_LOCAL_TEST=1 bun prepared/exec03/harness.ts
EXEC01B_LOCAL_TEST=1 bun prepared/exec04/harness.ts
EXEC05_LOCAL_TEST=1 bun prepared/exec05/harness.ts
EXEC05_LOCAL_TEST=1 EXEC06_LOCAL_TEST=1 bun prepared/exec06/harness.ts
EXEC05_LOCAL_TEST=1 EXEC06_LOCAL_TEST=1 EXEC07_LOCAL_TEST=1 bun prepared/exec07/harness.ts
```
**Un seul harnais 02/03/04 à la fois** (port 55440 partagé); ne pas joindre leurs bases comme si elles portaient le même dossier. Les 05/06/07 utilisent 55445/46/47, identités de harnais mono-opérateur. Copier scripts navigateur présents sous `/tmp/browser/<lot>` avant exécution; adapter dates futures pour créneaux. Les scripts 02 créent screenshots dans un sous-dossier : créer le parent `/tmp/browser/exec02` ou `/tmp/browser/exec02b` d’abord. Pas de secret/token dans captures ou journaux.

**Lacune de preuve retrouvée :** scripts navigateur 05/06 et certaines captures 01 étaient temporaires et ne figurent pas dans prepared; les captures conservées ne suffisent pas à rejouer leur scénario automatiquement. Les tests SQL/données builders 05/06 sont persistants; reproduction UI manuelle avec écrans/libellés des bilans. Ne pas prétendre ces scripts sauvegardés ni écrire une nouvelle simulation pour combler l’absence.

## Nettoyage
Harnais 05/06/07 : SIGTERM/SIGINT appelle cleanup, attendre fin puis vérifier aucune base unique restante. 02/04 : fin de processus **ne garantit pas suppression DB**; lire le nom unique de readiness/constructeur, vérifier host/port/data_directory et préfixe attendu, puis supprimer uniquement cette base fictive nommée. Aucun `DROP DATABASE` sur connexion par défaut. Conserver preuve anonymisée avant suppression. Stopper PostgreSQL seulement si aucun autre lot local ne l’utilise. Ne jamais publier pour arrêter un essai.

## Pour obtenir la vraie validation gratuite
Fournir un ordinateur ou CI déjà disponible avec Docker/Podman fonctionnel (le sandbox retourne `cannot set user namespace`). Installer la stack locale officielle complète (DB/Auth/PostgREST/Storage/fonctions et capture courrier interne), puis appliquer migrations projet en ordre du journal à base vide. Aucun remplacement de auth.uid ou balance financière. Références/versions buckets/extensions doivent être établies avant application : si une migration dépend d’extensions indisponibles, **stopper**, ne pas stubber. Exposer origine privée autorisée sans keys de production; créer comptes fictifs par vraie Auth et tester A/B plus liens dossiers. La machine/CI et son accès ne sont pas fournis ici; gratuit logiciel ne garantit pas gratuit hébergement.

Alternative Cloud : support pour Test historique si admissible; sinon remix structure sans données après contrôle budget. Pas d’export de la production nécessaire ou autorisé par ce lot. Une fois instance distincte établie, reprendre l’ordre et la matrice dans `exec08-bilan.md`, terminer les writers manquants avant de parler d’activation.