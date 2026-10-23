# Registre de reprise Vrac Québec — 23 octobre 2026

## R4B — actualisation après 18:19 UTC
Sauvegarde locale composée avec EXEC-02, accord affecté invalidé vers exception, snapshot conservé, restant et livré inchangés. Acceptation propriétaire concurrente à édition testée dans le moteur commun. Wrapper transport versionné et notification unique préparés, original préservé. Navigation admin exige rôle approuvé et ne restaure plus admin depuis cache; refus entrepreneur SEO maintenu. Installation, activation, publication : **aucune**.

R4B n’est pas parcours réel opérationnel : nouveaux RPCs absents du serveur partagé, flag false; vraie chaîne Auth/API/Storage complète, session admin autorisée et raccordement invitation/profil JSC restent R4C. Liste d’opérations et autorisations : `prepared/reprise-r3-r4/INSTALLATION-R4B.md`.

### Suite unique à conserver
| Sous-lot | État / travail suivant | Dépendance / preuve attendue |
|---|---|---|
| R4C coordination | R4B local développé; nouvelle proposition après invalidation | Cible complète indépendante, admin autorisé; API/écran/débit unique et révocation |
| Chauffeurs/flotte | Accès assigné local protégé; invitations/profil JSC non raccordés | Compose modules existants sans détourner invitations Punch; preuve identité + entreprise + véhicule/documents |
| Localisation | Correctifs R1 conservés; aucun suivi réel | Permissions et arrêt web testés; appareils physiques pour arrière-plan/verrouillage seulement |
| Communications EXEC-04 | Préparées, pas activées | File capture-only + opposition/finalité/horaires/rebond/rejeu dans cible indépendante |
| Hiver printemps 2027 | `prepared/campagne-hiver-2027.md` existe, enrichi | Liste contrôlée/exclusions et validation métier; aucun envoi fixé ou lancé |
| Partenaires/commission | Préparation EXEC-04 conservée | Accord réel et événement financier, pas taux inventé; périmètre partagé consenti et même entreprise |
| Formation Jonathan | Checklist existante enrichie scénario R4B/flotte/chauffeur | Date non fixée, responsable métier Jonathan; séance non effectuée |
| EXEC-05/06 | Préparations conservées, pas nouvelle activation | Cible adaptée + leurs tests/permissions; pas processeur/paiement/paie activés |
| SEO R2 | 188 villes, catalogue théorique ≠ pertinence; tests reprise/doublon conservés | Session admin approuvée pour lecture E2E; pas IA/publication massive |

Les bilans datés ci-dessous demeurent historiques; ne pas additionner leurs comptes de tests ou prendre leurs blocages résolus comme actuels.

## Actualisation R3/R4 — 23 octobre après 17:58 UTC
Édition et réquisitions développées en préparation, serveur non installé (`REQUEST_WORKBENCH_INSTALLED=false`), publication/activation inchangées. Même dossier/numéro, droits/version/historique, revalidation des décisions, chauffeur personnel et notification applicative capturée testés sur PostgreSQL jetable. 18 tests SQL + 17 EXEC-03 dont les cinq ignorés de R1 exécutés; 34 tests interface/SEO/GPS. Bilan actuel : `prepared/reprise-r3-r4/README.md`.

Refus SEO expliqué : compte personnel entrepreneur approuvé, aucun rôle admin; RPC exige admin approuvé. Pas de droits contournés. Défaut indépendant observé : helper hébergé `jsc_my_driver_ids()` ignore `is_active` et membership révoqué; correction préparée, non appliquée.

Pas terminé en hébergé : réservations engagées refusent la modification jusqu’à composition EXEC-02; adaptation `request_update`, contexte entreprise/invitations, vraie Auth/PostgREST et triggers complets restent R4B. Le bilan R1 ci-dessous demeure historique; ses cinq tests ignorés ne le sont plus à cette date.

## Verdict et périmètre de cette reprise
**Sous-lot R1 corrigé dans l’aperçu; mandat maître partiellement exécuté.** Aucun nouveau périmètre activé, aucune fonction déployée, aucune migration appliquée, aucune publication, aucun contact réel, paiement ou donnée métier modifiés. Pas de génération IA réelle. Les fonctions existantes et leurs paramètres sont conservés.

L’aperçu et la production partagent le serveur : les appels métiers ont été simulés ou bloqués pendant les tests navigateur. Les lectures de catalogue/tâches/migrations ont utilisé des requêtes SELECT. Les preuves historiques restent historiques; elles ne sont pas additionnées aux tests actuels.

