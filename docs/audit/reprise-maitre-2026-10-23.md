# Registre de reprise Vrac Québec — 23 octobre 2026

## R4D — actualisation 19:04 UTC, raccordé dans le code, pas clôturé hébergé
**Réalisé** : connexion/inscription via client Auth existant dans document invitation isolé, fragment conservé; panneau employés et activation raccordés sous porte false. Invitation/renouvellement + file transactional existante atomiques, worker préparé composé capture-only. Révocation portail/profil R4C + notifications/documents/mission/points R4D; autorisation avant lot vide ancien `drv_points_batch` (défaut trouvé par essai puis corrigé). Refus de position arrête/purge suivi, erreur réquisition purge affichage. Aucun « Fixed admin SEO ».

**Preuve actuelle** : 112 tests réussis / 11 fichiers / zéro ignoré (`docs/audit/reprise-r4d-preuves/tests-final.txt`). SQL réel PostgreSQL jetable avec Auth/file/Storage fixtures : invitation→capture→activation→mission/révalidation→clôture→révocation et refus anciennes requêtes/token/documents/notifications, historique conservé. R4B concurrence/capacité rejoué. Tests connexion = services injectés, pas Auth réelle. Chromium 1280×1800 : Connexion/Retour garde fragment, aucune soumission Auth/envoi; capture `connexion-retour.png`. Compilation OK. **Pas essai intégré hébergé Auth/API/Storage**, pas sauvegarde réelle déclarée.

**Installé/activé/publié** : aucun nouveau changement partagé. Manifest actuel `prepared/reprise-r3-r4/MANIFEST-R4D.sha256` remplace R4C devenu historique. Ordre/migrations/RPC/worker/flags/impact/retour : `prepared/reprise-r3-r4/INSTALLATION-R4D.md`. Retour ferme nouveaux accès, ne réouvre pas anciennes failles et ne supprime rien.

**Blocages exacts** : cible complète indépendante Auth/PostgREST/Storage/PGMQ indisponible; URLs Storage déjà signées peuvent survivre à révocation jusqu’à expiration (fichiers téléchargés non récupérables); aucune vérification complète de ces anciens chemins. Pas nouvelle simulation proposée ni transfert du même raccordement à R4E. Action nécessaire : accès à cible complète indépendante autorisée + comptes fictifs confirmés; installation paquet et contrôle vrais services/anciens liens. Installation partagée et déploiement worker nécessitent accord nouveau après preuves; autorisation EXEC-01 conservée sans extension. Publication/activation/envois réels exclus.

**Suite indépendante** : garde communications TEST renforcé et testé, campagne hiver/formation Jonathan actualisées avec limites réelles. R5 = validation des horaires/exclusions/oppositions/reprise file existante et cas partenaires avant activation, seulement sur cible indépendante; reste dépendant des services complets pour preuve transport. Coordination R4B/billets/finances, partenaires/commissions, flotte/documents, chauffeurs, GPS appareil verrouillé, formation métier, SEO admin 188 villes et matériel commercial restent ouverts comme ci-dessous. Les anciens bilans restent historiques; cette section prévaut.

## R4C — actualisation après 18:44 UTC, préparation non installée
**Réalisé localement** : invitations employés existantes composées avec un profil JSC explicitement choisi; activation liée au compte personnel confirmé et à la bonne entreprise, expiration/renouvellement avec rotation, révocation du membre/profil et anciennes RPCs couvertes par trigger. Notifications/historique uniques et persistants dans les objets existants. Catalogue et panneaux chauffeurs préparés, non raccordés aux écrans actifs. Lectures hébergées ont confirmé deux autres écarts : `jsc_driver_portal` ignore membership/is_active, et policy « portal driver reads own file » autorise user_id seul; corrections préparées et SQL local validé, **pas appliquées**.

**Preuves actuelles** : 154 tests réussis / 12 fichiers / zéro ignoré (`docs/audit/reprise-r4c-preuves/tests-final.txt`). PostgreSQL 17 jetable 127.0.0.1:55439, identités Auth fixtures et rôles SQL : invitation capturée→activation→réquisition→acceptation ou refus→étapes→clôture, mauvais compte/B, expiration/rotation, compte non confirmé, révocation concurrente, profil/portail privés retirés. R3/R4/R4B conservés/rejoués avec vrai SQL EXEC-02 préparé : acceptation concurrente à édition, snapshots, livraison mesurée/débit unique, notification atomique. Chromium 1280×1800 confirme seulement la fermeture de l’écran actif; deux tentatives externes bloquées par l’essai. Aucun vrai parcours Auth/API/Storage certifié.

