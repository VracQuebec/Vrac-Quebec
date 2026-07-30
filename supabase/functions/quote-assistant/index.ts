// ============================================================
// VRAC QUÉBEC OS — ASSISTANT INTELLIGENT DE SOUMISSION (API)
// ------------------------------------------------------------
// Interface publique du parcours d'estimation. Cette fonction
// n'applique AUCUNE règle métier : elle expose le catalogue admin,
// appelle les moteurs (Decision + Calculation) et enregistre le
// résultat dans le CRM (client, demande, estimation).
//
// POST { action: 'catalog' | 'advise' | 'quote' | 'submit', ... }
// Le client ne reçoit jamais le bloc technique (fournisseur,
// transporteur, coûts, marge, paramètres, traces de décision).
// ============================================================
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { runQuote, type QuoteResult, type Unit } from '../_shared/vqos/index.ts';
import { distanceProvider, geocode, loadConfig } from '../_shared/vqos/runtime.ts';

const UNITS: Unit[] = ['tonne', 'verge', 'm3'];
const EXCLUDED = /remblai/i; // Le module Remblai reste totalement indépendant.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const clean = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};

function db() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

// ---------- 1. Catalogue (100 % paramètres administrateur) ----------
async function catalog(sb: any) {
  const [cats, mats] = await Promise.all([
    sb.from('jsc_material_categories').select('id,name,code,description,sort_order')
      .eq('is_active', true).is('archived_at', null)
      .order('sort_order', { ascending: true }).order('name', { ascending: true }),
    sb.from('jsc_materials')
      .select('id,name,code,category_id,category,unit,density_kg_per_m3,public_description,sort_order')
      .eq('is_active', true).is('archived_at', null)
      .order('sort_order', { ascending: true }).order('name', { ascending: true }),
  ]);
  if (cats.error) throw new Error(cats.error.message);
  if (mats.error) throw new Error(mats.error.message);

  const categories = (cats.data ?? []).filter((c: any) => !EXCLUDED.test(`${c.name} ${c.code ?? ''}`));
  const allowed = new Set(categories.map((c: any) => c.id));
  const materials = (mats.data ?? []).filter(
    (m: any) => !EXCLUDED.test(`${m.name} ${m.code ?? ''} ${m.category ?? ''}`) &&
      (!m.category_id || allowed.has(m.category_id)),
  );
  return { ok: true, categories, materials };
}

// ---------- 2. Conseiller « Je ne sais pas quel matériau choisir » ----------
async function advise(sb: any, answers: Record<string, string>) {
  const { materials } = await catalog(sb);
  if (!materials.length) return { ok: true, recommendations: [] };

  const key = Deno.env.get('LOVABLE_API_KEY');
  const list = materials.map((m: any) =>
    `- ${m.id} | ${m.name}${m.code ? ` (${m.code})` : ''}${m.category ? ` — ${m.category}` : ''}${m.public_description ? ` : ${m.public_description}` : ''}`,
  ).join('\n');

  if (key) {
    try {
      const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content:
                "Tu es conseiller en matériaux en vrac au Québec. À partir du catalogue fourni, recommande au maximum 3 matériaux adaptés au projet du client. Réponds UNIQUEMENT en JSON : {\"recommendations\":[{\"material_id\":\"...\",\"reason\":\"une phrase simple en français\"}]}. N'invente aucun identifiant.",
            },
            {
              role: 'user',
              content: `Catalogue disponible :\n${list}\n\nProjet du client :\n${
                Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n')
              }`,
            },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content ?? '';
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
        const byId = new Map(materials.map((m: any) => [m.id, m]));
        const recommendations = (parsed?.recommendations ?? [])
          .filter((r: any) => byId.has(r.material_id))
          .slice(0, 3)
          .map((r: any) => ({ material: byId.get(r.material_id), reason: clean(r.reason, 240) }));
        if (recommendations.length) return { ok: true, recommendations };
      } else {
        console.error('advise gateway error', res.status, await res.text());
      }
    } catch (e) {
      console.error('advise failed, fallback catalogue', e instanceof Error ? e.message : e);
    }
  }

  // Repli : les premiers matériaux du catalogue, dans l'ordre défini par l'administration.
  return {
    ok: true,
    recommendations: materials.slice(0, 3).map((m: any) => ({
      material: m,
      reason: m.public_description ?? 'Matériau polyvalent proposé par notre équipe.',
    })),
  };
}

// ---------- 3. Estimation (moteurs uniquement) ----------
interface QuoteArgs { material_id: string; quantity: number; unit: Unit; address: string }

function readQuoteArgs(body: any): QuoteArgs {
  const material_id = body?.material_id;
  const quantity = Number(body?.quantity);
  const unit: Unit = body?.unit ?? 'tonne';
  const address = clean(body?.address, 300);
  if (typeof material_id !== 'string' || material_id.length < 10) throw new Error('Matériau requis.');
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) throw new Error('Quantité invalide.');
  if (!UNITS.includes(unit)) throw new Error('Unité invalide.');
  if (!address || address.length < 5) throw new Error('Adresse de livraison requise.');
  return { material_id, quantity, unit, address };
}