## 1. SEO : données actuelles et causes établies
Lecture du 23 octobre : **188 villes actives**, non 167; **17 matériaux + 10 services + 1 page ville = 28 possibilités théoriques**. Ce total ne prouve pas une disponibilité ni une opportunité pertinente dans chaque ville.

| Ville | Pages existantes | Publiées | Brouillons | Observation |
|---|---:|---:|---:|---|
| Québec | 28 | 28 | 0 | Couverture historique; indexation Google non vérifiée |
| Lévis | 28 | 28 | 0 | Couverture historique; indexation Google non vérifiée |
| Adstock | 9 | 7 | 2 | Une publiée noindex; 3 demandes au registre territorial |
| Blainville | 4 | 3 | 1 | 1 demande au registre territorial |
| Brossard | 2 | 1 | 1 | 1 demande au registre territorial |
| Contrecoeur | 3 | 2 | 1 | 1 demande au registre territorial |
| Cowansville | 3 | 2 | 1 | 1 demande au registre territorial |

Les tâches historiques d’une même ville comptent plusieurs runs; leur somme ne représente jamais le nombre de combinaisons uniques. Les tâches récentes observées signalent notamment « Disponibilité inconnue — aucune preuve ni décision enregistrée » et « Combinaison exclue ». Ce sont des blocages métier, pas nécessairement une panne IA.

Le verrou global est **actif** (`seo_pipeline_guard.global_disabled=true`, raison du 13 octobre). Aucun run queued/running constaté dans les totaux lus. Il n’a pas été levé.

### Corrections réalisées
- `cityActions.ts` : une tâche récente n’est plus sélectionnée simplement parce qu’une autre tâche de la ville est interrompue. Date individuelle obligatoire pour la reprise; seuil existant de 15 minutes conservé, pas de nouveau seuil inventé.
- `useCityGeneration.ts` : verrou synchrone avant attente du démarrage serveur; refus de démarrage arrête tout; relecture des dates/activité au clic; résultat vide jamais considéré comme une page créée; réponse `updated` conservée pour régénération.
- Le lot s’arrête sur quota 402/429 ou indisponibilité 503, ou sauvegarde de progression refusée. Les pages non traitées restent indiquées; fin non confirmée affichée en erreur, pas succès silencieux.
- `cityCoverage.ts` : statut actuel `published` fait foi; une ancienne date de publication ne rend plus un brouillon publié.
- `PipelineControlCenter.tsx` : lecture de couverture échouée marquée en erreur même après réussite antérieure; verrou inconnu ne permet plus la reprise globale.

### Écarts non masqués
La définition hébergée lue de `seo_city_slots_expected` inclut encore `existing_slots` dans son union; ce registre historique n’est donc pas une preuve de pertinence commerciale. La grille `seo_city_slots_catalog` contient une logique historique de preuves, alors que la disponibilité protégée dispose d’autres fonctions. **Ne pas corriger cette divergence par suppression de pages ou en levant les droits.** Prochain R2 : comparer `seo_slot_availability`, le rapport, le catalogue et les décisions sur une session admin autorisée, préparer un changement SQL épinglé avec inverse seulement si la divergence est confirmée sur le chemin effectif.

La session personnelle obtenue par `--self` n’est pas administratrice : les sept rapports refusent « Réservé aux administrateurs »; `/admin/seo` revient à `/`. Aucun changement de rôle effectué. Le refus de l’outil SQL pour `seo_city_coverage_all` ne démontre pas une erreur de droits de l’application. Les journaux recherchés de `seo-generate-page` et `submission-owner-portal` ne contenaient aucune entrée : **parité des déploiements non vérifiée**.

Les lots manuels restent séquentiels par ville; plafond configurable, délais explicites et preuve complète après interruption restent à compléter. Pas de publication ni indexation déclarées comme effectuées.

