# Plan d'implantation — Parcours fiable Demande → Dompe → Transport → Historique

Aucune modification tant que ce plan n'est pas approuvé. Tout est additif et réversible : aucune table ni colonne supprimée, aucun statut historique réécrit, aucune donnée existante modifiée hors rattachements explicitement validés.

## Principe directeur

`transport_requests` devient la **demande de référence** du parcours entrepreneur. `submissions` (les dompes) garde son rôle de référentiel des demandes de remblai. Les deux sont reliées ; elles ne sont pas fusionnées. Les voyages restent dans le module existant (`lead_trips`, calendrier, flotte) et y sont seulement rattachés.

```text
transport_requests (demande, versions)
   └─ request_versions (instantané figé v1, v2, …)
        └─ dompe_confirmations (liée à UNE version)
             └─ lead_trips / calendar_events (voyage lié à UNE confirmation)
request_events (journal horodaté + acteur, pour tout le reste)
```

---

## Phase 1 — Cycle de vie de la demande

1. **Existant concerné** : `transport_requests`, son historique de champs, `submit-transport-request`, `enforce_transport_request_insert_defaults`, `crm_notify_transport_request`, `EntrepreneurDemandeDetail`, `AdminTransportRequests`.
2. **Modifications minimales**
   - Nouvelle colonne `lifecycle_status` (avec valeur par défaut), à côté de l'ancien `status` qui reste en place. Valeurs : `a_valider`, `attente_confirmation_dompe`, `confirmee`, `revalidation_requise`, `prete_transport`, `en_cours`, `terminee`, `annulee`, `refusee`, `expiree`. Remplissage initial par correspondance, sans modifier `status`.
   - Nouvelle colonne `current_version` (entier).
   - Nouvelle table `transport_request_versions` : instantané JSON figé à chaque changement (dompe, camion, matériau, quantité, date, adresse), avec auteur et date. Lecture seule, jamais modifiée.
   - Nouvelle table `transport_request_events` : action, ancien et nouveau statut, `actor_id`, rôle de l'acteur, origine (entrepreneur, admin, système, support), date.
   - Fonctions serveur `request_update(id, changes)`, `request_cancel(id, reason)` et `request_transition(id, to)`. Une table des transitions permises est contrôlée côté serveur. Un changement **critique** (dompe, type de camion, matériau, date, quantité > seuil paramétrable) crée une nouvelle version, passe la demande à `revalidation_requise` et invalide la confirmation active.
   - Règle d'annulation par l'entrepreneur : permise jusqu'à `prete_transport`. Après ce statut, elle devient une demande d'annulation que l'admin doit traiter. Le délai est paramétrable dans les réglages admin, sans valeur codée en dur.
   - Interface entrepreneur : boutons « Modifier » et « Annuler » dans le dossier, onglet « Historique » avec les versions.
3. **Relations à préserver** : numéro de demande, `submission_id`, lien JSC, `user_id`, historique de champs existant, RLS propriétaire.
4. **Risques** : écrans qui lisent `status` (conservé et synchronisé en sens unique), notifications existantes déclenchées sur `status`, et les 2 demandes sans compte (ni modifiables ni annulables par un entrepreneur).
5. **Tests d'acceptation** : un entrepreneur modifie la date d'une demande confirmée, ce qui crée la v2, fait passer la demande en revalidation et invalide la confirmation ; un entrepreneur B ne peut ni lire ni modifier la demande de A ; une annulation après `prete_transport` est refusée par le serveur ; chaque action a un acteur et une date ; l'ancien `status` n'est pas altéré pour les 8 demandes existantes.
6. **Ordre** : colonnes et tables, puis fonctions et transitions, puis remplissage initial, puis interface entrepreneur.
7. **Terminée quand** : aucune écriture directe possible sur le statut hors fonctions serveur, 100 % des actions journalisées, tests A/B verts.

## Phase 2 — Confirmation de dompe

1. **Existant** : `decide_submission_site`, `add_submission_site`, table des décisions de sites (0 ligne), `DompesApprobationPanel`, protection de l'adresse réelle.
2. **Modifications**
   - Nouvelle table `dompe_confirmations` : `request_id`, `request_version` (obligatoire), `submission_id`, matériaux acceptés, type de camion autorisé (liste contrôlée : 10 roues, 12 roues, semi, trailer…), capacité, restrictions, date, début et fin de plage, consignes d'accès, `confirmed_by`, nom du contact de la dompe, `confirmed_at`, `status` (active, invalidée, remplacée), `invalidated_reason`.
   - Une seule confirmation active par demande (index unique partiel).
   - `decide_submission_site` reste l'interrupteur qui donne accès à l'adresse. Une confirmation active l'appelle en interne, pour ne pas dupliquer la logique de confidentialité.
   - Contrôle serveur **avertissant** (non bloquant à la v1, avec justification obligatoire) si camion ou matériau demandé ≠ autorisé.
