// ============================================================
// « ANNUAIRE PROFESSIONNEL DES ENTREPRENEURS » — V1, LECTURE SEULE.
// Source unique : RPC serveur `get_entrepreneur_directory()`
// (SECURITY DEFINER, réservée aux comptes connectés) qui ne retourne
// QUE des colonnes professionnelles publiques.
// Interdits assumés en V1 : carte, latitude/longitude, distance, rayon,
// proximité, géocodage, matchmaking, recommandations, messagerie.
// Aucune donnée n'est inventée : un champ absent reste absent.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { RpcClient } from "@/lib/parcours/validation";
import { geoKey } from "@/lib/parcours/geo-referentiel";
import type { PublicLocalisation } from "@/lib/parcours/localisation";
import {
  compareProximity,
  PROXIMITY_RANK,
  type ProximityRelation,
} from "@/lib/parcours/proximite";

/** Champs publics — strictement ceux retournés par la RPC. */
export interface AnnuaireProfil {
  id: string;
  company: string;
  city: string | null;
  province: string | null;
  provinceName: string | null;
  region: string | null;
  postalSector: string | null;
  truckTypes: string[];
  truckCount: string | null;
  /** Libellé de localisation construit uniquement avec des valeurs réelles. */
  locationLabel: string | null;
  /** true si ville ET province sont réellement connues. */
  locationComplete: boolean;
  /** Relation de proximité avec le profil de référence (jamais une distance). */
  proximity: ProximityRelation;
}

export type AnnuaireResult =
  | { state: "ok"; profils: AnnuaireProfil[] }
  | { state: "unauthorized" }
  | { state: "error"; message: string };

export interface AnnuaireFilters {
  query: string;
  province: string;
  region: string;
  city: string;
  truckType: string;
  /** "" = Tous. Sinon same_city | same_region | same_province. */
  proximity: "" | "same_city" | "same_region" | "same_province";
}

export const EMPTY_FILTERS: AnnuaireFilters = {
  query: "",
  province: "",
  region: "",
  city: "",
  truckType: "",
  proximity: "",
};

/** Colonnes publiques demandées au serveur (aucun `select('*')`). */
export const PUBLIC_COLUMNS = [
  "id",
  "company",
  "city",
  "province",
  "province_name",
  "region",
  "postal_sector",
  "truck_types",
  "truck_count",
] as const;

/** Champs qui ne doivent JAMAIS apparaître dans l'annuaire. */
export const FORBIDDEN_COLUMNS = [
  "address",
  "billing_address",
  "email",
  "phone",
  "user_id",
  "notes",
  "tax_tps",
  "tax_tvq",
  "map_number",
  "postal_code",
  "latitude",
  "longitude",
] as const;

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
};

/** Projection publique d'une ligne renvoyée par la RPC. */
export const mapAnnuaireProfil = (row: unknown): AnnuaireProfil | null => {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = str(r.id);
  const company = str(r.company);
  if (!id || !company) return null;

  const city = str(r.city);
  const province = str(r.province);
  const provinceName = str(r.province_name);
  const region = str(r.region);
  const truckTypes = Array.isArray(r.truck_types)
    ? r.truck_types.map((t) => String(t ?? "").trim()).filter(Boolean)
    : [];

  const parts = [city, provinceName ?? province].filter(Boolean) as string[];
  return {
    id,
    company,
    city,
    province,
    provinceName,
    region,
    postalSector: str(r.postal_sector),
    truckTypes,
    truckCount: str(r.truck_count),
    locationLabel: parts.length ? parts.join(", ") : null,
    locationComplete: !!city && !!province,
    proximity: "unknown",
  };
};

/** Valeurs de filtres réellement présentes dans les données (aucune invention). */
export const buildFacets = (profils: AnnuaireProfil[]) => {
  const uniq = (values: (string | null)[]) =>
    Array.from(new Set(values.filter((v): v is string => !!v))).sort((a, b) =>
      a.localeCompare(b, "fr"),
    );
  return {
    provinces: uniq(profils.map((p) => p.provinceName ?? p.province)),
    regions: uniq(profils.map((p) => p.region)),
    cities: uniq(profils.map((p) => p.city)),
    truckTypes: uniq(profils.flatMap((p) => p.truckTypes)),
  };
};

