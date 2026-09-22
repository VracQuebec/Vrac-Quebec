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
import { type Unit } from '../_shared/vqos/index.ts';
import { runCarrierQuote } from '../_shared/vqos/jsc-engine.ts';
import { distanceProvider, geocode, loadConfig } from '../_shared/vqos/runtime.ts';
import { clientIp, enforceIpQuota, GuardError, guardPublicRequest, rememberResult } from '../_shared/public-guard.ts';

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

// Courriels transactionnels : jamais bloquants pour la confirmation client.
async function sendEmail(payload: Record<string, unknown>) {
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('assistant email failed', e instanceof Error ? e.message : e);
  }
}

// ---------- 1. Catalogue (100 % paramètres administrateur) ----------
async function catalog(sb: any) {
  const [cats, mats, trucks] = await Promise.all([
    sb.from('jsc_material_categories').select('id,name,code,description,sort_order')
      .eq('is_active', true).is('archived_at', null)
      .order('sort_order', { ascending: true }).order('name', { ascending: true }),
    sb.from('jsc_materials')
      .select('id,name,code,category_id,category,unit,density_kg_per_m3,public_description,sort_order')
      .eq('is_active', true).is('archived_at', null)
      .order('sort_order', { ascending: true }).order('name', { ascending: true }),
    sb.from('jsc_trucks')
      .select('id,name,truck_type,capacity_tonnes,capacity_m3,sort_order')
      .eq('is_active', true).is('archived_at', null)
      .order('capacity_tonnes', { ascending: true }),
  ]);
  if (cats.error) throw new Error(cats.error.message);
  if (mats.error) throw new Error(mats.error.message);

  const categories = (cats.data ?? []).filter((c: any) => !EXCLUDED.test(`${c.name} ${c.code ?? ''}`));
  const allowed = new Set(categories.map((c: any) => c.id));
  const materials = (mats.data ?? []).filter(
    (m: any) => !EXCLUDED.test(`${m.name} ${m.code ?? ''} ${m.category ?? ''}`) &&
      (!m.category_id || allowed.has(m.category_id)),
  );
  return { ok: true, categories, materials, trucks: trucks.error ? [] : (trucks.data ?? []) };
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
interface QuoteArgs { material_id: string; quantity: number; unit: Unit; address: string; truck_id?: string | null }

function readQuoteArgs(body: any): QuoteArgs {
  const material_id = body?.material_id;
  const quantity = Number(body?.quantity);
  const unit: Unit = body?.unit ?? 'tonne';
  const address = clean(body?.address, 300);
  if (typeof material_id !== 'string' || material_id.length < 10) throw new Error('Matériau requis.');
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) throw new Error('Quantité invalide.');
  if (!UNITS.includes(unit)) throw new Error('Unité invalide.');
  if (!address || address.length < 5) throw new Error('Adresse de livraison requise.');
  const truck_id = typeof body?.truck_id === 'string' && body.truck_id.length >= 10 ? body.truck_id : null;
  return { material_id, quantity, unit, address, truck_id };
}

async function computeQuote(sb: any, args: QuoteArgs) {
  const delivery = await geocode(args.address);
  const config = await loadConfig(sb, args.material_id);
  const result = await runCarrierQuote(
    {
      material_id: args.material_id, quantity: args.quantity, unit: args.unit, delivery,
      truck_id: args.truck_id ?? null,
    },
    config,
    distanceProvider,
  );
  return { result, delivery };
}

