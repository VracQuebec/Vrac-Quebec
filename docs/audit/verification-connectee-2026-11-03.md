# Vérification des espaces connectés — 3 novembre 2026 (liste cumulative)

Comptes fictifs : test-superadmin@test.invalid (ee8fdaca-b1b8-4809-be7f-e49685a9e09f), test-a-proprietaire@test.invalid (83384382-0409-4fa8-9e93-5fdf5f6697f0).
Environnement : aperçu local (même serveur que la production), navigateur automatisé 1280×1800.

## Testé
- Admin : 29 sections ouvertes sans erreur (CRM, répertoire, flotte, agenda, tâches, punch, finances, soumissions, place de marché ×4, Groupes Facebook, notifications, paramètres, témoins, accès dompes, services, offres, centre de contrôle, missions, catalogue, coupons, liste noire, calendrier, logbook, opérations, conversations, plateforme).
- Entrepreneur : 24 sections ouvertes sans erreur.
- Tâche fictive TEST-a8a0e76e (d96626b2-7e10-4bbf-a225-e664111feee6) : création (double Entrée → 1 ligne), rechargement, recherche, coche terminée persistée (fait, done_at).
- Cloisonnement serveur (jeton entrepreneur A) : clients, soumissions, factures, tâches limités à son entreprise; 0 ligne lue pour demandes CRM, notifications admin, Groupes Facebook, consentements.
- Place de marché : correction notifications installée (4 fonctions); 0 invitation/offre/attribution/automatisation → aucun dossier partiel ni doublon.
- Sécurité : analyse relancée, 11 constats tous déjà écartés par vous, 0 critique.

## Anomalies corrigées
1. Boucle infinie : entrepreneur ouvrant une page admin refusée → connexion → retour à la page admin → … Corrigé (src/pages/Login.tsx + allowedReturnPath, test ajouté).
2. Formulaire public de transport : appels refusés (401) aux tarifs protégés pour les visiteurs. Supprimés pour les visiteurs; tarifs toujours protégés.

## Reste à faire (reprendre ici)
- Rôles employé, chauffeur, gestionnaire : aucun compte fictif avec rôle attribué (r4k-chauffeur et test-a-operateur sans rôle) — approbation de connexion à demander par compte.
- Place de marché de bout en bout depuis l'interface : aucun partenaire fictif.
- Inscription / mot de passe : envoie de vrais courriels d'authentification; paiements : aucun environnement d'essai isolé confirmé.
- Actions d'écriture des autres modules (flotte, finances, factures, agenda, punch, Groupes Facebook).

## Reprise du 3 novembre (après-midi) — actions réelles

Comptes fictifs utilisés (existants, aucun droit modifié, aucun compte réel touché) :
- test-entrepreneur-1778281900@vracquebec.test (c3a361a5-9b20-44fb-a3d0-01e14fc0693f) : gestionnaire TEST B, lecture TEST A.
- test-a-operateur@test.invalid (a05e7e5f-f7c4-4fd0-9cdb-da27bf0f40c4) : employé opérateur TEST A.

### Actions exécutées et résultats
- Site publié, gestionnaire : /admin → /entrepreneur (3 navigations, pas de boucle, aucun accès admin).
- Rôles (serveur, jeton réel) : gestionnaire B crée tâche/client/camion dans B (201); refusé dans A (lecture) et C (non membre, 0 ligne lue). Opérateur A : création tâche/client/camion refusée, 0 client/facture lus, modification d'une tâche d'autrui sans effet (titre inchangé), ne voit que ses tâches.
- Interface vracquebec.ca : en lecture (A), aucun champ d'ajout; en B, champ présent, tâche fictive visible. Double clic « Cocher » → statut « fait », done_at/done_by = gestionnaire, 2 lignes d'historique; entreprise active conservée après rechargement.
- Flotte : entretien fictif 206c6f66-f88e-4fdd-af84-2d68d4700a16 sur camion fictif B (201).
- Punch (gestionnaire B) : entrée, double entrée (même quart, pas de doublon), pause, reprise, sortie → quart 3 min 17 s, pause 1 min 05; relevé pun_summary : travail 3, pause 1, net 2 min, en attente d'approbation. Entrée dans A (lecture) refusée. Opérateur A : entrée/sortie réussies.
- Groupes Facebook / place de marché : 0 ligne lue par le gestionnaire; table des partenaires refusée.

