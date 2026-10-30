// ============================================================
// Action « estimate » : demande de prix du parcours public
// 1. Enregistre (ou met à jour) la demande dans le CRM ;
// 2. seulement ensuite, lance le moteur unique ;
// 3. inscrit le résultat (calculé, échec, traitement manuel) sur la
//    MÊME demande. Aucun courriel, aucun SMS : la notification interne
//    habituelle du CRM est créée à l'insertion par les déclencheurs.
// Si l'enregistrement échoue, aucun calcul n'est lancé et le visiteur
// est invité à réessayer (rien n'est présenté comme reçu).
// ============================================================
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { type Unit } from '../_shared/vqos/index.ts';
import { runCarrierQuote } from '../_shared/vqos/jsc-engine.ts';
import { distanceProvider, geocode, loadConfig } from '../_shared/vqos/runtime.ts';
import { clientIp, enforceIpQuota, GuardError } from '../_shared/public-guard.ts';
import { logEvent, logEventAsync } from '../_shared/observability.ts';
import { cleanAnswers, patchLead, upsertLead } from './lead.ts';

const UNITS: Unit[] = ['tonne', 'verge', 'm3', 'voyage'];
const UNIT_LABEL: Record<string, string> = { tonne: 'tonnes', m3: 'm³', verge: 'verges³', voyage: 'voyage(s)' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const clean = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};

export interface EstimateCtx {
  leadToken: string | null;
  name: string; phone: string; email: string; company: string | null;
  comments: string | null; accessNotes: string | null; desiredDate: string | null;
  materialId: string | null; catalogId: string | null; granulometryId: string | null; customMaterial: string | null;
}

async function materialLabelOf(sb: any, c: EstimateCtx, body: any): Promise<string> {
  if (c.customMaterial) return `Autre : ${c.customMaterial}`;
  if (c.materialId) {
    const { data } = await sb.from('jsc_materials').select('name').eq('id', c.materialId).maybeSingle();
    if (data?.name) return data.name;
  }
  if (c.catalogId) {
    const { data } = await sb.from('material_catalog').select('name_fr').eq('id', c.catalogId).maybeSingle();
    const label = clean(body?.material_label, 200);
    return label ?? data?.name_fr ?? 'Matériau';
  }
  return clean(body?.material_label, 200) ?? 'Matériau';
}

