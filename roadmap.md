# Feuille de route — Mission de correction de l'audit global (15 oct. 2026)

## EXEC-01 — suivi remblai sans compte (19 oct.)
- [x] EXEC-01B : adaptateur serveur et SQL préparés; parcours HTTP/PostgreSQL local et capture courriel fictive vérifiés, même dossier et sécurité; 40 tests ciblés réussis.
- [x] Parcours fictif isolé, conditions complètes, aperçu courriel et vue CRM TEST du même dossier.
- [x] Contrôles du service et transitions testés sans accès métier réel; handler serveur préparé, non déployé.
- [x] Captures mobile/ordinateur et dépendances explicites : prepared/exec01/README.md.
- [ ] Activation CRM Cloud : nécessite autorisation séparée, raccordement au schéma complet/auth/prestataire et résolution des limites décrites dans prepared/exec01b/README.md. Serveur local isolé désormais vérifié; aucun accès réel activé.

Source : /mnt/documents/audit-global-2026-10-15.md (22 constats classés P1–P3).
Contraintes : aperçu = même base que la production (confirmé) → aucune soumission réelle, aucune écriture de test, aucune notification réelle. Aucune publication, aucun déploiement serveur sans autorisation. Les 1 281 meta_title SEO = chantier séparé, non touché.

## Lot 1 — Fiabilité des demandes (terminé)
- [x] P1-1 /acces-dompe : refus serveur → état « rejeté » honnête. Testé E2E navigateur avec refus simulé.
- [x] P1-2 Achat vrac : demande enregistrée + courriel en échec → confirmation avec numéros. 6 tests unitaires. Serveur PRÉPARÉ, NON DÉPLOYÉ.
- [x] Anti-doublon et conservation des saisies confirmés.

## Lot 2 — SEO technique (terminé)
- [x] P1-3 Canonical blogue : correct dans l'aperçu (6 pages vérifiées); site en ligne défectueux jusqu'à publication.
- [x] P2-5 JSON-LD : déduplication vérifiée, doublon WebSite retiré (Blog.tsx).
- [~] P1-4 Soft 404 : bloqué par l'hébergement (SPA, 200 partout). noindex en place. Option SSR = décision utilisateur.

## Lot 3 — Intégrations (terminé)
- [x] P2-7 SiteAssistant : conversation conservée sur erreur transitoire.
- [x] P2-6 Modale GBP : bouton Fermer + rôle dialog.
- [x] P2-9 mailchimp-webhook + sitemap-live : PRÉPARÉS, NON DÉPLOYÉS.
- [x] P2-8 fetchWithTimeout sur 8 chemins exposés; ~39 autres sans délai — Lot 6.

## Lot 4 — Sécurité et confidentialité
- [x] Audit RLS/policies : RLS activé partout; anon = INSERT seulement sur submissions/transport_requests (voulu); aucun accès anon en lecture sur tables sensibles
- [x] Isolation entrepreneur ↔ entrepreneur : policies user_id = auth.uid() + entcrm_role (SECURITY DEFINER, search_path fixé); aucune fonction SECURITY DEFINER sans search_path
- [x] Secrets/jetons : aucune clé privée côté client, aucun secret dans les journaux (grep functions+src : 0)
- [~] Grants anon larges (arwd) sur tables sensibles — couverts par RLS; resserrement = migration PRÉPARÉE, non appliquée
- [x] En-têtes CSP / X-Frame-Options : absents, limité par l'hébergement — documenté
- [x] Comparaison secret Mailchimp : empreinte SHA-256 en place (Lot 3, non déployé)

## Lot 5 — Données et logique métier
- [x] P2-11 Doublons remblai : 29 groupes au 15 oct. — 7 <1h (doublons probables), 8 même jour, 14 >1 jour (légitimes probables). AUCUNE fusion/suppression.
- [x] Prévention doubles soumissions : verdict duplicate respecté dans submit-parcours (PRÉPARÉ, non déployé) + 5 tests ciblés (fenêtre 30 min, légitime >30 min/90 jours, limite 5/h, course simultanée documentée)
- [x] P2-10 Divergence aperçu camion : FAUX POSITIF — jsc_public_trucks exige capacité>0 ET tarif>0, liste identique au serveur; aucune correction.
- [x] Vérifications parcours dompe/remblai (lecture seule, tours précédents) : filtres 477 dompes, distances, cohérence OK.