**Code / serveur / publication / activation** : code préparé, installation partagée **aucune**, publication **aucune**, activation nouvelle **aucune**, validation métier **non effectuée**. Flags false conservés. Paquet exact et dépendances : `prepared/reprise-r3-r4/INSTALLATION-R4C.md`, empreintes `MANIFEST-R4C.sha256`. Dépendance employés extraite sans punch/paie; dépendances EXEC-02 non installables aveuglément. Retour ferme nouveaux RPCs et conserve guards/historiques, sans réouvrir ancienne faille.

**Libellés** : aucun « Fixed admin SEO » revendiqué. R4B vérifiable uniquement : `src/hooks/useUserRole.ts` + `src/lib/auth/approved-roles.ts`, hints approuvés et pas admin restauré du cache. `has_role` décide serveur. Refus entrepreneur SEO normal; 188 villes/couverture pertinente distinctes; session réelle déjà admin approuvée requise pour lecture SEO. Action : ce compte se connecte dans l’aperçu et demande contrôle en lecture seule, ou est désigné pour session nominative avec approbation; aucun rôle changé.

### Prochaine reprise exacte : R4D, puis R5
| Travail ouvert | État / dépendance réelle |
|---|---|
| Invitation complète hébergée | **Partiel** : composer reprise de connexion (écran actuel efface le fragment au clic Connexion), branchement panneaux/activation et courrier atomique dans file existante, capture-only. Pas une simple levée de flag. |
| Permissions chauffeurs transversales | **Partiel** : nouveaux RPCs/helper/portail/profil local vérifiés; policies alternatives `jsc_can_manage`, notifications personnelles, documents/Storage et `drv_*` encore à composer/vérifier dans schéma complet. |
| Cible Auth/API/Storage/file indépendante | **Dépendance externe** : PostgreSQL local disponible mais pas stack complète accessible; aucune simulation remplaçante ni écriture partagée. CI/installation locale conteneurs réellement accessible requise. |
| Coordination EXEC-02 | Composition R4B locale testée; installation dépendances et boucle billets/capacité/écrans hébergés non validées. |
| Communications/hiver 2027 | Garde TEST renforcé en préparation (mode explicite/destinataires réservés), huit nouveaux tests; 28 régressions communications/secteurs rejouées. File/oppositions/horaires/capture Auth complets restent R5; aucun message réel. |
| Partenaires/commissions | Préparations conservées; attribution/acquisition et écritures financières transversales dans cible complète; pas taux inventé. |
| Flotte et chauffeurs | Profils/camions réutilisés, pas fusion des catalogues; documents/assurance et révocation toutes voies restent ouverts. |
| Localisation | R1 conservé; pas suivi réel. Consentement/retrait/rétention à vérifier côté serveur; verrouillage/arrière-plan seulement nécessitent appareils physiques. |
| Formation Jonathan | Checklist enrichie invitation→chauffeur et R4B; séance métier non effectuée. Captures/scripts existants conservés; matériel commercial extérieur manquant. |
| SEO R2 | 188 villes, reprise/double lancement tests verts; admin réel et catalogue/file/disponibilité effectifs non validés. Aucun système déclaré entièrement corrigé. |
| EXEC-01/03/05/06/07/08 | Préparations antérieures conservées, tests complets A–E et installations distinctes restent au registre; pas paiement/paie/achat ni nouvelle activation. |

Les sections et comptes datés ci-dessous restent historiques; cette actualisation prévaut. Mandat maître non terminé. Prochaine action concrète : R4D branchement sécurisé et transport atomique préparés, puis validation sur cible complète avant décision unique d’installation partagée; autorisations EXEC-01 acquises non redemandées et non étendues.

## R4B — actualisation après 18:19 UTC
Sauvegarde locale composée avec EXEC-02, accord affecté invalidé vers exception, snapshot conservé, restant et livré inchangés. Acceptation propriétaire concurrente à édition testée dans le moteur commun. Wrapper transport versionné et notification unique préparés, original préservé. Navigation admin exige rôle approuvé et ne restaure plus admin depuis cache; refus entrepreneur SEO maintenu. Installation, activation, publication : **aucune**.

