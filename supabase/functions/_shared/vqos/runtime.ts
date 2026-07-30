// ============================================================
// VRAC QUÉBEC OS — RUNTIME PARTAGÉ DES MOTEURS (Deno / edge)
// ------------------------------------------------------------
// Géocodage, matrice de distances et chargement de la configuration
// administrateur. Utilisé par toutes les fonctions qui appellent
// les moteurs (quote-engine, quote-assistant, CRM, futures API).
// Aucune règle métier ici : uniquement l'accès aux données.
// ============================================================
import type { DistanceProvider, EngineConfig } from './index.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_maps';

export function mapsHeaders() {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) throw new Error('Missing Google Maps connector credentials');
  return { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': GOOGLE_MAPS_API_KEY };
}

export interface GeocodedAddress {
  lat: number;
  lng: number;
  address: string;
  city: string | null;
  postal_code: string | null;
}

export async function geocode(address: string): Promise<GeocodedAddress> {
  const params = new URLSearchParams({ address, region: 'ca', language: 'fr' });
  const res = await fetch(`${GATEWAY_URL}/maps/api/geocode/json?${params}`, { headers: mapsHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(`Geocoding failed [${res.status}]: ${JSON.stringify(data)}`);
  const result = data?.results?.[0];
  const loc = result?.geometry?.location;
  if (!loc) {
    console.error('geocode empty', JSON.stringify({ status: data?.status, error: data?.error_message }));
    if (data?.status && data.status !== 'ZERO_RESULTS') {
      throw new Error("Le service de validation d'adresse est momentanément indisponible. Notre équipe peut préparer votre estimation par téléphone.");
    }
    throw new Error("Adresse de livraison introuvable. Précisez le numéro civique, la ville et le code postal.");
  }
  const comp = (type: string) =>
    result.address_components?.find((c: { types: string[] }) => c.types?.includes(type))?.long_name ?? null;
  return {
    lat: loc.lat as number,
    lng: loc.lng as number,
    address: result.formatted_address as string,
    city: comp('locality') ?? comp('administrative_area_level_2'),
    postal_code: comp('postal_code'),
  };
}

export const distanceProvider: DistanceProvider = async (origins, destination) => {
  const out: Record<string, { distance_km: number; duration_minutes: number } | null> = {};
  for (let i = 0; i < origins.length; i += 25) {
    const chunk = origins.slice(i, i + 25);
    const res = await fetch(`${GATEWAY_URL}/routes/distanceMatrix/v2:computeRouteMatrix`, {
      method: 'POST',
      headers: {
        ...mapsHeaders(),
        'Content-Type': 'application/json',
        'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,condition',
      },
      body: JSON.stringify({
        origins: chunk.map((o) => ({ waypoint: { location: { latLng: { latitude: o.lat, longitude: o.lng } } } })),
        destinations: [{ waypoint: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } } }],
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
      }),
    });
    if (!res.ok) {
      console.error('Routes matrix error', res.status, await res.text());
      chunk.forEach((o) => { out[o.id] = null; });
      continue;
    }
    const rows = await res.json();
    for (const row of Array.isArray(rows) ? rows : []) {
      const origin = chunk[row.originIndex ?? 0];
      if (!origin) continue;
      if (row.condition && row.condition !== 'ROUTE_EXISTS') { out[origin.id] = null; continue; }
      out[origin.id] = {
        distance_km: Number(((row.distanceMeters ?? 0) / 1000).toFixed(2)),
        duration_minutes: Math.round(Number(String(row.duration ?? '0s').replace('s', '')) / 60),
      };
    }
    chunk.forEach((o) => { if (!(o.id in out)) out[o.id] = null; });
  }
  return out;
};

const live = (q: any) => q.eq('is_active', true).is('archived_at', null);

/** Charge l'intégralité des paramètres administrateur nécessaires aux moteurs. */
export async function loadConfig(db: any, materialId: string): Promise<EngineConfig> {
  const [material, prices, pickups, suppliers, carriers, trucks, rates, zones, taxes, settings] = await Promise.all([
    db.from('jsc_materials').select('*').eq('id', materialId).is('archived_at', null).maybeSingle(),
    live(db.from('jsc_material_prices').select('*')).eq('material_id', materialId),
    live(db.from('jsc_pickup_locations').select('*')),
    live(db.from('jsc_suppliers').select('id,name')),
    live(db.from('jsc_companies').select('id,name')),
    live(db.from('jsc_trucks').select('*')),
    live(db.from('jsc_transport_rates').select('*')),
    live(db.from('jsc_zones').select('id,name,distance_surcharge')),
    live(db.from('jsc_taxes').select('id,name,code,rate_percent,apply_order,compound')),
    live(db.from('jsc_settings').select('key,value')),
  ]);

  if (material.error) throw new Error(material.error.message);
  if (!material.data) throw new Error('Matériau introuvable ou inactif.');

  const settingsMap: Record<string, string> = {};
  for (const row of settings.data ?? []) settingsMap[row.key] = row.value;

  return {
    material: material.data,
    prices: prices.data ?? [],
    pickups: pickups.data ?? [],
    suppliers: suppliers.data ?? [],
    carriers: carriers.data ?? [],
    trucks: trucks.data ?? [],
    rates: rates.data ?? [],
    zones: zones.data ?? [],
    taxes: taxes.data ?? [],
    settings: settingsMap,
  };
}
