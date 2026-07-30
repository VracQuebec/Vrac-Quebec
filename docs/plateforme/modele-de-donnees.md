# Vrac Québec OS — Modèle de données officiel (Sprint 1.5)

Référence unique de l'architecture des données. Toute nouvelle fonctionnalité
(calculateur public, CRM, commandes, répartition, facturation, API, IA, mobile)
doit s'appuyer sur ces entités — sans en créer de parallèles.

## Principes non négociables

1. **Aucune valeur codée en dur.** Toute règle vient de `jsc_settings` (préfixes de
   numérotation, longueur des numéros, marges, temps fixes…).
2. **Clés stables.** Chaque enregistrement a un `id` UUID immuable; les références
   se font par UUID, jamais par nom.
3. **Multi-entreprise.** Chaque table porte `company_id` → `jsc_companies`
   (une entreprise = un transporteur / partenaire de la plateforme).
4. **Jamais de suppression.** `archived_at` / `archived_by` (archivage réversible via
   `jsc_archive_record`). Les tables transactionnelles conservent l'historique complet.
5. **Traçabilité totale.** Toute écriture déclenche `jsc_audit_trigger`; les événements
   applicatifs (calcul, décision moteur, envoi) passent par `jsc_log_event`.
6. **API / mobile / IA.** Tables normalisées, colonnes `jsonb` (`decision`,
   `calculation`, `settings_snapshot`, `public_payload`) pour les traces riches
   consommables par les moteurs et l'IA sans migration.

## Champs communs

| Champ | Type | Rôle |
|---|---|---|
| `id` | uuid | Clé primaire stable |
| `company_id` | uuid → `jsc_companies` | Cloisonnement multi-entreprise |
| `is_active` | boolean | Retire des calculs futurs sans effacer l'historique |
| `archived_at` / `archived_by` | timestamptz / uuid | Archivage réversible |
| `created_at` / `updated_at` | timestamptz | Horodatage (trigger `touch_updated_at`) |

## Entités

### Référentiel (configuration administrateur)

| Entité | Table | Champs clés | Relations |
|---|---|---|---|
| Transporteurs / entreprises | `jsc_companies` | name, legal_name, code, currency, timezone, is_default | 1‑N camions, tarifs, tous les enregistrements |
| Camions | `jsc_trucks` | truck_type, capacity_tonnes, capacity_m3, hourly_rate, loading/unloading/fixed_time_minutes, is_subcontracted | N‑1 transporteur; 1‑N tarifs, chauffeurs, commandes |
| Chauffeurs | `jsc_drivers` | first_name, last_name, phone, license_number, license_class, hourly_cost, status | N‑1 transporteur, N‑1 camion habituel; 1‑N commandes |
| Fournisseurs | `jsc_suppliers` | name, contact_name, phone, payment_terms, zone_id | 1‑N lieux de chargement, 1‑N prix |
| Lieux de chargement | `jsc_pickup_locations` | address, city, latitude, longitude, opening_hours, loading_time_minutes | N‑1 fournisseur, N‑1 zone; 1‑N prix |
| Catégories de matériaux | `jsc_material_categories` | name, code, description | 1‑N matériaux |
| Matériaux | `jsc_materials` | name, code, unit, density_kg_per_m3, purchase/selling_price, is_taxable | N‑1 catégorie; 1‑N prix; N‑N fournisseurs via prix |
| Prix matériau | `jsc_material_prices` | unit, purchase_price, selling_price, minimum_quantity, is_preferred | N‑1 matériau, fournisseur, lieu de chargement |
| Zones | `jsc_zones` | code, region, center_lat/lng, radius_km, distance_surcharge | 1‑N tarifs, fournisseurs, lieux, demandes |
| Tarifs de transport | `jsc_transport_rates` | rate_mode (hourly/per_km/per_trip/flat), taux, minimum_charge, minimum_hours, distance_from/to_km | N‑1 camion, N‑1 zone, N‑1 transporteur |
| Taxes | `jsc_taxes` | code, rate_percent, apply_order, compound, registration_number | Appliquées aux estimations, soumissions, factures |
| Paramètres | `jsc_settings` | key, label, category, value_type, value, unit | Source unique des règles du moteur |

