# EXEC-06 — accès employés et punch opérationnel

19 octobre 2026. **GO limité à une validation d’intégration dans un Cloud isolé autorisé; NO-GO production.** Le lot est développé et testé partiellement en local, pas activé sur le site partagé. Aucun envoi, invitation externe, migration Cloud, publication, paiement ou transmission de paie.

## Accès et chemins
- Employé et employeur : `/entrepreneur/punch`, écran `PunchBoard` existant; contexte d’entreprise explicite, navigation employé réduite à Mes heures / Quitter pour les rôles non gestionnaires. Entrée entrepreneur déjà présente dans Planification → Punch et heures.
- Employeur : Accès employés, Équipe, Feuilles de temps, historique d’exports; contrôle réel par RPC/RLS, pas par sélection de rôle dans le navigateur.
- Invitation : `/entrepreneur/punch#invitation=…`, fragment séparé des montages d’analytique/notifications; le bouton réel reste désactivé tant que les sources préparées ne sont pas validées et autorisées. Le lien est préparé et copiable; **aucun courrier d’invitation n’est raccordé ou envoyé**.
- Test uniquement sur localhost : `/entrepreneur/punch?punch_test=local`, harnais 127.0.0.1:55446. Sélecteur d’identité explicitement fictif; aucune équivalence avec un JWT hébergé. Le serveur local est arrêté après les preuves.

## Manques complétés dans le code
1. Préparation d’invitations par propriétaire, rôles terrain limités, empreinte SHA-256 du jeton, expiration 7 jours, activation par identité existante correspondant au courriel, reprise sans doublon, annulation. Un lien accepté ne rétablit jamais un membre révoqué. Les memberships `jsc_company_members` restent la source des accès, jamais le profil.
2. Gardes `pun_can_*` avant entrées/sorties/pauses/corrections et sur lectures; employé limité à ses propres heures. Client CRM étranger refusé lors de saisie manuelle. Résumé révoqué vide; lectures propres `pay_employees/pay_stubs` conditionnées à l’accès actif dans le SQL préparé. Navigation privée réduite; rôle recalculé au focus et toutes les 30 secondes.
3. RPC existantes conservées derrière gardes sérialisées. Double entrée/pause idempotente; oubli identifié via journal et demande idempotente; approbation rejouée ne rajoute pas d’événement identique. Chevauchement manuel interentreprises interdit et entrée simultanée dans une autre entreprise refusée par le code préparé.
4. Chantier/tâche existants sélectionnables sans exposer le CRM entier, tâche employé affectée seulement, validation société et chantier côté serveur. Activité libre conservée. Pas de seconde table de tâches.
5. Demande de correction employé avec motif, traitement employeur, nouvel enregistrement soumis + ancien archivé; avant/après/motif/auteur/date dans `pun_log`, rendu statut et motif de décision. Pauses reliées au pointage, reportées sans pause inventée lors de remplacement; correction incompatible avec les pauses constatées refusée. Journal rendu immuable.
6. Résumé canonical `pun_summary` découpé aux minuits Toronto, durée réelle des journées 23/25 heures; journée et semaine affichées séparément, pauses enregistrées seulement. Saisie locale Toronto indépendante du fuseau du téléphone; heure sautée ou ambiguë rejetée au lieu de choisir silencieusement un décalage.
7. Export CSV des **heures approuvées seulement**, identifiant et snapshot figés, rejeu même clé sans nouveau document; remplacement visible après correction. Une période de paie finalisée bloque le changement des heures, transaction annulée, traitement financier séparé requis. Aucune paie calculée en navigateur.
8. Projection des heures approuvées par chantier depuis les mêmes entrées/pauses. Coût monétaire NULL, aucun tarif choisi ni nouvelle imputation comptable. Cette projection ne remplace pas une chaîne d’imputation de coûts.
9. Limite hors connexion affichée clairement et actions désactivées. **Pas de queue hors connexion**, donc aucun événement déclaré « en attente » sans enregistrement. Récupération proposée via Oubli de punch après reconnexion. Géolocalisation ponctuelle opt-in uniquement, pas de suivi permanent.

## Vérifications réellement exécutées
Commande : `EXEC05_LOCAL_TEST=1 EXEC06_LOCAL_TEST=1 bunx vitest run src/test/exec06-integration.test.ts src/test/exec06-time.test.ts`.

**17 tests réussis : 12 SQL + 5 dates.** Le chargeur vérifie adresse 127.0.0.1, port 55439 et `data_directory` sous `/tmp/exec-correctifs/`; base vide unique créée depuis template0 puis supprimée. Auth/users est une fixture locale uniquement. Migrations CRM/finances originales utilisées pour relations et permissions; 0154 punch et 0155 paie chargées, puis SQL EXEC-06. Aucune base Cloud sollicitée.

| Test SQL | Résultat concret |
|---|---|
| Invitation personnelle | création répétée même ID, courriel erroné refusé, acceptation répétée même société, finance/commercial false, zéro client CRM visible |
| Refus permissions | autre entreprise, lecture seule au punch et invitation rôle comptabilité refusés |
| Pointage/pause | une seule entrée répétée, une pause réelle répétée, pause fermée avec liaison, géolocalisation false, contexte d’autrui refusé |
| Minuit | 23 h → 1 h = 60 minutes chaque journée |
| Toronto DST | printemps = 60 minutes; automne = 180 minutes |
| Chevauchement/client | saisie chevauchante et client d’entreprise étrangère refusés |
| Correction/export | original archivé, remplacement soumis, snapshot inchangé et stale=true, décision reprise même ID, un événement de correction |
| Paie finalisée | modification refusée, ancien statut conservé |
| Chantier | 120 minutes approuvées relues, montant NULL, projection interdite à employé |
| Oubli/reprise | même identifiant = même entrée; charge utile différente refusée |
| Approbation/reprise | un événement au journal après deux appels |
| Révocation | entrées/résumé et paramètres propres de paie inaccessibles, sortie/pause/lien repris refusés, archives conservées |

