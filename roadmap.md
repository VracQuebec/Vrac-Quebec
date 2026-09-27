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
