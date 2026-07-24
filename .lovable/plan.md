# Phase — Moteur opérationnel intelligent (Vrac Québec OS)

Objectif : bâtir le cœur d'exploitation sur la base CRM 360° existante (clients, entrepreneurs, carriers, dumps, trucks, drivers, transport_requests, lead_trips, crm_activities, crm_documents, calendar_events). Aucune table existante n'est recréée.

## 1. Fondation données (migration additive)

Nouvelles tables :
- `trips` — voyage unitaire. Colonnes : `trip_number` (auto `V-0001`), `transport_request_id`, `client_id`, `entrepreneur_id`, `carrier_id`, `driver_id`, `truck_id`, `dump_id`, `material`, `quarry_address`, `pickup_address`, `delivery_address`, `pickup_lat/lng`, `delivery_lat/lng`, `distance_km`, `scheduled_at`, `started_at`, `loaded_at`, `delivered_at`, `completed_at`, `status` (enum), `cost`, `revenue`, `margin` (généré), `notes`, `signature_url`, `photos jsonb`, `documents jsonb`, `assigned_by`, `assignment_mode` ('auto'|'manual').
- `trip_status_history` — journal `trip_id, from_status, to_status, changed_by, changed_at, reason`.
- `dispatch_scenarios` — propositions du moteur : `transport_request_id`, `rank`, `carrier_id`, `driver_id`, `truck_id`, `dump_id`, `estimated_distance_km`, `estimated_duration_min`, `estimated_cost`, `estimated_margin`, `score`, `reasons jsonb`, `expires_at`, `chosen_at`.
- `dispatch_rules` — pondérations éditables : `key`, `weight`, `active`.

Enum `trip_status` : `demande, soumission_envoyee, accepte, planifie, en_route, chargement, transport, livraison, termine, facture, paye, annule`.

Nouveaux triggers :
- `trips_before_write` : `trip_number`, calcul `margin = revenue - cost`, sync `last_activity_at` sur client/carrier/dump/entrepreneur, création `calendar_events` liée quand `scheduled_at` défini.
- `trips_status_audit` : insère `trip_status_history`, publie `crm_activities` (`type='status_change'`), met à jour `transport_requests.status` correspondant, notifie via `pg_notify('trip_events', payload)`.
- `dispatch_scenarios_expire` : cron 5 min qui expire les scénarios non choisis > 30 min.

RPCs :
- `dispatch_generate_scenarios(_request_id uuid, _limit int)` — SECURITY DEFINER admin : calcule scoring déterministe (distance Haversine sur lat/lng existants, capacité camion vs quantité, disponibilité dump `availability_status`, blacklist, horaires) et insère top-N scénarios.
- `dispatch_apply_scenario(_scenario_id uuid)` — crée le(s) `trips` et change `transport_requests.status → planifie`.
- `trip_advance_status(_trip_id, _next_status, _reason)` — validation transitions + audit.
- `ops_dashboard_stats()` — KPI cockpit (voyages jour/semaine/mois, camions/transporteurs/clients/dompes actifs, revenu, marge, top matériaux, top villes, temps moyen chargement→livraison).
- `ops_planning_range(_from, _to, _view)` — retourne voyages + événements calendrier pour vues jour/semaine/mois.

Realtime : `ADD TABLE trips, trip_status_history, dispatch_scenarios` à `supabase_realtime`.

GRANTS / RLS : admins full ; entrepreneur voit ses voyages via `entrepreneur_id = auth.uid()` ; transporteurs (rôle futur) prêts via `carrier_id`.

## 2. Moteur de répartition (edge function `dispatch-engine`)

