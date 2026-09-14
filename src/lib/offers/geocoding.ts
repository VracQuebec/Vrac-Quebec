// ============================================================
// LOT 20 — ABSTRACTION DE GÉOCODAGE
// ------------------------------------------------------------
// Aucune clé API n'est introduite ici. Un fournisseur (Google, Mapbox,
// OpenStreetMap…) pourra être branché plus tard en implémentant
// `GeocodingAdapter`. Par défaut : saisie manuelle uniquement.
// ============================================================

export interface GeocodeQuery {
  address?: string | null;
  city?: string | null;
  sector?: string | null;
  region?: string | null;
  raw?: string | null;
}

export interface GeocodeResult {
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  region: string | null;
  sector: string | null;
  /** Provenance réelle de la coordonnée (jamais devinée). */
  source: string;
  confidence: number;
  resolved: boolean;
  message: string;
}

export interface GeocodingAdapter {
  name: string;
  geocode(query: GeocodeQuery): Promise<GeocodeResult>;
}

export const emptyResult = (source: string, message: string): GeocodeResult => ({
  latitude: null, longitude: null, city: null, region: null, sector: null,
  source, confidence: 0, resolved: false, message,
});

/** Adaptateur par défaut : aucune résolution automatique, saisie humaine requise. */
export const manualGeocodingAdapter: GeocodingAdapter = {
  name: "manual",
  async geocode(query) {
    const city = query.city?.trim() || null;
    return {
      ...emptyResult("manual", "Coordonnées à saisir manuellement (aucun fournisseur branché)."),
      city,
      region: query.region?.trim() || null,
      sector: query.sector?.trim() || null,
      confidence: city ? 0.3 : 0,
    };
  },
};

let activeAdapter: GeocodingAdapter = manualGeocodingAdapter;

export const setGeocodingAdapter = (adapter: GeocodingAdapter) => { activeAdapter = adapter; };
export const getGeocodingAdapter = (): GeocodingAdapter => activeAdapter;

/** Coordonnées saisies à la main : toujours acceptées, source explicite. */
export function manualCoordinates(latitude: number, longitude: number): GeocodeResult {
  return {
    latitude, longitude, city: null, region: null, sector: null,
    source: "manual_input", confidence: 1, resolved: true,
    message: "Coordonnées saisies manuellement.",
  };
}

export async function geocode(query: GeocodeQuery): Promise<GeocodeResult> {
  return activeAdapter.geocode(query);
}
