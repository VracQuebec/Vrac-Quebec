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