### Anomalies
- Aucune anomalie bloquante. Mineur, non corrigé : « sortie » sans quart ouvert répond sans erreur (rien n'est créé; le bouton n'apparaît pas dans l'interface).
- Aucune correction de code → aucune publication dans cette reprise.

### Données fictives créées (étiquette TEST-01af9229)
- Tâche 58383f11-7007-4516-9a9e-81e8c28de1f9, client fac2b05f-26c3-4d24-80b8-a65c2b175bde (client@test.invalid), camion 87740be5-08be-4dd7-8900-01d20de967dd, entretien 206c6f66-…, quart 3c9bf453-c297-4488-8136-92ff768c394e + pause 09b00e22-… (TEST B); quart 46a0bac9-4f7e-4318-8ba8-51d95a5ee932 (TEST A, opérateur).

### Restent bloqués
- Chauffeur : seul compte fictif (r4k) désactivé dans TEST A; le réactiver changerait une exception validée → non fait.
- Place de marché de bout en bout : aucun partenaire fictif; en créer un = nouvelle fiche partenaire, à autoriser.
- Inscription, mot de passe, paiements : aucun environnement isolé (courriels réels / paiements réels).
- Non encore exécutés : ronde de sécurité, réparation, inspection, agenda (assignation), factures/conversion, finances, Groupes Facebook (rotation), exports CRM.

## Reprise du 3 novembre (fin d'après-midi) — parcours restants

Comptes fictifs : test-superadmin@test.invalid (admin), gestionnaire B c3a361a5-…, opérateur A a05e7e5f-…. Aucun compte réel ni règle de permission modifié.

### Résultats
- Place de marché : partenaire fictif fc990320-1243-4d25-9323-226cd654522f (TEST B, partenaire@test.invalid); demande VQ-2026-00011 (5e4e51b0-0daf-4698-924b-9183cc8359c2) arrivée au CRM (submission 46bd6fe0-…); offre b296f0e3-… ; attribution 30f12d0b-… (double appel = même attribution); automatisations 0 action; statut « en_cours » relu. Courriel partenaire supprimé (adresse d'essai). Invitation : 0 partenaire correspondant (fiche non qualifiée) → aucune invitation créée.
- ANOMALIE (non corrigée, décision requise) : un membre partenaire peut déposer une offre sur une demande sans invitation s'il connaît son identifiant (règle mkt_bids_partner).
- Agenda : événement 58dabd5a-0208-4733-a519-951d54a19ced créé, modifié, statut confirme→termine relu; participant hors entreprise refusé; opérateur A : 0 lu, modification sans effet; création dans A (lecture) refusée.
- Groupes Facebook : groupe occupé par un autre super admin → « ok:false, heldBy »; libération par un autre sans effet; gestionnaire refusé; journal lisible.
- Soumission → facture : soumission 0a0b2906-…, 250 $ → TPS 12,50, TVQ 24,94, total 287,44 (exact); acceptation documentée ×2 idempotente; facture b6e81213-… F-00001 (×2 = même), émission ×2 « already »; encaissement 100 $ ×2 rejoué une fois, solde 187,44; trop-perçu 100 000 $ accepté en « non affecté » puis annulé (f2642e29-…). Profil fiscal fictif TEST B complété (numéros TEST). Remarque : facture fictive is_test=false.
- Ronde de sécurité : rapports 87af2c1c-… (v1 remplacée par 5a0e5f47-… v2), 26fa70ed-…; défauts 4dae9636-…, 7008ebee-…; réparation flotte terminée; double soumission = même rapport.
- ANOMALIE CORRIGÉE (serveur, migration 0261) : fleet_can_manage / fleet_can_administer renvoyaient « inconnu » au lieu de « non » pour une personne sans rôle → un employé d'une autre entreprise a pu marquer réparé le défaut fictif 4dae9636 (seul cas en base). Après correction : refus « Accès refusé », notes vides refusées.
- CRM admin (vracquebec.ca) : accès admin OK; recherche « test.invalid »; export CSV administrateur = 48 lignes = 48 en base; statut fictif 483d4b78 changé puis restauré; opérateur : modification sans effet.
- Rôles (vracquebec.ca) : gestionnaire /admin → /entrepreneur (3 navigations, sans boucle), /admin/temoins → /entrepreneur.
- Punch : approbation par gestionnaire (opérateur refusé), relevé approuvé 2 min. Calcul : quart 196,57 s − pause 65,47 s = 131,09 s = 2,18 min → arrondi à la minute dans pun_summary (round); durées enregistrées exactes à la microseconde.
- ANOMALIE CORRIGÉE (écran) : « Puncher la sortie » depuis un écran périmé affichait « Sortie enregistrée » alors que rien n'était fait (pun_out renvoie vide). L'écran affiche maintenant un refus et s'actualise.

### Bloqués
- Chauffeur actif : créer un compte de connexion exige l'envoi d'une invitation par courriel; non fait.
- Inscription / mot de passe : boîte de réception contrôlée requise. Paiements : aucun mode d'essai isolé.
- Téléphones physiques et application installée : non vérifiés.

## Reprise du 3 novembre (soir)

### Place de marché — offre sans invitation (CORRIGÉ serveur, migration 0262)
- Règle existante : un partenaire ne voit une demande que par une invitation (mkt_can_see_request); modes « auto » et « manuel » passent tous deux par des invitations — aucune demande ouverte à tous.
- Correction : mkt_can_bid(demande, entreprise) exige une invitation envoyée/vue/intéressée/soumise; le partenaire ne peut écrire qu'en brouillon/envoyée (plus d'auto-sélection « retenue »); l'admin garde l'écriture complète.
- Essais (API réelle, comptes fictifs) : visiteur 401; TEST C pour B 403; TEST C pour C 403; TEST B sans invitation 403; TEST C lit 0 demande. Invitation fictive bbc65dd4-40b9-4d7c-a8b1-62fe963b0c6f → TEST B dépose 0e0cee8e-ba92-4cd6-9e56-6eff37684bd9 (201); auto-« retenue » 403; TEST C modifie l'offre de B : 0 ligne.
- Offre refusée (non_retenue) : attributions 1→1, notifications 5→5; réouverture par B : 0 ligne.

### Données fictives
- F-00001 b6e81213-a04b-4e4e-a4b4-7d9407f57b0a = « TEST — Entreprise B » (54a6c2c3-…). Marquage is_test refusé par la garde d'immuabilité des factures émises (« note de crédit requise ») — non contourné. Identification par entreprise TEST. L'autre F-00001 (e4bde962-…, TEST A) est déjà is_test.
- Numéros TPS/TVQ « TEST… » présents uniquement dans TEST B (0 ailleurs); taxes désactivées.

### Trop-perçu
- Encaissements : 100 $ actif (b2786aa0-…) + 100 000 $ annulé (f2642e29-…, motif conservé). Reçu 100 / total 287,44 → solde 187,44 : l'annulé n'est ni compté ni doublé.
- Comportement actuel : un encaissement supérieur au solde est accepté et rattaché à la facture (pas de crédit client distinct). Bloquer ou convertir en crédit = décision commerciale, pas un défaut technique.

### Vérifications sur vracquebec.ca (soir)
- Admin fictif : /admin ouvert, liste des demandes affichée.
- Punch écran périmé (opérateur A, TEST A) : entrée par l'écran, sortie faite dans un « autre onglet » (quart fictif 60f6786e-4ef6-4e2c-bd53-ff6696d07504), puis clic sur l'écran périmé → « Action refusée — Aucun quart ouvert », aucun faux succès, aucune écriture.
- Réparation 7008ebee : opérateur A et propriétaire C refusés (« Accès refusé ») pour l'inscription et la validation; visiteur 401; défaut inchangé.
- Publication relancée : même version de l'écran (aucun changement d'écran en attente); correction des offres active côté serveur.