const match = (a: string | null, b: string): boolean =>
  !!a && geoKey(a) === geoKey(b);

// ------------------------------------------------------------
// PROXIMITÉ — lecture seule, aucune distance, aucune coordonnée.
// Le contrat déterministe `compareProximity` est la seule source.
// ------------------------------------------------------------

/** Projection publique d'un profil d'annuaire vers le contrat de proximité. */
export const toProximityLocalisation = (p: AnnuaireProfil): PublicLocalisation => ({
  city: p.city,
  province: p.province,
  provinceName: p.provinceName,
  region: p.region,
  postalSector: p.postalSector,
});

/**
 * Annote chaque profil avec sa relation de proximité puis trie de façon
 * STABLE selon `PROXIMITY_RANK` (égalité = ordre serveur conservé).
 * Sans profil de référence, l'ordre existant est intégralement conservé.
 */
export const applyProximity = (
  profils: AnnuaireProfil[],
  reference: PublicLocalisation | null | undefined,
): AnnuaireProfil[] => {
  if (!reference) return profils.map((p) => ({ ...p, proximity: "unknown" as const }));
  const annotated = profils.map((p, index) => ({
    p: {
      ...p,
      proximity: compareProximity(
        { localisation: reference },
        { localisation: toProximityLocalisation(p) },
      ).relation,
    },
    index,
  }));
  annotated.sort(
    (a, b) =>
      PROXIMITY_RANK[a.p.proximity] - PROXIMITY_RANK[b.p.proximity] || a.index - b.index,
  );
  return annotated.map((a) => a.p);
};

/** Libellé simple, sans kilomètre ni carte. */
export const proximityLabel = (relation: ProximityRelation): string | null => {
  switch (relation) {
    case "same_city": return "Même ville";
    case "same_region": return "Même région";
    case "same_province": return "Même province";
    default: return null;
  }
};

/** Recherche textuelle déterministe sur les champs publics uniquement. */
export const filterAnnuaire = (
  profils: AnnuaireProfil[],
  filters: AnnuaireFilters,
): AnnuaireProfil[] => {
  const q = geoKey(filters.query ?? "");
  return profils.filter((p) => {
    if (filters.proximity && p.proximity !== filters.proximity) return false;
    if (filters.province && !(match(p.provinceName, filters.province) || match(p.province, filters.province)))
      return false;
    if (filters.region && !match(p.region, filters.region)) return false;
    if (filters.city && !match(p.city, filters.city)) return false;
    if (filters.truckType && !p.truckTypes.some((t) => match(t, filters.truckType))) return false;
    if (!q) return true;
    const haystack = [
      p.company,
      p.city,
      p.province,
      p.provinceName,
      p.region,
      ...p.truckTypes,
    ]
      .filter(Boolean)
      .map((v) => geoKey(String(v)))
      .join(" ");
    return haystack.includes(q);
  });
};

/** Charge l'annuaire. Aucun identifiant client transmis, aucun filtre serveur contourné. */
export const loadAnnuaire = async (
  client: RpcClient = supabase as unknown as RpcClient,
): Promise<AnnuaireResult> => {
  try {
    const { data, error } = await client.rpc("get_entrepreneur_directory", {});
    if (error) {
      const m = (error.message || "").toLowerCase();
      if (m.includes("not_authorized") || m.includes("permission") || m.includes("jwt")) {
        return { state: "unauthorized" };
      }
      return { state: "error", message: error.message || "Lecture impossible." };
    }
    const rows = Array.isArray(data) ? data : [];
    return {
      state: "ok",
      profils: rows
        .map(mapAnnuaireProfil)
        .filter((p): p is AnnuaireProfil => p !== null),
    };
  } catch (e) {
    return { state: "error", message: (e as Error)?.message || "Lecture impossible." };
  }
};