### Flux commercial

| Entité | Table | Champs clés | Relations |
|---|---|---|---|
| Clients | `jsc_clients` | client_type, name, contact_name, phone, email, billing_address, latitude/longitude, tax_exempt, payment_terms | 1‑N demandes, soumissions, commandes, factures |
| Demandes | `jsc_requests` | request_number, source, status, quantity + quantity_unit, delivery_address, lat/lng, desired_date, notes | N‑1 client, matériau, zone; 1‑N estimations, soumissions |
| Estimations | `jsc_estimates` | trips, distance_km, billed_hours, material_cost, transport_cost, surcharges, margin, subtotal, tax_total, total, `decision`, `calculation`, `settings_snapshot`, is_selected | N‑1 demande (cascade), transporteur, camion, fournisseur, lieu, matériau, tarif |
| Soumissions | `jsc_quotes` | quote_number, status, valid_until, `public_payload`, subtotal, tax_total, total, sent_at, accepted_at, refused_at | N‑1 demande, N‑1 estimation retenue, N‑1 client; 1‑N commandes |
| Commandes | `jsc_orders` | order_number, status, scheduled_date/time, trips_planned/completed, delivered_quantity, montants | N‑1 soumission, demande, client, transporteur, camion, chauffeur, fournisseur, lieu, matériau; 1‑N factures |
| Factures | `jsc_invoices` | invoice_number, status, issued_at, due_at, subtotal, tax_total, total, amount_paid, `balance` (calculé) | N‑1 commande, N‑1 client; 1‑N lignes |
| Lignes de facture | `jsc_invoice_lines` | line_type, description, quantity, unit, unit_price, line_total, tax_ids[] | N‑1 facture (cascade) |

### Traçabilité

| Entité | Table | Rôle |
|---|---|---|
| Journal d'audit | `jsc_audit_log` | `table_name`, `record_id`, `record_label`, `action` (insert/update/delete/archive/restore + actions applicatives), `actor_id`/`actor_email`, `changed_fields`, `old_values`, `new_values`, `entity_type`, `entity_id`, `context`, `created_at` |
| Compteurs | `jsc_number_counters` | Séquences par entreprise et par type de document |

## Numérotation

`jsc_next_number(company_id, kind)` produit `PRÉFIXE + ANNÉE + séquence`
(`DEM-2026-00001`). Le préfixe (`numbering_<kind>_prefix`) et le nombre de chiffres
(`numbering_padding`) sont des **paramètres administrateur**. Les triggers
`jsc_assign_number` remplissent automatiquement `request_number`, `quote_number`,
`order_number`, `invoice_number` si absents.

## Règles d'intégrité

- Une estimation appartient à une demande (`ON DELETE CASCADE`); une seule
  estimation `is_selected = true` doit être retenue par demande (règle applicative).
- Une soumission référence l'estimation figée qui l'a produite : les prix restent
  auditables même si les paramètres changent (`settings_snapshot`).
- Une commande naît d'une soumission acceptée; une facture naît d'une commande.
- `balance` d'une facture est calculé (`total - amount_paid`), jamais saisi.
- Toutes les clés étrangères pointent vers des UUID; aucune donnée dupliquée par nom.
- Accès : réservé aux administrateurs (`jsc_can_manage`) + `service_role` pour les
  services internes (moteurs, API, tâches planifiées).

## Diagramme des relations

Voir `docs/plateforme/erd-vrac-quebec-os.mmd`.

## Journalisation applicative

```sql
select public.jsc_log_event(
  'calculation',            -- action
  'jsc_estimates',          -- entité
  '<uuid estimation>',      -- identifiant
  'DEM-2026-00001',         -- libellé
  '{"carrier":"...","supplier":"...","settings":{...}}'::jsonb
);
```

Permet de retracer l'historique complet d'une estimation ou d'une commande :
paramètres utilisés, transporteur et fournisseur choisis, utilisateur, date et heure.
