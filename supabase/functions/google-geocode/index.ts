import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_maps';

interface GeocodeResult {
  status: 'validated_address' | 'validated_postal' | 'approximate' | 'error';
  lat: number | null;
  lng: number | null;
  postalLat: number | null;
  postalLng: number | null;
  formattedAddress: string | null;
  placeId: string | null;
  locationType: string | null;
  error?: string;
}

async function googleGeocode(query: string, components?: string) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');
  if (!GOOGLE_MAPS_API_KEY) throw new Error('GOOGLE_MAPS_API_KEY is not configured');

  const params = new URLSearchParams();
  if (query) params.set('address', query);
  if (components) params.set('components', components);
  params.set('region', 'ca');
  params.set('language', 'fr');

  const res = await fetch(`${GATEWAY_URL}/maps/api/geocode/json?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': GOOGLE_MAPS_API_KEY,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Geocoding gateway failed [${res.status}]: ${JSON.stringify(data)}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // SECURITY: only authenticated admins may invoke geocoding to prevent
    // anonymous abuse of the Google Maps API quota.
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return new Response(JSON.stringify({ status: 'error', error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.slice(7).trim();
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;
    if (claimsErr || !userId) {
      return new Response(JSON.stringify({ status: 'error', error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await adminClient.rpc('has_role', {
      _user_id: userId, _role: 'admin',
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ status: 'error', error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { address, postalCode } = await req.json();
    const cleanAddress = String(address || '').trim();
    const cleanPostal = String(postalCode || '').trim().toUpperCase().replace(/\s+/g, ' ');

    const result: GeocodeResult = {
      status: 'error',
      lat: null, lng: null, postalLat: null, postalLng: null,
      formattedAddress: null, placeId: null, locationType: null,
    };

    // 1) Full address geocoding
    let main: any = null;
    if (cleanAddress) {
      const q = cleanPostal ? `${cleanAddress}, ${cleanPostal}, Québec, Canada` : `${cleanAddress}, Québec, Canada`;
      const data = await googleGeocode(q);
      if (data.status === 'OK' && data.results?.[0]) {
        main = data.results[0];
      }
    }

    // 2) Postal centroid (separate request, used for entrepreneur anonymisation)
    let postal: any = null;
    if (cleanPostal) {
      const data = await googleGeocode('', `postal_code:${cleanPostal}|country:CA`);
      if (data.status === 'OK' && data.results?.[0]) {
        postal = data.results[0];
      }
    }

    if (main) {
      const loc = main.geometry?.location;
      result.lat = loc?.lat ?? null;
      result.lng = loc?.lng ?? null;
      result.formattedAddress = main.formatted_address ?? null;
      result.placeId = main.place_id ?? null;
      result.locationType = main.geometry?.location_type ?? null;

      // Validation: must be in Québec, Canada
      const inQc = main.address_components?.some((c: any) =>
        c.short_name === 'QC' || c.long_name === 'Québec' || c.long_name === 'Quebec'
      );
      const isPrecise = result.locationType === 'ROOFTOP' || result.locationType === 'RANGE_INTERPOLATED';
      if (inQc && isPrecise) result.status = 'validated_address';
      else if (inQc) result.status = 'approximate';
      else result.status = 'approximate';
    }

    if (postal) {
      const ploc = postal.geometry?.location;
      result.postalLat = ploc?.lat ?? null;
      result.postalLng = ploc?.lng ?? null;
      if (!main && result.postalLat != null) {
        result.lat = result.postalLat;
        result.lng = result.postalLng;
        result.status = 'validated_postal';
      }
    } else if (main) {
      // fallback: use main coords as postal coords (will still be offset for entrepreneurs)
      result.postalLat = result.lat;
      result.postalLng = result.lng;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('google-geocode error:', msg);
    return new Response(JSON.stringify({ status: 'error', error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});