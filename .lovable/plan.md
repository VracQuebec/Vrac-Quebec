# Plan d'implantation v2 — Parcours fiable Demande → Dompe → Transport → Historique

Cette version remplace le plan du 28 septembre. Elle intègre vos 4 décisions. Aucune modification ne sera faite avant votre approbation. Tout reste additif : aucune suppression, aucun statut historique réécrit.

## Décisions intégrées

1. **Changements critiques** (déclenchent une nouvelle version, le statut « Revalidation requise » et l'invalidation de la confirmation) : dompe, adresse du chantier, point de chargement, type de camion, type de remorque, configuration du camion, matériau, date, quantité, nombre de voyages, conditions d'accès. S'y ajoute tout champ futur marqué « critique » dans une liste que l'admin peut modifier.
2. **Annulation**
   - L'entrepreneur annule directement tant que le transport n'est pas prêt **et** qu'aucun transporteur n'est assigné.
   - Si une dompe était déjà confirmée, l'admin est averti immédiatement.
   - Ensuite, l'entrepreneur ne peut que soumettre une demande d'annulation, que l'admin traite.
   - Chaque annulation conserve la demande originale, le motif, la date et l'heure, et l'identité de la personne.
   - La confirmation liée est invalidée. Les voyages liés passent à « Suspendu — validation admin requise », et aucun ne reste actif sans décision de l'admin.
3. **Compatibilité bloquante** : la confirmation est impossible si le matériau, le camion ou la remorque, la capacité ou l'accès ne sont pas validés. La demande reste « À valider ». Seul un admin peut faire une dérogation, avec une justification obligatoire qui est journalisée.
4. **Deux demandes sans compte**
   - Nouvelle liste admin « À identifier ».
   - Rattachement manuel seulement après vérification de l'identité, jamais sur une simple ressemblance de nom ou d'adresse.
   - Données d'origine préservées.
   - Toute nouvelle demande est associée d'office au compte connecté, et le serveur refuse une demande entrepreneur sans compte.

## Architecture (inchangée)

```text
transport_requests (demande de référence, + lifecycle_status, current_version)
  ├─ transport_request_versions (instantanés figés)
  ├─ transport_request_events   (journal : action, acteur, rôle, origine, date, motif)
  ├─ dompe_confirmations        (liée à UNE version ; active / invalidée / remplacée)
  └─ lead_trips, calendar_events (+ transport_request_id, dompe_confirmation_id)
submissions (dompes) : reliées, jamais fusionnées
```

## Phase 1 — Cycle de vie

- Fonctions serveur `request_update`, `request_cancel`, `request_cancel_request` (demande d'annulation), `request_transition`, avec une table des transitions permises.
- Liste des champs critiques stockée dans les réglages.
- Garde serveur : `user_id` obligatoire à la création côté entrepreneur.
- Vue admin « À identifier ».
- Interface entrepreneur : Modifier, Annuler (ou Demander l'annulation) et Historique des versions.
- **Tests** :
  - Modifier la remorque d'une demande confirmée crée la v2, passe la demande en revalidation et invalide la confirmation.
  - Une annulation directe est refusée dès qu'un transporteur est assigné.
  - Un entrepreneur B est isolé des demandes de A.
  - L'ancien `status` des 8 demandes reste intact.
- **Terminée quand** : aucune écriture de statut n'est possible hors des fonctions serveur, toutes les actions sont journalisées et les tests A/B sont verts.

## Phase 2 — Confirmation de dompe

- Table `dompe_confirmations` avec les champs demandés : dompe, matériaux acceptés, camion ou remorque autorisé, capacité, restrictions, date, plage horaire, consignes, personne qui confirme, date et heure.
- Une seule confirmation active par demande.
- `confirm_dompe()` vérifie la compatibilité, **bloque** en cas d'écart et accepte `override_reason` seulement pour un admin. Elle appelle `decide_submission_site`, l'outil existant qui donne accès à l'adresse.
- **Tests** :
  - Un camion incompatible est refusé.
  - Une dérogation admin avec justification est enregistrée.
  - Une confirmation sur une version périmée est impossible.
  - Une invalidation coupe l'accès à l'adresse.

## Phase 3 — Voyages

- Colonnes de lien nullables ajoutées au module de voyages existant, sans nouvelle table.
- Un trigger empêche un voyage lié de démarrer sans confirmation active.
- Une invalidation ou une annulation suspend les voyages non terminés.
- Les 28 voyages historiques ne sont pas touchés.
- **Tests** : un voyage de la v1 est bloqué après la v2 ; un voyage d'une demande annulée est suspendu.

## Phase 5 — Notifications

Toutes les notifications partent du journal des événements. On réutilise les avis existants dans l'application et la file de courriels. Les tests se font uniquement sur des comptes `@test.invalid`.

| Événement | Destinataires |
|---|---|
| Nouvelle demande | Admin ; accusé à l'entrepreneur |
| Demande modifiée / revalidation requise | Admin (prioritaire) |
| Annulation, ou demande d'annulation | Admin (immédiat si dompe confirmée) ; entrepreneur ; transporteur si assigné |
| Confirmation reçue | Entrepreneur (app + courriel) |
| Confirmation invalidée | Entrepreneur ; transporteur si voyage |
| Transport prêt | Entrepreneur ; transporteur interne (jamais nommé au client) |
| Demande terminée | Entrepreneur ; admin |

## Phase 4 — Tableau de bord admin « Dossiers »

- File unique, avec en tête les demandes en revalidation, à identifier et avec annulation demandée.
- Panneau en 5 blocs : Demande et versions, Dompe (confirmer ou déroger), Transport, Activité, Notes.
- Les anciens écrans restent accessibles.

## Ordre

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 5
5. Phase 4

Chaque phase est livrée en aperçu, démontrée sur des demandes fictives, et reste sans publication.
