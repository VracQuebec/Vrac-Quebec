# Feuille de route — Vrac Québec

## En cours
- [x] Correction finale du layout CRM partagé — header, menu mobile, safe areas, Centre de notifications et validation 375→1920 px
- [x] Refonte produit de l'Espace entrepreneur — coquille d'application, tableau de bord, chantiers, dossier chantier, demandes, carte, comparateur, réseau, historique, mon entreprise migrés dans la nouvelle expérience
- [ ] Validation visuelle connectée de l'espace entrepreneur — bloquée : aucun compte entrepreneur de test disponible pour ouvrir une session

- [x] Optimisation responsive complète (site public, CRM, administration) — validée 320→1920 px, aucune action hors écran
  - [x] Audit automatisé des débordements horizontaux (site public : aucun débordement global)
  - [x] En-tête central responsive (Retour / Accueil / titre) + safe areas
  - [x] Onglets, tableaux, cartes, modales, boutons : règles centrales
  - [x] Tests multi-largeurs 375 → 1440 px (pages publiques)
  - [x] Validation visuelle des pages administration avec une session admin autorisée

## Fait
- [x] Moteur d'optimisation SEO en lot
  - [x] File d'attente persistée (en attente / en cours / optimisée / ignorée / erreur)
  - [x] « Optimiser la sélection » et « Optimiser en lot » en un seul clic
  - [x] Retry automatique borné, concurrence contrôlée, anti-doublons
  - [x] Reprise après interruption par le surveillant automatique (chaque minute)
  - [x] Une page en erreur ne bloque plus la file; le traitement se clôt tout seul
  - [x] Compteurs recalculés depuis l'état réel des pages
  - [x] Point d'entrée unique (l'ancien traitement séquentiel a été retiré)

## Contrôle qualité final (responsive + moteur SEO)
- [x] CRM : en-tête, onglets défilants, barre de filtres et bouton « Nouveau » adaptés au mobile
- [x] Centre d'optimisation SEO : barre d'outils et boutons « Optimiser » utilisables sur téléphone
- [x] Moteur SEO en lot vérifié (toutes les fonctions de file, contrôle, reprise et historique présentes)
- [x] Tests : 414 tests passés, compilation sans erreur, aucune barre de défilement horizontale à 375/430/768/1024/1440
- [x] Validation visuelle des pages d'administration connectées

## CRM-02 — Abonnement mensuel de test (terminé)
- Offre technique « TEST — Entrepreneur Pro » 10 $/mois, environnement de test uniquement.
- Page « Mon abonnement » (/entrepreneur/abonnement) : état, échéance, services, factures, portail, resynchronisation.
- Paiement initial vérifié en test : facture payée 10,00 $, abonnement actif jusqu'au 16 octobre 2026.
- Prix commercial Entrepreneur Pro toujours « À définir ». Aucun lancement réel activé.

## CRM-02B — Vérifications et lisibilité (terminé en test)
- [x] Services affichés en langage clair, avec explication et bouton « Ouvrir » vers la fonction existante.
- [x] Fonctions à venir distinguées (export entrepreneur inexistant, jumelage interne désactivé).
- [x] Taxes : état réel lu chez le prestataire. Observé « non configurées » (adresse vendeur absente, 0 inscription).
- [x] Échec de performance du LOT 11 corrigé à la source (limite du lanceur alignée sur le seuil, seuil inchangé) — 1 103 tests, 0 échec.
- [x] Renouvellement prouvé avec horloge de test : 2e facture 10,00 $ payée, période actualisée dans l'application.
- [x] Échec de paiement (carte refusée) : état « paiement en retard », puis régularisation vérifiée (facture payée, retour à actif).
- [x] Annulation en fin de période : droits maintenus jusqu'à la fin, puis état « terminé ».
- [x] Isolation A/B avec sessions ordinaires + membre sans droit de facturation : chaque compte ne voit que son entreprise ; paiement, portail et resynchronisation refusés au membre sans droit ; aucune lecture directe des dossiers, notes privées ou verrous.
- [x] Double paiement impossible : verrou court par entreprise (platform_checkout_locks) — deux tentatives simultanées, une seule session ouverte.
- [ ] Conditions commerciales restantes : prix réel « À définir », configuration fiscale réelle et passage en direct non décidés.

## CRM-03 — Suivi quotidien (livré en prévisualisation)
- Vue « Aujourd'hui » dans le CRM : actions échues et du jour, compteurs alignés sur la liste affichée.
- Terminer une relance, en planifier une suivante, historique conservé dans crm_activities.
- Statut commercial et disponibilité réelle de la demande restent indépendants ; aucune relance automatique par courriel ou SMS.

## CRM-03 — Inventaire préalable (à réutiliser, ne pas refaire)
- Tris : 20 options groupées déjà livrées (src/lib/crm/leadSort.ts), tri par défaut « Plus récents », persistance dans l'URL.
- Filtres serveur : statut, type, matériau, entrepreneur, plage de dates, recherche (src/lib/crm/leadsQuery.ts), pagination 50.
- Prochaines actions : colonne next_follow_up_at déjà en place et triable.
- Historiques : crm_audit_log, crm_activities, jsc_status_history, platform_change_log.
- Responsables : appartenance par jsc_company_members et rôles ; notifications automatiques sur toutes les sources de demandes.