## 2. Tableau des 22 périmètres
| Périmètre | État actuel / preuve | Résultat R1 et prochaine étape |
|---|---|---|
| 1 Méthode/continuité | Registre créé; lectures et journal confirmés | Aucun replay de migration; reprise R2 décrite ci-dessous |
| 2 SEO | Partiel; matrice ci-dessus, défauts de code démontrés | Corrections locales testées; parité serveur et rapport admin non vérifiés |
| 3 Accueil/soumissions | Parcours existant conservé `/obtenir-des-soumissions` | Texte factuel, double clic protégé, numéro requis, photo refusée non ignorée; E2E simulé |
| 4 Entrepreneur/modification/notifications | Accueil et dossiers existants; modification complète non prouvée | Bannière noire réduite sans changer navigation/carte; édition/version/revalidation/notification restent R3 |
| 5 EXEC-01 | Activé **dans le code**; SQL 0225–0230 installé confirmé | Empreintes inchangées; correctifs préparés antérieurs non installés; SMTP/Storage/actions réelles non rejoués |
| 6 Préavis/urgence | Date souhaitée/période existantes | Recommandation générale ajoutée; pas refus/seuil; premier voyage/rythme/flexibilité structurés et préavis configurable restent à raccorder |
| 7 EXEC-02 | Développé mais non installé/activation false | Préférences ≠ accord; réservations/capacité SQL historiques non retestées dans cette reprise |
| 8 EXEC-03 | Carte conservée; extension de recherche false | 600 $ et frais différentiels testés; Google/polygone réel et serveur préférences non validés |
| 9 EXEC-04 | Développé mais non installé/false | Campagne hiver et SMS proposés dans prepared, modèle `reconfirmation` réutilisé; aucune campagne créée |
| 10 Recommandations | Formulaire public `/remblai` existant | Lien public distinct rappelé; acquisition/doublons/partage UI non complétés |
| 11 Partenaires/commissions | Modules préparés/existants; connexion finance partielle | Aucun taux ajouté; ententes/finances transversales attendent cible adaptée |
| 12 EXEC-05 | Finances existantes conservées; extension false | PDF/solde/brouillon mail testés; chaîne complète Auth/Storage/écriture non exécutée |
| 13 EXEC-06 | Punch existant conservé; extension false | Hors connexion non livré; invitation/approbation/export transversal non exécutés |
| 14 Chauffeurs/camions | Flotte et `jsc_driver_portal` existants | Accès/invitations multi-entreprises non entièrement validés; aucune nouvelle permission |
| 15 Réquisitions/voyages | `drv_missions`, `jsc_deliveries`, `trips` et `cpn_trips` ont des rôles distincts | Pas de fusion; affectation sécurisée, refus/incident/version acceptée à compléter. Signature `signed:timestamp` du portail n’est pas certifiée comme signature de document |
| 16 Localisation | Page existante `/chauffeur/mission`, RPC hébergées présentes | Reprise explicite, arrêt sur page cachée/compte, erreurs honnêtes, clôture relue; tests sans GPS réel; rétention/annulation externe et appareils restent ouverts |
| 17 Installation | PWA, manifeste, invitation existants conservés | Acceptation de prompt ≠ installation; état confirmé par appinstalled/standalone; appareils physiques non essayés |
| 18 Aide/formation | Aide existante, progression appareil | Progression corrompue réparée sans fausse complétion; checklist Jonathan préparée; hébergement support non raccordé |
| 19 Validation Jonathan | Non vérifiée | Parcours courts et fiche de validation préparés; aucune validation métier attribuée à Cassandra ou Jonathan |
| 20 Commercial/abonnement | `/entrepreneur/abonnement`, scripts EXEC-07 existants | Aucun tarif/paiement modifié; catalogue 6 pages/guide représentant/plan tournage commercial non retrouvés dans fichiers examinés |
| 21 Vérifications | 179 tests réussis, 5 SQL ignorés; navigateur décrit ci-dessous | Pas certification A–E ni test fournisseur/appareil réel |
| 22 Livraison/reprise | Ce registre + copie consultable | Travail global non terminé; aucune activation proposée comme immédiatement prête |

## 3. Installation réelle, paramètres et structures
Journal **Drizzle** lu : 231 entrées. Les six entrées correspondant aux fichiers 0225–0230 ont été retrouvées par leur `created_at`, et leurs SHA-256 correspondent exactement aux fichiers locaux. La recherche par nom dans `supabase_migrations` ne suffisait pas et n’a pas été utilisée comme conclusion.

| Migration déjà installée | Journal id | Date millisecondes |
|---|---:|---:|
| 0225 schéma portail | 226 | 1792443371894 |
| 0226 quota | 227 | 1792443390397 |
| 0227 correctif inputhash | 228 | 1792443415277 |
| 0228 confirmation queue | 229 | 1792443430078 |
| 0229 capture courrier | 230 | 1792443448399 |
| 0230 photos privées | 231 | 1792443466041 |