Derniers essais : **59 SQL + 33 interface/rôles/SEO**, soit 92 réussis; zéro ignoré dans ces sept fichiers. PostgreSQL jetable 127.0.0.1:55439; vraie fonction EXEC02 composée, JWT de fixture (pas vraie Auth), messages capture-only. Chromium 360/768/1280 injection fictive sans appel externe; compilation OK. Retour des nouveaux RPCs testé localement, inverse helper non certifié. Preuves dans `docs/audit/reprise-r4b-preuves/`.

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
## Mise à jour 2026-10-27 (R4G)
- Raccordé à l’interface (aperçu) : Documents d’entreprise, Preuves d’assurance chauffeur et pièces de police passent par `secure-file` (`src/lib/secureFile.ts`); l’accès direct au stockage depuis ces écrans est retiré. Messages 401/403/indisponible affichés.
- Testé : 2 tests de messages; fonction hébergée sans session → 401 (observé).
- Non testé de bout en bout : téléchargement autorisé, refus même session après révocation, refus interentreprises — bloqués faute de sessions TEST authentifiées.
- Anciens liens signés déjà émis : valides jusqu’à expiration; aucun déplacement de fichiers ni changement de clé.
- Patch Zod serveur, paquet EXEC-02→éditeur→R4D, PDF visuel : non avancés dans ce lot.

## R4G — examen fonctions sensibles connectées (2026-10-27)
- Périmètre : 30 fonctions SECURITY DEFINER fin_/asr_/entcrm_/has_role exécutables par comptes connectés sans contrôle visible direct, + aides centrales (entcrm_role, asr_role, fin_can_*, fin_exp_can_see, fin_portal_active, has_role).
- Défaut démontré : fin_exp_adv_avail, fin_exp_alloc_sum, fin_bank_account_ok, fin_pay_account_check sans contrôle entreprise. Correctif préparé `prepared/securite-r4g/0233_…sql`, NON installé.
- Autres : contrôle délégué vérifié (rôle actif + archived_at + is_active). Fonctions publiques à jeton (entcrm_public_quote/respond) conservées.
- Tests de session (accepté/autre entreprise/rôle/révoqué) : non exécutés, sans comptes TEST.
### Prochains objectifs
1. Diagnostic Zod serveur. 2. Contrôle visuel PDF. 3. Paquet EXEC-02 → éditeur → missions R4D. 4. Validation complète avec les deux comptes TEST.

## R4H — 2026-10-27 (09:45 Toronto)

| Point | Changé | Environnement | Tests réellement exécutés | Reste bloqué |
|---|---|---|---|---|
| 0233 aides finances | Correctif corrigé (signature réelle `fin_pay_account_check(uuid,uuid,text)`; l’ancienne version préparée aurait échoué) puis **installé** | Serveur en service | Lecture code : 11 appelants tous SECURITY DEFINER/propriétaire postgres, aucun appel client ni politique/vue. Test local PostgreSQL jetable : 8 refus (authenticated/anon × 4), service_role OK, appelant interne OK (70/30), retour arrière = mêmes droits (ordre d’affichage seul différent). Serveur : droits effectifs authenticated=false, anon=false; RPC parentes conservées. Appel API anonyme 401, catalogue public 200. Preuves `prepared/securite-r4g/preuves/0233-*` | Essai avec vraie session (parcours dépenses/banque/paiement) : **non exécuté**, exige comptes TEST |
| Zod serveur | Aucun changement serveur | Local (Deno 2.6.10) | Cause du « plantage » : résolution des paquets Deno en mode node_modules du projet, pas Zod. En dossier isolé, zod 3.25.76 et 4.6.6 : vérification de types et import OK; 5 cas de validation identiques (200/400/400/400/200). `preuves/zod/probe.ts` | Compatibilité du moteur hébergé non prouvée sans redéploiement (non autorisé) |
| PDF facture | Défaut démontré corrigé : « → » rendu « !' »; flèches/comparateurs/points de suspension remplacés | Aperçu (code) | PDF fictif 3 pages : accents OK, montants 5 700,00 / 285,00 / 568,58 / 6 553,58 $ exacts, « Page x / 3 », totaux non coupés. Vitest 2/2. Preuves `preuves/pdf/`. PDF déjà émis non modifiés (octets figés) | — |
| Paquet EXEC-02→éditeur→R4D | `INSTALLATION-PAQUET-EXEC02-EDITEUR-R4D.md` + nouveau manifeste | Lecture serveur, fichiers préparés | EXEC-02 absent du serveur; 0 mission/0 point actuels; empreintes des 4 fonctions missions consignées; anciens manifestes R4C/R4D périmés (3 fichiers) | Installation non autorisée; composition EXEC-02 sur schéma réel à écrire |
| Comptes TEST | Instructions conservées | — | — | Création par parcours normal (inscription, courriel confirmé, invitation chauffeur). Je ne peux pas ouvrir leurs sessions automatiquement : le seul moyen sûr est que vous vous connectiez vous-même dans l’aperçu Lovable avec le compte TEST, la session est alors transmise à mes essais |

