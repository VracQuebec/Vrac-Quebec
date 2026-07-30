// ============================================================
// TRANSPORT JSC — Configuration des modules administratifs
// ------------------------------------------------------------
// SOURCE DE VÉRITÉ UNIQUE de l'interface d'administration.
// Aucun prix, fournisseur, adresse ou paramètre n'est codé ici :
// seuls les *champs* et leurs libellés sont déclarés. Les données
// vivent exclusivement en base (tables jsc_*).
// Ajouter un module ou un champ = éditer ce fichier, rien d'autre.
// ============================================================

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "reference";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** Affiché dans le tableau de la liste */
  inList?: boolean;
  placeholder?: string;
  help?: string;
  suffix?: string;
  options?: { value: string; label: string }[];
  /** Pour type "reference" : table jsc_* source des options */
  refTable?: string;
  refLabel?: string;
  required?: boolean;
  defaultValue?: string | number | boolean | null;
  /** Champ interne : jamais destiné au client */
  confidential?: boolean;
}

export interface ResourceDef {
  id: string;
  table: string;
  title: string;
  singular: string;
  description: string;
  icon: string;
  labelField: string;
  orderBy: { column: string; ascending: boolean }[];
  fields: FieldDef[];
}

const activeField: FieldDef = {
  key: "is_active",
  label: "Actif",
  type: "boolean",
  inList: true,
  defaultValue: true,
  help: "Désactiver retire l'élément des calculs futurs sans effacer l'historique.",
};

const sortField: FieldDef = {
  key: "sort_order",
  label: "Ordre d'affichage",
  type: "number",
  defaultValue: 0,
};