Boundary serveur pour enrichissement (Distance Matrix Google via connector) — appelé par la RPC quand lat/lng manquent. Fallback : Haversine local. Retourne scénarios triés, écrits via RPC. 100 % déterministe, zéro appel IA (respecte l'économie Phase 3).

Scoring pondéré (via `dispatch_rules`) :
- distance (30 %) — plus court = mieux
- disponibilité dump (20 %)
- adéquation type camion / tonnage (20 %)
- charge du transporteur (15 %) — voyages actifs
- historique performance (10 %) — % `termine` sans incident
- coût estimé vs marge cible (5 %)

## 3. Frontend — `/admin/operations`

Nouvelle page `src/pages/AdminOperations.tsx` avec sous-onglets :

### a) Cockpit
`OpsCockpit.tsx` — KPI temps réel via `ops_dashboard_stats` + abonnement realtime, cartes : voyages actifs, camions en route, revenu/marge du jour, temps moyen, top matériaux/villes.

### b) Répartition
`DispatchBoard.tsx` — file des `transport_requests` sans voyage. Bouton « Générer scénarios » → tableau top-5 avec score, distance, coût, marge, transporteur/camion/dompe suggérés. Bouton « Appliquer » (crée le voyage) ou « Manuel » (formulaire).

### c) Planification
`PlanningBoard.tsx` — vues :
- **Jour** : timeline horaire par camion (colonnes camions, lignes 06 h→20 h).
- **Semaine** : grille 7 jours × camions.
- **Mois** : mini-calendrier.
- **Carte** : Google Maps avec pins chargement/livraison, itinéraires.
Drag & drop léger (`@dnd-kit/core` déjà présent sinon `react-beautiful-dnd`, sinon HTML5 natif — on utilise HTML5 natif pour éviter dep) pour déplacer un voyage entre camions ou créneaux → appelle `trip_reschedule` RPC.

### d) Voyages
`TripsTable.tsx` — liste filtrable par statut/date/client/transporteur, ouvre `TripDetail.tsx` (drawer) : timeline statuts, coûts/marge, photos, signature (preview), documents (bucket `crm-docs`), boutons de transition (`Avancer statut`) et raccourcis vers fiche CRM.

### e) Automatisations
`AutomationsPanel.tsx` — liste des règles actives (readonly V1), toggle notifications par statut.

Réutilise : `EntrepreneurShell`/`AdminMap`/`google-maps-loader`/`material-colors`/`calendar-utils`/`InlineField`/`FullPageState`/`FilterBar` du CRM.

## 4. Realtime & notifications

- Hook `useTripsRealtime()` — un seul channel `trips` monté au niveau `/admin/operations`, teardown au unmount.
- Toast sur transition importante (accepte → planifie, en_route → livraison, termine).
- Enqueue email transactionnel (réutilise `enqueue_email` + templates `client-confirmation` / `new-lead-notification`) lorsque `accepte`, `planifie`, `termine`, `facture`.

## 5. Intégrations préparées (interfaces, pas implémentation)

- `src/lib/ops/pricing.ts` — signatures pour futur module facturation (`computeTripInvoice(trip)`).
- `src/lib/ops/routing.ts` — wrapper Google `routes/directions/v2:computeRoutes` (gateway) déjà branché ; utilisé par le moteur si lat/lng présents.
- `src/lib/ops/signature.ts` — placeholders (`captureSignature`, `attachSignatureToTrip`).
- Points d'extension explicités en commentaires (Comptabilité, App chauffeur/entrepreneur, IA recommandation).

## 6. Vérification finale

- Migration → linter Supabase (RLS/GRANT).
- `bunx tsgo --noEmit` doit rester vert.
- Smoke test : créer une `transport_request` de test → générer scénarios → appliquer → avancer statuts jusqu'à `termine` → vérifier historique + KPI cockpit + calendar_events créés.

## Détails techniques

```text
transport_requests ──► dispatch_generate_scenarios ──► dispatch_scenarios
                                                            │
                                                            └─ apply ─► trips ──► trip_status_history
                                                                          │
                                                                          ├─► calendar_events (auto)
                                                                          ├─► crm_activities (auto)
                                                                          └─► realtime channel `trips`
```

- Aucune table existante recréée. Toutes les nouvelles colonnes/tables sont additives.
- Tous les nouveaux endpoints DB sont `SECURITY DEFINER` avec check `has_role(auth.uid(),'admin')`.
- Toutes les nouvelles tables portent `GRANT` explicites (authenticated + service_role) et RLS activée.
- Zéro appel IA dans le moteur (100 % déterministe, aligné sur la politique d'économie de crédits).

## Livraison

Un seul lot : migration → edge function `dispatch-engine` → page `/admin/operations` + composants → hooks realtime → validation typecheck. Confirme-moi le go et j'exécute.