Tests dates : heure sautée au printemps refusée, heure ambiguë automne refusée, 07 h Toronto = 11 h UTC le 19 octobre, lundi calculé en Toronto lorsque UTC est déjà lundi, split minuit 60/60.

Navigateur : vraie UI partagée `PunchBoard` + `EmployeeAccess` sur le serveur local. Identité employée → activation invitation fictive → chantier/tâche → entrée/pause/reprise/sortie → oubli → employeur approuve → CSV snapshot → employée demande correction → employeur prépare un second lien sans envoi et accepte correction → ancien export signalé → révocation → accès employé refusé → autre entreprise refusée. Desktop 1280×1800 et mobile 390×844; mise hors connexion montre la limite. **0 erreur JS, 0 requête externe** lors du parcours final. Résultats dans `exec06-preuves/browser-result.log`. Aperçu : dernier contrôle `build OK`.

Captures :
- [Employée ordinateur](exec06-preuves/employee-desktop.png)
- [Export employeur ordinateur](exec06-preuves/employer-export-desktop.png)
- [Employée mobile](exec06-preuves/employee-mobile.png)
- [Invitation préparée mobile](exec06-preuves/employer-invitation-mobile.png)
- [Correction et export remplacé](exec06-preuves/correction-export-mobile.png)
- [Hors connexion](exec06-preuves/offline-mobile.png)
- [Révocation](exec06-preuves/revocation-mobile.png)
- [Refus autre entreprise](exec06-preuves/cross-company-mobile.png)

## Fichiers intégrés/modifiés
- `src/components/punch/PunchBoard.tsx` : écran existant enrichi.
- `src/components/punch/{EmployeeAccess,PunchLocalScreen,EmployeeInviteScreen}.tsx` : accès/invitation et entrée locale sans services réels.
- `src/lib/punch/runtime.ts` : client local isolé, verrou hosted=false, règles Toronto partagées.
- `src/pages/EntrepreneurPunch.tsx`, `src/components/entrepreneur-app/EntrepreneurAppShell.tsx` : navigation employé limitée.
- `src/components/todo/useCompanyRole.ts` : recalcul de droits sans réponse obsolète après changement de contexte.
- `src/App.tsx` : entrées locales et invitation séparées des montages globaux.
- `prepared/exec06/{schema.sql,local-db.ts,harness.ts}` : SQL **préparé seulement**, fixtures/serveur loopback.
- `src/test/exec06-{integration,time}.test.ts`, `docs/audit/exec06-bilan.md`, `docs/audit/exec06-preuves/`, `AGENTS.md`, `roadmap.md`, liste d’activation commune.

## Limites et dépendances précises
- **Cloud isolé autorisé nécessaire** pour inspecter les signatures et schéma réels actuels, ordre des migrations, index unique memberships, extension pay/punch, JWT, confirmation du courriel, RLS/grants/PostgREST, révocation multi-session et navigation directe. Aucun paramètre d’inscription/connexion hébergé vérifié; activation locale utilise une identité existante fictive, **pas la création et confirmation d’un nouveau compte hébergé**.
- SQL préparé dépend des objets CRM/Punch/Paie existants (notamment `pay_runs`, `ent_crm_projects`, `assignee_user_id`). Renommage des RPC en *_base doit être validé contre les dépendances hébergées et leur historique avant migration autorisée. Pas de copier/coller dans la production.
- Courrier d’invitation : raccordement à la file existante, capture, quota, confirmation d’identité et prévol réel à valider en isolé; aucun expéditeur/provider activé. Jeton de fragment non enregistré par l’analytique; parcours de connexion gardant l’invitation à finaliser avant activation.
- Hors connexion non implémenté, aucune synchronisation/déduplication d’événements hors ligne certifiée. Limite visible acceptée par le périmètre demandé.
- Coût monétaire chantier : pas d’imputation aux `trips.cost` ni à une paie finalisée sans règle validée d’affectation et de rapprochement. Heures liées disponibles; **export externe n’empêche pas techniquement un logiciel tiers de réimporter le même CSV**, identifiant/snapshot/alerte servent de preuve et de garde locale. Aucun second registre d’import ou coût créé.
- Horaires ambigus : saisie simple refuse 01 h 30 répété en automne; choix explicite d’offset dans un correctif serveur reste nécessaire pour ces rares corrections. Les pointages natifs timestamptz mesurent correctement les durées.
- Concurrence : sérialisation et idempotence testées séquentiellement, pas stress concurrent multi-processus. Résumé très long borné à 366 jours; politique d’heures supplémentaires/recalcul sur semaines partielles à revalider avec le module de paie existant avant transmission.
- Affichage des décisions disponible, mais aucune nouvelle interface exhaustive de consultation du journal ni export audit métier n’a été créée; preuves avant/après restent stockées dans le journal protégé.
- Aucun forfait ni tarif d’abonnement changé, aucun calcul/transfert de paie exécuté. La garde de période finalisée est volontairement conservative et peut bloquer des heures d’un autre employé dans la même période: résolution paie contrôlée requise.
- Toutes les dépendances EXEC-01 à EXEC-05, Google, stockage et communications demeurent dans la liste commune.

**Statut final : fonctions de source intégrées et 17 tests locaux réussis; invitation réelle, activation hébergée et imputation monétaire non livrées. GO pour validation isolée autorisée, NO-GO production.** Aucun lot suivant lancé.
