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
