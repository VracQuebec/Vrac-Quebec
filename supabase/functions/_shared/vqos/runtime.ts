// ============================================================
// VRAC QUÉBEC OS — RUNTIME PARTAGÉ DES MOTEURS (Deno / edge)
// ------------------------------------------------------------
// Géocodage, matrice de distances et chargement de la configuration
// administrateur. Utilisé par toutes les fonctions qui appellent
// les moteurs (quote-engine, quote-assistant, CRM, futures API).
// Aucune règle métier ici : uniquement l'accès aux données.
// ============================================================
import type { DistanceProvider, EngineConfig } from './index.ts';
import { logEvent, logEventAsync } from '../observability.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_maps';

/**
 * Appel Google avec reprise automatique : les limites de débit (429) et les
 * erreurs temporaires (5xx) sont réessayées avec un délai croissant plutôt
 * que de faire échouer une soumission client.
 */
async function fetchGoogle(url: string, init: RequestInit, attempts = 6): Promise<Response> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init);
    if (res.ok || (res.status !== 429 && res.status < 500)) return res;
    const body = await res.text().catch(() => '');
    if (i === attempts - 1) {
      logEventAsync({
        source: 'google_maps', event: 'saturated', level: 'critical',
        statusCode: res.status,
        message: 'Google Maps sature : toutes les tentatives ont échoué.',
      });
      return new Response(body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }
    const wait = Math.min(12_000, 400 * 2 ** i) + Math.floor(Math.random() * 400);
    logEventAsync({
      source: 'google_maps', event: 'retry', level: 'warn',
      statusCode: res.status, message: `Nouvelle tentative dans ${wait} ms`,
      context: { attempt: i + 1 },
    });
    await new Promise((r) => setTimeout(r, wait));
  }
  return new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } });
}

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
  const started = Date.now();
  const res = await fetchGoogle(`${GATEWAY_URL}/maps/api/geocode/json?${params}`, { headers: mapsHeaders() });
  const data = await res.json();
  if (!res.ok) {
    await logEvent({
      source: 'google_maps', event: 'geocode', level: 'critical',
      message: `Geocoding failed [${res.status}]: ${JSON.stringify(data)}`,
      statusCode: res.status, durationMs: Date.now() - started,
    });
    throw new Error(`Geocoding failed [${res.status}]: ${JSON.stringify(data)}`);
  }
  const result = data?.results?.[0];
  const loc = result?.geometry?.location;
  if (!loc) {
    if (data?.status && data.status !== 'ZERO_RESULTS') {
      await logEvent({
        source: 'google_maps', event: 'geocode', level: 'critical',
        message: `Statut Google inattendu: ${data.status}`,
        durationMs: Date.now() - started,
        context: { status: data?.status, error: data?.error_message },
      });
      throw new Error("Le service de validation d'adresse est momentanément indisponible. Notre équipe peut préparer votre estimation par téléphone.");
    }
    logEventAsync({
      source: 'google_maps', event: 'geocode.zero_results', level: 'warn',
      durationMs: Date.now() - started,
    });
    throw new Error("Adresse de livraison introuvable. Précisez le numéro civique, la ville et le code postal.");
  }
  logEventAsync({ source: 'google_maps', event: 'geocode', durationMs: Date.now() - started });
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
  const startedAll = Date.now();

  const pending: typeof origins = [];
  const keyOf = (o: { lat: number; lng: number }) =>
    `${o.lat.toFixed(3)},${o.lng.toFixed(3)}>${destination.lat.toFixed(3)},${destination.lng.toFixed(3)}`;

  // 1) Cache mémoire (isolat courant).
  for (const o of origins) {
    const cached = distanceCache.get(keyOf(o));
    if (cached && cached.expires > Date.now()) out[o.id] = cached.value;
    else pending.push(o);
  }

  // 2) Cache partagé en base : les trajets fixes (garage ↔ carrières) ne sont
  //    demandés à Google qu'une seule fois pour toute la plateforme.
  const stillPending: typeof origins = [];
  const shared = await readRouteCache(pending.map(keyOf));
  for (const o of pending) {
    const hit = shared.get(keyOf(o));
    if (hit !== undefined) {
      out[o.id] = hit;
      distanceCache.set(keyOf(o), { value: hit, expires: Date.now() + DISTANCE_TTL_MS });
    } else stillPending.push(o);
  }

  const fresh: Array<{ key: string; value: { distance_km: number; duration_minutes: number } | null }> = [];
  for (let i = 0; i < stillPending.length; i += 25) {
    const chunk = stillPending.slice(i, i + 25);
    const res = await fetchGoogle(`${GATEWAY_URL}/routes/distanceMatrix/v2:computeRouteMatrix`, {
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
      await logEvent({
        source: 'google_maps', event: 'route_matrix', level: 'critical',
        message: `Routes matrix error: ${await res.text()}`,
        statusCode: res.status, context: { origins: chunk.length },
      });
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
      distanceCache.set(keyOf(origin), { value: out[origin.id], expires: Date.now() + DISTANCE_TTL_MS });
      fresh.push({ key: keyOf(origin), value: out[origin.id] });
    }
    chunk.forEach((o) => { if (!(o.id in out)) out[o.id] = null; });
  }
  if (fresh.length) writeRouteCache(fresh);

  logEventAsync({
    source: 'google_maps', event: 'route_matrix',
    durationMs: Date.now() - startedAll,
    context: { origins: origins.length, from_cache: origins.length - stillPending.length },
  });
  return out;
};

