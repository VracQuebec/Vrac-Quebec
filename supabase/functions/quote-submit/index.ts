// ============================================================
// MODULE 5 — SOUMISSION PROFESSIONNELLE (parcours public)
// ------------------------------------------------------------
// Le client ne voit jamais les calculs internes : cette fonction
// recalcule côté serveur, enregistre la soumission dans le CRM
// (client, demande, estimation, soumission), envoie le courriel
// professionnel, notifie l'administration et journalise le tout.
//
// POST { action: 'submit' | 'callback', material_slug|material_id,
//        quantity, unit, address, contact{name,phone,email,company,comments} }
// ============================================================
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { type Unit } from '../_shared/vqos/index.ts';
import { runCarrierQuote } from '../_shared/vqos/jsc-engine.ts';
import { distanceProvider, geocode, loadConfig } from '../_shared/vqos/runtime.ts';

const UNITS: Unit[] = ['tonne', 'verge', 'm3'];
const VALIDITY_SETTING = 'quote_validity_days';
const DEFAULT_VALIDITY_DAYS = 7;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const clean = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};

const money = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n);

function db() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

async function readSetting(sb: any, key: string): Promise<string | null> {
  const { data } = await sb.from('jsc_settings').select('value').eq('key', key)
    .eq('is_active', true).is('archived_at', null).maybeSingle();
  return data?.value ?? null;
}

async function resolveMaterialId(sb: any, body: any): Promise<string> {
  if (typeof body?.material_id === 'string' && body.material_id.length >= 10) return body.material_id;
  const slug = clean(body?.material_slug, 120);
  if (!slug) throw new Error('Matériau requis.');
  const { data } = await sb.from('jsc_materials').select('id').eq('slug', slug)
    .eq('is_active', true).is('archived_at', null).maybeSingle();
  if (!data) throw new Error(`Matériau « ${slug} » non configuré.`);
  return data.id;
}