### Toujours non testés depuis les écrans
- Ronde/réparation, agenda, soumission→facture, encaissement, rotation Facebook, place de marché (tests faits côté serveur seulement).
- Chauffeur : aucun compte actif connectable (invitation par courriel requise).

## Reprise du 3 novembre (20 h UTC) — six parcours depuis l'interface (vracquebec.ca)
- Ronde (TEST B, propriétaire) : bouton désactivé tant que déclaration/signature/lieu manquent (validation OK); 2 exécutions → rapports 522814f0-…, 1330aee6-… (1 par double clic), historique relu après rechargement.
- Agenda : événement e97fb6ae-4484-45e8-bf85-2a2dfbdd5981 créé (double clic = 1), responsable test-multi-gest…, modifié, « Terminé », 2 entrées de journal, relu après rechargement.
- Soumission→facture : TEST-AUD-Q1 (1aeac5a3-…) ; remise bloquée « taxes à déterminer » (validation OK), puis remise, acceptation documentée (double clic), « Créer la facture » double clic = 1 facture c2cddd0d-9e4f-4881-aa55-817d3baa30c3 F-00002 marquée « Exemple fictif » avant émission (is_test = true).
- Encaissement : 100 $ double clic = 1 saisie; reste 200,00 $ relu après rechargement.
- Groupes Facebook (admin fictif) : DÉFAUT CORRIGÉ — double clic « Créer » créait 2 campagnes (735d3841-… et 0dc2e627-…, renommée « doublon double clic »); verrou ajouté. Sélection de 2 groupes, prise en charge double clic = 1 attribution, relue après rechargement, libération; journal : attribution + attribution_retiree. Aucune publication enregistrée ni post.
- Place de marché : DÉFAUT CORRIGÉ (migration 0263) — l'espace partenaire n'affichait aucune occasion (vue partenaire vidée par la RLS des demandes). Après correction : B voit 1 demande, C 0, visiteur 401. Demande fictive VQ-2026-00012 (cf09960f-3406-4ae7-8a2c-e7828d221b46); service « Transport de terre » ajouté au profil B depuis l'écran; invitation depuis le jumelage (32502312-…); offre 777 $ double clic = 1 (45fb8ae4-…); client fictif test-c-paysager « Retenir » double clic = 1 attribution, statut « attribution à confirmer »; partenaire « Gagnées 1 ».
- Remarque : pas d'écran admin pour attribuer; l'attribution passe par le client.

