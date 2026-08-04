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
    { key: "public_description", label: "Description", type: "textarea" },
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
    { key: "address", label: "Adresse complète", type: "text", inList: true },
    { key: "city", label: "Ville", type: "text", inList: true },
    { key: "postal_code", label: "Code postal", type: "text" },
    { key: "latitude", label: "Latitude (GPS)", type: "number", inList: true },
    { key: "longitude", label: "Longitude (GPS)", type: "number", inList: true },
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
  type: "number" | "select";
  unit?: string;
  options?: { value: string; label: string }[];
};

/** Section 5 — Paramètres généraux (stockés dans jsc_settings) */
export const SOUMISSION_SETTINGS: SettingDef[] = [
  {
    key: "min_trip_minutes",
    label: "Temps minimum facturable",
    help: "Durée plancher facturée pour un voyage, peu importe la distance.",
    type: "number",
    unit: "min",
  },
  {
    key: "loading_time_minutes",
    label: "Temps de chargement",
    help: "Temps immobilisé à la carrière, par voyage.",
    type: "number",
    unit: "min",
  },
  {
    key: "unloading_time_minutes",
    label: "Temps de déchargement",
    help: "Temps immobilisé au chantier, par voyage.",
    type: "number",
    unit: "min",
  },
  {
    key: "buffer_time_minutes",
    label: "Temps tampon",
    help: "Marge ajoutée à chaque voyage (circulation, attente, manœuvres).",
    type: "number",
    unit: "min",
  },
  {
    key: "rounding_method",
    label: "Méthode d'arrondissement",
    help: "Façon dont les temps et les voyages seront arrondis par le moteur.",
    type: "select",
    options: [
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
  },
];

export const SOUMISSION_SECTIONS: ResourceDef[] = [
  SOUMISSION_MATERIALS,
  SOUMISSION_QUARRIES,
  SOUMISSION_TRUCKS,
  SOUMISSION_TAXES,
];
