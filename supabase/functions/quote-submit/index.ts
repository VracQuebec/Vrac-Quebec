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
import { clientIp, GuardError } from '../_shared/public-guard.ts';
import { claimQuote, completeQuote, quoteFingerprint, releaseQuote, SCOPE } from './dedupe.ts';
import { cleanAnswers, findLead, patchLead, upsertLead, validLeadToken } from './lead.ts';
import { handleEstimate } from './estimate.ts';
import { fetchWithTimeout } from '../_shared/http.ts';
import { logEvent, logEventAsync } from '../_shared/observability.ts';

const UNITS: Unit[] = ['tonne', 'verge', 'm3', 'voyage'];
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

async function resolveMaterialId(sb: any, body: any): Promise<string | null> {
  if (typeof body?.material_id === 'string' && body.material_id.length >= 10) return body.material_id;
  const catalogId = typeof body?.material_catalog_id === 'string' && body.material_catalog_id.length >= 10 ? body.material_catalog_id : null;
  if (catalogId) {
    let q = sb.from('jsc_materials').select('id').eq('material_catalog_id', catalogId)
      .eq('is_active', true).is('archived_at', null);
    const v = typeof body?.material_variant_id === 'string' && body.material_variant_id.length >= 10 ? body.material_variant_id : null;
    const g = typeof body?.granulometry_id === 'string' && body.granulometry_id.length >= 10 ? body.granulometry_id : null;
    // Variante exacte : jamais de repli sur un prix générique du matériau.
    if (v) q = q.eq('variant_id', v);
    else { q = g ? q.eq('granulometry_id', g) : q.is('granulometry_id', null); q = q.is('variant_id', null); }
    const { data } = await q.limit(2);
    return data?.length === 1 ? data[0].id : null;
  }
  const slug = clean(body?.material_slug, 120);
  if (!slug) return null;
  const { data } = await sb.from('jsc_materials').select('id').eq('slug', slug)
    .eq('is_active', true).is('archived_at', null).maybeSingle();
  return data?.id ?? null;
}

/**
 * Envoi courriel : la fonction retourne l'erreur réelle. L'appelant
 * décide de la suite ; aucun succès n'est simulé.
 * `idempotencyKey` empêche tout envoi multiple du même courriel.
 */
