// ============================================================
// CONFIGURATION DES SOUMISSIONS (Transport JSC)
// ------------------------------------------------------------
// Déclare uniquement la STRUCTURE administrable qui alimentera
// le futur moteur de calcul : matériaux, carrières, camions,
// taxes et paramètres généraux.
// Aucun prix, aucune valeur métier n'est codé ici : tout vit en
// base (tables jsc_*) et se modifie depuis l'administration.
// ============================================================
import type { FieldDef, ResourceDef } from "@/lib/jsc/config";

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

/** Section 1 — Matériaux */
export const SOUMISSION_MATERIALS: ResourceDef = {
  id: "soum_materials",
  table: "jsc_materials",
  title: "Matériaux",
  singular: "Matériau",
  description:
    "Matériaux offerts, leur prix à la tonne et la carrière d'approvisionnement. Ajoutez de nouveaux matériaux sans modifier le code.",
  icon: "Layers",
  labelField: "name",
  orderBy: [{ column: "sort_order", ascending: true }, { column: "name", ascending: true }],
  companyScoped: true,
  fields: [
    { key: "name", label: "Nom du matériau", type: "text", inList: true, required: true },
    {
      key: "category_id", label: "Catégorie", type: "reference", inList: true,
      refTable: "jsc_material_categories", refLabel: "name",
      help: "Regroupement utilisé dans le catalogue et les filtres.",
    },
    { key: "selling_price", label: "Prix à la tonne", type: "number", inList: true, suffix: "$", defaultValue: 0 },
    {
      key: "pickup_location_id",
      label: "Carrière d'approvisionnement",
      type: "reference",
      inList: true,
      refTable: "jsc_pickup_locations",
      refLabel: "name",
      help: "Point de chargement utilisé par le moteur pour calculer la distance.",
    },
    { key: "cover_image_url", label: "Image (URL)", type: "text", help: "Photo du matériau utilisée dans les parcours publics." },
    { key: "public_description", label: "Description", type: "textarea" },
    { key: "density_kg_per_m3", label: "Densité", type: "number", suffix: "kg/m³", help: "Sert à convertir verges/m³ en tonnes." },
    { key: "is_taxable", label: "Taxable (TPS/TVQ)", type: "boolean", defaultValue: true },
    sortField,
    activeField,
  ],
};

/** Section 2 — Carrières */
export const SOUMISSION_QUARRIES: ResourceDef = {
  id: "soum_quarries",
  table: "jsc_pickup_locations",
  title: "Carrières",
  singular: "Carrière",
  description: "Lieux de chargement (carrières, sablières) auxquels les matériaux sont rattachés.",
  icon: "MapPin",
  labelField: "name",
  orderBy: [{ column: "sort_order", ascending: true }, { column: "name", ascending: true }],
  companyScoped: true,
  fields: [
    { key: "name", label: "Nom", type: "text", inList: true, required: true },
    {
      key: "location_type", label: "Type de fournisseur", type: "select", inList: true,
      defaultValue: "carriere",
      options: [
        { value: "carriere", label: "Carrière" },
        { value: "sabliere", label: "Sablière" },
        { value: "depot", label: "Dépôt" },
        { value: "recyclage", label: "Centre de recyclage" },
        { value: "garage", label: "Garage / point de départ" },
        { value: "autre", label: "Autre" },
      ],
      help: "Nature du site d'approvisionnement. « Garage » désigne le point de départ des camions.",
    },
    {
      key: "supplier_id", label: "Fournisseur", type: "reference",
      refTable: "jsc_suppliers", refLabel: "name",
      help: "Entreprise propriétaire du site. Optionnel si le site appartient à Transport JSC.",
    },
    { key: "address", label: "Adresse complète", type: "text", inList: true },
    { key: "city", label: "Ville", type: "text", inList: true },
    { key: "postal_code", label: "Code postal", type: "text" },
    { key: "latitude", label: "Latitude (GPS)", type: "number", inList: true },
    { key: "longitude", label: "Longitude (GPS)", type: "number", inList: true },
    { key: "loading_time_minutes", label: "Temps de chargement sur place", type: "number", suffix: "min", help: "Si vide, le moteur utilise le temps de chargement des paramètres généraux." },
    { key: "access_notes", label: "Notes d'accès", type: "textarea", help: "Matériaux disponibles, horaires, consignes. L'association matériau ↔ carrière se fait dans l'onglet Matériaux." },
    sortField,
    activeField,
  ],
};