// ---------- 4. Confirmation : client + demande + estimation ----------
async function submit(sb: any, body: any, req: Request) {
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

  // Anti-robot, limitation de débit et surtout DÉDUPLICATION : un double
  // clic (ou un renvoi identique) ne doit jamais créer deux demandes CRM.
  const fingerprint = [
    email.toLowerCase(), args.material_id, String(args.quantity), args.unit, args.address.toLowerCase(),
  ].join('|');
  const guard = await guardPublicRequest(sb, {
    scope: 'assistant-soumission',
    identity: email.toLowerCase(),
    fingerprint,
    honeypot: body?.website,
    formStartedAt: body?.form_started_at,
    freeText: [comments, name].filter(Boolean).join(' '),
    ip: clientIp(req),
  });

  // Recalcul serveur : la valeur affichée au client n'est jamais celle enregistrée sans vérification.
  const { result, delivery } = await computeQuote(sb, args);

  if (guard.duplicate && guard.previous?.request_number) {
    return {
      ok: true,
      deduplicated: true,
      request_number: String(guard.previous.request_number),
      submission_id: guard.previous.submission_id ?? null,
      quote: { public: result.public },
    };
  }

  const best = result.technical.selected as Record<string, any>;

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
    desired_date: desiredDate,
    notes: comments,
  }).select('id,request_number').single();
  if (requestError) throw new Error(requestError.message);

  const { error: estimateError } = await sb.from('jsc_estimates').insert({
    request_id: request.id,
    engine_version: result.engine_version,
    truck_id: best?.truck?.id ?? null,
    supplier_id: best?.pickup?.supplier_id ?? null,
    pickup_location_id: best?.pickup?.id ?? null,
    material_id: result.public.material.id,
    trips: result.public.trips,
    distance_km: result.public.distance_km,
    billed_hours: result.public.billable_hours,
    material_cost: result.public.material_amount,
    transport_cost: result.public.transport_amount,
    subtotal: result.public.subtotal,
    tax_total: result.public.tax_total,
    total: result.public.total,
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

  // ---------- CRM unique : la demande apparaît aussi dans `submissions` ----------
  const attribution = {
    utm_source: clean(body?.attribution?.utm_source, 80),
    utm_medium: clean(body?.attribution?.utm_medium, 80),
    utm_campaign: clean(body?.attribution?.utm_campaign, 120),
    landing_referrer: clean(body?.attribution?.landing_referrer, 300),
  };
  const description = [
    'Demande provenant de /soumission (assistant de transport et livraison).',
    `Matériau : ${result.public.material.name}`,
    `Quantité demandée : ${args.quantity} ${args.unit}`,
    `Tonnage calculé : ${result.public.tonnage} tonnes`,
    `Voyages estimés : ${result.public.trips}`,
    `Estimation totale : ${result.public.total} $`,
    `Référence estimation : ${request.request_number}`,
    desiredDate ? `Date souhaitée : ${desiredDate}` : '',
    comments ? `Notes du demandeur : ${comments}` : '',
  ].filter(Boolean).join('\n');

  let submissionId: string | null = null;
  const { data: lead, error: leadError } = await sb.from('submissions').insert({
    materials: [result.public.material.name],
    property_type: 'Livraison de matériaux',
    quantity: `${args.quantity} ${args.unit}`,
    tonnage: String(result.public.tonnage ?? ''),
    address: delivery.address ?? args.address,
    postal_code: delivery.postal_code ?? '',
    city: delivery.city ?? null,
    name,
    company,
    email,
    phone,
    description,
    request_type: 'transport',
    service_type: 'transport_livraison',
    deliver_or_remove: 'À livrer',
    desired_date: desiredDate,
    ...attribution,
  }).select('id').single();

  if (leadError) {
    console.error('assistant CRM lead failed', leadError.message);
  } else if (lead?.id) {
    submissionId = lead.id as string;
    // Le déclencheur public neutralise les coordonnées : on les réapplique.
    if (typeof delivery.lat === 'number' && typeof delivery.lng === 'number') {
      await sb.from('submissions').update({
        latitude: delivery.lat,
        longitude: delivery.lng,
        formatted_address: delivery.address,
        geocoding_status: 'ok',
        geocoding_provider: 'google',
      }).eq('id', submissionId);
    }
    const mails = (async () => {
      await sendEmail({
        templateName: 'new-lead-notification',
        idempotencyKey: `new-lead-${submissionId}`,
        submissionId,
      });
      await sendEmail({
        templateName: 'client-confirmation',
        idempotencyKey: `client-confirm-${submissionId}`,
        submissionId,
      });
    })();
    const rt = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(mails); else await mails;
  }

  await rememberResult(sb, 'assistant-soumission', fingerprint, {
    request_number: request.request_number,
    submission_id: submissionId,
  });

  return {
    ok: true,
    request_number: request.request_number,
    submission_id: submissionId,
    quote: { public: result.public },
  };
}

// ---------- 5. Calculateur de soumission rapide (CRM, administrateurs) ----------
// Même moteur, même configuration : seule l'interface change. Cette action
// n'écrase jamais une donnée existante ; elle rattache la soumission au lead
// déjà présent lorsqu'il existe, sinon elle en crée un.
async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Accès réservé aux administrateurs.');
  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) throw new Error('Accès réservé aux administrateurs.');
  const sb = db();
  const { data: role } = await sb.rpc('has_role', { _user_id: userData.user.id, _role: 'admin' });
  if (role !== true) throw new Error('Accès réservé aux administrateurs.');
  return { sb, user: userData.user };
}