async function computeQuote(sb: any, args: QuoteArgs) {
  const delivery = await geocode(args.address);
  const config = await loadConfig(sb, args.material_id);
  const result = await runQuote(
    { material_id: args.material_id, quantity: args.quantity, unit: args.unit, delivery },
    config,
    distanceProvider,
  );
  return { result, delivery };
}

// ---------- 4. Confirmation : client + demande + estimation ----------
async function submit(sb: any, body: any) {
  const args = readQuoteArgs(body);
  const name = clean(body?.contact?.name, 160);
  const phone = clean(body?.contact?.phone, 40);
  const email = clean(body?.contact?.email, 200);
  const company = clean(body?.contact?.company, 160);
  const comments = clean(body?.contact?.comments, 2000);
  const desiredDate = clean(body?.desired_date, 10);

  if (!name) throw new Error('Votre nom est requis.');
  if (!phone || phone.replace(/\D/g, '').length < 10) throw new Error('Un numéro de téléphone valide est requis.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Un courriel valide est requis.');
  if (desiredDate && !/^\d{4}-\d{2}-\d{2}$/.test(desiredDate)) throw new Error('Date souhaitée invalide.');

  // Recalcul serveur : la valeur affichée au client n'est jamais celle enregistrée sans vérification.
  const { result, delivery } = await computeQuote(sb, args);
  const best = result.technical.selected;

  const { data: client, error: clientError } = await sb.from('jsc_clients').insert({
    client_type: company ? 'entreprise' : 'particulier',
    name: company ?? name,
    contact_name: name,
    phone,
    email,
    billing_address: delivery.address,
    city: delivery.city,
    postal_code: delivery.postal_code,
    latitude: delivery.lat,
    longitude: delivery.lng,
  }).select('id,name').single();
  if (clientError) throw new Error(clientError.message);

  const { data: request, error: requestError } = await sb.from('jsc_requests').insert({
    client_id: client.id,
    source: 'assistant',
    material_id: args.material_id,
    quantity: args.quantity,
    quantity_unit: args.unit,
    delivery_address: delivery.address,
    city: delivery.city,
    postal_code: delivery.postal_code,
    latitude: delivery.lat,
    longitude: delivery.lng,
    zone_id: best.plan.zone.id,
    desired_date: desiredDate,
    notes: comments,
  }).select('id,request_number').single();
  if (requestError) throw new Error(requestError.message);

  const { error: estimateError } = await sb.from('jsc_estimates').insert({
    request_id: request.id,
    engine_version: result.engine_version,
    carrier_id: best.plan.carrier.id,
    truck_id: best.plan.truck?.id ?? null,
    supplier_id: best.plan.supplier.id,
    pickup_location_id: best.plan.pickup.id,
    material_id: best.plan.material.id,
    transport_rate_id: best.plan.rate?.id ?? null,
    trips: best.plan.trips,
    distance_km: best.plan.distance_km,
    billed_hours: best.time.total_hours_billed,
    material_cost: best.cost.material_cost,
    transport_cost: best.cost.transport_cost,
    surcharges: best.cost.surcharges_total,
    margin: best.cost.margin_amount,
    subtotal: best.cost.subtotal,
    tax_total: best.cost.tax_total,
    total: best.cost.total,
    decision: result.technical.decision_trace as unknown as Record<string, unknown>,
    calculation: { public: result.public, selected: best, options: result.technical.options },
    settings_snapshot: result.technical.settings_used as unknown as Record<string, unknown>,
    is_selected: true,
  });
  if (estimateError) throw new Error(estimateError.message);

  const logged = await sb.rpc('jsc_log_event', {
    _action: 'assistant_submission',
    _entity_type: 'jsc_requests',
    _entity_id: request.id,
    _label: request.request_number,
    _context: { engine_version: result.engine_version, total: result.public.total, source: 'assistant' },
  });
  if (logged.error) console.error('audit log failed', logged.error.message);

  return {
    ok: true,
    request_number: request.request_number,
    quote: { public: result.public },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non supportée' }, 405);

  try {
    const sb = db();
    const body = await req.json().catch(() => null);
    switch (body?.action) {
      case 'catalog':
        return json(await catalog(sb));
      case 'advise':
        return json(await advise(sb, body?.answers ?? {}));
      case 'quote': {
        const { result } = await computeQuote(sb, readQuoteArgs(body));
        return json({
          ok: true,
          engine_version: result.engine_version,
          computed_at: result.computed_at,
          quote: { public: result.public },
        });
      }
      case 'submit':
        return json(await submit(sb, body));
      default:
        return json({ error: 'Action inconnue.' }, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    console.error('quote-assistant failed:', message);
    return json({ error: message }, 400);
  }
});
