# Phase 3D — Audit cpn_trips vs trips (lecture seule, 2026-10-07)

## Nombres réels
- cpn_trips : 1 ligne (liée à 1 demande, 0 entrepreneur_id, 0 annulée, côté « recu », type « voyage »); 0 transport lié via la demande; 0 doublon.
- trips : 0 ligne. dispatch_scenarios : 0.

## Rôles
- cpn_trips = compteur de coupons / preuve de décompte (reçu vs livré, jamais additionnés). Pas de statut, camion/chauffeur en texte libre, aucun lien transport, agenda ni facture. Écrit seulement par RPC cpn_trip_add / cpn_trip_void.
- trips = voyage opérationnel de répartition : liens FK vers submission, transport_request, client, entrepreneur (auth.users), carrier, driver, truck, dump, calendar_event; statut enum trip_status (demande → payé), horodatages d'exécution, coût/revenu/marge. Lu/écrit par AdminOperations, ops_planning_range, ops_dashboard_stats, trip_advance_status, dispatch_*; triggers trg_trips_before_write/status_audit.

## Utilisation UI
- cpn_trips : TripCounter (/compteur), AdminVoyages, EntrepreneurDataProvider (fiche demande/chantier, Phase 3B/3C).
- trips : AdminOperations (cockpit, dispatch, planification, voyages) seulement. Aucun écran entrepreneur.
- Aucune page ne lit les deux pour les mêmes voyages → pas de lecture redondante.

## Sécurité
- cpn_trips : SELECT authentifié = admin, entrepreneur rattaché, créateur ou entrepreneur assigné à la demande; écriture par RPC.
- trips : admin = tout; entrepreneur = SELECT si entrepreneur_id = son compte. Anonyme : aucun accès aux deux (vérifié en Phase 3C).

## Recommandation : A
Rôles distincts (preuve de décompte vs exécution planifiée). trips = source opérationnelle future; cpn_trips = preuve terrain liée. Aucune migration/fusion.
