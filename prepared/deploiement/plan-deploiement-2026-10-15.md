# Plan de déploiement — Vrac Québec (préparé le 16 oct. 2026)

> **Document de PRÉPARATION. Ce n'est pas une autorisation de déployer.**
> Chaque étape marquée [AUTORISATION] exige un accord explicite du propriétaire.
> Ce fichier n'est pas publié sur le site (dossier `prepared/`, hors du site).

## 1. Problèmes traités

| # | Problème | Correction | Statut |
|---|---|---|---|
| P1 | Empreinte anti-doublon enregistrée avant validation d'adresse et création : un échec bloquait la nouvelle tentative (perte de demande) | Réservation en 3 temps : `guard_claim` → `guard_complete` (après création) / `guard_release` (échec) | Code + migration prêts, testés en base jetable |
| P2 | Doublon renvoyait la dernière demande du courriel (`request_type = 'remblai'` codé en dur) | Référence exacte mémorisée sur la réservation ; recherche secondaire seulement pour une réservation orpheline, par courriel + adresse + sens + quantité + fenêtre | Prêt, testé |
| P3 | Mode de secours silencieux (PGRST202 / 42883) | Événement `guard.fallback_active` (sans donnée personnelle), compteur, distinction migration absente / erreur inattendue ; erreur inattendue → 503, aucune création | Prêt, testé |
| P4 | `guard_check_and_log` sans validation | Empreinte vide/espaces, durée hors 1–1440, nulls, payload non objet : refus explicite sans écriture | Prêt, testé |
| P5 | anon : tous privilèges sur tables, vues, séquences + privilèges par défaut | Relevé exact, liste blanche, `ALTER DEFAULT PRIVILEGES` (postgres) | Prêt, testé en base jetable |
| P6 | Retour arrière `GRANT ALL ON ALL TABLES` trop large | Restauration depuis le relevé `acl_backup_20261016` | Prêt, testé (identique à l'état initial) |
| P7 | mailchimp-webhook ignorait les erreurs base (répondait « ok ») | Erreur → 500 (Mailchimp relivre) ; journal sans secret ni courriel | Code prêt, non testé en exécution |

## 2. Fichiers et migrations

**Migrations (non appliquées)** — `prepared/deploiement/`
- `migration-anti-doublon-transactionnel-NON-APPLIQUEE.sql` (v2)
- `migration-resserrement-grants-anon-NON-APPLIQUEE.sql` (v2)
- `restauration-grants-anon-NON-APPLIQUEE.sql`
- `inventaire-privileges-LECTURE-SEULE.sql`
- `tests/concurrence-pg.sh`, `tests/grants-pg.sh` (bases PostgreSQL jetables locales)

**Fonctions serveur (non déployées)**
- `submit-parcours/index.ts`, `submit-parcours/dedupe-flow.ts` (nouveau)
- `_shared/public-guard.ts` — importé par : submit-parcours, quote-submit, quote-engine, quote-assistant, mkt-request-submit, geocode-submission, transport-distance-matrix, backup-to-sheet, send-transactional-email, site-assistant. **Toutes** doivent être redéployées pour que le journal du mode de secours soit uniforme.
- `mailchimp-webhook/index.ts`
- Modules préparés aux lots précédents : `_shared/gbp.ts`, `ai-cache.ts`, `observability.ts`, `stripe.ts`, `vqos-intel.ts`, `http.ts`, `sitemap-live`.

**Secrets requis (déjà présents, non modifiés)** : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MAILCHIMP_WEBHOOK_SECRET`, clé Google (géocodage).

## 3. Préconditions

1. Staging isolé disponible (base distincte, envois coupés) — **ABSENT aujourd'hui** (voir §8).
2. Relevé de l'état initial de production : exécuter `inventaire-privileges-LECTURE-SEULE.sql` et archiver la sortie.
3. Confirmer la disponibilité d'une sauvegarde de base restaurable. **Aucune sauvegarde n'a été créée ni vérifiée par moi.** Le point de restauration automatique de l'hébergement n'a pas été testé.
4. Tests verts : `bunx vitest run`, `bash prepared/deploiement/tests/concurrence-pg.sh`, `bash prepared/deploiement/tests/grants-pg.sh`.

## 4. Ordre (dépendances)

```text
[Préparation]  tests locaux ── relevé production (lecture)
      │
[Staging]      M1 anti-doublon → fonctions Edge → M2 permissions → aperçu
      │
[Production]   E1 M1 ─▶ E2 fonctions Edge ─▶ (24 h obs.) ─▶ E3 M2 ─▶ E4 publication
```

M1 **avant** les fonctions : sans M1, le nouveau code fonctionne en secours (non atomique, journalisé). M2 est **indépendante** et appliquée seule, après validation de l'inventaire.

## 5. Étapes production

### E1 — Migration anti-doublon [AUTORISATION]
- Action : appliquer `migration-anti-doublon-...sql`.
- Contrôles : 5 fonctions `guard_*` présentes ; `has_function_privilege('anon', …)` = faux, `service_role` = vrai ; `search_path=public`.
- Arrêt : toute erreur d'application (la transaction est annulée en bloc).
- Retour base : `DROP FUNCTION` (bloc en fin de fichier). Aucune donnée touchée. Ancien code non dépendant.

### E2 — Fonctions serveur [AUTORISATION]
- Action : déployer submit-parcours puis les 9 autres fonctions important `public-guard.ts`, puis mailchimp-webhook et sitemap-live.
- Contrôles : journaux sans `guard.fallback_active` ; aucun `guard.complete_failed` ; `submission.in_progress` rare.
- Test de fumée réel : **une** demande de test sur autorisation expresse uniquement (adresse `.invalid` → aucun courriel par garde existante), puis renvoi identique → même référence.
- Arrêt : un `guard.fallback_active`, une hausse d'erreurs 5xx ou un échec de création de demande.
- Retour code : redéployer la version précédente (historique du dépôt). Les lignes `pending/done/failed` restent, inoffensives.

### E3 — Migration permissions [AUTORISATION]
- Précondition : ré-exécuter l'inventaire ; toute nouvelle politique anon/{public} doit être ajoutée à la liste blanche.
- Contrôles après : accueil (Questionnaire), /remblai, /depot-materiaux, /acces-dompe, place de marché, réseau, blogue, pages SEO, en navigation privée ; aucune erreur `42501 permission denied` dans les journaux.
- Arrêt : une seule erreur 42501 sur une page publique.
- Retour base : `restauration-grants-anon-...sql` (exact, testé).

### E4 — Publication de l'interface [AUTORISATION]
- Vérifications avant/après : parcours dompe et remblai, confirmations, canoniques blogue, données structurées, assistant, modale GBP, 360/768/1280 px, 404, liens internes.
- Retour : republier la version précédente. Les 1 281 titres SEO ne sont pas concernés.

## 6. Surveillance (sans seuil inventé)
Le projet n'a pas de seuil chiffré défini. Indicateurs à suivre et à comparer avec la semaine précédente : `guard.fallback_active` (attendu : 0), `guard.complete_failed` (attendu : 0), `submission.in_progress`, `submission.duplicate`, `submit.failed`, erreurs 42501, nombre de demandes remblai/jour.

## 7. Risques non réversibles
- Une demande réelle créée pendant un test ne peut pas être « annulée » proprement (numéro consommé, notifications). D'où : aucun test réel sans autorisation.
- Les 30 minutes suivant E1+E2 : une répétition d'une demande envoyée juste avant n'est pas reconnue (lignes historiques sans état).
- Défauts de `supabase_admin` non modifiables : objets créés par ce rôle héritent encore des droits anon.

## 8. Staging
Aucun environnement isolé n'existe : l'aperçu partage la base de production. Instructions : créer un brouillon Lovable avec base propre isolée (fonction « drafts »), y appliquer M1/M2, déployer les fonctions, couper les envois (adresses `.invalid`). **Création non faite : peut être payante, autorisation requise.**
Substitut réalisé : bases PostgreSQL jetables locales (connexions distinctes) — prouvent la logique SQL, pas l'environnement hébergé (PostgREST, fonctions Edge réelles).

## 9. Liste de contrôle finale
- [ ] Staging isolé créé [AUTORISATION]
- [ ] M1, fonctions, M2 validées en staging
- [ ] Sauvegarde production confirmée restaurable
- [ ] Relevé des privilèges archivé
- [ ] E1 → E2 → observation → E3 → E4, chacune autorisée séparément
- [ ] Décision : resserrer EXECUTE des fonctions pour anon (194) — inventaire requis
