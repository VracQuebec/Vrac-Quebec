- [x] Auditer les parcours et données existants pour la refonte centrée chantier.
- [x] Recentrer Accueil, dossiers chantier, Demandes et Transports.
- [x] Contextualiser Dompes et Comparateur sans toucher au moteur.
- [x] Réorganiser Mon entreprise et fiabiliser les liens de notifications.
- [x] Vérifier les parcours, la confidentialité et les formats mobile/iPad/ordinateur.

## CATALOGUE-03 (reprise)
- [x] Lot C : variante A→B, réponse tardive de A ignorée, variante sans tarif = « Sur demande » (navigateur mobile + ordinateur).
- [ ] Lot C : vérification avec deux vrais tarifs de test en base (réponse serveur réelle).
- [ ] Lot A : offres, fournisseurs, filtres de carte, interpréteur, matching → catalogue central.
- [ ] Lot B : Remblai — sélecteur central principal, raccourcis, moteur actif; parcours matériau hors grille.
- [ ] Lot D : démonstration isolée avec messagerie capturée.
- [ ] Lot E/F : sources Warwick/Bauval/Pomerleau/Savaria, régions, réconciliation 45→82, fichier de prix.
- [ ] Lot G : tableau final par lot + matrice des modules.

## CRM-ENT-01 (en cours — CATALOGUE-03 en pause)
- [x] Fondations : tables ent_crm_*, droits par rôle côté base, cohérence entreprise, historique avec origine assistance.
- [x] Page « Mon CRM » : aujourd'hui, leads (liste/Kanban, filtres, pagination, import/export CSV, doublons), clients/contacts, soumissions (versions, PDF, acceptation documentée, chantier unique), chantiers, tâches, rapports, historique.
- [x] Bouton admin « Ouvrir le CRM de cette entreprise » + bandeau Assistance.
- [ ] Tests d'isolation avec vraies sessions (2 entreprises, employé limité, membre révoqué).
- [ ] Rôle « lecture seule », gestion des membres, étapes personnalisables, vues enregistrées.
- [ ] Documents/photos privés par entreprise; suivi des demandes réseau; prestations/tarifs privés.
- [ ] Vérification mobile/ordinateur.

## CRM-ENT-02 — état
- [x] Accès des membres d'entreprise à Mon CRM, contrôles de droits serveur sans faille (0048)
- [x] Isolation A/B, lecture seule, employé, révoqué, journal confidentiel : vérifiés en sessions réelles
- [x] Parcours complet A (ordinateur) et B (mobile 390) vérifié
- [ ] Import CSV : test navigateur à faire
- [ ] Session super admin distincte à préparer pour revérifier le bandeau
- [ ] Changement d'entreprise A↔B (compte double) dans le navigateur
- [ ] Lien client CRM ↔ clients Transport JSC (référence) à raccorder
- [ ] Hors livraison : documents/photos privés, prestations/tarifs/modèles, suivi réseau Vrac

## CRM-ENT-02B (prévisualisation)
- [x] A super admin fictif distinct (consultation sans trace, corrections journalisées, retrait vérifié)
- [x] B changement d'entreprise A/B (brouillon protégé, droits recalculés)
- [x] C import CSV navigateur (aperçu, erreurs, doublons, entreprise imposée ignorée)
- [x] D lien clients Transport JSC (jsc_client_id, rattachement explicite)
- [ ] CRM-ENT-03 : documents/photos privés, prestations/tarifs, modèles métier, suivi demandes réseau
- [ ] Décision de rattachement des 23 clients JSC réels (tous sur une seule entreprise) : à valider par Vrac Québec

## CRM-ENT-03 (prévisualisation)
- [x] Vue enregistrée : bouton masqué en lecture seule + contrôle serveur ; mise à jour d'une vue
- [x] Documents privés multi-dossiers (migration 0050, stockage entcrm-files)
- [x] Prestations/tarifs privés, coût interne réservé ; modèles métier ; soumission à valeurs figées + actualisation explicite
- [x] « Ajouter à mon CRM » sans doublon ; statut source / accès retiré
- [x] Aperçu super admin du rattachement JSC (lecture seule)
- [ ] Parcours A/B/C en navigateur avec sessions fictives (390 px + ordinateur), étape personnalisée, isolation A/B des réglages — sessions à re-générer

