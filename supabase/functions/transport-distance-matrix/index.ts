// Compute driving distance + duration from a site to a list of dumps
// via Google Routes API (computeRouteMatrix) through the Lovable connector gateway.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_maps';

interface DumpInput { id: string; lat: number; lng: number }
interface Body {
  origin: { lat: number; lng: number };
  dumps: DumpInput[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      return new Response(JSON.stringify({ error: 'Missing Google Maps connector credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = (await req.json()) as Body;
    if (!body?.origin || !Array.isArray(body?.dumps) || body.dumps.length === 0) {
      return new Response(JSON.stringify({ error: 'origin et dumps requis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Routes API allows up to 25*25 in one matrix call. Chunk destinations by 25.
    const chunks: DumpInput[][] = [];
    for (let i = 0; i < body.dumps.length; i += 25) chunks.push(body.dumps.slice(i, i + 25));

    const results: Record<string, { distance_km: number; duration_minutes: number } | null> = {};

    for (const chunk of chunks) {
      const payload = {
        origins: [{ waypoint: { location: { latLng: { latitude: body.origin.lat, longitude: body.origin.lng } } } }],
        destinations: chunk.map((d) => ({ waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lng } } } })),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
      };

      const res = await fetch(`${GATEWAY_URL}/routes/distanceMatrix/v2:computeRouteMatrix`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': GOOGLE_MAPS_API_KEY,
          'Content-Type': 'application/json',
          'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,condition',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('Routes matrix error', res.status, err);
        // Fallback: mark chunk as unknown
        chunk.forEach((d) => { results[d.id] = null; });
        continue;
      }

      const text = await res.text();
      // Response is a JSON array of elements
      const elements = JSON.parse(text);
      for (const el of elements) {
        const idx = el.destinationIndex ?? 0;
        const dump = chunk[idx];
        if (!dump) continue;
        if (el.condition !== 'ROUTE_EXISTS') { results[dump.id] = null; continue; }
        const meters = el.distanceMeters ?? 0;
        const secs = parseInt(String(el.duration || '0s').replace('s', '')) || 0;
        results[dump.id] = { distance_km: Math.round((meters / 1000) * 10) / 10, duration_minutes: Math.round(secs / 60) };
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});