/** Section 3 — Camions */
export const SOUMISSION_TRUCKS: ResourceDef = {
  id: "soum_trucks",
  table: "jsc_trucks",
  title: "Camions",
  singular: "Camion",
  description: "Flotte disponible : capacité maximale et tarif horaire. Aucun camion n'est codé dans le moteur.",
  icon: "Truck",
  labelField: "name",
  orderBy: [{ column: "sort_order", ascending: true }, { column: "name", ascending: true }],
  companyScoped: true,
  fields: [
    { key: "name", label: "Nom", type: "text", inList: true, required: true },
    {
      key: "truck_type", label: "Type", type: "select", inList: true,
      options: [
        { value: "6_roues", label: "6 roues" },
        { value: "10_roues", label: "10 roues" },
        { value: "12_roues", label: "12 roues" },
        { value: "semi_remorque", label: "Semi-remorque" },
        { value: "fardier", label: "Fardier" },
        { value: "autre", label: "Autre" },
      ],
    },
    { key: "capacity_tonnes", label: "Capacité maximale", type: "number", inList: true, suffix: "t" },
    { key: "hourly_rate", label: "Tarif horaire", type: "number", inList: true, suffix: "$/h" },
    sortField,
    activeField,
  ],
};

/** Section 4 — Taxes */
export const SOUMISSION_TAXES: ResourceDef = {
  id: "soum_taxes",
  table: "jsc_taxes",
  title: "Taxes",
  singular: "Taxe",
  description: "Taux de TPS et de TVQ appliqués aux soumissions. Modifiables en tout temps.",
  icon: "Percent",
  labelField: "name",
  orderBy: [{ column: "apply_order", ascending: true }],
  companyScoped: true,
  fields: [
    { key: "name", label: "Nom", type: "text", inList: true, required: true },
    { key: "code", label: "Code", type: "text", inList: true, placeholder: "TPS / TVQ" },
    { key: "rate_percent", label: "Taux", type: "number", inList: true, suffix: "%", defaultValue: 0 },
    { key: "registration_number", label: "Numéro d'enregistrement", type: "text" },
    { key: "apply_order", label: "Ordre d'application", type: "number", defaultValue: 1 },
    activeField,
  ],
};

export type SettingDef = {
  key: string;
  label: string;
  help: string;
  type: "number" | "select" | "reference";
  unit?: string;
  options?: { value: string; label: string }[];
  /** Table source pour un paramètre de type « reference » (liste déroulante). */
  refTable?: string;
  refLabel?: string;
  /** Regroupement dans l'écran des paramètres. */
  group?: "operation" | "financier";
};

/** Section 3 — Catégories de matériaux */
export const SOUMISSION_CATEGORIES: ResourceDef = {
  id: "soum_categories",
  table: "jsc_material_categories",
  title: "Catégories",
  singular: "Catégorie",
  description: "Familles de matériaux (terre, sable, pierre, remblai…) utilisées par le catalogue et les filtres.",
  icon: "Layers",
  labelField: "name",
  orderBy: [{ column: "sort_order", ascending: true }, { column: "name", ascending: true }],
  companyScoped: true,
  fields: [
    { key: "name", label: "Nom", type: "text", inList: true, required: true },
    { key: "code", label: "Code", type: "text", inList: true },
    { key: "description", label: "Description", type: "textarea" },
    sortField,
    activeField,
  ],
};

/** Section 4 — Fournisseurs */
export const SOUMISSION_SUPPLIERS: ResourceDef = {
  id: "soum_suppliers",
  table: "jsc_suppliers",
  title: "Fournisseurs",
  singular: "Fournisseur",
  description: "Entreprises qui approvisionnent les matériaux. Chaque carrière peut être rattachée à un fournisseur.",
  icon: "Building2",
  labelField: "name",
  orderBy: [{ column: "sort_order", ascending: true }, { column: "name", ascending: true }],
  companyScoped: true,
  fields: [
    { key: "name", label: "Nom", type: "text", inList: true, required: true },
    { key: "contact_name", label: "Personne-ressource", type: "text", inList: true },
    { key: "phone", label: "Téléphone", type: "text", inList: true },
    { key: "email", label: "Courriel", type: "text", inList: true },
    { key: "address", label: "Adresse", type: "text" },
    { key: "city", label: "Ville", type: "text", inList: true },
    { key: "postal_code", label: "Code postal", type: "text" },
    { key: "website", label: "Site web", type: "text" },
    { key: "opening_hours", label: "Heures d'ouverture", type: "text" },
    { key: "payment_terms", label: "Conditions de paiement", type: "text", confidential: true },
    {
      key: "internal_notes", label: "Notes internes", type: "textarea", confidential: true,
      help: "Matériaux fournis, ententes, particularités. Jamais visible du client.",
    },
    sortField,
    activeField,
  ],
};