## CRM-FINAL (en cours)
- [x] Relevé de départ : 1542 vérifications automatiques réussies; Mon CRM + Mon abonnement (compte fictif A) affichés sans erreur, ordinateur et mobile 390.
- [x] Fichiers (28/09) : envoi multiple, HEIC réel, limite 20 Mo serveur, reprise, téléchargement, liens multiples, retrait ≠ suppression, refus A/B — 25/25.
- [x] Lien client : bonne version seule, pièces cochées seules, révocation (bouton « Retirer le lien » ajouté) — pas d'expiration par date (valide jusqu'au retrait).
- [x] Rôles (28/09) : coûts internes, opérateur terrain, lecture seule, multi-entreprises, réglages isolés — 13/13.
- [ ] Décision : l'abonnement ne conditionne pas encore l'accès au CRM (aucun contrôle de capacité branché) — à trancher avant d'appliquer, risque pour les entreprises réelles sans abonnement.
- [ ] Autre métier sur téléphone, super admin (notre CRM + assistance), inscription nouvelle entreprise, clôture chantier mobile, import/export, retrait réseau, propagation JSC fictive.
- [x] Soumission : taxes par entreprise figées à la remise, lien client, pièce téléchargeable, réponse client fictif, v2 révision, chantier — preuve navigateur (E2E 29209).
- [ ] Super admin fictif : dossiers propres, supervision, assistance.
- [ ] Cycle mensuel en mode test (renouvellement, échec, régularisation, annulation, factures).
- [ ] Bloqué : prix réel d'Entrepreneur Pro (à définir par Vrac Québec).
- [ ] Bloqué : compte de paiement réel non connecté (Stripe à réclamer et activer).
- [ ] Bloqué : publication — autorisation explicite requise.

## NAV-01 / NAV-01B — navigation fiable et brouillons
- [x] J1 Sauvegarde au compte : table user_drafts + RPC draft_save/close/reopen (version, conflit P0409, refus tardif P0410), sync dans useDraft
- [x] J1 Effacement : achat en vrac et obligation effacés seulement après réponse confirmée (vérifié dans le code)
- [x] J2 « Reprendre mon travail » (/entrepreneur/brouillons) + reprise dans un contexte indépendant, abandon ailleurs bloque l'écriture tardive
- [x] Assistants publics (P01-P03), retour après reconnexion (D partiel), déconnexion (E)
- [x] J1 Verrou double clic / répétition après confirmation (achat en vrac)
- [x] J3 Finances : Ajouter une obligation (tous champs), Modifier une obligation (protection « modifiée ailleurs »), préparation de règlement, paramètres (catégories) — vérifiés à l'écran
- [ ] J3 Finances restant : fenêtre d'échéance (montant/déplacer/annuler/suspendre/archiver), fiche de règlement (corrections), changement de règle
- [ ] J3 CRM entrepreneur, flotte, éditeur d'articles, admin, autres routes
- [ ] J3 Listes/cartes : recherche, filtres, défilement après fiche
- [x] J4 Isolation serveur entre 2 comptes fictifs d'entreprises différentes; vrai conflit A/B résolu et persistant; saisie gardée après abandon ailleurs
- [x] Copie de récupération après abandon ailleurs + reprise sous un NOUVEL identifiant (essai 3 navigateurs, écriture tardive refusée P0410, blocage si stockage indisponible)
- [ ] J4 Même entreprise (2 utilisateurs), utilisateur à 2 entreprises, droit retiré
- [ ] J4 A, B, C, F, notification admin, connexion par l'interface
- [ ] Fiche d'essai sur téléphone réel

## NAV-01B — suite (30 sept.)
- [x] Fenêtre d'échéance : préparation (montant, date planifiée, annulation, archivage, suspension, levée) en brouillon par compte+entreprise+échéance; reprise ?brouillon=echeance; dates passées signalées, jamais remplacées
- [x] Changement de règle : brouillon séparé (obligation-regle), date d'effet conservée
- [ ] Essais navigateur restants : montant, déplacement, archivage, suspension, changement de règle, reprise depuis le menu
- [ ] Correction d'un règlement (Settlements), pièces jointes réelles, doubles envois confirmés au serveur
- [ ] Recherches/filtres/position Finances puis CRM, flotte, articles, administration
- [ ] Session/droits (lente, renouvellement, coupure, changement de compte, 2 utilisateurs, 2 entreprises, accès retiré); fiche téléphone