## Lot 6 — Accessibilité, compatibilité, régression
- [x] P3 libellés /soumission et /materiaux : déjà présents (constat obsolète); aria-label ajouté à l'input file masqué d'ObtenirSoumissions.
- [x] P3 cibles tactiles : pieds de page (PublicContactFooter, Index) + « Autres besoins » à min-h-11; reste = liens inline du bandeau défilant (exception WCAG 2.5.8 liens dans le texte).
- [x] P3 numéro public : déjà centralisé via public-phone.ts (constat obsolète; reste = fichiers de tests uniquement).
- [x] Appels externes sans délai : fetchWithTimeout ajouté aux 5 modules partagés (_shared/gbp, ai-cache, observability, stripe, vqos-intel) — couvre la majorité des fonctions; les appels directs restants dans les fonctions cron SEO/feuilles sont documentés (PRÉPARÉ, non déployé).
- [x] Régression lots 1–5 : 2 105 tests réussis (0 échec); navigateur 360/768/1280 sur 6 routes : aucun débordement, aucune erreur JS.
- [x] Routes/canoniques/JSON-LD revérifiés : 6 routes OK, 404 avec noindex, JSON-LD valides, /acces-dompe + /demande-transport noindex (voulu).

## Rapport final
- [x] Bilan des six lots : /mnt/documents/bilan-corrections-audit-2026-10-15.md

## Phase finale — préparation au déploiement (terminée, en attente d'autorisation)
- [x] Migration anti-doublon transactionnelle rédigée : prepared/deploiement/migration-anti-doublon-transactionnel-NON-APPLIQUEE.sql (RPC guard_check_and_log + verrou consultatif); public-guard.ts appelle le RPC avec repli; 3 tests de concurrence/idempotence ajoutés (15/15, suite complète 2 107 réussis)
- [x] Migration resserrement grants anon rédigée : prepared/deploiement/migration-resserrement-grants-anon-NON-APPLIQUEE.sql (liste blanche déduite des politiques RLS réelles)
- [x] Plan de mise en production : /mnt/documents/plan-deploiement-2026-10-15.md (ordre, fumées, retours arrière, liste de contrôle)
- [ ] EN ATTENTE D'AUTORISATION : appliquer migrations, déployer fonctions, publier aperçu

## Phase correction technique (16 oct.) — aperçu seulement, rien déployé
- [x] Anti-doublon en 3 temps (claim/complete/release) : submit-parcours + dedupe-flow.ts + public-guard.ts; migration v2
- [x] Mode de secours journalisé (guard.fallback_active), erreur inattendue → 503
- [x] Validation des paramètres SQL; tests réels base jetable : 47/47
- [x] Permissions anon v2 + relevé exact + restauration exacte; tests base jetable 19/19
- [x] mailchimp-webhook : erreurs base non ignorées
- [x] Plan : prepared/deploiement/plan-deploiement-2026-10-15.md
- [ ] EN ATTENTE : staging isolé, migrations, déploiement, publication (autorisation)

## quote-submit + préparation staging (16 oct.) — aperçu seulement
- [x] quote-submit sur le mécanisme guard_claim/complete/release (quote-submit/dedupe.ts); succès seulement avec numéro
- [x] Tests simulés du gestionnaire réel 12/12; PostgreSQL jetable 55/55
- [x] Staging/sauvegardes documentés : prepared/deploiement/staging-et-sauvegardes-2026-10-16.md
- [x] Inventaire 194 fonctions anon : prepared/deploiement/inventaire-fonctions-anon-2026-10-16.csv
- [ ] EN ATTENTE : création staging, revue des 130 « à examiner » et 3 « dangereuses », révocations (autorisation)
- [x] Étape sécurisation (16 oct.) : prepared/deploiement/securisation-etape-2026-10-16.md + proposition-restriction-fonctions-anon-NON-APPLIQUEE.sql
- [ ] EN ATTENTE : vérifier état prod des fonctions, staging, sauvegarde vérifiée, colonne guard_claim_id (autorisation)
- [x] Préparé (16 oct., 13 h) : migration guard_claim_id + module claimed-create (prepared/, non déployé) ; tests PG 31/31, simulés 5/5 ; revue 3 fonctions ; procédure sauvegarde
- [ ] EN ATTENTE : export, staging, migrations, copie du module dans supabase/functions, restrictions (autorisation)