export async function handleEstimate(req: Request, sb: any, body: any, c: EstimateCtx): Promise<Response> {
  const started = Date.now();
  if (!c.leadToken) return json({ ok: false, recorded: false, error: 'Requête invalide : rechargez la page puis réessayez.' }, 400);
  // Champ piège anti-robot rempli : refus sans enregistrement.
  if (typeof body?.website === 'string' && body.website.trim()) {
    return json({ ok: false, recorded: false, error: 'Envoi impossible pour le moment.' }, 400);
  }
  try {
    await enforceIpQuota(sb, 'quote-estimate', clientIp(req), 40, 60);
  } catch (e) {
    const status = e instanceof GuardError ? e.status : 429;
    return json({ ok: false, recorded: false, error: (e as Error).message }, status);
  }

  const address = clean(body?.address, 300) ?? '';
  const quantity = Number(body?.quantity);
  const hasQty = Number.isFinite(quantity) && quantity > 0 && quantity <= 100000;
  const unit = (typeof body?.unit === 'string' ? body.unit : 'tonne') as Unit;
  const unitOk = UNITS.includes(unit);
  const lat = typeof body?.delivery?.lat === 'number' ? body.delivery.lat : null;
  const lng = typeof body?.delivery?.lng === 'number' ? body.delivery.lng : null;
  const quantityLabel = clean(body?.quantity_label, 200)
    ?? (hasQty ? `${quantity} ${UNIT_LABEL[unit] ?? unit}` : 'À déterminer');

  // Motif de traitement manuel : signalé par le formulaire ou constaté ici.
  let manualReason = clean(body?.manual_reason, 500);
  if (!manualReason) {
    if (c.customMaterial) manualReason = 'Matériau introuvable dans le catalogue : qualification requise.';
    else if (!c.materialId) manualReason = 'Aucun produit tarifé pour ce matériau / cette variante (Sur demande).';
    else if (!hasQty) manualReason = 'Quantité non précisée : à évaluer avec le client.';
    else if (!unitOk) manualReason = `Unité non prise en charge (${String(unit).slice(0, 20)}).`;
    else if (address.length < 5) manualReason = 'Adresse de livraison manquante.';
  }

  const materialLabel = await materialLabelOf(sb, c, body);
  const description = [
    'Demande de prix — parcours « J’ai besoin de matériel en vrac »',
    `Matériau : ${materialLabel}`,
    `Quantité : ${quantityLabel}`,
    c.desiredDate ? `Date souhaitée : ${c.desiredDate}` : '',
    c.accessNotes ? `Accès : ${c.accessNotes}` : '',
    c.comments ? `Notes : ${c.comments}` : '',
    'Décision du client : en attente (une demande de prix n’est pas une acceptation).',
  ].filter(Boolean).join('\n');

  // ---------- 1. Enregistrement durable AVANT tout calcul ----------
  let lead;
  try {
    lead = await upsertLead(sb, c.leadToken, {
      name: c.name, email: c.email, phone: c.phone, company: c.company,
      address: address || '—', lat, lng, materialLabel, quantityLabel,
      quantityValue: hasQty ? quantity : null, quantityUnit: unitOk ? unit : null,
      desiredDate: c.desiredDate, description, answers: cleanAnswers(body?.form_answers),
    }, {
      quote_calc_status: manualReason ? 'manuel' : 'en_cours',
      quote_calc_error: manualReason, quote_calc_at: new Date().toISOString(),
    });
  } catch (e) {
    await logEvent({ source: 'quote_submit', event: 'estimate.lead_failed', level: 'critical', message: e instanceof Error ? e.message : String(e) });
    return json({ ok: false, recorded: false, error: "Votre demande n'a pas pu être enregistrée. Vos réponses sont conservées : réessayez dans un instant." }, 503);
  }
  // Après acceptation, un nouveau clic ne modifie plus la décision.
  const decision = lead.quote_client_decision ?? 'en_attente';
  const ref = { recorded: true, request_number: lead.submission_number, decision };

  if (manualReason) {
    logEventAsync({ source: 'quote_submit', event: 'estimate.manual', refId: lead.id });
    return json({ ok: false, ...ref, manual: true, error: manualReason });
  }

  // ---------- 2. Calcul (moteur unique, paramètres administrateur) ----------
  try {
    const delivery = lat != null && lng != null ? { lat, lng, address } : await geocode(address);
    const config = await loadConfig(sb, c.materialId!);
    const { data: guard } = await sb.rpc('jsc_production_guard');
    if (guard && guard.ok === false) {
      throw new Error(guard.message ?? "Configuration incomplète : estimation officielle impossible pour le moment.");
    }
    const result = await runCarrierQuote({
      material_id: c.materialId!, quantity, unit, delivery,
      truck_id: typeof body?.truck_id === 'string' && body.truck_id.length >= 10 ? body.truck_id : null,
    }, config, distanceProvider);
    const pub = result.public as Record<string, any>;
    const truckLabel = pub.truck?.name
      ? (pub.truck?.capacity_tonnes ? `${pub.truck.name} (${pub.truck.capacity_tonnes} tonnes)` : pub.truck.name) : null;
    await patchLead(sb, lead.id, {
      quote_calc_status: 'calculee', quote_calc_error: null, quote_calc_at: new Date().toISOString(),
      quote_material: pub.material?.name ?? materialLabel, quote_quantity: pub.quantity, quote_unit: pub.unit,
      quote_tonnage: pub.tonnage, quote_trips: pub.trips, quote_truck: truckLabel,
      quote_distance_km: pub.distance_km ?? null,
      quote_duration_minutes: Number(pub.estimated_duration_minutes) || null,
      quote_total: pub.total,
    });
    logEventAsync({ source: 'quote_submit', event: 'estimate.computed', durationMs: Date.now() - started, refId: lead.id });
    // Confidentialité : jamais le lieu de chargement, la base ni la marge.
    const { pickup: _p, base: _b, margin_amount: _m, ...clientPublic } = pub;
    return json({ ok: true, ...ref, quote: clientPublic, engine_version: result.engine_version, computed_at: result.computed_at });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Estimation indisponible.';
    const isManual = /soumission à confirmer|sur demande/i.test(message);
    try {
      await patchLead(sb, lead.id, {
        quote_calc_status: isManual ? 'manuel' : 'echec', quote_calc_error: message.slice(0, 1000),
        quote_calc_at: new Date().toISOString(),
      });
    } catch { /* la demande reste enregistrée avec l'état « en cours » */ }
    await logEvent({ source: 'quote_submit', event: 'estimate.failed', level: 'warn', message, refId: lead.id });
    // Le détail exact reste dans le CRM ; le client ne voit jamais d'information
    // interne (lieu de chargement, fournisseur) contenue dans le message moteur.
    return json({
      ok: false, ...ref, manual: isManual,
      error: isManual
        ? 'Soumission à confirmer : le prix ne peut pas être calculé automatiquement pour cette demande.'
        : "Le calcul automatique n'a pas pu être effectué pour cette adresse ou cette quantité.",
    });
  }
}