// ------------------------------------------------------------
// Cache partagé des trajets (table public.route_cache)
// ------------------------------------------------------------
function restEnv() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return url && key ? { url, key } : null;
}

async function readRouteCache(keys: string[]) {
  const map = new Map<string, { distance_km: number; duration_minutes: number } | null>();
  const env = restEnv();
  if (!env || keys.length === 0) return map;
  try {
    const list = [...new Set(keys)].map((k) => `"${k}"`).join(',');
    const res = await fetch(
      `${env.url}/rest/v1/route_cache?select=cache_key,distance_km,duration_minutes,route_exists&cache_key=in.(${encodeURIComponent(list)})`,
      { headers: { apikey: env.key, Authorization: `Bearer ${env.key}` } },
    );
    if (!res.ok) { await res.text(); return map; }
    for (const row of await res.json()) {
      map.set(row.cache_key, row.route_exists
        ? { distance_km: Number(row.distance_km), duration_minutes: Number(row.duration_minutes) }
        : null);
    }
  } catch { /* le cache ne doit jamais bloquer un calcul */ }
  return map;
}

function writeRouteCache(rows: Array<{ key: string; value: { distance_km: number; duration_minutes: number } | null }>) {
  const env = restEnv();
  if (!env) return;
  const payload = rows.map((r) => ({
    cache_key: r.key,
    distance_km: r.value?.distance_km ?? null,
    duration_minutes: r.value?.duration_minutes ?? null,
    route_exists: r.value !== null,
    last_used_at: new Date().toISOString(),
  }));
  void fetch(`${env.url}/rest/v1/route_cache?on_conflict=cache_key`, {
    method: 'POST',
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

const live = (q: any) => q.eq('is_active', true).is('archived_at', null);

// ------------------------------------------------------------
// Caches mémoire (durée de vie de l'isolat edge). Ils réduisent
// la charge Supabase et les appels Google sans jamais figer une
// modification administrateur plus de quelques dizaines de secondes.
// ------------------------------------------------------------
const CONFIG_TTL_MS = 60_000;
const DISTANCE_TTL_MS = 5 * 60_000;
const configCache = new Map<string, { value: EngineConfig; expires: number }>();
const distanceCache = new Map<string, { value: { distance_km: number; duration_minutes: number } | null; expires: number }>();

/** Charge l'intégralité des paramètres administrateur nécessaires aux moteurs. */
export async function loadConfig(db: any, materialId: string): Promise<EngineConfig> {
  const cached = configCache.get(materialId);
  if (cached && cached.expires > Date.now()) return cached.value;

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

  const config: EngineConfig = {
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

  if (configCache.size > 200) configCache.clear();
  configCache.set(materialId, { value: config, expires: Date.now() + CONFIG_TTL_MS });
  return config;
}