export const JSC_RESOURCES: ResourceDef[] = [
  {
    id: "materials",
    table: "jsc_materials",
    title: "Matériaux",
    singular: "Matériau",
    description:
      "Catalogue des matériaux en vrac. Prix d'achat et prix de vente sont des données internes.",
    icon: "Layers",
    labelField: "name",
    orderBy: [{ column: "sort_order", ascending: true }, { column: "name", ascending: true }],
    fields: [
      { key: "name", label: "Nom", type: "text", inList: true, required: true },
      { key: "code", label: "Code", type: "text", inList: true, placeholder: "ex. MG20" },
      { key: "category", label: "Catégorie", type: "text", inList: true, placeholder: "ex. Pierre, Sable, Terre" },
      {
        key: "unit", label: "Unité de vente", type: "select", inList: true, defaultValue: "tonne",
        options: [
          { value: "tonne", label: "Tonne métrique" },
          { value: "verge", label: "Verge cube" },
          { value: "m3", label: "Mètre cube" },
          { value: "voyage", label: "Voyage" },
        ],
      },
      { key: "density_kg_per_m3", label: "Densité", type: "number", suffix: "kg/m³", help: "Sert à convertir volume ↔ masse." },
      { key: "purchase_price", label: "Prix d'achat", type: "number", suffix: "$", confidential: true, defaultValue: 0 },
      { key: "selling_price", label: "Prix de vente", type: "number", inList: true, suffix: "$", defaultValue: 0 },
      { key: "is_taxable", label: "Taxable", type: "boolean", defaultValue: true },
      { key: "public_description", label: "Description publique", type: "textarea" },
      { key: "internal_notes", label: "Notes internes", type: "textarea", confidential: true },
      sortField,
      activeField,
    ],
  },
  {
    id: "suppliers",
    table: "jsc_suppliers",
    title: "Fournisseurs",
    singular: "Fournisseur",
    description: "Carrières, sablières et fournisseurs partenaires. Information strictement interne.",
    icon: "Building2",
    labelField: "name",
    orderBy: [{ column: "sort_order", ascending: true }, { column: "name", ascending: true }],
    fields: [
      { key: "name", label: "Nom", type: "text", inList: true, required: true },
      { key: "contact_name", label: "Personne-ressource", type: "text", inList: true },
      { key: "phone", label: "Téléphone", type: "text", inList: true },
      { key: "email", label: "Courriel", type: "text" },
      { key: "address", label: "Adresse", type: "text" },
      { key: "zone_id", label: "Zone", type: "reference", refTable: "jsc_zones", refLabel: "name", inList: true },
      { key: "payment_terms", label: "Conditions de paiement", type: "text", placeholder: "ex. Net 30" },
      { key: "internal_notes", label: "Notes internes", type: "textarea", confidential: true },
      sortField,
      activeField,
    ],
  },
  {
    id: "pickup_locations",
    table: "jsc_pickup_locations",
    title: "Lieux de chargement",
    singular: "Lieu de chargement",
    description: "Points de chargement rattachés aux fournisseurs. Jamais affichés au client.",
    icon: "MapPin",
    labelField: "name",
    orderBy: [{ column: "sort_order", ascending: true }, { column: "name", ascending: true }],
    fields: [
      { key: "name", label: "Nom du site", type: "text", inList: true, required: true },
      { key: "supplier_id", label: "Fournisseur", type: "reference", refTable: "jsc_suppliers", refLabel: "name", inList: true },
      { key: "zone_id", label: "Zone", type: "reference", refTable: "jsc_zones", refLabel: "name", inList: true },
      { key: "address", label: "Adresse", type: "text", inList: true, required: true },
      { key: "city", label: "Ville", type: "text", inList: true },
      { key: "postal_code", label: "Code postal", type: "text" },
      { key: "latitude", label: "Latitude", type: "number" },
      { key: "longitude", label: "Longitude", type: "number" },
      { key: "opening_hours", label: "Heures d'ouverture", type: "text", placeholder: "ex. Lun-Ven 7h-16h" },
      { key: "loading_time_minutes", label: "Temps de chargement", type: "number", suffix: "min", defaultValue: 0 },
      { key: "access_notes", label: "Notes d'accès", type: "textarea", confidential: true },
      sortField,
      activeField,
    ],
  },
  {
    id: "material_prices",
    table: "jsc_material_prices",
    title: "Prix par fournisseur",
    singular: "Prix",
    description:
      "Prix d'un matériau selon le fournisseur ou le lieu de chargement. Permet plusieurs sources pour un même matériau.",
    icon: "DollarSign",
    labelField: "id",
    orderBy: [{ column: "created_at", ascending: false }],
    fields: [
      { key: "material_id", label: "Matériau", type: "reference", refTable: "jsc_materials", refLabel: "name", inList: true, required: true },
      { key: "supplier_id", label: "Fournisseur", type: "reference", refTable: "jsc_suppliers", refLabel: "name", inList: true },
      { key: "pickup_location_id", label: "Lieu de chargement", type: "reference", refTable: "jsc_pickup_locations", refLabel: "name", inList: true },
      {
        key: "unit", label: "Unité", type: "select", inList: true, defaultValue: "tonne",
        options: [
          { value: "tonne", label: "Tonne métrique" },
          { value: "verge", label: "Verge cube" },
          { value: "m3", label: "Mètre cube" },
          { value: "voyage", label: "Voyage" },
        ],
      },
      { key: "purchase_price", label: "Prix d'achat", type: "number", inList: true, suffix: "$", confidential: true, defaultValue: 0 },
      { key: "selling_price", label: "Prix de vente", type: "number", inList: true, suffix: "$", defaultValue: 0 },
      { key: "minimum_quantity", label: "Quantité minimum", type: "number" },
      { key: "is_preferred", label: "Source préférée", type: "boolean", inList: true, defaultValue: false },
      activeField,
    ],
  },
  {
    id: "trucks",
    table: "jsc_trucks",
    title: "Camions",
    singular: "Camion",
    description: "Flotte et sous-traitants : capacités, taux horaires et temps fixes.",
    icon: "Truck",
    labelField: "name",
    orderBy: [{ column: "sort_order", ascending: true }, { column: "name", ascending: true }],
    fields: [
      { key: "name", label: "Nom / identifiant", type: "text", inList: true, required: true },
      { key: "truck_type", label: "Type", type: "text", inList: true, placeholder: "ex. 10 roues, semi-remorque" },
      { key: "capacity_tonnes", label: "Capacité", type: "number", inList: true, suffix: "t", defaultValue: 0 },
      { key: "capacity_m3", label: "Capacité volume", type: "number", suffix: "m³" },
      { key: "hourly_rate", label: "Taux horaire", type: "number", inList: true, suffix: "$/h", confidential: true, defaultValue: 0 },
      { key: "loading_time_minutes", label: "Temps de chargement", type: "number", suffix: "min", defaultValue: 0 },
      { key: "unloading_time_minutes", label: "Temps de déchargement", type: "number", suffix: "min", defaultValue: 0 },
      { key: "fixed_time_minutes", label: "Autre temps fixe", type: "number", suffix: "min", defaultValue: 0 },
      { key: "is_subcontracted", label: "Sous-traitant", type: "boolean", inList: true, defaultValue: false },
      { key: "internal_notes", label: "Notes internes", type: "textarea", confidential: true },
      sortField,
      activeField,
    ],
  },
  {
    id: "transport_rates",
    table: "jsc_transport_rates",
    title: "Tarifs de transport",
    singular: "Tarif",
    description:
      "Règles de tarification du transport : horaire, kilométrique, par voyage ou forfait. Toutes internes.",
    icon: "Route",
    labelField: "name",
    orderBy: [{ column: "sort_order", ascending: true }, { column: "name", ascending: true }],
    fields: [
      { key: "name", label: "Nom du tarif", type: "text", inList: true, required: true },
      {
        key: "rate_mode", label: "Mode de calcul", type: "select", inList: true, defaultValue: "hourly",
        options: [
          { value: "hourly", label: "Horaire" },
          { value: "per_km", label: "Au kilomètre" },
          { value: "per_trip", label: "Par voyage" },
          { value: "flat", label: "Forfait" },
        ],
      },
      { key: "truck_id", label: "Camion", type: "reference", refTable: "jsc_trucks", refLabel: "name", inList: true },
      { key: "zone_id", label: "Zone", type: "reference", refTable: "jsc_zones", refLabel: "name", inList: true },
      { key: "hourly_rate", label: "Taux horaire", type: "number", suffix: "$/h", defaultValue: 0 },
      { key: "rate_per_km", label: "Taux au km", type: "number", suffix: "$/km", defaultValue: 0 },
      { key: "rate_per_trip", label: "Taux par voyage", type: "number", suffix: "$", defaultValue: 0 },
      { key: "flat_rate", label: "Forfait", type: "number", suffix: "$", defaultValue: 0 },
      { key: "minimum_charge", label: "Minimum facturable", type: "number", inList: true, suffix: "$", defaultValue: 0 },
      { key: "minimum_hours", label: "Heures minimum", type: "number", suffix: "h", defaultValue: 0 },
      { key: "distance_from_km", label: "Distance à partir de", type: "number", suffix: "km" },
      { key: "distance_to_km", label: "Distance jusqu'à", type: "number", suffix: "km" },
      { key: "notes", label: "Notes", type: "textarea", confidential: true },
      sortField,
      activeField,
    ],
  },
  {
    id: "zones",
    table: "jsc_zones",
    title: "Zones desservies",
    singular: "Zone",
    description: "Territoires couverts par Transport JSC et surcharges de distance associées.",
    icon: "Globe2",
    labelField: "name",
    orderBy: [{ column: "sort_order", ascending: true }, { column: "name", ascending: true }],
    fields: [
      { key: "name", label: "Nom", type: "text", inList: true, required: true },
      { key: "code", label: "Code", type: "text", inList: true },
      { key: "region", label: "Région", type: "text", inList: true },
      { key: "center_address", label: "Adresse du centre", type: "text" },
      { key: "center_lat", label: "Latitude du centre", type: "number" },
      { key: "center_lng", label: "Longitude du centre", type: "number" },
      { key: "radius_km", label: "Rayon", type: "number", inList: true, suffix: "km" },
      { key: "distance_surcharge", label: "Surcharge", type: "number", inList: true, suffix: "$", defaultValue: 0 },
      { key: "notes", label: "Notes", type: "textarea", confidential: true },
      sortField,
      activeField,
    ],
  },
  {
    id: "taxes",
    table: "jsc_taxes",
    title: "Taxes",
    singular: "Taxe",
    description: "Taxes applicables aux soumissions et aux factures.",
    icon: "Percent",
    labelField: "name",
    orderBy: [{ column: "apply_order", ascending: true }],
    fields: [
      { key: "name", label: "Nom", type: "text", inList: true, required: true, placeholder: "ex. TPS" },
      { key: "code", label: "Code", type: "text", inList: true },
      { key: "rate_percent", label: "Taux", type: "number", inList: true, suffix: "%", defaultValue: 0 },
      { key: "registration_number", label: "Numéro d'inscription", type: "text" },
      { key: "apply_order", label: "Ordre d'application", type: "number", inList: true, defaultValue: 0 },
      { key: "compound", label: "Taxe composée", type: "boolean", defaultValue: false, help: "Calculée sur le sous-total incluant les taxes précédentes." },
      activeField,
    ],
  },
  {
    id: "settings",
    table: "jsc_settings",
    title: "Paramètres du système",
    singular: "Paramètre",
    description:
      "Toutes les valeurs de configuration globales. Chaque paramètre est lu par les modules à venir — aucune valeur en dur dans le code.",
    icon: "Settings2",
    labelField: "label",
    orderBy: [{ column: "category", ascending: true }, { column: "sort_order", ascending: true }],
    fields: [
      { key: "label", label: "Libellé", type: "text", inList: true, required: true },
      { key: "key", label: "Clé technique", type: "text", inList: true, required: true, help: "Identifiant utilisé par le système. À ne pas modifier une fois utilisé." },
      { key: "category", label: "Catégorie", type: "text", inList: true, defaultValue: "general" },
      {
        key: "value_type", label: "Type de valeur", type: "select", inList: true, defaultValue: "number",
        options: [
          { value: "number", label: "Nombre" },
          { value: "text", label: "Texte" },
          { value: "boolean", label: "Oui / Non" },
        ],
      },
      { key: "value", label: "Valeur", type: "text", inList: true },
      { key: "unit", label: "Unité", type: "text" },
      { key: "description", label: "Description", type: "textarea" },
      sortField,
      activeField,
    ],
  },
];