Prochains objectifs : composition EXEC-02 sur schéma réel (base jetable), autorisation de redéploiement Zod, essais 0233 et documents avec comptes TEST.

## R4I — 2026-10-27 : paquet missions et Zod (rien installé ni déployé)
| Point | Changement | Environnement | Tests | Bloqué |
|---|---|---|---|---|
| Paquet EXEC-02→éditeur→R4D | `prepared/paquet-missions-2026-10-27/` (00–10, retour, manifeste, `INSTALLATION.md`) ; priorités « haute » → « importante » (refusées par le serveur) ; RPC missions limitées aux missions liées | Réplique isolée fidèle au serveur | 40/40 scénarios ; retour arrière vérifié identique au serveur | Autorisation d’installation ; décision propriétaire des demandes (731/737 sans auteur) |
| Défaut existant voyages | Correctif 00 préparé : création de voyage impossible sur le serveur | Réplique | voyage + journal OK | Autorisation |
| Zod 4 serveur | Essai du point d’entrée complet, `prepared/zod-serveur/` | Deno local isolé | 16/16 réponses identiques, `deno check` 2 fonctions | Runtime hébergé non prouvé ; redéploiement non autorisé |
| Comptes TEST | — | — | vraies sessions non exécutées | Connexion du gestionnaire dans l’aperçu |
Résiduel noté : 256 fonctions serveur exécutables par tous par défaut (corps protégés à vérifier au cas par cas, hors lot).

## R4J — 2026-10-27 (10:45 Toronto) : installations autorisées
| Point | Environnement | Vérification | Résultat |
|---|---|---|---|
| Correctif création voyages (0234) | Serveur en service | empreinte avant ; essai annulé | voyage + journal créés puis annulés, 0 voyage conservé |
| Paquet EXEC-02→éditeur→R4D (0235–0244) | Serveur en service | état serveur = état testé avant ; fichiers installés = fichiers testés ; 156 objets serveur = réplique | aucun écart ; 0233 conservé (4 aides refusées anon/authenticated) ; création publique passe (essai annulé) ; 0 mission, 0 réservation, 0 dossier rattaché |
| Zod 4.6.6 (submission-owner-portal, send-transactional-email) | Serveur en service | GET 200 sans mutation ; POST origine étrangère 403 ; démarrage des deux fonctions dans les journaux ; GET envoi 401 | archive `prepared/zod-serveur/archive-avant-deploiement/` ; retour = restaurer ces 2 fichiers et redéployer |
| Rattachement des demandes (fichier 11) | Réplique isolée seulement | 30/30 essais + 40/40 chaîne ; retour arrière vérifié | NON installé |
| Écran : explication « non rattachée » + demande de vérification | Aperçu | 10/10 tests écran | service non installé ; éditeur toujours désactivé (`REQUEST_WORKBENCH_INSTALLED=false`) |
Toujours désactivés : réservations automatiques (aucune règle propriétaire), envois réels, points d’entrée EXEC-02/invitations non déployés, éditeur et réquisitions côté écran.
Non exécuté (vraies sessions TEST) : connexion gestionnaire/chauffeur, téléchargement autorisé/refusé, révocation avec session ouverte sur le serveur, invitation capturée réelle.