## Chauffeur
- 9d1b59b7-b36f-44c8-a7f5-1b5669ac2407 (TEST A) = fiche chauffeur seulement, sans utilisateur.
- r4k-chauffeur@test.invalid = utilisateur, rôle chauffeur inactif, jamais connecté. Rôle non validé.

## F-00001
- b6e81213-a04b-4e4e-a4b4-7d9407f57b0a, « TEST — Entreprise B » (54a6c2c3-…), is_test=false (verrou respecté). Les statistiques et exports qui l'additionnent sont tous limités à une entreprise : aucune contamination des activités réelles constatée. Elle apparaît seulement dans les totaux de TEST B.

## Trop-perçu (décision ouverte)
- Actuel : un encaissement plus élevé que le reste est accepté sur la facture et affiché « trop-perçu non affecté », sans remboursement automatique. Le reste ne descend pas sous 0. Une saisie annulée sort des totaux et reste barrée dans l'historique.
- Choix : (a) refuser tout dépassement du reste ; (b) gérer un crédit client réutilisable.
- Publié (nouvelle version servie) : double clic « Créer » campagne « TEST-AUD campagne UI verrou » → 1 seule campagne (vérifié sur vracquebec.ca).

## Boîte d'essai proposée (3 nov. 2026) — conflit
- kassandrapaquette@hotmail.com correspond déjà à un compte réel : créé le 2026-05-08, courriel confirmé, rôle entrepreneur actif, membre d'une entreprise, dernière connexion le 2026-10-28, 5 demandes réelles.
- Rien n'a été modifié ni envoyé (aucune invitation, aucune inscription, aucune réinitialisation). Il faut une adresse distincte, sans compte existant.
- Variantes kassandrapaquette+chauffeur@ et +inscription@hotmail.com : aucun compte, aucune invitation, aucune suppression; distinctes du compte principal (non modifié).
- Invitation chauffeur existante = lien préparé à l'écran (pun_invite_prepare), aucun courriel envoyé par ce mécanisme.
- Courriels déclenchés : 0 (maintenance du serveur Lovable Cloud en cours, 3 nov. 21 h UTC). Reçus : 0. Activations : 0.
- 21 h 06 UTC : status.lovable.dev = « Lovable backend maintenance » en cours; vérification directe du serveur du projet : connexions et base joignables; domaine notify.vracquebec.ca vérifié, file d'envoi saine.
- Avant essai : 0 compte et 0 courriel pour kassandrapaquette+*. Inscription existante (/entrepreneur/inscription) : compte créé et confirmé côté serveur, sans courriel ni approbation; mot de passe choisi par la personne dans le formulaire → étape laissée à l'utilisatrice. Tentatives : 0.

