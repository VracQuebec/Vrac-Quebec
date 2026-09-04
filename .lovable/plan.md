# Gestion de la flotte — module interne (étape 1)

## Ce qui existe déjà (analyse)

- **Administration**: toutes les pages vivent sous `/admin/...` dans l'app actuelle, protégées par le rôle `admin` (`useUserRoles` + `has_role`). Aucun nouveau système de comptes n'est nécessaire.
- **Calendrier**: `/admin/calendrier` (`AdminCalendar`) sur la table `calendar_events` (titre, début/fin, statut, camion, chauffeur, notes, adresses). Vues Jour / Semaine / Mois / Agenda / Répartition. Statuts: à planifier, planifié, en cours, terminé, reporté, annulé.
- **Notifications**: table `crm_notifications` + fonction `crm_notify(...)` avec clé anti-doublon (`dedupe_key`), priorités, statuts (non lue / lue / en cours / résolue), lien direct (`action_url`), et `crm_resolve(...)` pour fermer une alerte. Cloche + page `/admin/notifications` + envoi Push iPhone déjà branchés.
- **Camions et chauffeurs**: tables `trucks` et `drivers`, déjà gérées dans le calendrier (« Gestion de la flotte » basique: nom, type, plaque, actif, notes).
- **Documents**: stockage de fichiers déjà utilisé (photos de leads, documents CRM).

## Ce qui sera réutilisé (aucun doublon)

- Le calendrier existant `calendar_events` — **aucun deuxième calendrier**.
- Les notifications existantes `crm_notify` / `crm_notifications` — **aucun deuxième système d'alertes**.
- Les camions existants `trucks` comme registre unique des véhicules (enrichi, pas dupliqué) et `drivers` pour les inspections.
- Les rôles admin existants, la navigation admin existante, les composants d'interface existants.

## Ce qui sera créé

### Base de données

1. **Enrichissement de `trucks`** (le véhicule reste une seule entité):
   marque, modèle, année, numéro d'unité, VIN, kilométrage actuel, heures moteur, statut de service, date d'ajout.
2. **`fleet_maintenance`** — entretiens: véhicule, date, kilométrage, heures, type, travail effectué, pièces, fournisseur, coût, prochain entretien (date + kilométrage), notes, document, lien événement calendrier.
3. **`fleet_repairs`** — réparations: véhicule, problème, date signalée, kilométrage, description, priorité, statut (à diagnostiquer / à planifier / planifiée / en réparation / terminée), coût estimé et réel, date prévue, date effectuée, pièces, fournisseur, documents, notes, lien événement calendrier, lien inspection d'origine.
4. **`fleet_inspections`** — inspections: véhicule, chauffeur, date, kilométrage, points de contrôle (huile, pneus, air, lumières, freins, fuites, dompe, hydraulique) en OK / à surveiller / problème, commentaire, signature.
5. **`fleet_parts`** — pièces remplacées, rattachées à un entretien ou une réparation (coût, quantité).
6. **`fleet_costs`** (structure préparée pour la rentabilité future): type de coût, véhicule, montant, date, source. Aucun calcul de rentabilité développé maintenant.
7. **Colonnes de liaison sur `calendar_events`**: `vehicle_id`, `fleet_ref_type` (entretien / réparation / inspection / échéance), `fleet_ref_id`. Nullables — aucun impact sur les événements existants.

Toutes les tables: accès réservé aux administrateurs (lecture/écriture) et aux services internes, avec les autorisations d'accès requises. Rien n'est exposé publiquement.

### Relations

```text
trucks (véhicule)
  ├─ fleet_maintenance   ─┬─ fleet_parts
  ├─ fleet_repairs       ─┘
  ├─ fleet_inspections ── (problème) ──> fleet_repairs
  ├─ fleet_costs
  └─ calendar_events (vehicle_id + fleet_ref_type/fleet_ref_id)
```

### Calendrier — comment il sera relié

- Quand un entretien, une réparation ou une inspection reçoit une date future, un événement est créé dans le calendrier existant avec le véhicule, un titre clair (« Entretien — Camion 12 »), le type et la référence de l'intervention.
- Clic sur l'événement → ouverture directe de la fiche du véhicule sur l'intervention concernée.
- Fiche véhicule → onglet Calendrier listant les événements futurs de ce véhicule (lecture des mêmes données, pas de copie).

### Notifications — comment elles seront reliées

- Une fonction interne génère les alertes via `crm_notify` avec une clé unique par intervention et par seuil (ex. `fleet:maint:<id>:bientot`), ce qui empêche les doublons; l'état non lue / lue / résolue est celui déjà en place.
- Règles: entretien bientôt dû (date ou kilométrage approchant), entretien en retard, réparation urgente, réparation à planifier, inspection à venir ou échue, problème détecté en inspection.
- Résolution automatique par `crm_resolve` dès que l'intervention est terminée.

### Interface

Nouvelle entrée « Gestion de la flotte » dans la navigation admin, page `/admin/flotte` avec onglets:
Tableau de bord · Véhicules · Entretien · Réparations · Inspections · À faire bientôt · Historique · Coûts.

- Tableau de bord: camions en service, entretiens à venir / en retard, réparations urgentes, inspections à venir, alertes non lues, coûts du mois et de l'année, avec liens rapides.
- Fiche véhicule: Informations, Entretien, Réparations, Pièces, Inspections, Historique, Coûts, À faire, Alertes, Calendrier.
- Actions rapides: + véhicule, + entretien, + réparation, + inspection (formulaires courts).
- Formulaire d'inspection pensé d'abord pour iPad et téléphone (grands boutons OK / à surveiller / problème).

## Hors périmètre

Aucune page publique, aucun affichage côté visiteurs, entrepreneurs ou clients. Aucun calcul de rentabilité pour l'instant (structure seulement). Aucune fonctionnalité existante supprimée ou modifiée.
