// ============================================================
// Continuité de données : /depot-materiaux (demande créée dans
// `submissions`) → entrepreneur connecté → /entrepreneur/comparateur.
// Ce module ne fait QUE transporter des données déjà enregistrées :
// aucune conversion d'unité, aucun calcul, aucune donnée inventée.
// ============================================================
import { normalizeMaterial, normalizeTruck, type MaterialKey, type TruckKey } from "@/lib/entrepreneur/site-match";

export const HANDOFF_KEY = "vq_parcours_handoff_v1";

export interface ParcoursHandoff {
  /** Identifiant réel de la ligne créée dans `submissions`. */
  submissionId: string | null;
  address: string;
  coords: { lat: number; lng: number } | null;
  /** Matériau tel que saisi (libellé du parcours) + clé normalisée. */
  material: string;
  materialKey: MaterialKey | null;
  materials: string[];
  /** Quantité conservée telle quelle : valeur ET unité séparées. */
  quantityValue: string;
  quantityUnit: string;
  quantityLabel: string;
  truckType: string;
  truckKey: TruckKey | null;
  desiredDate: string;
  timeframe: string;
  accessHeavyTruck: string;
  accessDetails: string[];
  createdAt: number;
}

export interface HandoffInput {
  submissionId?: string | null;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  materials?: string[];
  quantityValue?: string;
  quantityUnit?: string;
  quantityLabel?: string;
  truckType?: string;
  desiredDate?: string;
  timeframe?: string;
  accessHeavyTruck?: string;
  accessDetails?: string[];
}

/** Construit l'objet de transmission à partir des valeurs réellement envoyées. */
export const buildHandoff = (input: HandoffInput): ParcoursHandoff => {
  const materials = (input.materials ?? []).filter((m) => typeof m === "string" && m.trim());
  const material = materials[0] ?? "";
  const truckType = (input.truckType ?? "").trim();
  const hasCoords = typeof input.lat === "number" && typeof input.lng === "number";
  return {
    submissionId: input.submissionId ?? null,
    address: input.address ?? "",
    // Aucune coordonnée inventée : si Google Places n'a pas validé, on reste null.
    coords: hasCoords ? { lat: input.lat as number, lng: input.lng as number } : null,
    material,
    materialKey: material ? normalizeMaterial(material) : null,
    materials,
    quantityValue: (input.quantityValue ?? "").trim(),
    quantityUnit: input.quantityUnit ?? "",
    quantityLabel: input.quantityLabel ?? "",
    truckType,
    truckKey: truckType ? normalizeTruck(truckType) : null,
    desiredDate: input.desiredDate ?? "",
    timeframe: input.timeframe ?? "",
    accessHeavyTruck: input.accessHeavyTruck ?? "",
    accessDetails: input.accessDetails ?? [],
    createdAt: Date.now(),
  };
};

/** Nombre de voyages : uniquement si la quantité est DÉJÀ exprimée en voyages. */
export const tripsFromHandoff = (h: ParcoursHandoff): string =>
  h.quantityUnit === "voyages" && h.quantityValue ? h.quantityValue : "";

export const saveHandoff = (h: ParcoursHandoff) => {
  try { sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(h)); } catch { /* quota */ }
};

export const loadHandoff = (): ParcoursHandoff | null => {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ParcoursHandoff;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch { return null; }
};

export const clearHandoff = () => {
  try { sessionStorage.removeItem(HANDOFF_KEY); } catch { /* ignore */ }
};
