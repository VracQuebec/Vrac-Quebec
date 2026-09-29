# Centre de contrôle des demandes — Phase 1 (interface sur données existantes)

## Constat de l'audit
- Demandes existantes : dompes/remblai (`submissions`, statuts CRM : nouveau, message texte envoyé, soumission envoyée, soumission acceptée, en attente de livraison, paiement effectué, perdu, archivé), transport (`transport_requests`), soumissions place de marché (`mkt_quote_requests`). Aucune seconde base ne sera créée.
- Avis internes : `crm_notifications` (déjà alimentée par déclencheurs, anti-doublon par `dedupe_key`, statuts non lu / lu / en cours / terminé / archivé) + cloche existante + délais réglables dans `crm_notification_settings.delays`.
- Rappels : `submissions.next_follow_up_at` et avis « relance » déjà produits par la surveillance planifiée.
- Notes internes : `lead_notes`. Historique : `crm_audit_log`.
- Écrans voisins conservés tels quels : Centre des opérations (livraisons), Notifications admin, Surveillance.

## Ce qui est livré dans cette phase (sans nouvelle table)
1. Nouvelle page admin « Centre de contrôle » (`/admin/centre-controle`), réservée aux administrateurs, ajoutée au menu admin et à la navigation mobile. Page d'accueil de l'admin : proposée comme option, pas imposée.
2. En-tête : état des avis calculé réellement (dernier avis reçu vs dernière demande reçue, erreurs de l'envoi push, connexion temps réel) → « Fonctionnel » seulement si vérifié, sinon « Vérification requise », « Erreur de notification » ou « Synchronisation en retard »; dernière synchro, dernière demande reçue, alertes non résolues.
3. Quatre cartes cliquables (Nouvelles, Urgentes, Suivis requis, Traitées aujourd'hui) calculées sur les vraies demandes.
4. Zone « Action immédiate requise » ordonnée selon la consigne, cartes avec numéro, type, entrepreneur, municipalité, réception, temps écoulé, statut, priorité, dernière action; boutons « Consulter » et « Prendre en charge » distincts.
5. Liste centrale avec les 9 filtres (correspondance vers les statuts existants, aucun statut inventé) et recherche numéro / entrepreneur / service / municipalité. Cartes empilées sur mobile, aucun tableau horizontal.
6. Fiche rapide en panneau latéral : identification, détails du formulaire, suivi, historique, notes internes, rappel (via `next_follow_up_at`), lien vers la fiche complète existante.
7. « Rappels à venir » à partir des relances existantes.
8. Priorités : rouge urgent, orange attention, jaune suivi, vert traité; délais lus dans les réglages existants.
9. Temps réel + actualisation périodique; états vides et erreurs clairs.

## Dépendance à valider avant de la construire
Les notions « consultée », « prise en charge », « responsable » et « date de prise en charge » n'existent pas sur les demandes. Deux options :
- A (recommandée) : petite table séparée de suivi (une ligne par demande, admin seulement, journalisée), sans toucher aux demandes historiques.
- B : ne rien ajouter; « consultée » et « prise en charge » s'appuient sur l'état de l'avis lié (lu / en cours). Moins précis (pas de responsable nommé).
En phase 1, j'applique B pour livrer l'écran sans nouvelle infrastructure; A sera proposée ensuite si vous la validez.

## Validation
Essais dans le navigateur avec comptes fictifs uniquement : accès admin, refus pour un entrepreneur, compteurs comparés à des requêtes directes, ordinateur et téléphone. Aucune demande réelle modifiée (lecture seule sauf avis), aucun courriel. Rapport final : créé / réutilisé / testé / non testé.
