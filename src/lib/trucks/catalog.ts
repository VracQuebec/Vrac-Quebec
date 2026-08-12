// ============================================================
// SOURCE DE VÉRITÉ UNIQUE — TYPES DE CAMIONS
// ------------------------------------------------------------
// Les identifiants correspondent exactement à l'énum Postgres
// `public.truck_type` (aucune nomenclature parallèle).
// Les CAPACITÉS ne sont PAS définies ici : elles proviennent de
// l'administration (`jsc_trucks`). Aucune valeur inventée.
// ============================================================

export type TruckTypeKey =
  | "6_roues" | "10_roues" | "12_roues" | "semi_remorque" | "fardier" | "autre";

/** vrac = transport de matériaux ; machinerie = transport d'équipement. */
export type TruckUsage = "vrac" | "machinerie" | "autre";

export interface TruckTypeDef {
  key: TruckTypeKey;
  label: string;
  description: string;
  usage: TruckUsage;
  /** Camion lourd (contrainte d'accès chantier). */
  heavy: boolean;
  order: number;
  /** Peut transporter des matériaux en vrac (calcul de voyages). */
  bulk: boolean;
}

export const TRUCK_TYPES: TruckTypeDef[] = [
  {
    key: "6_roues",
    label: "Camion 6 roues",
    description:
      "Petit camion dompeur utilisé pour les livraisons en espace restreint.",
    usage: "vrac", heavy: false, order: 1, bulk: true,
  },
  {
    key: "10_roues",
    label: "Camion 10 roues",
    description:
      "Camion dompeur à deux essieux arrière utilisé pour le transport de matériaux en vrac.",
    usage: "vrac", heavy: true, order: 2, bulk: true,
  },
  {
    key: "12_roues",
    label: "Camion 12 roues",
    description:
      "Camion dompeur tri-essieux utilisé pour transporter une charge de matériaux en vrac plus importante qu'un 10 roues.",
    usage: "vrac", heavy: true, order: 3, bulk: true,
  },
  {
    key: "semi_remorque",
    label: "Semi-dompeur",
    description:
      "Tracteur routier avec semi-remorque dompeuse destiné au transport de grandes quantités de matériaux en vrac.",
    usage: "vrac", heavy: true, order: 4, bulk: true,
  },
  {
    key: "fardier",
    label: "Fardier",
    description:
      "Tracteur avec remorque surbaissée destiné principalement au transport de machinerie lourde.",
    usage: "machinerie", heavy: true, order: 5, bulk: false,
  },
  {
    key: "autre",
    label: "Autre",
    description: "Autre configuration de véhicule.",
    usage: "autre", heavy: false, order: 99, bulk: false,
  },
];

export const TRUCK_TYPE_KEYS = TRUCK_TYPES.map((t) => t.key);

export const truckTypeDef = (key: string | null | undefined): TruckTypeDef | null =>
  TRUCK_TYPES.find((t) => t.key === key) ?? null;

export const truckTypeLabel = (key: string | null | undefined): string =>
  truckTypeDef(key)?.label ?? (key ? String(key) : "—");

/** Types utilisables pour un calcul de voyages de matériaux en vrac. */
export const BULK_TRUCK_TYPES = TRUCK_TYPES.filter((t) => t.bulk);

export const isBulkTruck = (key: string | null | undefined) =>
  truckTypeDef(key)?.bulk === true;

const strip = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Normalisation contrôlée des variantes historiques
 * (« 12 roues », « 12-roues », « camion 12 roues », « semi », …)
 * vers l'identifiant officiel. Les anciennes données restent lisibles.
 */
export const normalizeTruckType = (raw: string): TruckTypeKey | null => {
  const s = strip(raw || "");
  if (!s) return null;
  if (/fardier|lowbed|low bed|plateforme|surbaisse/.test(s)) return "fardier";
  if (/semi|remorque|train routier|dompeur\s*semi/.test(s)) return "semi_remorque";
  if (/\b12\b|douze/.test(s)) return "12_roues";
  if (/\b10\b|dix/.test(s)) return "10_roues";
  if (/\b6\b|six/.test(s)) return "6_roues";
  return null;
};