## Reprise 3 nov. 21 h 20 UTC — inscription et mot de passe (vracquebec.ca)
- Inscription /entrepreneur/inscription, kassandrapaquette+inscription@hotmail.com (b6518205-55d9-4c3d-84ec-7a64e9942a05), double clic « Créer mon compte » → 1 seul compte, courriel confirmé côté serveur, rôle entrepreneur actif sans approbation, arrivée sur /entrepreneur, session conservée après rechargement, /admin refusé (renvoi /entrepreneur). RÉUSSI. Aucun courriel envoyé par l'inscription.
- Mot de passe oublié (/login → /mot-de-passe-oublie), double clic : message neutre affiché; envoi enregistré par le service de connexion (recovery_sent_at 21:21:46). Courriel déclenché : 1. Réception / changement de mot de passe : à confirmer par l'utilisatrice.
- Compte principal kassandrapaquette@hotmail.com inchangé (créé 2026-05-08, entrepreneur).
- Chauffeur +chauffeur : non lancé — le lien d'invitation (Punch > Accès employés > Préparer une invitation, TEST A) puis la confirmation du courriel de création exigent l'ouverture du courriel par l'utilisatrice.

## 3 nov. 21 h 35 UTC
- /soumission : le récapitulatif affiche « N voyages (≈ X tonnes) » quand le mode voyages est choisi; calculs, capacités et tarifs inchangés. Publié : le fichier servi (Soumission-jypfBB5P.js) contient le nouvel affichage. Parcours complet à l'écran non rejoué.
- Invitation chauffeur : non préparée. Sur le site publié, « Accès employés » est volontairement inactif (extension punch désactivée; invitations chauffeur réservées à l'aperçu de développement, sans envoi réel). L'activer = mise en service d'un module préparé, hors autorisation.
- Mot de passe : envoi annoncé + enregistré (21:21:46); réception, réinitialisation et reconnexion NON confirmées.
- Paiements : Stripe via les paiements intégrés; aucun jeton public configuré (pk_test_ / pk_live_ absent) → aucun paiement possible, ni test ni réel.
