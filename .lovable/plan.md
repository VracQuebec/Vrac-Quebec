## Calendrier Opérationnel Avancé — Plan d'implémentation

Un nouveau module CRM complet pour devenir le centre de répartition de Vrac Québec / Transport JSC.

---

### 1. Base de données (3 nouvelles tables)

**`trucks`** — Flotte de véhicules
- `name` (ex. "10 roues #1"), `type` (enum: 6_roues, 10_roues, 12_roues, semi_remorque, fardier, autre), `plate`, `active`

**`drivers`** — Registre des chauffeurs
- `name`, `phone`, `email`, `status` (disponible/occupé/inactif), `notes`

**`calendar_events`** — Événements planifiés
- `title`, `start_at`, `end_at`, `status` (a_planifier/planifie/en_cours/termine/reporte/annule)
- Chantier : `dompe_number`, `dompe_address`, `loading_address`, `delivery_address`, `material_type`
- Transport : `trips_planned`, `tonnage_estimated`, `quantity_estimated`
- Liens : `entrepreneur_id` → entrepreneurs, `driver_id` → drivers, `truck_id` → trucks, `submission_id` → submissions (nullable, pour l'import depuis CRM)
- Notes : `admin_notes`, `special_instructions`

RLS : lecture/écriture admin uniquement (via `has_role('admin')`). GRANTs appropriés.

---

### 2. Nouvelle page `/admin/calendar`

Onglet ajouté dans la navigation Admin existante.

**Composants :**

- `CalendarPage.tsx` — Layout principal avec sélecteur de vue (Jour / Semaine / Mois / Agenda / **Répartition**), filtres latéraux, bouton "+ Planifier une livraison".
- `CalendarGrid.tsx` — Grille jour/semaine/mois (implémentation maison, sans librairie lourde, basée sur `date-fns` déjà compatible).
- `AgendaView.tsx` — Liste chronologique.
- `DispatchView.tsx` — Tableau Répartition : Date | Heure | Camion | Chauffeur | Dompe | Adresse | Voyages | Statut.
- `EventCard.tsx` — Bloc événement avec couleur de statut, type camion, entrepreneur, voyages.
- `EventModal.tsx` — Création/édition (tous les champs spec).
- `DailyDashboard.tsx` — En-tête : Aujourd'hui (livraisons, voyages, dompes actives, camions, chauffeurs) + Cette semaine.
- `CalendarFilters.tsx` — Entrepreneur, chauffeur, camion, dompe, statut, date, matériel.

**Vue par défaut :** Semaine.

**Palette statuts :**
- Planifié : bleu (`hsl(217 91% 60%)`)
- En cours : orange (`hsl(25 95% 53%)`)
- Terminé : primary green (`hsl(89 74% 48%)`)
- Reporté : jaune (`hsl(48 96% 53%)`)
- Annulé : rouge (`hsl(0 84% 60%)`)

Tokens définis dans `index.css` (`--status-planifie`, etc.) pour rester cohérent avec le design system.

---

### 3. Gestion flotte & chauffeurs

Deux pages secondaires accessibles depuis le calendrier :
- `/admin/trucks` — CRUD camions
- `/admin/drivers` — CRUD chauffeurs

Modales rapides "+ Nouveau camion" / "+ Nouveau chauffeur" directement depuis l'EventModal.

---

### 4. Intégration CRM ↔ Calendrier

Dans `Admin.tsx` (liste demandes), ajout d'un bouton **"Planifier au calendrier"** sur chaque demande. Au clic → ouvre `EventModal` pré-rempli avec : numéro de dompe, adresses, matériel, voyages, nom client, `submission_id`. L'admin n'a qu'à choisir date/heure/chauffeur/camion.

---

### 5. Responsive

- Desktop : grille complète avec sidebar filtres.
- Tablette : filtres en drawer.
- Mobile : vue Agenda + Jour privilégiées, switcher compact.

---

### 6. Vision future (préparée mais pas implémentée)

Structure DB compatible : champs nullables pour `sms_sent_at`, `client_signature_url`, `google_event_id`, `last_known_lat/lng` ajoutés dès maintenant pour éviter une future migration.

---

### Détails techniques

- Pas de nouvelle dépendance lourde (react-big-calendar exclu) — composant calendrier custom + `date-fns` (déjà installé).
- Réutilisation des composants shadcn existants (Dialog, Select, Table, Card, Badge, Popover, Calendar pour datepickers).
- Types Supabase régénérés après migration.
- Realtime activé sur `calendar_events` pour mise à jour live entre admins.

### Étapes d'exécution

1. Migration DB (3 tables + RLS + GRANTs + realtime publication).
2. Pages flotte/chauffeurs (CRUD simple).
3. Page Calendrier + composants de vues.
4. EventModal + intégration depuis Admin.tsx.
5. Dashboard quotidien + filtres.
6. Tests responsive.

Estimation : ~15-20 fichiers créés/modifiés, livré en plusieurs vagues d'édits.