Définitions hébergées présentes, empreintes MD5 relues : `exec01_dispatch` 2da0b80649cfacf5db57fe559adab3c2, `exec01_projection` e4cec3f904e15ec6ef264a22f71298c1, `exec01_enqueue_confirmation` 7262c4525163637476d42b57c8b63c82, `exec01_photo_manage` 797eadff98c2eca9cf750a29464524c2. Correspondent aux références de préparation antérieures; **aucun remplacement**.

Paramètres réellement modifiés : **aucun**. Paramètres de source conservés : `REMBLAI_CLOUD_ENABLED=true`, `RECEPTION_CLOUD_ENABLED=false`, `SEARCH_CLOUD_ENABLED=false`, `EXEC04_CLOUD_ENABLED=false`, `EXEC05_HOSTED_ENABLED=false`, `EXEC06_HOSTED_ENABLED=false`. Ce ne sont pas des preuves de parité de la publication.

Aucune migration nouvelle écrite dans R1. Proposition multi-adresses antérieure conservée : `prepared/multi-emplacements/0240_demande_multi_emplacements_NON_APPLIQUEE.sql` : groupe principal + lignes `submissions` par emplacement, fiches CRM inchangées, anciens dossiers non convertis; `MULTI_SITES_SERVER_READY=false`. Non installée/non testée dans cette reprise. Le bilan ancien `prepared/vehicle-access/README.md` n’a pas été retrouvé dans ce checkout : ne pas considérer son ancien inventaire comme preuve actuelle; uniformisation véhicules à revérifier en R3.

## 4. Chemins exacts
- Propriétaire : `/remblai`, `/portail/remblai` **avec son lien privé existant**, aucun exemple de secret fourni.
- Entrepreneur : `/entrepreneur`, `/entrepreneur/chantiers`, `/entrepreneur/demandes/:id`, `/entrepreneur/transports`, `/entrepreneur/carte`, `/entrepreneur/crm`, `/entrepreneur/finances`, `/entrepreneur/punch`, `/entrepreneur/aide`, `/entrepreneur/abonnement`.
- Chauffeur : `/portail/chauffeur` (feuille de route), `/chauffeur/mission` (localisation consentie). Ce sont deux modules existants, pas un droit général de compte.
- Administration : `/admin/seo?tab=generator`, `?tab=cities`, `?tab=materials`, `?tab=uses`, `?tab=services`, `/admin/territoires`, `/admin/integrations-google`, `/admin/ai-economy`, `/admin/missions`, `/admin/relances`, `/admin/finances`, `/admin/punch`, `/admin/marche/soumissions`, `/admin/marche/commissions`.

## 5. Fichiers modifiés dans R1
Présentation : `src/components/home/IntentChoice.tsx`, `src/pages/Index.tsx`, `src/pages/EntrepreneurDashboard.tsx`, `src/components/parcours/ParcoursForm.tsx`.

SEO : `src/lib/seo/cityActions.ts`, `cityCoverage.ts`, `useCityGeneration.ts`, `src/components/seo/PipelineControlCenter.tsx`.

Autres corrections : `src/pages/ObtenirSoumissions.tsx`, `src/pages/DriverMission.tsx`, `src/hooks/useInstallApp.ts`, `src/lib/help/progress.ts`.

Tests : `src/test/seo-city-plan.test.ts`, `seo-city-coverage.test.ts`, `seo-city-generation-launch.test.tsx`, `driver-mission-safety.test.tsx`, `marketplace-submit-safety.test.tsx`, `help-progress-recovery.test.ts`, `install-app.test.ts`.

Documents : ce registre, `prepared/campagne-hiver-2027.md`, `prepared/reprise-formation-jonathan-2026-10-23.md`, `roadmap.md`, `AGENTS.md`, mémoire de contraintes du mandat. `communications.ts` a été inspecté; le nouveau type hivernal incompatible a été retiré, aucune modification fonctionnelle finale du catalogue de modèles.