## R4K — 2026-10-27 (rattachement installé, éditeur/réquisitions en aperçu, essais avec vraies sessions TEST)
- **Serveur** : migration 0245 rattachement des demandes (concordance vérifiée : objets absents, règle de création empreinte e1fb01e5…, retour `prepared/paquet-missions-2026-10-27/retour/11_rattachement_demandes.sql`). Droits : status/request/decide authenticated seulement, capture d'auteur non appelable; 0233 et `exec02_dispatch` toujours fermés.
- **Serveur — défaut démontré et corrigé** : `secure-file` servait une copie en cache du stockage à un membre révoqué (même session). Lecture via point « authenticated » + paramètre unique; redéployée (archive `prepared/securite-r4k/archive/`).
- **Aperçu seulement** (build de développement, pas la version publiée) : éditeur, réquisitions, demande de vérification et panneau de décision du centre de contrôle.
- **Vraies sessions TEST (comptes @test.invalid)** : téléchargement autorisé 200 no-store; refus A→B et B→A 403; sans session 401; révocation même session ouverte 403 après correctif puis 200 au rétablissement; auteur capturé par la session, auteur imposé écrasé, entreprise imposée refusée; demande de vérification (refus pour autre entreprise, idempotente), décision refusée au non-admin; refus motivé et approbation avec preuve via l'écran admin, journal + historique CRM; modification autorisée v1→v2 avec revalidation, rejeu idempotent, version périmée refusée, autre entreprise refusée. Captures `docs/audit/r4k-preuves/`.
- **Données TEST créées** : 4 demandes fictives (@test.invalid), 2 demandes de rattachement, 2 fichiers TEST. Accès B rétabli.
- **Bloqué** : invitation chauffeur en capture TEST, accès aux missions, révocation chauffeur — aucun compte chauffeur TEST confirmé. Création d'une réquisition complète : nécessite chauffeur/camion TEST.
- **Avant publication** : décision de publier, essais chauffeur, activer l'interrupteur hors aperçu.

### R4K — complément chauffeur du 27 octobre, 17:45 UTC
- **Serveur, TEST uniquement** : camion privé `43537bcf-ed93-48af-b3e8-7aa2469af1f0`, profil non lié `9d1b59b7-b36f-44c8-a7f5-1b5669ac2407`, support transport DT-0056 `5101bddf-c0ce-4189-858f-35cf98b7c250` sur dossier 823. Réquisition complète **non affectée** : aucun chauffeur confirmé ni destination TEST approuvée. 20 tonnes reprises sans conversion; tentative `m3` refusée par la contrainte, annulée avant reprise. Aucun compte/rôle créé ou modifié.
- **Aperçu seulement** : raccord invitation au service capture installé, indépendant du punch étendu désactivé; entreprise du portail prise du profil serveur; lien de suivi exact après acceptation. Publication toujours interdite, aucune activation d'envoi.
- **Preuves de ce tour** : tests ciblés et résultats `docs/audit/r4k-preuves/tests-locaux.txt`; Playwright signé-out : formulaire de création personnelle accessible, portail sans mission; captures `creation-personnelle.png` / `sans-session.png`. Ce ne sont pas des parcours utilisateur authentifiés.
- **Données anciennes relues** : quatre demandes TEST, deux décisions et deux objets Storage présents; aucune ligne `ent_company_documents` associée à ces objets lors de cette lecture. Aucun fichier privé ouvert ni suppression. Le défaut de cache et sa correction déjà déployée sont documentés, pas rejoués.
- **Bloqués précisément** : invitation capturée avec propriétaire connecté, activation compte chauffeur confirmé, destination fictive approuvée puis affectation, acceptation/démarrage/positions/clôture/isolation/révocation même session. Compte chauffeur inexistant et session actuelle signed_out. Première connexion utile : `test-a-proprietaire@test.invalid` à `/login` dans l'aperçu. Création personnelle sur le document invitation; incompatibilité à résoudre honnêtement entre capture réservée `.invalid` et confirmation par boîte normale, sans confirmation forcée.
- **Protections** : 0 mission, 0 réservation, 0 invitation pour le nouveau profil; `exec02_dispatch(jsonb)` et les quatre auxiliaires financiers fermés à authenticated. 0231/0232/0233 conservés, aucun déploiement/migration/publication/courriel/SMS.
- **Bilan détaillé et identification consultables dans le projet, non publics** : [Clôture de préparation chauffeur](r4k-preuves/CLOTURE-CHAUFFEUR.md). Préparation indépendante close; validation R4K chauffeur non close. SEO, abonnement et campagnes hors verdict.
