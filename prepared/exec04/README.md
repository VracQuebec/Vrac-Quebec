# EXEC-04 — préparation non déployée

Même domaine et SQL pour les écrans existants et PostgreSQL loopback vide; données fictives exclusivement.

- Tests ciblés : `EXEC01B_LOCAL_TEST=1 bunx vitest run src/test/marketplace-exec04.test.ts`.
- Harnais : `EXEC01B_LOCAL_TEST=1 bun prepared/exec04/harness.ts`, PostgreSQL local existant sur 55439, HTTP 127.0.0.1:55440. Identités admin/partenaire fictives exclusivement dans ce harnais; aucun mécanisme de ce login n'est livré à Cloud.
- Pages existantes : `/admin/relances?exec04=local`, `/admin/marche/soumissions?exec04=local`, `/admin/marche/commissions?exec04=local`, `/partenaire/soumissions?exec04=local`; portail accessible seulement par lien capturé.
- Préparation des sources : `bun prepared/exec04/package.ts`; sortie temporaire `/tmp/exec04-package`. Contrôle : `deno check --config /tmp/exec04-package/deno.json /tmp/exec04-package/prepared/exec04/edge-entry.ts`.
- `schema.sql` n'est jamais appliqué au serveur partagé; le harnais crée une base vide aléatoire. `local-fixture.sql` ne reproduit pas tous les déclencheurs/finances Cloud.
- Activation réelle désactivée, pas de contournement par URL ou environnement. Provenance réseau explicite exigée pour les propriétaires; anciens dossiers exclus par défaut.
- Arrêter le harnais libère l'HTTP; supprimer uniquement sa base `exec04_<uuid>` après les essais. Ne pas supprimer le serveur PostgreSQL commun aux lots locaux.

Bilan : `docs/audit/exec04-bilan.md`; liste d'activation commune : `prepared/exec01b/activation-checklist.md`.