## 6. Tests réellement exécutés et preuves
- Vitest final : **18 fichiers, 179 réussis, 5 ignorés, 0 échec**. Fichier complet `docs/audit/reprise-maitre-preuves/tests-final.txt`.
- SEO : reprise partielle/date récente, lancement concurrent pendant RPC, démarrage refusé, quota, résultat absent, régénération `updated`, sauvegarde progression refusée, protection existante des pages publiées. Tous appels IA simulés.
- Soumissions : numéro absent → brouillon conservé; double clic → un appel; upload refusé → pas d’envoi sans pièce.
- Chauffeur : ouverture sans GPS, autorisation explicite, page cachée puis reprise non automatique, logout, lecture refusée, clôture refusée ou non relue. Aucun point réel.
- Aide : stockage null/tableau/clé inconnue/date invalide et séparation entreprise; installation : choix accepté sans faux état installé.
- Règles conservées : exemple d’économie **12 × 20 ÷ 60 × 150 = 600 $** avant frais; PDF figé/brouillon mail et règlement distinct de facture envoyée; statuts remblai et abonnements.
- Chromium : soumission complète fictive aux largeurs **360, 768, 1280**, requête interceptée, numéro TEST affiché; pas de débordement ni erreur JS. Chauffeur aux mêmes largeurs : démarrage/arrêt local et clôture TEST refusée, mission conservée, GPS remplacé, requête réelle interdite. Captures dans `docs/audit/reprise-maitre-preuves/`.
- Dernier journal de compilation après changements : `build OK`. Aucun build/typecheck manuel lancé.

### Non exécuté
Les **5 tests SQL EXEC-03** requièrent la base loopback vérifiée; aucun cluster complet Auth/PostgREST/Storage/capture accessible établi. A–E non rejoués, concurrence SQL réservation/capacité/finances non recertifiée. SMTP remis/livré, photos Cloud, notifications d’une mutation super admin, autorisation chauffeur serveur multi-entreprises et révocation, incident/réquisition/signature, vrai Maps/GSC/GBP non testés. iPhone/Android physiques, verrouillage/arrière-plan/installation réelle non disponibles. Une page navigateur TEST n’est pas une certification hébergée.

## 7. Scénarios A–E conservés
Définitions inchangées de `docs/audit/exec08-bilan.md` : A formulaire → courriel → lien → modification → même CRM; B demande → recherche → trois modes → réponse → livraison partielle → capacité; C besoin → partage → partenaire → résultat → commission; D client → soumission → PDF → règlements → solde/comptabilité; E invitation → employé → punch → correction → approbation → export. **Aucun de ces scénarios complets n’est déclaré réussi par les tests R1.**

## 8. Reprise précise et liste unique de mise en service restante
1. **R2 SEO (prochain sous-lot de code, pas une demande de publication)** : obtenir lecture admin autorisée du rapport effectif, aligner catalogue/file/disponibilité sur données factuelles; plafond de lot configurable et délai/reprise explicites; tests anti-doublon entre instances. Ne pas compter chaque historique de tâche comme une page. Aucun titre/page réelle à régénérer pour masquer l’écart.
2. **R3 demande entrepreneur** : édition même dossier, version et champ allowlist; revalidation accords et notification existante; uniformisation véhicules/multi-adresses selon état réel. Les writers serveur restent préparés. Ce code est encore à compléter, pas seulement « en attente d’activation ».
3. **R4 chauffeurs/réquisitions** : accès personnel existant, affectation entreprise/destination autorisée, notification TEST, version acceptée/refus/incident; clarifier signature réelle et rétention localisation. Vérifier source serveur avant préparation de permissions.
4. **R5 intégration EXEC-02–07** : writers manquants, file existante et capture, vraie Auth/RLS/Storage dans environnement indépendant fourni et accessible; ne pas remplacer par un faux serveur. Rejouer A–E selon définitions exactes.
5. **R6 commercial/formation** : Jonathan valide métier et appareils; retrouver contenus extérieurs manquants, poursuivre captures factuelles et configuration sans tarif inventé.
6. **Installation finale unique à approuver seulement après ces preuves** : liste SQL exacte épinglée + inverses ciblés + fonctions nommées + paramètres d’activation séparés + sauvegarde datée. Pas rejouer 0225–0230; pas copier prepared vers les fonctions actives avant approbation. Impact : serveur public partagé, nouvelles fonctions publiques possibles. Retour arrière : remettre les définitions précédentes ciblées et désactiver uniquement le nouveau périmètre, sans restauration globale ni effacement de dossiers.
7. **Publication** : autorisation distincte, non exécutée. Aucun envoi réel, paiement, achat ou campagne implicitement couvert par l’accord d’installation.

La limite de cette exécution a permis R1 et les préparations documentaires indépendantes, pas les 22 périmètres complets. R2/R3/R4 sont encore des développements; l’absence d’environnement complet explique les validations hébergées manquantes, pas tout le code restant.