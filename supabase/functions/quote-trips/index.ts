// ============================================================
// MODULE 3 — MOTEUR DE CALCUL DES TRAJETS (endpoint)
// ------------------------------------------------------------
// Retourne distances réelles, durées, voyages et temps opérationnels.
// AUCUN calcul financier : ni prix, ni taxes, ni soumission.
//
// POST { material_id | material_slug, quantity, unit, address | delivery{lat,lng} }
// Réservé aux administrateurs (données stratégiques internes).
// ============================================================
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { type Unit } from '../_shared/vqos/core.ts';
import { computeTrips, RoutingError } from '../_shared/vqos/routing/index.ts';
import { geocode, loadConfig, routeProvider } from '../_shared/vqos/runtime.ts';

const UNITS: Unit[] = ['tonne', 'verge', 'm3'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: 'Unauthorized' }, 401);
    const { data: isAdmin } = await db.rpc('has_role', { _user_id: userData.user.id, _role: 'admin' });
    if (isAdmin !== true) return json({ error: 'Accès réservé aux administrateurs' }, 403);

    const body = await req.json().catch(() => null);
    let materialId = body?.material_id;

    if (typeof materialId !== 'string' && typeof body?.material_slug === 'string') {
      const slug = body.material_slug.trim().slice(0, 120);
      const { data: found } = await db
        .from('jsc_materials').select('id').eq('slug', slug)
        .eq('is_active', true).is('archived_at', null).maybeSingle();
      if (!found) return json({ error: `Matériau « ${slug} » non configuré dans l'administration.` }, 404);
      materialId = found.id;
    }

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
    const result = await computeTrips({ material_id: materialId, quantity, unit, delivery }, config, routeProvider);

    return json({ ok: true, scope: 'internal', result });
  } catch (e) {
    if (e instanceof RoutingError) {
      console.error('quote-trips routing error:', e.message);
      return json({ error: e.message, failures: e.failures }, 422);
    }
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    console.error('quote-trips failed:', message);
    return json({ error: message }, 400);
  }
});