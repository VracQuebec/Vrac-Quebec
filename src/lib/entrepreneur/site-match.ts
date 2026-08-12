// ============================================================
// Compatibilité site de dépôt ↔ demande (matériau, camion, accès,
// disponibilité). Aucune donnée inventée : lorsqu'une information
// essentielle est absente, le statut est « À CONFIRMER ».
// La nomenclature réutilise les matériaux réellement présents dans
// `submissions.materials` et les types de camions de l'énum
// `public.truck_type`.
// ============================================================

export type MaterialKey =
  | "terre" | "terre_vegetale" | "sable" | "gravier" | "pierre"
  | "roc" | "beton" | "asphalte" | "remblai" | "autre";

export const MATERIAL_OPTIONS: { key: MaterialKey; label: string }[] = [
  { key: "terre", label: "Terre" },
  { key: "terre_vegetale", label: "Terre végétale" },
  { key: "sable", label: "Sable" },
  { key: "gravier", label: "Gravier" },
  { key: "pierre", label: "Pierre" },
  { key: "roc", label: "Roc / roches" },
  { key: "beton", label: "Béton" },
  { key: "asphalte", label: "Asphalte" },
  { key: "remblai", label: "Remblai / remplissage" },
];

/** Types de camions : source de vérité unique `@/lib/trucks/catalog`. */
export type TruckKey = Exclude<TruckTypeKey, "autre">;

export const TRUCK_OPTIONS: { key: TruckKey; label: string; heavy: boolean; bulk: boolean }[] =
  TRUCK_TYPES.filter((t) => t.key !== "autre").map((t) => ({
    key: t.key as TruckKey, label: t.label, heavy: t.heavy, bulk: t.bulk,
  }));

/** Camions pertinents pour choisir un site de dépôt de matériaux en vrac.
 *  Le fardier (machinerie) n'intervient que si le parcours le concerne. */
export const BULK_TRUCK_OPTIONS = TRUCK_OPTIONS.filter((t) => t.bulk);

const strip = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const normalizeMaterial = (raw: string): MaterialKey | null => {
  const s = strip(raw || "").trim();
  if (!s) return null;
  if (/terre\s*(vegetal|noire)|humus/.test(s)) return "terre_vegetale";
  if (/asphalt|planage|pavage/.test(s)) return "asphalte";
  if (/beton|ciment|dalle/.test(s)) return "beton";
  if (/concass|poussiere de pierre|pierre/.test(s)) return "pierre";
  if (/roc\b|roche/.test(s)) return "roc";
  if (/gravier/.test(s)) return "gravier";
  if (/sable/.test(s)) return "sable";
  if (/remblai|remplissage/.test(s)) return "remblai";
  if (/terre|glaise|argile/.test(s)) return "terre";
  return null;
};

export const normalizeTruck = (raw: string): TruckKey | null => {
  const k = normalizeTruckType(raw);
  return k && k !== "autre" ? (k as TruckKey) : null;
};

export type Compat = "compatible" | "unknown" | "incompatible";

export interface SiteLike {
  materials: string[] | null;
  other_material?: string | null;
  truck_types_allowed: string[] | null;
  accessibility: string[] | null;
  access_heavy_truck?: string | null;
  access_details?: Record<string, unknown> | null;
  availability_status: string | null;
  availability_updated_at: string | null;
}

export const siteMaterialKeys = (s: SiteLike): MaterialKey[] => {
  const set = new Set<MaterialKey>();
  [...(s.materials ?? []), s.other_material ?? ""].forEach((m) => {
    const k = normalizeMaterial(m);
    if (k) set.add(k);
  });
  return Array.from(set);
};

export const siteTruckKeys = (s: SiteLike): TruckKey[] => {
  const set = new Set<TruckKey>();
  [...(s.truck_types_allowed ?? []), ...(s.accessibility ?? [])].forEach((t) => {
    const k = normalizeTruck(t);
    if (k) set.add(k);
    // « 12 roues et semi-remorque 2 essieux » contient deux types.
    if (/semi/i.test(t)) set.add("semi_remorque");
    if (/\b12\b/.test(t)) set.add("12_roues");
    if (/\b10\b/.test(t)) set.add("10_roues");
  });
  return Array.from(set);
};

/** Un site « remblai » accepte des matériaux de remplissage, mais sans
 *  confirmation explicite du matériau demandé on reste à « à confirmer ». */
const FILL_MATERIALS: MaterialKey[] = ["terre", "terre_vegetale", "sable", "gravier", "pierre"];

export const materialCompat = (s: SiteLike, requested: MaterialKey | null): Compat => {
  if (!requested) return "unknown";
  const keys = siteMaterialKeys(s);
  if (keys.length === 0) return "unknown";
  if (keys.includes(requested)) return "compatible";
  if (keys.includes("remblai") && FILL_MATERIALS.includes(requested)) return "unknown";
  return "incompatible";
};

