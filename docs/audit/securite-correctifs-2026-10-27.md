# Correctifs sécurité — 27 octobre 2026

## Installé sur le serveur partagé
- 0231 : révocation chauffeur (portail, fiche, notifications, documents entreprise/assurances Storage). Essai base annulé : `reprise-r4d-preuves/essai-heberge-2026-10-27.txt`.
- 0232 : `fin_credit_refunded`, `fin_scr_avail`, `fin_credit_allocated`, `fin_exp_member` retirés des clients (anon/authenticated) — aides internes sans contrôle d'entreprise; `asr_continuity` vérifie `asr_can_read`; anon retiré de `asr_continuity`/`asr_driver_doc_ok`. Preuve externe : 401 sans compte, catalogue public 200.
- Fonction `secure-file` : téléchargement `company-docs`/`asr-files` revérifié à chaque requête avec la session de l'utilisateur, réponse `no-store`, jamais de lien signé. Preuve : 401 sans session, 403 avec vraie session sur fichier d'une autre entreprise. Écrans non encore branchés.

## Fonctions examinées (SECURITY DEFINER exécutables par anon)
80 dans finances/rôles/CRM/assurances/JSC. Toutes ont `search_path` fixé. 29 sans contrôle d'identité explicite : majorité déclencheurs (non appelables), `entcrm_public_*` (jeton de partage, légitime), `jsc_public_*` (catalogue public, légitime); 6 aides corrigées par 0232. Examen limité à ces familles et à l'exposition anon; les fonctions appelables par tout compte connecté n'ont pas toutes été relues.

## Liens déjà émis
- Documents entreprise/assurances : 300 s à 3 600 s. Factures : 120 s. CRM flotte : 1 h.
- 10 ans : `blog-media` (contenu public) et `partner-photos` (marketplace).
- Seuls moyens d'invalider avant expiration : déplacer/renommer l'objet, ou changer la clé de signature du projet (coupe aussi toutes les sessions — non fait). Aucun lien émis n'est déclaré révoqué.

## Préparé, non installé
- R4D missions corrigé : missions sans réquisition gardent leurs règles (entrepreneur + propriétaire). 47 tests SQL jetables réussis.
- Dépendances : EXEC-02 (`prepared/exec01b/coordination.sql`, `lifecycle.sql`), puis R4B → éditeur (`INSTALLATION-NON-APPLIQUEE.sql`) → transport → R4D missions. Autorisation EXEC-02 requise.
- zod 4 serveur : `prepared/securite-zod4-serveur.patch` (fonctions EXEC-01 actives, `uuid()`→`guid()`); non redéployé. Le paquet `prepared/remblai-formulaire/serveur` (inactif) reste en 3.25.76.

## SheetJS
Source : https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz — 0.20.3. SHA-256 `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`, intégrité lockfile sha512 `oLDq3jw7…H+3AJA==`. Corrige CVE-2023-30533 (pollution de prototype, <0.19.3) et CVE-2024-22363 (ReDoS, <0.20.2). Non contrôlé par le scanner habituel.

## Alertes écartées antérieurement (non corrigées)
- Lecture publique blog_* et catégories de services : contenu public voulu. Risque : tout ajout futur d'une colonne privée serait public.
- Lecture par tout compte : fin_tax_rates, pay_rates (paramètres officiels annuels, pas de salaires), rds_categories (référentiel). Risque faible.

## Bloqué
- Parcours Auth réel avec comptes fictifs : aucun compte fictif confirmé possible (adresses TEST non confirmables, pas d'accès administrateur Auth). Une seule vraie session (compte du propriétaire) utilisée, en lecture.
