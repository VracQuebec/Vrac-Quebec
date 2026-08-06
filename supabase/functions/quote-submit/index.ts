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
import { clientIp, GuardError, guardPublicRequest, rememberResult } from '../_shared/public-guard.ts';
import { logEvent, logEventAsync } from '../_shared/observability.ts';

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

/**
 * Envoi courriel : la fonction retourne l'erreur réelle. L'appelant
 * décide de la suite ; aucun succès n'est simulé.
 * `idempotencyKey` empêche tout envoi multiple du même courriel.
 */
async function sendEmail(payload: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string }> {
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
    if (!res.ok) {
      await logEvent({
        source: 'email', event: 'send.failed', level: 'error',
        message: `Courriel refusé (${payload.templateName}): ${text}`,
        statusCode: res.status, refId: String(payload.idempotencyKey ?? ''),
        context: { template: payload.templateName },
      });
      return { ok: false, error: `Envoi du courriel impossible (${res.status}).` };
    }
    logEventAsync({
      source: 'email', event: 'send.ok',
      refId: String(payload.idempotencyKey ?? ''),
      context: { template: payload.templateName },
    });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logEvent({
      source: 'email', event: 'send.failed', level: 'error',
      message: `${payload.templateName}: ${message}`,
      context: { template: payload.templateName },
    });
    return { ok: false, error: message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non supportée' }, 405);

  const startedAt = Date.now();
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

    // ---------- Protection : robots, pourriel, débit, doublons ----------
    const fingerprint = [
      email.toLowerCase(), body?.material_slug ?? body?.material_id ?? '',
      quantity, unit, address.toLowerCase(), action,
    ].join('|');
    const guard = await guardPublicRequest(sb, {
      scope: 'quote-submit',
      identity: email.toLowerCase(),
      fingerprint,
      honeypot: body?.website,
      formStartedAt: body?.form_started_at,
      freeText: [comments, name, company].filter(Boolean).join(' '),
      ip: clientIp(req),
    });
    if (guard.duplicate) {
      // Demande identique déjà traitée : on renvoie la soumission existante
      // sans recalculer, sans créer de doublon CRM et sans réexpédier de courriel.
      logEventAsync({ source: 'quote_submit', event: 'submission.duplicate', level: 'warn' });
      return json({
        ok: true,
        duplicate: true,
        quote_number: (guard.previous as any)?.quote_number ?? null,
        request_number: (guard.previous as any)?.request_number ?? null,
        valid_until: (guard.previous as any)?.valid_until ?? null,
        emailed_to: email,
      });
    }

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
    // Le courriel doit afficher exactement la même information que la page.
    const UNIT_LABEL: Record<string, string> = { tonne: 'tonnes', m3: 'm³', verge: 'verges³' };
    const quantityLabel = pub.unit && pub.unit !== 'tonne'
      ? `${pub.quantity} ${UNIT_LABEL[pub.unit] ?? pub.unit} (≈ ${pub.tonnage} tonnes)`
      : `${pub.tonnage} tonnes`;
    const truckLabel = pub.truck?.name
      ? (pub.truck?.capacity_tonnes ? `${pub.truck.name} (${pub.truck.capacity_tonnes} tonnes)` : pub.truck.name)
      : null;
    const validLabel = validUntilDate.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });

    // ---------- CRM existant : la demande rejoint la liste des leads ----------
    // Même table, même workflow et mêmes déclencheurs que les autres
    // formulaires publics (`submissions`). Aucun nouveau pipeline.
    try {
      const durationMinutes = Number((pub as any).estimated_duration_minutes) || null;
      const deliveryAddress = publicPayload.delivery_address ?? delivery.address;
      const description = [
        `Soumission automatique ${quote.quote_number ?? ''}`.trim(),
        `Matériau : ${pub.material.name}`,
        `Quantité : ${quantityLabel}`,
        `Voyages : ${pub.trips}`,
        truckLabel ? `Camion recommandé : ${truckLabel}` : '',
        pub.distance_km != null ? `Distance : ${pub.distance_km} km` : '',
        durationMinutes ? `Temps estimé : ${durationMinutes} min` : '',
        `Prix estimé : ${money(pub.total)}`,
        action === 'callback' ? 'Rappel demandé par le client.' : '',
        comments ? `Notes : ${comments}` : '',
      ].filter(Boolean).join('\n');

      const { data: lead, error: leadError } = await sb.from('submissions').insert({
        materials: [pub.material.name],
        property_type: 'Non spécifié',
        quantity: quantityLabel,
        tonnage: String(pub.tonnage ?? ''),
        address: deliveryAddress,
        postal_code: delivery.postal_code ?? '',
        city: delivery.city ?? null,
        name,
        email,
        phone: phone ?? '',
        company: company ?? null,
        description,
        request_type: 'vrac',
        service_type: 'vrac_achat',
        client_id: null,
        desired_date: null,
        quote_number: quote.quote_number ?? null,
        quote_id: quote.id,
        quote_material: pub.material.name,
        quote_quantity: pub.quantity,
        quote_unit: pub.unit,
        quote_tonnage: pub.tonnage,
        quote_trips: pub.trips,
        quote_truck: truckLabel,
        quote_distance_km: pub.distance_km ?? null,
        quote_duration_minutes: durationMinutes,
        quote_total: pub.total,
      }).select('id').single();
      if (leadError) throw new Error(leadError.message);

      // Les coordonnées GPS sont neutralisées à l'insertion publique :
      // on les réapplique aussitôt (adresse déjà validée par Google).
      if (lead?.id && delivery.lat != null && delivery.lng != null) {
        await sb.from('submissions').update({
          latitude: delivery.lat,
          longitude: delivery.lng,
          formatted_address: deliveryAddress,
          geocoding_status: 'ok',
          geocoding_provider: 'google',
        }).eq('id', lead.id);
      }
      logEventAsync({ source: 'quote_submit', event: 'crm.lead_created', refId: String(lead?.id ?? '') });
    } catch (e) {
      // Le CRM ne doit jamais bloquer la soumission client : on journalise.
      await logEvent({
        source: 'quote_submit', event: 'crm.lead_failed', level: 'error',
        message: e instanceof Error ? e.message : String(e),
        refId: quote.quote_number ?? quote.id,
      });
    }

    const clientData = {
      quoteNumber: quote.quote_number, name, material: pub.material.name,
      quantity: quantityLabel, trips: pub.trips, truck: truckLabel,
      address: publicPayload.delivery_address, total: money(pub.total), validUntil: validLabel,
    };

    const clientMail = await sendEmail({
      templateName: 'soumission-client',
      recipientEmail: email,
      idempotencyKey: `soumission-client-${quote.id}`,
      templateData: clientData,
    });

    const adminEmail = await readSetting(sb, 'admin_notification_email');
    if (adminEmail) {
      await sendEmail({
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

    logEventAsync({
      source: 'quote_submit', event: action === 'callback' ? 'callback.created' : 'submission.created',
      durationMs: Date.now() - startedAt,
      refId: quote.quote_number ?? quote.id,
      context: {
        request_number: request.request_number, total: pub.total,
        engine_version: result.engine_version, material: pub.material?.name,
      },
    });

    // La soumission est enregistrée : on mémorise le résultat pour que
    // tout renvoi du même formulaire soit reconnu comme un doublon.
    await rememberResult(sb, 'quote-submit', fingerprint, {
      quote_number: quote.quote_number,
      request_number: request.request_number,
      valid_until: quote.valid_until,
    });

    // Un échec d'envoi n'est jamais masqué par un ok:true.
    if (!clientMail.ok) {
      await logEvent({
        source: 'email', event: 'submission.email_failed', level: 'critical',
        message: clientMail.error, refId: quote.quote_number ?? quote.id,
      });
      return json({
        ok: false,
        error: "Votre soumission a été enregistrée, mais l'envoi du courriel a échoué. Notre équipe vous contactera.",
        email_error: clientMail.error,
        quote_number: quote.quote_number,
        request_number: request.request_number,
      }, 502);
    }

    return json({
      ok: true,
      quote_number: quote.quote_number,
      request_number: request.request_number,
      valid_until: quote.valid_until,
      emailed_to: email,
    });
  } catch (e) {
    if (e instanceof GuardError) {
      logEventAsync({
        source: 'quote_submit', event: `guard.${e.code}`, level: 'warn',
        message: e.message, statusCode: e.status,
      });
      return json({ ok: false, code: e.code, error: e.message }, e.status);
    }
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    await logEvent({
      source: 'quote_submit', event: 'submission.failed', level: 'error',
      message, durationMs: Date.now() - startedAt,
    });
    return json({ ok: false, error: message }, 400);
  }
});