export const truckCompat = (s: SiteLike, requested: TruckKey | null): Compat => {
  if (!requested) return "unknown";
  const heavy = TRUCK_OPTIONS.find((t) => t.key === requested)?.heavy ?? false;
  const ht = strip(s.access_heavy_truck ?? "");
  if (heavy && /^(non|no|false)/.test(ht)) return "incompatible";
  const keys = siteTruckKeys(s);
  if (keys.length === 0) return heavy && /^(oui|yes|true)/.test(ht) ? "compatible" : "unknown";
  if (keys.includes(requested)) return "compatible";
  return "incompatible";
};

export type AvailabilityLevel = "available" | "approval" | "limited" | "unavailable" | "unknown";

export interface AvailabilityInfo {
  level: AvailabilityLevel;
  label: string;
  freshness: string;
  stale: boolean;
}

const STALE_DAYS = 30;

export const availabilityInfo = (s: SiteLike): AvailabilityInfo => {
  const raw = (s.availability_status ?? "").toLowerCase();
  const iso = s.availability_updated_at;
  const days = iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;
  const stale = days == null || days > STALE_DAYS;
  const freshness =
    days == null
      ? "Disponibilité jamais confirmée"
      : days <= 0
        ? "Mise à jour aujourd'hui"
        : days === 1
          ? "Mise à jour hier"
          : days <= STALE_DAYS
            ? `Mise à jour il y a ${days} jours`
            : `Mise à jour il y a ${days} jours — à reconfirmer`;

  if (raw === "unavailable") return { level: "unavailable", label: "Indisponible", freshness, stale };
  if (raw === "approval" || raw === "on_approval")
    return { level: "approval", label: "Sur approbation", freshness, stale };
  if (raw === "limited") return { level: "limited", label: "Disponibilité limitée", freshness, stale };
  if (raw === "available" && !stale)
    return { level: "available", label: "Disponible", freshness, stale };
  // Donnée vide OU périmée → jamais transformée en « Disponible ».
  return { level: "unknown", label: "À confirmer", freshness, stale };
};

export interface SiteEvaluation {
  material: Compat;
  truck: Compat;
  availability: AvailabilityInfo;
  status: Compat;
  reasons: string[];
}

export const evaluateSite = (
  s: SiteLike,
  requestedMaterial: MaterialKey | null,
  requestedTruck: TruckKey | null,
): SiteEvaluation => {
  const material = materialCompat(s, requestedMaterial);
  const truck = truckCompat(s, requestedTruck);
  const availability = availabilityInfo(s);
  const reasons: string[] = [];

  if (material === "incompatible") reasons.push("Matériau non accepté à ce site");
  else if (material === "unknown") reasons.push("Matériaux acceptés à confirmer");
  if (truck === "incompatible") reasons.push("Type de camion non accepté");
  else if (truck === "unknown") reasons.push("Camions acceptés à confirmer");
  if (availability.level === "unavailable") reasons.push("Site indisponible");
  else if (availability.level === "unknown") reasons.push("Disponibilité à confirmer");
  else if (availability.level !== "available") reasons.push(availability.label);

  let status: Compat = "compatible";
  if (material === "incompatible" || truck === "incompatible" || availability.level === "unavailable") {
    status = "incompatible";
  } else if (material !== "compatible" || truck !== "compatible" || availability.level !== "available") {
    status = "unknown";
  }
  return { material, truck, availability, status, reasons };
};

export const STATUS_META: Record<Compat, { label: string; cls: string; dot: string }> = {
  compatible: { label: "COMPATIBLE", cls: "bg-primary/15 text-primary border-primary/30", dot: "🟢" },
  unknown: { label: "À CONFIRMER", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30", dot: "🟡" },
  incompatible: { label: "NON COMPATIBLE", cls: "bg-destructive/10 text-destructive border-destructive/30", dot: "🔴" },
};

/** Contraintes d'accès lisibles (jamais de notes internes/admin). */
export const ACCESS_RESTRICTION_OPTIONS: { key: string; label: string }[] = [
  { key: "acces_etroit", label: "Accès étroit" },
  { key: "pente", label: "Pente" },
  { key: "sol_mou", label: "Sol mou" },
  { key: "virage_limite", label: "Espace de virage limité" },
  { key: "marche_arriere", label: "Marche arrière requise" },
  { key: "camion_lourd_restreint", label: "Restriction camion lourd" },
  { key: "hauteur_limitee", label: "Hauteur limitée" },
  { key: "largeur_limitee", label: "Largeur limitée" },
];

const RESTRICTION_LABELS: Record<string, string> = Object.fromEntries(
  ACCESS_RESTRICTION_OPTIONS.map((o) => [o.key, o.label]),
);

const restrictionLabel = (k: string) => RESTRICTION_LABELS[k] ?? k.replace(/_/g, " ");

export const accessConstraints = (s: SiteLike): string[] => {
  const out: string[] = [];
  const d = s.access_details;
  if (d && typeof d === "object") {
    Object.entries(d).forEach(([k, v]) => {
      if (v === true) out.push(restrictionLabel(k));
      else if (typeof v === "string" && v.trim() && !/^non?$/i.test(v.trim())) out.push(`${restrictionLabel(k)} : ${v}`);
    });
  }
  const ht = strip(s.access_heavy_truck ?? "");
  if (/^(non|no|false)/.test(ht)) out.push("Camions lourds non acceptés");
  return out.slice(0, 6);
};