async function sendEmail(_sb: any, payload: Record<string, unknown>) {
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) console.error(`email failed [${res.status}]: ${text}`);
  } catch (e) {
    console.error('email failed', e instanceof Error ? e.message : e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non supportée' }, 405);

  try {
    const sb = db();
    const body = await req.json().catch(() => null);
    const action = body?.action === 'callback' ? 'callback' : 'submit';

    // ---------- Validation des coordonnées ----------
    const name = clean(body?.contact?.name, 160);
    const phone = clean(body?.contact?.phone, 40);
    const email = clean(body?.contact?.email, 200);
    const company = clean(body?.contact?.company, 160);
    const comments = clean(body?.contact?.comments, 2000);
    if (!name) throw new Error('Votre nom est requis.');
    if (!phone || phone.replace(/\D/g, '').length < 10) throw new Error('Un numéro de téléphone valide est requis.');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Un courriel valide est requis.');

    const materialId = await resolveMaterialId(sb, body);
    const quantity = Number(body?.quantity);
    const unit: Unit = body?.unit ?? 'tonne';
    const address = clean(body?.address, 300);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) throw new Error('Quantité invalide.');
    if (!UNITS.includes(unit)) throw new Error('Unité invalide.');
    if (!address || address.length < 5) throw new Error('Adresse de livraison requise.');

    // ---------- Recalcul serveur (source unique de vérité) ----------
    const delivery = await geocode(address);
    const config = await loadConfig(sb, materialId);
    const result = await runCarrierQuote(
      { material_id: materialId, quantity, unit, delivery },
      config,
      distanceProvider,
    );
    const pub = result.public;
    const sel = result.technical.selected as Record<string, any>;

    // ---------- CRM : client ----------
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
    }).select('id').single();
    if (clientError) throw new Error(clientError.message);

    // ---------- CRM : demande (lead) ----------
    const { data: request, error: requestError } = await sb.from('jsc_requests').insert({
      client_id: client.id,
      source: action === 'callback' ? 'rappel' : 'soumission_web',
      material_id: materialId,
      quantity,
      quantity_unit: unit,
      delivery_address: delivery.address,
      city: delivery.city,
      postal_code: delivery.postal_code,
      latitude: delivery.lat,
      longitude: delivery.lng,
      notes: action === 'callback' ? `Rappel demandé. ${comments ?? ''}`.trim() : comments,
    }).select('id,request_number').single();
    if (requestError) throw new Error(requestError.message);

    // ---------- CRM : estimation technique (interne) ----------
    const { data: estimate, error: estimateError } = await sb.from('jsc_estimates').insert({
      request_id: request.id,
      engine_version: result.engine_version,
      truck_id: sel?.truck?.id ?? null,
      supplier_id: sel?.pickup?.supplier_id ?? null,
      pickup_location_id: sel?.pickup?.id ?? null,
      material_id: pub.material.id,
      trips: pub.trips,
      distance_km: pub.distance_km,
      billed_hours: pub.billable_hours,
      material_cost: pub.material_amount,
      transport_cost: pub.transport_amount,
      subtotal: pub.subtotal,
      tax_total: pub.tax_total,
      total: pub.total,
      decision: result.technical.decision_trace as unknown as Record<string, unknown>,
      calculation: { public: pub, selected: sel, options: result.technical.options },
      settings_snapshot: result.technical.settings_used as unknown as Record<string, unknown>,
      is_selected: true,
    }).select('id').single();
    if (estimateError) throw new Error(estimateError.message);

    // ---------- CRM : soumission professionnelle (document client) ----------
    const validityDays = Number(await readSetting(sb, VALIDITY_SETTING)) || DEFAULT_VALIDITY_DAYS;
    const validUntilDate = new Date(Date.now() + validityDays * 86400000);
    const validUntil = validUntilDate.toISOString().slice(0, 10);

    const publicPayload = {
      material: pub.material.name,
      quantity: pub.quantity,
      unit: pub.unit,
      tonnage: pub.tonnage,
      trips: pub.trips,
      delivery_address: pub.delivery_address ?? delivery.address,
      subtotal: pub.subtotal,
      taxes: pub.taxes,
      tax_total: pub.tax_total,
      total: pub.total,
      contact: { name, phone, email, company },
      valid_until: validUntil,
      requested_callback: action === 'callback',
    };

    const { data: quote, error: quoteError } = await sb.from('jsc_quotes').insert({
      request_id: request.id,
      estimate_id: estimate.id,
      client_id: client.id,
      status: 'sent',
      valid_until: validUntil,
      public_payload: publicPayload,
      subtotal: pub.subtotal,
      tax_total: pub.tax_total,
      total: pub.total,
      sent_at: new Date().toISOString(),
    }).select('id,quote_number,valid_until').single();
    if (quoteError) throw new Error(quoteError.message);

    // ---------- Courriels : client + administration ----------
    const quantityLabel = `${pub.tonnage} tonnes`;
    const validLabel = validUntilDate.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
    const clientData = {
      quoteNumber: quote.quote_number, name, material: pub.material.name,
      quantity: quantityLabel, trips: pub.trips,
      address: publicPayload.delivery_address, total: money(pub.total), validUntil: validLabel,
    };

    await sendEmail(sb, {
      templateName: 'soumission-client',
      recipientEmail: email,
      idempotencyKey: `soumission-client-${quote.id}`,
      templateData: clientData,
    });

    const adminEmail = await readSetting(sb, 'admin_notification_email');
    if (adminEmail) {
      await sendEmail(sb, {
        templateName: 'soumission-interne',
        recipientEmail: adminEmail,
        idempotencyKey: `soumission-interne-${quote.id}`,
        templateData: {
          ...clientData, phone, email, kind: action,
          requestNumber: request.request_number, notes: comments,
          crmLink: 'https://vracquebec.ca/admin/soumissions',
        },
      });
    }

    // ---------- Notifications internes + historique ----------
    await sb.rpc('jsc_notify', {
      _company_id: null,
      _event_code: action === 'callback' ? 'quote_callback' : 'quote_created',
      _title: `${action === 'callback' ? 'Rappel demandé' : 'Nouvelle soumission'} ${quote.quote_number ?? ''}`,
      _body: `${name} — ${pub.material.name}, ${quantityLabel}, ${money(pub.total)}. ${publicPayload.delivery_address ?? ''}`,
      _audience: 'admin',
      _user_id: null,
      _entity_type: 'quote',
      _entity_id: quote.id,
    });

    const logged = await sb.rpc('jsc_log_event', {
      _action: action === 'callback' ? 'quote_callback_requested' : 'quote_sent',
      _entity_type: 'jsc_quotes',
      _entity_id: quote.id,
      _label: quote.quote_number,
      _context: { total: pub.total, engine_version: result.engine_version, source: 'achat-vrac' },
    });
    if (logged.error) console.error('audit log failed', logged.error.message);

    return json({
      ok: true,
      quote_number: quote.quote_number,
      request_number: request.request_number,
      valid_until: quote.valid_until,
      emailed_to: email,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    console.error('quote-submit failed:', message);
    return json({ error: message }, 400);
  }
});