export const getResource = (id: string) => JSC_RESOURCES.find((r) => r.id === id);

// Module transverse : transporteurs (architecture multi-transporteur).
// Vrac Québec est la plateforme; chaque transporteur (Transport JSC en premier)
// possède ses camions, tarifs, disponibilités et paramètres. Chaque
// enregistrement de chaque module est rattaché à un transporteur.
export const JSC_COMPANY_RESOURCE: ResourceDef = {
  id: "carriers",
  table: "jsc_companies",
  title: "Transporteurs",
  singular: "Transporteur",
  description:
    "Transporteurs partenaires de la plateforme. Camions, tarifs et paramètres sont cloisonnés par transporteur. Ajouter un transporteur ne demande aucune modification du système.",
  icon: "Building",
  labelField: "name",
  orderBy: [{ column: "created_at", ascending: true }],
  fields: [
    { key: "name", label: "Nom", type: "text", inList: true, required: true },
    { key: "legal_name", label: "Raison sociale", type: "text" },
    { key: "code", label: "Code", type: "text", inList: true, required: true, placeholder: "ex. JSC" },
    { key: "phone", label: "Téléphone", type: "text", inList: true },
    { key: "email", label: "Courriel", type: "text" },
    { key: "address", label: "Adresse", type: "text" },
    { key: "currency", label: "Devise", type: "text", inList: true, defaultValue: "CAD" },
    { key: "timezone", label: "Fuseau horaire", type: "text", defaultValue: "America/Toronto" },
    { key: "is_default", label: "Transporteur par défaut", type: "boolean", inList: true, defaultValue: false },
    activeField,
  ],
};