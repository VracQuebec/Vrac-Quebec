// ============================================================
// MOTEUR DE PROXIMITÉ — PHASE 1 : CONTRAT DÉTERMINISTE.
// Aucune carte, aucune coordonnée, aucune distance, aucun rayon,
// aucun géocodage, aucun matchmaking, aucune notification.
// Lecture seule : ce module ne touche ni la base, ni l'annuaire,
// ni les RLS, ni le CRM.
// ============================================================

import { geoKey, resolveCity, resolveProvince } from "./geo-referentiel";
import type { PublicLocalisation } from "./localisation";

/** Résultats explicites du contrat de proximité. Aucun autre état possible. */
export type ProximityRelation =
  | "same_city"
  | "same_region"
  | "same_province"
  | "different_province"
  | "unknown";

/**
 * Entrée du moteur : uniquement la projection PUBLIQUE de la localisation,
 * plus le drapeau de visibilité réseau (utilisé seulement par le helper
 * de candidature publique — le contrat de base n'en dépend pas).
 */
export interface ProximityProfile {
  localisation: PublicLocalisation;
  isNetworkVisible?: boolean;
}

export interface ProximityResult {
  relation: ProximityRelation;
  /** Raison déterministe, utile aux tests et au débogage. */
  reason: string;
}

// ------------------------------------------------------------
// NORMALISATION — réutilise `geoKey` du référentiel existant.
// Aucune seconde logique concurrente, aucun fuzzy matching.
// ------------------------------------------------------------

const key = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const k = geoKey(value);
  return k ? k : null;
};

/** Code de province certain, ou null (jamais deviné, jamais via code postal). */
export const normalizeProvinceCode = (value: unknown): string | null =>
  resolveProvince(value)?.code ?? null;

/**
 * Clé de ville normalisée. Si la ville est répertoriée, on utilise le nom
 * officiel du référentiel afin que « Quebec » et « Québec » convergent.
 * Sinon on garde la ville telle que saisie, normalisée : la comparaison
 * reste EXACTE après normalisation (« Québec » ≠ « Québec-Est »).
 */
export const normalizeCityKey = (
  city: unknown,
  provinceCode?: string | null,
): string | null => {
  const raw = key(city);
  if (!raw) return null;
  const ref = resolveCity(city, provinceCode ?? undefined);
  return ref ? geoKey(ref.name) : raw;
};

/**
 * Région administrative certaine :
 * - la région déjà normalisée si elle est présente;
 * - sinon la région du référentiel ville+QC.
 * Jamais déduite d'un code postal, jamais inventée hors Québec.
 */
export const normalizeRegionKey = (
  loc: PublicLocalisation,
  provinceCode: string | null,
): string | null => {
  if (provinceCode !== "QC") return null;
  const declared = key(loc.region);
  if (declared) return declared;
  const ref = resolveCity(loc.city, "QC");
  return ref ? geoKey(ref.region) : null;
};

// ------------------------------------------------------------
// CONTRAT
// ------------------------------------------------------------

/**
 * « Ces deux profils appartiennent-ils à une même zone de proximité logique ? »
 * Hiérarchie : ville > région > province. Le secteur postal n'est JAMAIS
 * utilisé pour décider (information complémentaire uniquement).
 */
export const compareProximity = (
  a: ProximityProfile | null | undefined,
  b: ProximityProfile | null | undefined,
): ProximityResult => {
  if (!a?.localisation || !b?.localisation) {
    return { relation: "unknown", reason: "profil_manquant" };
  }

  const pa = normalizeProvinceCode(a.localisation.province);
  const pb = normalizeProvinceCode(b.localisation.province);

  if (!pa || !pb) return { relation: "unknown", reason: "province_inconnue" };
  if (pa !== pb) return { relation: "different_province", reason: "provinces_differentes" };

  const ca = normalizeCityKey(a.localisation.city, pa);
  const cb = normalizeCityKey(b.localisation.city, pb);
  if (ca && cb && ca === cb) return { relation: "same_city", reason: "ville_identique" };

  const ra = normalizeRegionKey(a.localisation, pa);
  const rb = normalizeRegionKey(b.localisation, pb);
  if (ra && rb && ra === rb) return { relation: "same_region", reason: "region_identique" };

  if (!ca || !cb) return { relation: "unknown", reason: "ville_inconnue" };

  return { relation: "same_province", reason: "province_identique" };
};

/** Sucre syntaxique : même zone logique (ville OU région). */
export const isSameLocalZone = (
  a: ProximityProfile | null | undefined,
  b: ProximityProfile | null | undefined,
): boolean => {
  const r = compareProximity(a, b).relation;
  return r === "same_city" || r === "same_region";
};

/**
 * Un profil ne peut être candidat public que s'il est explicitement visible.
 * Ce helper ne modifie PAS l'annuaire existant : il prépare la phase suivante.
 */
export const isPublicCandidate = (
  profile: ProximityProfile | null | undefined,
): boolean => profile?.isNetworkVisible === true;

/** Ordre de priorité (le plus proche d'abord) — sans aucune distance. */
export const PROXIMITY_RANK: Record<ProximityRelation, number> = {
  same_city: 0,
  same_region: 1,
  same_province: 2,
  different_province: 3,
  unknown: 4,
};
