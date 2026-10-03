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
- [x] Échéance : seule l'action confirmée est close; autres préparations conservées et signalées; abandon global nommé explicitement (refus/acceptation vérifiés); double clic → 1 seul déplacement au serveur
- [ ] Inventaire préliminaire (17 fichiers sans brouillon) : CRM (EntrepreneurCrm, CrmServices), flotte (FleetDialogs, FleetDialogsV2, CompleteDialog, FleetManager), articles (à préciser), admin (ControlCenter, Marketplace ×4, Matching ×2, MaterialOffers, MaterialAssistant, MaterialLanguageLab)
- [x] Correction d'un règlement : brouillon par compte+entreprise+règlement, champs séparés par correction (annulation/remboursement/affectation, clé de réessai conservée), alerte si fiche changée, reprise ?brouillon=reglement-correction — essayé (actualisation, autre section+Retour, menu)
- Référence essais : échéance TEST FIN-03 C9 hebdo planifiée au 6 oct.; brouillon de correction du règlement TEST Fournisseur R laissé ouvert

## NAV-01B — état au 30 sept. 2026
- [x] CRM : fiche lead (création/modification) raccordée, ?lead= dans l'adresse, recherche clients ?cq= — essayé (Retour, actualisation, menu, double clic = 1 seul lead, 0 notification/courriel)
- [ ] CRM : fiche client (modification), soumissions, chantiers, tâches, Tarifs et modèles (CrmServices), pièces (CrmFiles); position de défilement
- [x] Finances essayés : montant, archivage, suspension, changement de règle, modification d'obligation (7 champs), changement de jour, pièce jointe, Entrée x3, réessai après réponse perdue (déplacement)
- [ ] Finances : levée de suspension (aucune suspension active), remboursement/affectation (reliquat manquant — accord requis), réessai incertain des autres actions
- [ ] Flotte : VehicleDialog, FleetDialogs(V2), CompleteDialog, FleetDocuments, FleetManager
- [ ] Articles : éditeur /admin/blogue/editer/:id (AdminBlogEditor), génération /admin/blogue/generer
- [ ] Administration : centre de contrôle, marché (transactions, commissions, lots, catégories, jumelage), SEO, territoires, CRM admin, plateforme, offres matériaux
- [ ] Session/droits, téléphone réel

- [x] CRM fiche client (création/modification) et ajout de contact : fenêtres avec brouillon, essayées (fermeture, section+Retour, actualisation, menu, double clic, Entrée x3)
- [ ] CRM : soumissions, chantiers, tâches, tarifs, pièces; « + Opportunité » (question native) sur la fiche client

