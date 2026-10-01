# Progression Finances

Mode de travail : un lot validé, puis publication confirmée avant le suivant. Publication déclenchée par ChatGPT, autorisée par l'utilisateur après chaque lot validé.
Abonnements, connexion bancaire et envois réels (courriel, texto, push) : jamais activés par ces travaux.

## FIN-08B — Encaissements reliés aux factures (2026-10-01)

- Réalisé et vérifié côté serveur (essais TEST annulés dans la même transaction) et par tests ciblés : 15/15 réussis, build de production code de sortie 0.
- Verrous : ajout et annulation verrouillent la facture puis l'encaissement (même ordre). Aucun essai concurrent réel exécuté (pas de deux sessions TEST isolées) : garantie par conception, non démontrée par essai.
- Idempotence : rejeu identique = même opération; même clé pour une requête différente ou une autre facture = refus explicite (P0409).
- Parcours réel ordinateur/mobile : NON VÉRIFIÉ.
- Publication : déclenchée par ChatGPT (autorisée par l'utilisateur) via deploy_project, commit 66c48051da3a33af44d6b9661f817535815e41a3, deployment_id b8603d72-b23a-4b59-a667-12189e737db6, statut reçu « pending ».
- Vérification 2026-10-01 03:09 UTC : https://vrac-quebec.lovable.app répond HTTP 302 → https://vracquebec.ca/ répond HTTP 200 (titre « Vrac Québec | Terre, Sable, Gravier & Remblai »). Preuve obtenue : site accessible et projet publié. NON prouvé : que le nouveau déploiement est terminé ni que la version servie correspond au commit 66c48051 — aucun accès au statut du déploiement, et le nom du fichier servi (index-A032Tyo-.js) ne permet pas de rattacher la version à un commit.
- Limites conservées : compte informatif seulement; trop-perçu isolé dans sa facture.

## FIN-08B — Constat de publication (2026-10-01)

- Déploiement e9e61f56-ab19-4f59-858f-1ac75608aa6b du HEAD a8c07b4 (code applicatif 66c48051) : interface Lovable constatée par ChatGPT vers 03:51 UTC, message « Votre site web a été mis à jour ». Constat rapporté, non vérifié par Lovable; l'interface réelle des Finances n'a pas été vérifiée.

## FIN-09A — Notes de crédit liées aux factures (2026-10-01)

- Réalisé : brouillon lié depuis une facture émise (motif obligatoire, lignes/quantités ou montant plafonné), aperçu serveur, émission explicite, numéro unique par entreprise (série NC-), PDF privé « NOTE DE CRÉDIT » rendu depuis instantanés (facture originale et son PDF inchangés).
- Solde : une source commune serveur (fin_invoice_balance) = brut figé − avoirs émis − encaissements actifs/antérieurs, plancher 0; trop-perçu / crédit disponible isolé, aucun remboursement ni mouvement bancaire. Facture entièrement créditée : entrée attendue retirée des prévisions (archivée).
- Vérifié côté serveur (entreprise TEST, tout annulé) : 1 149,75 − 400 − avoir 229,95 = 519,80; rejeu identique = un seul avoir; autre payload / même clé autre avoir = P0409; surcrédit refusé; trois crédits successifs = 1 000 + 50 + 99,75 exactement (résidu exact); facture payée créditée → trop-perçu 229,95 isolé; lignes mixtes TTC cumul = total facture; profil fiscal modifié sans effet sur l'avoir; lecture seule et autre entreprise refusées; aucune écriture directe accordée.
- Tests : 20/20 (5 FIN-09A + 4 FIN-08B + 2 FIN-08 + 9 FIN-07), compilation de production code 0.
- NON exécuté : essai concurrent réel (pas de deux sessions TEST isolées) — garantie par verrou commun facture, non démontrée. Parcours visuel réel ordinateur/mobile NON VÉRIFIÉ (test d'interface isolé seulement).
- Limites : pas d'annulation d'un avoir émis (aucune procédure traçable existante); pas de remboursement ni affectation du crédit disponible; conformité fiscale non certifiée.
- Sources de conception : Revenu Québec, Retours de biens et Réductions de prix (https://www.revenuquebec.ca/fr/entreprises/taxes/tpstvh-et-tvq/situations-particulieres-liees-a-la-tpstvh-et-a-la-tvq/retours-de-biens/ et .../reductions-de-prix/) : note identifiant vendeur et inscriptions, client, date, TPS/TVQ ajustées.
- Publication : CONFIRMÉE par ChatGPT après examen (constat ci-dessous).

### FIN-09A — Corrections avant publication (relecture du commit 6ad37cd, 2026-10-01)

- Migration additive 0091 : fin_credit_compute devient interne (aucun droit d'exécution anon/authenticated, vérifié par has_function_privilege; appel direct anonyme → 42501 « permission denied »). Anciennes signatures save/issue sans révision retirées des rôles clients (DEPRECATED).
- Validation stricte : indices négatifs, hors limites, non entiers, dupliqués, non numériques, quantités ≤ 0, mode inconnu, montants non numériques ou à plus de 2 décimales → refus 22023 (10 cas vérifiés, dont « 10 × ligne A » qui aurait crédité 1 000 HT).
- Arrondis : part de base figée par ligne répartie cumulativement; crédit de quantité = arrondi du cumul après − arrondi du cumul avant; taxes cumulées proportionnelles à la taxe facturée. Cas qty 3 × 0,335 + ligne 10,00 : unités 0,34 / 0,33 / 0,34 puis autre ligne → cumul 11,01 + 0,55 + 1,10 = 12,66 = facture. TTC mixte (taxable, détaxé, exonéré, crédits par demi-quantités) : cumul = 128,11 exact.
- Plus de troncature silencieuse : après un crédit par montant de 950,33, une ligne de 100 est refusée (« disponible 49,67 ») à l'aperçu et à l'émission; nouveau mode explicite « Solde exact restant » → cumul 1 149,75 = facture.
- Révision/empreinte : chaque brouillon a une révision; aperçu et émission transmettent révision + empreinte (motif + contenu). Brouillon modifié ailleurs à total identique → P0409, sauvegarde sur révision périmée → P0409. Interface : toute modification retire « Émettre »; conflit = message, aucune réémission automatique; réponse perdue = même clé, révision et empreinte; saisie fr-CA (200,50 ; 0,5) jamais convertie en 0; erreurs réseau de lecture/aperçu affichées; occupation réinitialisée au changement de facture/entreprise.
- Solde : le résumé des encaissements se recharge après émission d'un avoir sans fermer une saisie en cours; la fiche affiche le net depuis la même source serveur et « retirée des prévisions » pour une entrée archivée (plus d'ancien montant présenté comme net).
- PDF : motif et descriptions longs paginés, en-tête du tableau répété, colonne « Base HT ». Vérifié visuellement sur un PDF fictif de 4 pages converti en images.
- Essais serveur TEST annulés (vérifié : 0 avoir, 0 facture, profil « à compléter », rôle d'origine) : 519,80; rejeu = 1; facture payée → trop-perçu 229,95, aucun remboursement créé (5 remboursements préexistants inchangés); profil changé sans effet (TPS 5,00 / TVQ 9,98 pour 100 $); autre entreprise et lecture seule refusées.
- Tests : 26/26 (20 précédents + 6 nouveaux, dont intégration : fiche ouverte passe de 749,75 à 519,80 après l'avoir 229,95). public/sitemap.xml remis à sa version antérieure au lot (bruit généré).
- Toujours NON exécutés : essai concurrent réel à deux sessions; parcours visuel réel ordinateur/mobile. Le fichier sitemap est régénéré à chaque démarrage/compilation et peut réapparaître dans un commit.

## À venir (selon les plans déjà convenus — rien de ceci n'est livré)

- FIN-09B : acomptes et facturation progressive. FIN-09C : récurrence et retenues. (FIN-09A avoirs ci-dessus.)
- FIN-10 à FIN-23.
- OPS-00 à OPS-13.
- AVIS-01 à AVIS-03.

Les états non vérifiés listés ci-dessus et dans les lots précédents ne doivent pas être annoncés comme livrés.

## FIN-09A — Publication confirmée par ChatGPT

- Déploiement e0b07298-582c-4bec-99eb-12b72a5eb686 du commit e94c65244ed93fdaa74d2d26d5e6e7f5d2332a2c : interface Lovable vérifiée le 2026-10-01, message « Votre site web a été mis à jour », puis « Tout est publié ».
- Coût FIN-09A : 40,3 crédits (19 + 21,3, corrections comprises). Solde affiché après publication : 860 crédits. Les rapports de crédits sont en texte uniquement.
- Les limites de vérification ci-dessus restent applicables.

## FIN-09B1 — Acomptes et facturation progressive cumulative : TERMINÉ (2026-10-01, non publié)

- Réalisé : depuis CRM → Soumissions (soumission acceptée) « Facturation progressive » ouvre un dossier unique par soumission/version (contrat figé : lignes, remises, ventilation fiscale, client lié). Finances → Factures : liste des dossiers, fiche avec contrat / déjà facturé (HT, taxes, TTC) / reste à facturer, encaissements et avoirs séparés. Types « acompte », « situation progressive », « solde final »; cumul en % ou montant HT; un seul brouillon actif (reprise explicite, abandon motivé et conservé); aperçu serveur sans facture ni numéro; émission = vraie facture figée + une seule entrée attendue; PDF standard enrichi d'un récapitulatif (contrat, déjà facturé, cumul, cette facture, reste, numéros des factures précédentes).
- Calcul : parts cumulatives par traitement (taxable/détaxé/exonéré) et par taxe, cumul arrondi après − avant; solde final = résidus exacts. Facture ordinaire existante → démarrage refusé et proposée à l'ouverture (inchangée); dossier existant → « Créer la facture » refusé. Profil/taux différent du contrat à la date de facture → refus explicite (traitement contrôlé des changements fiscaux à venir).
- Sécurité : migrations 0092 et 0093; écritures uniquement par RPC (fin_progress_plan_create/draft_save/issue/abandon), calcul fin_progress_compute interne (aucun EXECUTE client), écriture directe sur les tables refusée; quote_id et progress_situation_id non modifiables hors RPC; même verrou soumission pour conversion entière et dossier; ordre dossier → situation → facture → numérotation; idempotence par clés (P0409 si contenu différent), révision + empreinte à l'émission.
- Essais serveur (entreprise TEST, tout annulé; nettoyage vérifié : 0 dossier, 0 client TEST, profil « à compléter », rôle gestionnaire) : 30 % = 300 + 15 + 29,93 = 344,93; 70 % = 400 + 20 + 39,90 = 459,90; solde = 300 + 15 + 29,92 = 344,92; somme 1 149,75. Acompte partiellement payé (100) : encaissement resté sur sa facture, entrées attendues 344,93/100 · 459,90→344,92 après avoir · 344,92, aucun doublon. Avoir 114,98 sur la situation 2 : solde final inchangé (plafond non rouvert). Rejeu identique = même résultat; même clé autre contenu = P0409; retour arrière, > 100 %, cumul = contrat hors « solde », vide, NaN, 3 décimales, date future refusés; second brouillon refusé; abandon rejoué identique; émission d'un abandonné, aperçu périmé, révision périmée = P0409; modification directe, retrait du lien, insertion directe avec quote_id ou situation refusées; ancienne API d'émission sans effet (« déjà émise »); conflit facture ordinaire dans les deux sens; lignes mixtes avec remise (1 021,94) et taxes incluses (940,95) soldées exactement; lecture seule et autre entreprise refusées.
- Tests : 65/65 Finances (dont 7 nouveaux FIN-09B1 : virgule, erreur réseau, contenu modifié après aperçu, rejeu, conflit, reprise, PDF); vérification des types 0; compilation de production code 0. PDF fictif réel généré et contrôlé en image.
- NON exécutés : essai concurrent réel à deux sessions (aucune paire de sessions TEST isolées; sérialisation garantie par verrous, non démontrée); parcours visuel réel ordinateur/mobile.
- Limites : changement de taux/profil en cours de contrat refusé (pas encore traité); aucune réaffectation d'encaissement ni remboursement; conformité fiscale non certifiée. Sources : Revenu Québec, moment où la TPS/TVQ doit être perçue (avances) et dépôts.
- À venir : FIN-09B2 (quantités par ligne, jalons, avenants approuvés), FIN-09C (récurrence, retenues).
