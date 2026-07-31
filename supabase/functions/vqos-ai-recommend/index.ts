// Vrac Québec OS — IA de recommandation : matériaux, quantité, camion, transporteur, moment idéal.
import { adminClient, callAI, corsHeaders, json, parseJsonLoose, quebecSeason, requireAdmin, AI_MODEL } from '../_shared/vqos-intel.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const body = await req.json().catch(() => ({}));
    const requestId = body?.request_id ? String(body.request_id) : null;
    if (!requestId) return json({ error: 'request_id requis' }, 400);

    const admin = adminClient();
    const { data: request } = await admin.from('jsc_requests').select('*').eq('id', requestId).maybeSingle();
    if (!request) return json({ error: 'Demande introuvable' }, 404);

    const [{ data: materials }, { data: trucks }, { data: carriers }, { data: suppliers }, { data: history }] =
      await Promise.all([
        admin.from('jsc_materials').select('id, name, category, subcategory, unit, selling_price, availability')
          .is('archived_at', null).eq('is_active', true).limit(120),
        admin.from('jsc_trucks').select('id, name, truck_type, capacity_tonnes, capacity_m3, availability, operational_status')
          .is('archived_at', null).eq('is_active', true).limit(60),
        admin.from('jsc_companies').select('id, name, availability, priority').is('archived_at', null).limit(40),
        admin.from('jsc_suppliers').select('id, name, city, zone_id').is('archived_at', null).eq('is_active', true).limit(60),
        request.client_id
          ? admin.from('jsc_orders').select('material_id, total, created_at, delivered_quantity')
              .eq('client_id', request.client_id).limit(20)
          : Promise.resolve({ data: [] }),
      ]);

    const context = {
      demande: {
        numero: request.request_number, materiau_id: request.material_id, quantite: request.quantity,
        unite: request.quantity_unit, ville: request.city, code_postal: request.postal_code,
        date_souhaitee: request.desired_date, notes: request.notes,
      },
      saison: quebecSeason(),
      catalogue: materials, camions: trucks, transporteurs: carriers, fournisseurs: suppliers,
      historique_client: history,
    };

    const ai = await callAI([
      {
        role: 'system',
        content:
          "Tu es le moteur de recommandation logistique de Vrac Québec (matériaux en vrac, Québec). " +
          'Tu tiens compte de la saison (dégel printanier, restrictions de charge, gel hivernal), de la région, du type de chantier et de l\'historique. ' +
          "N'utilise que les entités fournies (mêmes noms exacts). Réponds UNIQUEMENT en JSON valide : " +
          '{ "complementary_materials": [{"name","reason"}], "ideal_quantity": {"value","unit","reason"}, ' +
          '"optimal_truck": {"name","reason"}, "optimal_carrier": {"name","reason"}, ' +
          '"ideal_timing": {"window","reason"}, "alternative_suppliers": [{"name","reason"}], "summary": "3 phrases max" }',
      },
      { role: 'user', content: `Données réelles :\n${JSON.stringify(context).slice(0, 22000)}` },
    ], { jsonMode: true });

    if (!ai.ok) return json({ error: ai.error }, ai.status);
    const parsed = parseJsonLoose<Record<string, unknown>>(ai.text);
    if (!parsed) return json({ error: 'Réponse IA illisible' }, 502);

    const { data: saved, error } = await admin.from('jsc_recommendations').insert({
      company_id: request.company_id,
      request_id: request.id,
      scope: 'request',
      payload: parsed,
      summary: String(parsed.summary ?? ''),
      model: AI_MODEL,
    }).select().maybeSingle();
    if (error) return json({ error: error.message }, 500);

    return json({ recommendation: saved });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});