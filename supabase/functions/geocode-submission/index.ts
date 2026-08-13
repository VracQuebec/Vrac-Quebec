// ============================================================
// GÉOCODAGE SERVEUR D'UNE DEMANDE PUBLIQUE
// ------------------------------------------------------------
// Le déclencheur `enforce_submission_insert_defaults` neutralise
// volontairement les coordonnées envoyées par le navigateur.
// Cette fonction géocode, côté serveur (Google), l'adresse DÉJÀ
// enregistrée en base et réapplique lat/lng/ville/adresse formatée.
// Elle ne traite que des demandes encore en attente de géocodage
// (`geocoding_status = 'pending'` et coordonnées absentes) : elle
// ne peut donc ni déplacer ni écraser une demande déjà localisée.
// Le rattrapage en lot est réservé aux administrateurs connectés.
// ============================================================
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { geocode } from '../_shared/vqos/runtime.ts';
import { logEventAsync } from '../_shared/observability.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function db() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

async function isAdmin(sb: ReturnType<typeof db>, req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  if (!token) return false;
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return true;
  const { data } = await sb.auth.getUser(token);
  if (!data?.user) return false;
  const { data: ok } = await sb.rpc('has_role', { _user_id: data.user.id, _role: 'admin' });
  return ok === true;
}

async function geocodeOne(sb: ReturnType<typeof db>, id: string) {
  const { data: row } = await sb
    .from('submissions')
    .select('id, address, postal_code, city, latitude, longitude, geocoding_status')
    .eq('id', id)
    .maybeSingle();

  if (!row) return { id, ok: false, reason: 'introuvable' };
  if (row.latitude != null && row.longitude != null) return { id, ok: true, reason: 'déjà géocodée' };
  if (row.geocoding_status !== 'pending') return { id, ok: false, reason: 'non éligible' };

  const query = [row.address, row.postal_code, row.city, 'Québec, Canada'].filter(Boolean).join(', ');
  try {
    const geo = await geocode(query);
    await sb.from('submissions').update({
      latitude: geo.lat,
      longitude: geo.lng,
      city: row.city ?? geo.city,
      postal_code: row.postal_code || geo.postal_code || '',
      formatted_address: geo.address,
      geocoding_status: 'ok',
      geocoding_provider: 'google',
    }).eq('id', id);
    logEventAsync({ source: 'geocode_submission', event: 'geocoded', refId: id });
    return { id, ok: true, lat: geo.lat, lng: geo.lng, city: geo.city };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await sb.from('submissions').update({ geocoding_status: 'failed', geocoding_provider: 'google' }).eq('id', id);
    logEventAsync({ source: 'geocode_submission', event: 'geocode.failed', level: 'warn', refId: id, message });
    return { id, ok: false, reason: message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Méthode non supportée' }, 405);

  try {
    const sb = db();
    const body = await req.json().catch(() => null);

    // Rattrapage des demandes historiques restées sans coordonnées (admin uniquement).
    if (body?.backfill === true) {
      if (!(await isAdmin(sb, req))) return json({ ok: false, error: 'Réservé aux administrateurs' }, 403);
      const limit = Math.min(Number(body?.limit) || 25, 100);
      const { data: pending } = await sb
        .from('submissions')
        .select('id')
        .eq('geocoding_status', 'pending')
        .is('latitude', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      const results = [];
      for (const r of pending ?? []) results.push(await geocodeOne(sb, r.id as string));
      return json({ ok: true, processed: results.length, results });
    }

    const id = typeof body?.submissionId === 'string' ? body.submissionId : '';
    if (!UUID.test(id)) return json({ ok: false, error: 'submissionId invalide' }, 400);

    const result = await geocodeOne(sb, id);
    return json({ ok: result.ok, ...result });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'Erreur inattendue' }, 500);
  }
});
