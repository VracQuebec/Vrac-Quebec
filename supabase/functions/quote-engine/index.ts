// ============================================================
// VRAC QUÉBEC OS — API DES MOTEURS (point d'entrée unique)
// Decision Engine + Calculation Engine exposés à toute la plateforme :
// site web, calculateur public, CRM, commandes, répartition,
// API futures, IA téléphonique, applications mobiles.
//
// POST { material_id, quantity, unit, address | delivery:{lat,lng}, carrier_id?, supplier_id? }
// Réponse : bloc `public` toujours ; bloc `technical` pour les administrateurs.
// ============================================================
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { runQuote, type Unit } from '../_shared/vqos/index.ts';
import { distanceProvider, geocode, loadConfig } from '../_shared/vqos/runtime.ts';

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

    // Sécurité de mise en service : aucun calcul officiel si la configuration
    // administrateur est incomplète (erreurs critiques détectées).
    const { data: guard } = await db.rpc('jsc_production_guard');
    if (guard && guard.ok === false) {
      return json({
        error: guard.message ?? "Configuration incomplète : la plateforme ne peut pas produire d'estimation officielle.",
        blocked: true,
      }, 409);
    }

    const result = await runQuote(
      {
        material_id: materialId, quantity, unit, delivery,
        carrier_id: body?.carrier_id ?? null,
        supplier_id: body?.supplier_id ?? null,
      },
      config,
      distanceProvider,
    );

    // Le moteur retourne les données ; l'exposition dépend uniquement du rôle.
    if (isAdmin) {
      return json({
        ok: true, scope: 'internal', mode: guard?.mode ?? 'test',
        engine_version: result.engine_version, computed_at: result.computed_at, quote: result,
      });
    }
    return json({
      ok: true, scope: 'client', mode: guard?.mode ?? 'test', engine_version: result.engine_version,
      computed_at: result.computed_at, quote: { public: result.public },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    console.error('quote-engine failed:', message);
    return json({ error: message }, 400);
  }
});
