# Essai complet Zod 3.25.76 → 4.6.6 (fonctions serveur) — 2026-10-27

Environnement : Deno 2.6.10 local isolé (`/tmp/zodfull`, `deno.json` avec `nodeModulesDir: auto`), copie de `submission-owner-portal` + `_shared`; patch `prepared/securite-zod4-serveur.patch` appliqué à la copie seulement.
Méthode : le VRAI point d’entrée `index.ts` est importé (client serveur supabase-js 2.118.0, imports npm, CORS, quota, appels RPC); seul le réseau est remplacé par un faux serveur local, tout appel externe est refusé.

Cause du plantage antérieur : résolution des modules par la configuration Deno du projet, pas Zod ni le code.

| Cas | Ancienne | Nouvelle |
|---|---|---|
| OPTIONS | `200 ok | rpc:` | identique |
| GET sans mutation | `200 {"message":"Ouvrez le suivi personnel. Aucune modification effectu` | identique |
| POST JSON invalide | `400 {"error":"Requête invalide."} | rpc:/rest/v1/rpc/exec01_quota` | identique |
| read valide | `200 {"ok":true,"status":"en attente","version":3} | rpc:/rest/v1/rpc/e` | identique |
| read champ inconnu (strict) | `400 {"error":"Requête invalide."} | rpc:/rest/v1/rpc/exec01_quota` | identique |
| verify code 5 chiffres | `400 {"error":"Requête invalide."} | rpc:/rest/v1/rpc/exec01_quota` | identique |
| verify code valide | `200 {"ok":true,"kind":"verify"} | rpc:/rest/v1/rpc/exec01_quota,/rest/` | identique |
| revoke sans confirmation | `400 {"error":"Requête invalide."} | rpc:/rest/v1/rpc/exec01_quota` | identique |
| act confirmer | `200 {"ok":true,"kind":"act"} | rpc:/rest/v1/rpc/exec01_quota,/rest/v1/` | identique |
| act version 0 | `400 {"error":"Requête invalide."} | rpc:/rest/v1/rpc/exec01_quota` | identique |
| act modifier sans conditions | `400 {"error":"Conditions requises."} | rpc:/rest/v1/rpc/exec01_quota` | identique |
| act modifier conditions invalides | `400 {"error":"Requête invalide."} | rpc:/rest/v1/rpc/exec01_quota` | identique |
| kind inconnu | `400 {"error":"Requête invalide."} | rpc:/rest/v1/rpc/exec01_quota` | identique |
| issue sans admin | `403 {"error":"Accès refusé."} | rpc:/rest/v1/rpc/exec01_quota,/auth/v1` | identique |
| identifiant non RFC 0000…0001 | `200 {"ok":true,"status":"en attente","version":3} | rpc:/rest/v1/rpc/e` | identique |
| origine étrangère | `403 {"error":"Accès refusé."} | rpc:` | identique |

Résultat : 16/16 réponses identiques (statut, corps, appels serveur). `deno check` réussi : `submission-owner-portal` et `send-transactional-email`, ancienne et nouvelle version.

Non prouvé : le runtime hébergé (Supabase Edge Runtime) n’est pas Deno CLI; seule une version déployée prouvera la compatibilité hébergée.
Essai représentatif après autorisation : déployer les 2 fonctions, puis `OPTIONS`, `GET` (200 sans mutation), `POST {}` (400), `read` avec lien inexistant (refus) — aucune donnée créée.
Retour arrière : réappliquer le patch inversé (`patch -R`) et redéployer les 2 fonctions; aucune donnée ni schéma touchés.
