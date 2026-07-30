// ============================================================
// VRAC QUÉBEC — MOTEUR DE CALCUL V1 (point d'entrée unique)
// Utilisable par : site web, CRM, API futures, IA téléphonique,
// applications mobiles. Toute estimation de la plateforme passe ici.
//
// POST { material_id, quantity, unit, address | delivery:{lat,lng}, carrier_id? }
// Réponse client  : total, délai, voyages (aucune donnée stratégique).
// Réponse interne : ajoutée uniquement pour les administrateurs.
// ============================================================
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { computeQuote, type DistanceProvider, type EngineConfig, type Unit } from '../_shared/quote-engine.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_maps';
const UNITS: Unit[] = ['tonne', 'verge', 'm3'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function mapsHeaders() {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) throw new Error('Missing Google Maps connector credentials');
  return { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': GOOGLE_MAPS_API_KEY };
}

async function geocode(address: string) {
  const params = new URLSearchParams({ address, region: 'ca', language: 'fr' });
  const res = await fetch(`${GATEWAY_URL}/maps/api/geocode/json?${params}`, { headers: mapsHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(`Geocoding failed [${res.status}]: ${JSON.stringify(data)}`);
  const loc = data?.results?.[0]?.geometry?.location;
  if (!loc) throw new Error("Adresse de livraison introuvable.");
  return { lat: loc.lat as number, lng: loc.lng as number, address: data.results[0].formatted_address as string };
}

const distanceProvider: DistanceProvider = async (origins, destination) => {
  const out: Record<string, { distance_km: number; duration_minutes: number } | null> = {};
  for (let i = 0; i < origins.length; i += 25) {
    const chunk = origins.slice(i, i + 25);
    const res = await fetch(`${GATEWAY_URL}/routes/distanceMatrix/v2:computeRouteMatrix`, {
      method: 'POST',
      headers: { ...mapsHeaders(), 'Content-Type': 'application/json',
        'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,condition' },
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

async function loadConfig(db: any, materialId: string): Promise<EngineConfig> {
  const [material, prices, pickups, suppliers, carriers, trucks, rates, zones, settings] = await Promise.all([
    db.from('jsc_materials').select('*').eq('id', materialId).is('archived_at', null).maybeSingle(),
    live(db.from('jsc_material_prices').select('*')).eq('material_id', materialId),
    live(db.from('jsc_pickup_locations').select('*')),
    live(db.from('jsc_suppliers').select('id,name')),
    live(db.from('jsc_companies').select('id,name')),
    live(db.from('jsc_trucks').select('*')),
    live(db.from('jsc_transport_rates').select('*')),
    live(db.from('jsc_zones').select('id,name,distance_surcharge')),
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
    settings: settingsMap,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non supportée' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const db = createClient(url, service, { auth: { persistSession: false } });

    // Le détail interne (fournisseur, transporteur, coûts, candidats) est réservé aux administrateurs.
    let isAdmin = false;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: userData } = await userClient.auth.getUser();
    if (userData?.user) {
      const { data: role } = await db.rpc('has_role', { _user_id: userData.user.id, _role: 'admin' });
      isAdmin = role === true;
    }

    const body = await req.json().catch(() => null);
    const materialId = body?.material_id;
    const quantity = Number(body?.quantity);
    const unit: Unit = body?.unit ?? 'tonne';

    if (typeof materialId !== 'string' || materialId.length < 10) return json({ error: 'material_id requis' }, 400);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) return json({ error: 'quantity invalide' }, 400);
    if (!UNITS.includes(unit)) return json({ error: `unit invalide (${UNITS.join(', ')})` }, 400);

    let delivery = body?.delivery;
    if (!delivery || typeof delivery.lat !== 'number' || typeof delivery.lng !== 'number') {
      const address = typeof body?.address === 'string' ? body.address.trim() : '';
      if (address.length < 5 || address.length > 300) return json({ error: 'address ou delivery{lat,lng} requis' }, 400);
      delivery = await geocode(address);
    }

    const config = await loadConfig(db, materialId);
    const result = await computeQuote(
      { material_id: materialId, quantity, unit, delivery, carrier_id: body?.carrier_id ?? null },
      config,
      distanceProvider,
    );

    if (isAdmin) return json({ ok: true, scope: 'internal', quote: result });

    // Vue client : prix, délai et logistique visible, rien de stratégique.
    const s = result.selected;
    return json({
      ok: true,
      scope: 'client',
      quote: {
        material: { id: result.material.id, name: result.material.name },
        tonnage: result.input.tonnage,
        trips: s.trips,
        estimated_duration_minutes: s.total_minutes_rounded,
        delivery_address: delivery.address ?? null,
        total_before_tax: result.totals.total_before_tax,
        computed_at: result.computed_at,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    console.error('quote-engine failed:', message);
    return json({ error: message }, 400);
  }
});