async function sendEmail(payload: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetchWithTimeout(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-email`, {
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
  // Réservation anti-doublon : libérée si la création échoue, confirmée
  // (avec la référence exacte) dès que la demande existe réellement.
  let claimId: string | null = null;
  let recorded: { request_number: unknown; quote_number: unknown; valid_until: unknown } | null = null;
  const sb = db();
  try {
    const body = await req.json().catch(() => null);
    const rawAction = body?.action;
    const action = rawAction === 'callback' ? 'callback' : 'submit';

    // ---------- Refus de la soumission par le client (aucun courriel) ----------
    if (rawAction === 'decision') {
      const token = validLeadToken(body?.lead_token);
      if (!token || body?.decision !== 'refusee') return json({ ok: false, error: 'Requête invalide.' }, 400);
      const lead = await findLead(sb, token);
      if (!lead) return json({ ok: false, error: 'Demande introuvable.' }, 404);
      // Une soumission déjà acceptée n'est jamais requalifiée en refus.
      if (lead.quote_client_decision !== 'acceptee') {
        await patchLead(sb, lead.id, { quote_client_decision: 'refusee', quote_decision_at: new Date().toISOString() });
      }
      return json({ ok: true, request_number: lead.submission_number, decision: lead.quote_client_decision === 'acceptee' ? 'acceptee' : 'refusee' });
    }

    // ---------- Validation des coordonnées ----------
    const name = clean(body?.contact?.name, 160);
    const phone = clean(body?.contact?.phone, 40);
    const email = clean(body?.contact?.email, 200);
    const company = clean(body?.contact?.company, 160);
    const comments = clean(body?.contact?.comments, 2000);
    const accessNotes = clean(body?.access_notes, 500);
    const rawDate = clean(body?.desired_date, 10);
    const desiredDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
    if (!name) throw new Error('Votre nom est requis.');
    if (!phone || phone.replace(/\D/g, '').length < 10) throw new Error('Un numéro de téléphone valide est requis.');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Un courriel valide est requis.');

    const materialId = await resolveMaterialId(sb, body);
    const catalogId = typeof body?.material_catalog_id === 'string' && body.material_catalog_id.length >= 10 ? body.material_catalog_id : null;
    const variantId = typeof body?.material_variant_id === 'string' && body.material_variant_id.length >= 10 ? body.material_variant_id : null;
    const granulometryId = typeof body?.granulometry_id === 'string' && body.granulometry_id.length >= 10 ? body.granulometry_id : null;
    const customMaterial = clean(body?.custom_material, 500);
    if (!materialId && !catalogId && !customMaterial) throw new Error('Matériau requis.');
    const leadToken = validLeadToken(body?.lead_token);

    // ---------- Demande de prix : enregistrement CRM AVANT le calcul ----------
    if (rawAction === 'estimate') {
      return await handleEstimate(req, sb, body, {
        leadToken, name, phone, email, company, comments, accessNotes, desiredDate,
        materialId, catalogId, granulometryId, customMaterial,
      });
    }

    const quantity = Number(body?.quantity);
    const unit: Unit = body?.unit ?? 'tonne';
    const address = clean(body?.address, 300);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) throw new Error('Quantité invalide.');
    if (!UNITS.includes(unit)) throw new Error('Unité invalide.');
    if (!address || address.length < 5) throw new Error('Adresse de livraison requise.');

    // ---------- Protection : robots, pourriel, débit, doublons ----------
    // Mécanisme partagé avec submit-parcours (guard_claim/complete/release).
    const fingerprint = await quoteFingerprint({
      email, action, quantity, unit, address,
      material: String(body?.material_id ?? body?.material_slug ?? ''),
      catalogId, variantId, granulometryId, customMaterial,
    });
    const claim = await claimQuote(sb, {
      identity: email.toLowerCase(), fingerprint,
      honeypot: body?.website, formStartedAt: body?.form_started_at,
      freeText: [comments, name, company].filter(Boolean).join(' '), ip: clientIp(req),
    });
    if (claim.kind === 'duplicate') {
      // Référence EXACTE mémorisée à la création : aucun recalcul, aucune
      // écriture CRM et aucun courriel.
      logEventAsync({ source: 'quote_submit', event: 'submission.duplicate', level: 'warn' });
      return json({ ok: true, duplicate: true, ...claim.ref, emailed_to: null, email_sent: true });
    }
    if (claim.kind === 'in_progress') {
      logEventAsync({ source: 'quote_submit', event: 'submission.in_progress', level: 'warn' });
      return json({
        ok: false, code: 'in_progress', retryable: true,
        error: "Votre demande est en cours d'enregistrement. Patientez quelques secondes avant de vérifier votre courriel ou de réessayer.",
      }, 409);
    }
    claimId = claim.claimId;

    // ---------- Recalcul serveur (source unique de vérité) ----------
    const delivery = await geocode(address);
    let manualReason: string | null = null;
    let result: any = null;
    if (customMaterial) manualReason = 'Matériau introuvable dans le catalogue : qualification requise.';
    else if (!materialId) manualReason = 'Aucun produit tarifé pour ce matériau / cette variante (Sur demande).';
    else {
      try {
        const config = await loadConfig(sb, materialId);
        result = await runCarrierQuote(
          {
            material_id: materialId, quantity, unit, delivery,
            truck_id: typeof body?.truck_id === 'string' && body.truck_id.length >= 10 ? body.truck_id : null,
          },
          config,
          distanceProvider,
        );
      } catch (e) {
        manualReason = e instanceof Error ? e.message : String(e);
      }
    }

    // ---------- Traitement manuel : aucune somme présentée comme définitive ----------
    if (manualReason) {
      let catalogName: string | null = null;
      if (catalogId) {
        const { data: c } = await sb.from('material_catalog').select('name_fr').eq('id', catalogId).maybeSingle();
        catalogName = c?.name_fr ?? null;
      }
      let variantLabel: string | null = null;
      if (granulometryId) {
        const { data: g } = await sb.from('material_granulometries').select('label_fr').eq('id', granulometryId).maybeSingle();
        variantLabel = g?.label_fr ?? null;
      }
      const materialLabel = customMaterial ? `Autre : ${customMaterial}` : [catalogName ?? 'Matériau', variantLabel].filter(Boolean).join(' ');
      const { data: client, error: clientError } = await sb.from('jsc_clients').insert({
        client_type: company ? 'entreprise' : 'particulier', name: company ?? name, contact_name: name, phone, email,
        billing_address: delivery.address, city: delivery.city, postal_code: delivery.postal_code,
        latitude: delivery.lat, longitude: delivery.lng,
      }).select('id').single();
      if (clientError) throw new Error(clientError.message);
      const { data: request, error: requestError } = await sb.from('jsc_requests').insert({
        client_id: client.id, source: 'soumission_web_manuelle',
        material_id: materialId, material_catalog_id: catalogId, granulometry_id: granulometryId, material_variant_id: variantId,
        custom_material_description: customMaterial, manual_reason: manualReason,
        quantity, quantity_unit: unit, delivery_address: delivery.address, city: delivery.city,
        postal_code: delivery.postal_code, latitude: delivery.lat, longitude: delivery.lng,
        desired_date: desiredDate,
        notes: [`Soumission à confirmer — ${manualReason}`, comments ?? '', accessNotes ? `Accès : ${accessNotes}` : ''].filter(Boolean).join('\n'),
      }).select('id,request_number').single();
      if (requestError) throw new Error(requestError.message);
      recorded = { request_number: request.request_number, quote_number: null, valid_until: null };
      await completeQuote(sb, claimId!, { submission_id: request.id, ...recorded });
      try {
        const manualDescription = [`Soumission à confirmer (${request.request_number ?? ''})`, `Matériau : ${materialLabel}`, `Quantité : ${quantity} ${unit}`, `Motif : ${manualReason}`, comments ? `Notes : ${comments}` : ''].filter(Boolean).join('\n');
        const manualFields = {
          quote_calc_status: 'manuel', quote_calc_error: manualReason, quote_calc_at: new Date().toISOString(),
          quote_client_decision: action === 'callback' ? 'rappel' : 'en_attente',
        };
        if (leadToken) {
          await upsertLead(sb, leadToken, {
            name, email, phone: phone ?? '', company: company ?? null,
            address: delivery.address, city: delivery.city ?? null, postal_code: delivery.postal_code ?? null,
            lat: delivery.lat, lng: delivery.lng, materialLabel, quantityLabel: `${quantity} ${unit}`,
            quantityValue: quantity, quantityUnit: unit, desiredDate, description: manualDescription,
            answers: cleanAnswers(body?.form_answers),
          }, manualFields);
        } else {
          const { error: leadErr } = await sb.from('submissions').insert({
            materials: [materialLabel], property_type: 'Non spécifié', quantity: `${quantity} ${unit}`,
            tonnage: unit === 'tonne' ? String(quantity) : '',
            address: delivery.address, postal_code: delivery.postal_code ?? '', city: delivery.city ?? null,
            name, email, phone: phone ?? '', company: company ?? null,
            description: manualDescription,
            request_type: 'vrac', service_type: 'vrac_achat', desired_date: desiredDate, ...manualFields,
          });
          if (leadErr) throw new Error(leadErr.message);
        }
      } catch (e) {
        await logEvent({ source: 'quote_submit', event: 'crm.lead_failed', level: 'error', message: e instanceof Error ? e.message : String(e) });
      }
      await sb.rpc('jsc_notify', {
        _company_id: null, _event_code: 'quote_callback',
        _title: `Soumission à confirmer ${request.request_number ?? ''}`,
        _body: `${name} — ${materialLabel}, ${quantity} ${unit}. Motif : ${manualReason}`,
        _audience: 'admin', _user_id: null, _entity_type: 'request', _entity_id: request.id,
      });
      return json({ ok: true, manual: true, request_number: request.request_number, quote_number: null, valid_until: null, emailed_to: email });
    }
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
      material_id: materialId, material_catalog_id: catalogId, granulometry_id: granulometryId, material_variant_id: variantId,
      quantity,
      quantity_unit: unit,
      delivery_address: delivery.address,
      city: delivery.city,
      postal_code: delivery.postal_code,
      latitude: delivery.lat,
      longitude: delivery.lng,
      notes: [
        action === 'callback' ? 'Rappel demandé.' : '',
        comments ?? '',
        accessNotes ? `Accès : ${accessNotes}` : '',
        desiredDate ? `Date souhaitée : ${desiredDate}` : '',
      ].filter(Boolean).join('\n') || null,
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
    // La soumission EXISTE : on mémorise sa référence avant tout envoi.
    recorded = { request_number: request.request_number, quote_number: quote.quote_number, valid_until: quote.valid_until };
    await completeQuote(sb, claimId!, { submission_id: quote.id, request_id: request.id, ...recorded });

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
        truckLabel ? `Camion : ${truckLabel}` : '',
        pub.distance_km != null ? `Distance : ${pub.distance_km} km` : '',
        durationMinutes ? `Temps estimé : ${durationMinutes} min` : '',
        `Prix estimé : ${money(pub.total)}`,
        desiredDate ? `Date souhaitée : ${desiredDate}` : '',
        accessNotes ? `Accès : ${accessNotes}` : '',
        action === 'callback' ? 'Rappel demandé par le client.' : '',
        comments ? `Notes : ${comments}` : '',
      ].filter(Boolean).join('\n');

      const quoteFields = {
        client_id: null,
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
        quote_calc_status: 'calculee', quote_calc_error: null, quote_calc_at: new Date().toISOString(),
        // Décision du client, distincte du statut de suivi CRM.
        quote_client_decision: action === 'callback' ? 'rappel' : 'acceptee',
        quote_decision_at: new Date().toISOString(),
      };
      let lead: { id: string } | null = null;
      if (leadToken) {
        // Même demande que celle enregistrée au calcul : aucune nouvelle ligne.
        lead = await upsertLead(sb, leadToken, {
          name, email, phone: phone ?? '', company: company ?? null,
          address: deliveryAddress, city: delivery.city ?? null, postal_code: delivery.postal_code ?? null,
          lat: delivery.lat, lng: delivery.lng,
          materialLabel: pub.material.name, quantityLabel,
          quantityValue: quantity, quantityUnit: unit, desiredDate, description,
          answers: cleanAnswers(body?.form_answers),
        }, quoteFields);
      } else {
        const { data, error: leadError } = await sb.from('submissions').insert({
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
          desired_date: desiredDate,
          ...quoteFields,
        }).select('id').single();
        if (leadError) throw new Error(leadError.message);
        lead = data;
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
      const adminMail = await sendEmail({
        templateName: 'soumission-interne',
        recipientEmail: adminEmail,
        idempotencyKey: `soumission-interne-${quote.id}`,
        templateData: {
          ...clientData, phone, email, kind: action,
          requestNumber: request.request_number, notes: comments,
          crmLink: 'https://vracquebec.ca/admin/soumissions',
        },
      });
      // Courriel interne en échec : la demande reste enregistrée et visible
      // dans l'administration (notification ci-dessous) ; alerte journalisée.
      if (!adminMail.ok) {
        await logEvent({
          source: 'email', event: 'submission.internal_email_failed', level: 'critical',
          message: adminMail.error, refId: quote.quote_number ?? quote.id,
        });
      }
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

    // La soumission est ENREGISTRÉE : le courriel n'est jamais bloquant
    // (aligné sur quote-assistant). On confirme avec les numéros et on
    // signale honnêtement l'échec d'envoi ; l'équipe est alertée via le
    // journal critique ci-dessous et peut retenter l'envoi sans recréer
    // la demande (clé d'idempotence par soumission).
    if (!clientMail.ok) {
      await logEvent({
        source: 'email', event: 'submission.email_failed', level: 'critical',
        message: clientMail.error, refId: quote.quote_number ?? quote.id,
      });
      return json({
        ok: true,
        email_sent: false,
        notice: "confirmation_email_failed",
        quote_number: quote.quote_number,
        request_number: request.request_number,
        valid_until: quote.valid_until,
        emailed_to: null,
      });
    }

    return json({
      ok: true,
      email_sent: true,
      quote_number: quote.quote_number,
      request_number: request.request_number,
      valid_until: quote.valid_until,
      emailed_to: email,
    });
  } catch (e) {
    if (recorded) {
      // La demande est enregistrée : une erreur d'après-traitement ne doit
      // jamais la faire passer pour perdue (le visiteur renverrait).
      await logEvent({ source: 'quote_submit', event: 'post_record.failed', level: 'critical', message: e instanceof Error ? e.message : String(e) });
      return json({ ok: true, ...recorded, email_sent: false, notice: 'confirmation_email_failed', emailed_to: null });
    }
    if (claimId) await releaseQuote(sb, claimId, 'create_failed');
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
    // Ne jamais exposer le détail technique (schéma, contraintes) au visiteur.
    return json({ ok: false, error: "Une erreur est survenue. Veuillez réessayer." }, 400);
  }
});