async function adminSave(req: Request, body: any) {
  const { sb, user } = await requireAdmin(req);
  const args = readQuoteArgs(body);
  const name = clean(body?.contact?.name, 160);
  const phone = clean(body?.contact?.phone, 40);
  const email = clean(body?.contact?.email, 200);
  const company = clean(body?.contact?.company, 160);
  const notes = clean(body?.notes, 2000);
  const source = clean(body?.source, 40) ?? 'crm';
  const existingSubmissionId = clean(body?.submission_id, 40);

  if (!name) throw new Error('Le nom du client est requis.');
  if (!phone && !email) throw new Error('Un téléphone ou un courriel est requis.');

  const { result, delivery } = await computeQuote(sb, args);
  const best = result.technical.selected as Record<string, any>;

  // --- Client CRM : réutilisé s'il existe déjà (jamais de doublon, jamais d'écrasement).
  // Les valeurs sont recherchées par égalité stricte : aucun texte libre
  // n'est injecté dans la grammaire des filtres.
  let clientId: string | null = null;
  if (email) {
    const { data: found } = await sb.from('jsc_clients').select('id')
      .eq('email', email).limit(1).maybeSingle();
    clientId = found?.id ?? null;
  }
  if (!clientId && phone) {
    const { data: found } = await sb.from('jsc_clients').select('id')
      .eq('phone', phone).limit(1).maybeSingle();
    clientId = found?.id ?? null;
  }
  if (!clientId) {
    const { data: created, error } = await sb.from('jsc_clients').insert({
      client_type: company ? 'entreprise' : 'particulier',
      name: company ?? name,
      contact_name: name,
      phone, email,
      billing_address: delivery.address,
      city: delivery.city,
      postal_code: delivery.postal_code,
    }).select('id').single();
    if (error) throw new Error(error.message);
    clientId = created.id as string;
  }

  const { data: request, error: requestError } = await sb.from('jsc_requests').insert({
    client_id: clientId,
    source,
    material_id: args.material_id,
    quantity: args.quantity,
    quantity_unit: args.unit,
    delivery_address: delivery.address,
    city: delivery.city,
    postal_code: delivery.postal_code,
    latitude: delivery.lat,
    longitude: delivery.lng,
    notes,
    created_by: user.id,
  }).select('id,request_number').single();
  if (requestError) throw new Error(requestError.message);

  const { error: estimateError } = await sb.from('jsc_estimates').insert({
    request_id: request.id,
    engine_version: result.engine_version,
    truck_id: best?.truck?.id ?? null,
    supplier_id: best?.pickup?.supplier_id ?? null,
    pickup_location_id: best?.pickup?.id ?? null,
    material_id: result.public.material.id,
    trips: result.public.trips,
    distance_km: result.public.distance_km,
    billed_hours: result.public.billable_hours,
    material_cost: result.public.material_amount,
    transport_cost: result.public.transport_amount,
    subtotal: result.public.subtotal,
    tax_total: result.public.tax_total,
    total: result.public.total,
    decision: result.technical.decision_trace as unknown as Record<string, unknown>,
    calculation: { public: result.public, selected: best, options: result.technical.options },
    settings_snapshot: result.technical.settings_used as unknown as Record<string, unknown>,
    is_selected: true,
  });
  if (estimateError) throw new Error(estimateError.message);

  const summary = [
    `Soumission rapide ${request.request_number} (source : ${source})`,
    `Matériau : ${result.public.material.name}`,
    `Quantité : ${args.quantity} ${args.unit} (${result.public.tonnage} tonnes)`,
    `Camion : ${result.public.truck?.name ?? '—'}`,
    `Voyages : ${result.public.trips}`,
    `Livraison : ${delivery.address ?? args.address}`,
    `Matériau : ${result.public.material_amount} $ · Transport : ${result.public.transport_amount} $`,
    `Sous-total : ${result.public.subtotal} $ · Taxes : ${result.public.tax_total} $ · Total : ${result.public.total} $`,
    notes ? `Notes : ${notes}` : '',
  ].filter(Boolean).join('\n');

  // --- Lead CRM : rattachement prioritaire à une fiche existante.
  let submissionId: string | null = existingSubmissionId;
  if (!submissionId && email) {
    const { data: lead } = await sb.from('submissions').select('id')
      .eq('email', email).order('created_at', { ascending: false }).limit(1).maybeSingle();
    submissionId = lead?.id ?? null;
  }
  if (!submissionId && phone) {
    const { data: lead } = await sb.from('submissions').select('id')
      .eq('phone', phone).order('created_at', { ascending: false }).limit(1).maybeSingle();
    submissionId = lead?.id ?? null;
  }
  let leadCreated = false;
  if (!submissionId) {
    const { data: lead, error: leadError } = await sb.from('submissions').insert({
      materials: [result.public.material.name],
      property_type: 'Livraison de matériaux',
      quantity: `${args.quantity} ${args.unit}`,
      tonnage: String(result.public.tonnage ?? ''),
      address: delivery.address ?? args.address,
      postal_code: delivery.postal_code ?? '',
      city: delivery.city ?? null,
      name, company, email, phone,
      description: summary,
      request_type: 'transport',
      service_type: 'transport_livraison',
      deliver_or_remove: 'À livrer',
      latitude: delivery.lat,
      longitude: delivery.lng,
      formatted_address: delivery.address,
      geocoding_status: 'ok',
      geocoding_provider: 'google',
      utm_source: source,
    }).select('id').single();
    if (leadError) throw new Error(leadError.message);
    submissionId = lead.id as string;
    leadCreated = true;
    if (typeof delivery.lat === 'number' && typeof delivery.lng === 'number') {
      await sb.from('submissions').update({
        latitude: delivery.lat, longitude: delivery.lng,
        formatted_address: delivery.address, geocoding_status: 'ok', geocoding_provider: 'google',
      }).eq('id', submissionId);
    }
  }

  // La fiche existante n'est jamais modifiée : la soumission est journalisée en note.
  if (submissionId) {
    await sb.from('lead_notes').insert({
      submission_id: submissionId,
      author_id: user.id,
      author_email: user.email ?? null,
      note: summary,
    });
  }

  const logged = await sb.rpc('jsc_log_event', {
    _action: 'admin_quick_quote',
    _entity_type: 'jsc_requests',
    _entity_id: request.id,
    _label: request.request_number,
    _context: { source, total: result.public.total, submission_id: submissionId, lead_created: leadCreated },
  });
  if (logged.error) console.error('audit log failed', logged.error.message);

  return {
    ok: true,
    request_number: request.request_number,
    submission_id: submissionId,
    lead_created: leadCreated,
    quote: { public: result.public },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non supportée' }, 405);

  try {
    const sb = db();
    const body = await req.json().catch(() => null);
    // Les actions « advise » et « quote » déclenchent des services payants
    // (IA, géocodage) : quota par adresse pour les appels non connectés.
    if (body?.action === 'advise' || body?.action === 'quote') {
      await enforceIpQuota(sb, `quote-assistant:${body.action}`, clientIp(req), 30, 60);
    }
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
        return json(await submit(sb, body, req));
      case 'admin_save':
        return json(await adminSave(req, body));
      default:
        return json({ error: 'Action inconnue.' }, 400);
    }
  } catch (e) {
    if (e instanceof GuardError) return json({ error: e.message }, e.status);
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    console.error('quote-assistant failed:', message);
    // Message générique côté client : les détails restent dans les logs serveur.
    return json({ error: "Une erreur est survenue. Veuillez réessayer." }, 400);
  }
});