/** Section 5 — Paramètres généraux (stockés dans jsc_settings) */
export const SOUMISSION_SETTINGS: SettingDef[] = [
  {
    key: "base_location_id",
    label: "Point de départ des camions (garage)",
    help:
      "Lieu d'où partent et où reviennent les camions (ex. Logipark). Le moteur calcule le cycle garage → carrière → client → garage.",
    type: "reference",
    refTable: "jsc_pickup_locations",
    refLabel: "name",
    group: "operation",
  },
  {
    key: "min_trip_minutes",
    label: "Temps minimum facturable",
    help: "Durée plancher facturée pour un voyage, peu importe la distance.",
    type: "number",
    unit: "min",
    group: "operation",
  },
  {
    key: "loading_time_minutes",
    label: "Temps de chargement",
    help: "Temps immobilisé à la carrière, par voyage.",
    type: "number",
    unit: "min",
    group: "operation",
  },
  {
    key: "unloading_time_minutes",
    label: "Temps de déchargement",
    help: "Temps immobilisé au chantier, par voyage.",
    type: "number",
    unit: "min",
    group: "operation",
  },
  {
    key: "buffer_time_minutes",
    label: "Temps tampon",
    help: "Marge ajoutée à chaque voyage (circulation, attente, manœuvres).",
    type: "number",
    unit: "min",
    group: "operation",
  },
  {
    key: "rounding_method",
    label: "Méthode d'arrondissement",
    help: "Façon dont les temps et les voyages seront arrondis par le moteur.",
    type: "select",
    group: "operation",
    options: [
      { value: "superieur_strict", label: "Palier supérieur suivant (méthode JSC)" },
      { value: "superieur", label: "Toujours au supérieur" },
      { value: "inferieur", label: "Toujours à l'inférieur" },
      { value: "proche", label: "Au plus proche" },
    ],
  },
  {
    key: "time_rounding_minutes",
    label: "Pas d'arrondissement du temps",
    help: "Incrément utilisé pour arrondir la durée d'un voyage (ex. 15 minutes).",
    type: "number",
    unit: "min",
    group: "operation",
  },
  {
    key: "price_rounding_decimals",
    label: "Décimales des montants",
    help: "Nombre de décimales conservées sur tous les montants calculés.",
    type: "number",
    group: "financier",
  },
  {
    key: "margin_percent",
    label: "Marge",
    help: "Marge appliquée sur (matériau + transport + frais). 0 = aucune marge.",
    type: "number",
    unit: "%",
    group: "financier",
  },
  {
    key: "administration_fee_amount",
    label: "Frais administratifs",
    help: "Montant fixe ajouté à chaque soumission.",
    type: "number",
    unit: "$",
    group: "financier",
  },
  {
    key: "environmental_fee_per_tonne",
    label: "Frais environnementaux",
    help: "Montant facturé par tonne transportée.",
    type: "number",
    unit: "$/t",
    group: "financier",
  },
  {
    key: "fuel_surcharge_percent",
    label: "Supplément carburant",
    help: "Pourcentage appliqué sur le coût de transport.",
    type: "number",
    unit: "%",
    group: "financier",
  },
  {
    key: "distance_surcharge_per_km",
    label: "Supplément kilométrique",
    help: "Montant facturé par kilomètre du cycle complet.",
    type: "number",
    unit: "$/km",
    group: "financier",
  },
  {
    key: "trip_fee_amount",
    label: "Frais par voyage",
    help: "Montant fixe facturé pour chaque voyage planifié.",
    type: "number",
    unit: "$",
    group: "financier",
  },
  {
    key: "quote_validity_days",
    label: "Validité des soumissions",
    help: "Nombre de jours durant lesquels une soumission demeure valide.",
    type: "number",
    unit: "jours",
    group: "financier",
  },
];

export const SOUMISSION_SECTIONS: ResourceDef[] = [
  SOUMISSION_MATERIALS,
  SOUMISSION_CATEGORIES,
  SOUMISSION_QUARRIES,
  SOUMISSION_SUPPLIERS,
  SOUMISSION_TRUCKS,
  SOUMISSION_TAXES,
];
