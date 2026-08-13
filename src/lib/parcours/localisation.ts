// ============================================================
// NORMALISATION DE LA LOCALISATION DU PROFIL — V1, LECTURE SEULE.
// Source unique : `entrepreneurs.address` (déjà saisie par l'entrepreneur).
// Aucune table, aucune colonne, aucun appel externe, aucune écriture :
// la normalisation est calculée à l'affichage à partir du texte réel.
// L'adresse complète (numéro civique, rue, appartement) reste PRIVÉE et
// n'est jamais incluse dans les champs exposables au réseau.
// Aucune ville, région, coordonnée ou distance n'est inventée : ce qui
// n'est pas lisible dans l'adresse reste `null`.
// ============================================================

/** Qualité réelle de la localisation dérivée. */
export type LocalisationStatus =
  | "reliable"        // ville + province lisibles
  | "partial"         // une partie seulement (ville OU province OU code postal)
  | "unnormalizable"  // adresse présente mais rien d'exploitable
  | "missing"         // aucune adresse enregistrée
  | "error";          // erreur d'un service externe (aucun utilisé en V1)

export interface Localisation {
  status: LocalisationStatus;
  /** Ville lisible dans l'adresse, sinon null. */
  city: string | null;
  /** Région administrative : non déterminable de façon fiable en V1. */
  region: null;
  /** Province (normalisée « QC » pour le Québec), sinon null. */
  province: string | null;
  /** Code postal complet — PRIVÉ, jamais exposé au réseau. */
  postalCode: string | null;
  /** Secteur postal (3 premiers caractères) — exposable. */
  postalSector: string | null;
  /** Coordonnées : aucune source fiable et autorisée pour ce champ en V1. */
  latitude: null;
  longitude: null;
  /** Message d'état lisible par l'entrepreneur. */
  message: string;
}

const EMPTY: Localisation = {
  status: "missing",
  city: null,
  region: null,
  province: null,
  postalCode: null,
  postalSector: null,
  latitude: null,
  longitude: null,
  message: "Aucune adresse enregistrée.",
};

const POSTAL_RE = /\b([A-Za-z]\d[A-Za-z])[ -]?(\d[A-Za-z]\d)\b/;

const PROVINCES: Record<string, string> = {
  qc: "QC", quebec: "QC", québec: "QC",
  on: "ON", ontario: "ON",
  nb: "NB", "nouveau-brunswick": "NB",
  ns: "NS", pe: "PE", nl: "NL", mb: "MB", sk: "SK",
  ab: "AB", alberta: "AB", bc: "BC", "colombie-britannique": "BC",
  yt: "YT", nt: "NT", nu: "NU",
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const strip = (s: string) =>
  clean(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Un segment est une ville plausible : pas de numéro civique, pas un pays. */
const looksLikeCity = (seg: string): boolean => {
  const t = clean(seg);
  if (!t || t.length < 2) return false;
  if (/\d/.test(t)) return false;                       // « 1234 Rue X » → privé
  const s = strip(t);
  if (s === "canada" || s === "ca") return false;
  if (PROVINCES[s]) return false;
  return true;
};

/**
 * Dérive la localisation exposable à partir de l'adresse réelle.
 * Ne modifie jamais la donnée source et ne complète jamais l'inconnu.
 */
export const normalizeAddress = (address: unknown): Localisation => {
  const raw = typeof address === "string" ? clean(address) : "";
  if (!raw) return { ...EMPTY };

  // Code postal (le cas échéant) — reste privé, seul le secteur est exposable.
  const pm = raw.match(POSTAL_RE);
  const postalCode = pm ? `${pm[1].toUpperCase()} ${pm[2].toUpperCase()}` : null;
  const postalSector = pm ? pm[1].toUpperCase() : null;

  // Découpage en segments, code postal retiré pour ne pas polluer la ville.
  const segments = raw
    .replace(POSTAL_RE, " ")
    .split(",")
    .map(clean)
    .filter(Boolean);

  let province: string | null = null;
  let provinceIdx = -1;
  segments.forEach((seg, i) => {
    // La province peut être seule (« QC ») ou en fin de segment (« Québec QC »).
    const tokens = strip(seg).split(/[\s/]+/).filter(Boolean);
    for (const tk of tokens) {
      if (PROVINCES[tk] && provinceIdx === -1) {
        // « Québec » seul est ambigu (ville ET province) : on ne tranche que
        // s'il reste un segment ville avant, sinon on le traitera comme ville.
        province = PROVINCES[tk];
        provinceIdx = i;
      }
    }
  });

  let city: string | null = null;
  if (provinceIdx > 0) {
    for (let i = provinceIdx - 1; i >= 0; i--) {
      if (looksLikeCity(segments[i])) { city = segments[i]; break; }
    }
    // « Québec, QC » : le segment province précédent est la ville.
    if (!city && strip(segments[provinceIdx]) !== "qc") city = null;
  }
  if (!city && provinceIdx >= 0) {
    const provSeg = clean(segments[provinceIdx]);
    // Cas « … , Québec, Canada » : « Québec » est la ville lorsqu'aucun autre
    // segment ville n'existe avant et que le libellé n'est pas l'abréviation.
    if (strip(provSeg) === "quebec" && segments.slice(0, provinceIdx).every((s) => !looksLikeCity(s))) {
      city = provSeg;
    }
  }
  if (!city) {
    const candidates = segments.filter(looksLikeCity);
    if (candidates.length === 1) city = candidates[0];
    else if (candidates.length > 1 && provinceIdx === -1) city = candidates[candidates.length - 1];
  }

  const known = [city, province, postalSector].filter(Boolean).length;
  let status: LocalisationStatus;
  let message: string;
  if (city && province) {
    status = "reliable";
    message = "Localisation confirmée à partir de votre adresse.";
  } else if (known > 0) {
    status = "partial";
    message = "Localisation partielle : complétez votre adresse (ville et province).";
  } else {
    status = "unnormalizable";
    message = "Adresse enregistrée mais impossible à normaliser de façon fiable.";
  }

  return {
    status,
    city,
    region: null,
    province,
    postalCode,
    postalSector,
    latitude: null,
    longitude: null,
    message,
  };
};

/** Champs strictement non sensibles, seuls candidats à une exposition future. */
export interface PublicLocalisation {
  city: string | null;
  region: null;
  province: string | null;
  postalSector: string | null;
}

/**
 * Projection publique : ne contient JAMAIS l'adresse complète, le numéro
 * civique, le code postal complet, un identifiant interne ou un user_id.
 */
export const toPublicLocalisation = (loc: Localisation): PublicLocalisation => ({
  city: loc.city,
  region: null,
  province: loc.province,
  postalSector: loc.postalSector,
});

/** Libellé court affichable (jamais l'adresse complète). */
export const localisationLabel = (loc: Localisation): string | null => {
  const parts = [loc.city, loc.province].filter(Boolean) as string[];
  if (!parts.length) return loc.postalSector ? `Secteur ${loc.postalSector}` : null;
  return parts.join(", ");
};