3. **À préserver** : la divulgation de l'adresse uniquement après approbation, le moteur d'admissibilité (« en attente de livraison ») et les coordonnées anonymisées.
4. **Risques** : double source de vérité si l'approbation et la confirmation divergent (atténué par l'appel interne unique) ; confirmation liée à une version périmée.
5. **Tests** : une confirmation sur v1 puis une modification critique rendent la confirmation « invalidée » et coupent l'accès à l'adresse ; il est impossible de confirmer une version qui n'est pas la version courante ; l'avertissement de compatibilité camion est journalisé.
6. **Ordre** : table et contraintes, puis fonction `confirm_dompe()`, puis formulaire admin, puis affichage entrepreneur (camion validé, plage, consignes).
7. **Terminée quand** : toute confirmation porte une version, un auteur et une date, et l'invalidation automatique est prouvée en réel sur une demande fictive.

## Phase 3 — Transport et voyages

1. **Existant** : `lead_trips` (28), `calendar_events`, `dispatch_scenarios`, `dispatch_apply_scenario`, `trucks`/`drivers`, la flotte, `carriers`.
2. **Modifications** : colonnes nullables `transport_request_id` et `dompe_confirmation_id` sur `lead_trips` et `calendar_events`. Pas de nouvelle table de voyages. Une fonction `plan_trip_from_confirmation()` crée le voyage dans le module existant à partir de la confirmation active. Un trigger bloque la création ou le passage « en cours » d'un voyage lié à une confirmation non active. Quand une confirmation est invalidée, ses voyages non démarrés passent en « à replanifier » et sont signalés.
3. **À préserver** : les 28 voyages historiques (restent sans lien), le calendrier opérationnel, la facturation et les taxes de `lead_trips`.
4. **Risques** : triggers de facturation existants sur `lead_trips` (à tester) ; `dispatch_apply_scenario`, à adapter pour transmettre les liens.
5. **Tests** : un voyage créé depuis la confirmation v1 est bloqué après le passage en v2 ; impossible de démarrer un voyage sans confirmation active ; les voyages historiques sont inchangés.
6. **Ordre** : colonnes, puis trigger de garde, puis fonction de planification, puis bouton dans le dossier admin.
7. **Terminée quand** : aucun voyage lié ne peut s'exécuter sur une confirmation périmée.

## Phase 4 — Interface administrateur

1. **Existant** : `AdminTransportRequests`, `DompesApprobationPanel`, `OpsCenter`, CRM, calendrier.
2. **Modifications** : une page « Dossiers » (file unique filtrée par `lifecycle_status`, avec la revalidation en tête) et un panneau de dossier en 5 blocs : Demande (versions et différences), Dompe (confirmer ou invalider), Transport (planifier le voyage), Activité (journal), Notes. Les panneaux existants sont réutilisés comme composants, et les anciens écrans restent accessibles.
3. **À préserver** : les routes admin existantes et les permissions `has_role(admin)`.
4. **Risques** : performance de la file (pagination serveur), confusion pendant la transition (lien croisé depuis les anciens écrans).
5. **Tests** : traiter une demande de A à Z sans quitter la page ; le compteur « revalidation requise » est exact ; mobile et ordinateur.
6. **Ordre** : après les phases 1 à 3.
7. **Terminée quand** : un parcours complet est réalisé en réel depuis la page unique.

## Phase 5 — Notifications

Réutiliser `crm_notify`, `jsc_notifications`/`entrepreneur` en application, `enqueue_email` et la file de courriels existante. Tous les déclencheurs partent de `transport_request_events` (une seule source, ce qui supprime les doublons « dompe approuvée »/« décision »).

| Événement | Destinataires | Contenu |
|---|---|---|
| Nouvelle demande | Admin (app + courriel) ; entrepreneur (accusé) | N°, chantier, matériau, date souhaitée |
| Demande modifiée | Admin | N°, version, différences |
| Demande annulée | Admin ; entrepreneur (confirmation) ; transporteur si voyage planifié | N°, motif, voyages touchés |
| Confirmation reçue | Entrepreneur (app + courriel) | Dompe, adresse, camion autorisé, plage, consignes |
| Confirmation invalidée | Entrepreneur ; transporteur si voyage | Motif, « ne pas se présenter » |
| Nouvelle validation requise | Admin (prioritaire) | N°, champs critiques changés |
| Transport prêt | Entrepreneur ; transporteur interne | Date, plage, camion, consignes (jamais le nom du transporteur au client) |
| Demande terminée | Entrepreneur ; admin | Récapitulatif, historique |

Risques : envoi de vrais courriels pendant les tests (utiliser des comptes `@test.invalid` et une file bloquée pour ces domaines). Tests : un seul avis par événement, bon destinataire, aucune information stratégique chez le client. Terminée quand : les 8 événements sont prouvés sur une demande fictive.

---

## Ordre global recommandé

1. Phase 1 (base de tout)
2. Phase 2
3. Phase 3
4. Phase 5 (branchée sur le journal)
5. Phase 4 (assemble le tout)

Chaque phase sera livrée en aperçu avec une démonstration sur des demandes fictives, sans publication.

## Points à décider par Vrac Québec

- Liste exacte des changements « critiques » et seuil de quantité.
- Délai ou statut limite pour l'annulation autonome.
- Compatibilité camion/matériau : avertissement (proposé) ou blocage.
- Sort des 2 demandes sans compte : rattachement manuel ou maintien tel quel.