## NAV-01B — état (reprise couverture)
- [x] Éditeur d'articles : nouvel article non enregistré → brouillon (actualisation, section+Retour, menu vérifiés; aucune création serveur). Articles existants : déjà enregistrés automatiquement au serveur.
- [x] Flotte : entretien, réparation, inspection, dépense, travaux vérifiés (champs texte/nombre; fermeture, actualisation, section+Retour, menu); fenêtre gardée dans l'adresse; brouillons rattachés à l'entreprise et au véhicule.
- [ ] Flotte : clôture — aucun entretien/réparation fictif existant (données d'essai manquantes); cases/signature de l'inspection non comparées; essais d'erreur non faits (tout enregistrement de flotte crée des alertes internes).
- [x] Articles (nouvel article) : contenu long, mot-clé IA, description d'image, SEO, options vérifiés.
- [ ] Articles existants : enregistrés automatiquement au serveur (3 s); non essayé (aucun article fictif au serveur).
- [x] Inspection : 8 choix + signature (nom tapé) vérifiés.
- [ ] CRM : projets (enregistrement au blur), vues enregistrées, motif de perte, équipe/statuts (questions natives restantes).
- [ ] Administration (hors articles) et autres écrans de l'inventaire : non raccordés.
- [ ] Listes/cartes : conservation recherche/filtres/tri/position non généralisée.
- Bloqués : levée de suspension (aucune suspension fictive active); remboursement/reliquat (accord requis pour un règlement fictif supplémentaire); conflit « fiche client modifiée ailleurs » non essayé.

## NAV-01B — reprise « écrans sans protection »
- [x] CRM : questions natives remplacées par des fenêtres avec brouillon — vue enregistrée, motif de perte, ajout de membre, nouvelle étape, renommer/retirer une étape; chantier (adresse, dates) en fenêtre; taxes des soumissions en brouillon
- [x] Essayé : nouvelle étape (actualisation, fermeture puis Retour, autre section puis Retour)
- [ ] Essayer les autres fenêtres CRM ci-dessus + reprise depuis le menu
- [ ] Administration, listes/cartes, article existant (autosave), session/droits, fiche appareils réels
- Bloqués : clôture flotte, reliquat/remboursement, levée de suspension (isolation des alertes non établie)
- [x] CRM : vue, motif de perte, membre, nouvelle étape, chantier, taxes — essayés (fermeture+Retour, actualisation, section+Retour, menu); serveur inchangé
- [ ] CRM : renommer/retirer une étape — données d'essai manquantes (aucune étape personnalisée dans TEST B)
- [x] Centre de contrôle : suivi (action, raison, note, résolution, responsable, date) et délais en brouillon; filtre dans l'adresse (remplacement), recherche+position en mémoire de session; fiche dans ?demande= — essayés; serveur inchangé
- [x] /admin : Retour n'est plus bloqué quand une page précédente interne existe
- [x] /admin : interception du Retour supprimée (Retour/Avancer natifs normaux, y compris page extérieure); Retour interne → accueil en accès direct
- [x] Centre de contrôle : responsable/date et délais essayés; tri/pagination non applicables (tri fixe, 100 premières)
- [x] Marché : règle tarifaire, prix, tarif, offre, catégories (ajout + modifications de lignes), note interne (demandes), lots — code; essayés : règle, prix, offre, nouvelle catégorie
- [ ] Marché : lots et note interne non essayés (aucune demande TEST); tarif et modifications de lignes de catégories non essayés
- [ ] Jumelage (réglages enregistrés immédiatement — inchangés; recherche non conservée), référencement, territoires, CRM admin, plateforme, offres de matériaux
- [ ] Listes Finances et flotte : contexte (recherche, filtres, tri, pagination, position), cartes
- [x] NAV-01B listes Finances/flotte : contexte commun (lib/navigation/listContext)
- [x] NAV-01B listes admin + carte CRM : contexte commun (useScreenContext); sélection carte non essayée
- [x] NAV-01B finale : article existant (copie de secours + conflit par updated_at, statut jamais repris), référencement (5 fiches), territoire, offre de matériau, forfait plateforme ; correctif reprise après abandon (clôture en file)
- [ ] NAV-01B réserves : session expirée/changement de compte/accès retiré non réessayés ce lot ; CRM admin sans formulaire propre (non applicable) ; fiche appareils réels à faire par l'utilisateur

## FIN-05 — Trésorerie, budgets et scénarios
- [x] Tables comptes/soldes/entrées attendues/transferts/budgets/réserves/scénarios (RLS fin_can_*, même entreprise par trigger)
- [x] Moteur pur treasury.ts (cents, solde inconnu ≠ 0, retard « À replanifier », transferts nuls, carte hors encaisse, réserves sans double déduction) + 7 essais
- [x] Onglet Trésorerie (prévision 13 sem./30-90 j/6-12 mois/perso, graphique, détail, CSV, comptes, entrées + brouillon, budgets, réserves, scénarios)
- [ ] Parcours navigateur mobile représentatif (non exécuté)

## FIN-05B
- [x] Compte prévu par échéance (« Non affecté » sinon), carte hors banque, prévision partielle signalée
- [x] Paiements nets = versements − remboursements (reliquat non affecté exclu, prorata), détail + export alignés
- [x] Lecture seule bloquée côté serveur (essai annulé ensuite)
- [ ] Parcours navigateur mobile : non exécuté (connexion d'essai non approuvée) — essai manuel fourni

## Volet « Coupons, services et relances » (à faire APRÈS les lots en cours — plan directeur § 19)
- [x] Accès regroupé aux six volets dans les espaces entrepreneur et super admin; actions de gestion réservées à l'équipe.
- [x] Regrouper les outils par catégorie dans chaque espace et retirer les doublons du menu super admin.
- [x] Lot 1 — Carnets de coupons triplicata numérotés (client dompe + entrepreneur), préparation d'envoi postal à l'inscription, renouvellements/pertes/expéditions (envoi réel par l'équipe ou un prestataire) — livré (CPN-01)
- [x] Lot 2 — Compteur numérique de voyages relié aux coupons (une seule activité, jamais de double compte; total quotidien conservé sans heures inventées)
- [x] Lot 3 — Services complémentaires (pépine avec opérateur, camions 10/12 roues, matériaux, préparation/finition) → demande CRM liée au chantier
- [x] Lot 4 — Analyses de sols (demande, soumission, rendez-vous, prélèvement, résultats), partenaire labo; aucun contaminé accepté
- [x] Lot 5 — Suivi chauffeurs par mission (activation explicite, arrêts horodatés = indices à confirmer); suivi écran verrouillé = application mobile native
- [x] Lot 6 — Relances commerciales (J0/J+3/J+10/J+21, mensuel client, 2 sem. entrepreneur, plafond 1 promo / 7 jours) — nécessite un service d'envoi marketing dédié

## Outils d'équipe (après CRM, facturation, comptabilité, dépenses)
- [x] Lot A — Liste de tâches (entrepreneur + super admin) : couleurs, priorités, cochable/décochable, liste de contrôle, attribution aux employés, liens client/chantier du CRM, droits par échelon
- [x] Lot B — Agenda complet (couleurs, attribution, transfert, invitations, rappels courriel/texto/application préparés sans envoi réel, lien CRM)
- [ ] Lot C — Punch (bureau/chantier, position au punch seulement avec consentement, pauses, corrections approuvées, heures supp., primes, coût par chantier, écriture comptable, retenues QC/fédérales + talons — taux à valider chaque année)
- [ ] Lot D — Assistant IA de la page d'accueil (guide clients/entrepreneurs vers les bonnes pages)
- [ ] Lot E — Prise de contrôle en direct de la conversation par un administrateur autorisé

## Optimisation (après les 5 chantiers)
- [x] Paie : cumuls annuels, montants personnels TD1/TP-1015.3, FSS, CNESST « à compléter », talon imprimable/PDF, refus des périodes qui chevauchent
- [x] Assistant : alerte dans la cloche quand un visiteur demande une personne (courriel/texto préparés, non envoyés)
- [x] Essais punch (manuel, correction, refus, lecture seule, position) et paie (droits) — faille corrigée : le rôle lecture pouvait calculer la paie
- [x] Agenda (réponse invité) et cloisonnement TEST B vérifiés
- [x] Paie → grand livre : paie finalisée comptabilisée une seule fois (salaires, charges employeur, retenues à remettre, nets à verser)
- [x] Paie : sommaires annuels T4/RL-1 (préparation, non transmis)
- [x] Vitesse : assistant et formulaire d’évacuation chargés à la demande sur l’accueil (autres pages déjà chargées à la demande)

## MIS DE CÔTÉ — À RAPPELER À L'UTILISATEUR (demande du 3 oct. 2026)
- [ ] Valider les taux de paie 2026 avec Revenu Québec et l'ARC (pay_rates validated=false)
- [ ] Connecter un service d'envoi marketing (Mailchimp ou autre) + case de consentement aux promotions dans les inscriptions
- [ ] Application mobile native pour le suivi des chauffeurs écran verrouillé
- [ ] Comparaison avec les compétiteurs sur les analyses de sols à vérifier avant toute publicité
- [ ] Décision : rattachement des 23 clients JSC réels; prix Entrepreneur Pro; compte Stripe réel; autorisation de publication

- [x] Ronde de sécurité (gestion de flotte) : référentiel, ronde téléphone, défauts, réparations, tableau de bord
- [x] Ronde : photo du défaut (stockage privé par entreprise) et cloisonnement TEST B vérifiés
- [x] Ronde : envoi automatique au retour du réseau (file sur l’appareil, sans doublon)
- [ ] Ronde : écran verrouillé / arrière-plan — nécessite app native; photo exige réseau

## Lot 2026-10-03 — paie, Mailchimp, app chauffeur, sols, décisions
- [ ] Paie 2026 : paramètres versionnés, moteur marginal fédéral/Québec, charges patronales, primes/corrections, cumuls repris, comparatif WebRAS/T4127
- [ ] Mailchimp + consentement promotions (preuve, double confirmation, désabonnement bidirectionnel)
- [ ] App chauffeur native (Capacitor, localisation arrière-plan, file hors réseau)
- [ ] Comparaison analyses de sols documentée (non confirmé, pas de pub)
- [ ] Décisions de lancement maintenues en attente (JSC réels, Pro, Stripe réel, publication)
