// PRÉPARÉ — NON DÉPLOYÉ. Imports de staging à adapter selon INTEGRATION.md.
// ============================================================
// PARCOURS PUBLICS /remblai et /depot-materiaux
// ------------------------------------------------------------
// Une seule demande est créée, dans la table `submissions`
// existante (même CRM, mêmes déclencheurs, même workflow).
// Les coordonnées GPS sont réappliquées après l'insertion :
// le déclencheur public les neutralise volontairement.
// ============================================================
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { geocode } from '../_shared/vqos/runtime.ts';
import { clientIp, GuardError } from '../_shared/public-guard.ts';
import { classifyConfirmation, type ConfirmationStatus } from './confirmation-status.ts';
import { parcoursFingerprint } from '../../../supabase/functions/submit-parcours/dedupe-flow.ts';
import { runClaimedCreate, rejectedInsert } from '../_shared/claimed-create.ts';
import { findSubmission } from '../_shared/exact-reference.ts';
import { logEvent, logEventAsync } from '../_shared/observability.ts';
import { fetchWithTimeout } from '../_shared/http.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const clean = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};

const QUANTITY_UNITS = ['tonnes', 'verges3', 'm3', 'voyages', 'inconnu'] as const;
const TRUCK_KEYS = ['6_roues', '10_roues', '12_roues', 'semi_remorque', 'fardier', 'autre'] as const;
const ACCESS_KEYS = [
  'pente_prononcee', 'fils_electriques_bas', 'branches_basses', 'sol_mou',
  'recul_limite', 'demi_tour_possible', 'entree_asphaltee', 'voisinage_rapproche',
] as const;
const PHOTO_KEYS = ['materiau', 'acces', 'chantier', 'autre'] as const;

// Libellés affichés UNIQUEMENT dans le texte lisible; les clés restent la référence.
const TRUCK_LABELS: Record<string, string> = {
  '6_roues': 'Camion 6 roues', '10_roues': 'Camion 10 roues', '12_roues': 'Camion 12 roues',
  semi_remorque: 'Semi-dompeur', fardier: 'Fardier', autre: 'Autre',
};
const ACCESS_LABELS: Record<string, string> = {
  pente_prononcee: 'Pente prononcée', fils_electriques_bas: 'Fils électriques bas',
  branches_basses: "Branches d'arbres basses", sol_mou: 'Sol mou ou boueux',
  recul_limite: 'Espace de recul limité', demi_tour_possible: 'Demi-tour possible sur le terrain',
  entree_asphaltee: 'Entrée asphaltée ou pavée', voisinage_rapproche: 'Voisinage rapproché',
};

const inList = <T extends readonly string[]>(v: unknown, list: T): T[number] | null => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return (list as readonly string[]).includes(s) ? (s as T[number]) : null;
};

const numOrNull = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? n : null;
};

const strArray = (v: unknown, max = 20, len = 200): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => x.trim().slice(0, len)).filter(Boolean).slice(0, max) : [];

function requiredEnv(key: string) { const v = Deno.env.get(key); if (!v) throw new Error('Configuration absente'); return v; }
function db() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
}

async function sendEmail(payload: Record<string, unknown>): Promise<ConfirmationStatus> {
  try {
    const res = await fetchWithTimeout(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify(payload),
    }, 15_000);
    const status = classifyConfirmation(res.ok, await res.json().catch(() => null));
    if (status === 'failed') {
      logEventAsync({ source: 'submit_parcours', event: 'email.failed', level: 'warn', refId: String(payload.submissionId ?? ''), context: { template: payload.templateName, http: res.status } });
    }
    return status;
  } catch (e) {
    logEventAsync({
      source: 'submit_parcours', event: 'email.failed', level: 'warn',
      message: e instanceof Error ? e.message : String(e),
    });
    return 'failed';
  }
}

// Confirmation client : idempotente par demande (un seul lien par dossier côté
// serveur, nouvelle tentative = rejeu du même envoi, jamais un second lien).
const sendClientConfirmation = (id: string) => sendEmail({
  templateName: 'client-confirmation', idempotencyKey: `client-confirm-${id}`, submissionId: id,
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Méthode non supportée' }, 405);

  try {
    const sb = db();
    const body = await req.json().catch(() => null);

    const variant = body?.variant === 'evacuation' ? 'evacuation' : 'reception';
    const name = clean(body?.contact?.name, 160);
    const phone = clean(body?.contact?.phone, 40);
    const email = clean(body?.contact?.email, 200);
    const notes = clean(body?.contact?.notes, 2000);
    const address = clean(body?.address, 300);

    if (!name) throw new Error('Votre nom est requis.');
    if (!phone || phone.replace(/\D/g, '').length < 10) throw new Error('Un numéro de téléphone valide est requis.');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Un courriel valide est requis.');
    if (!address || address.length < 5) throw new Error("L'adresse du terrain est requise.");

    const materials = strArray(body?.materials, 15, 120);
    // Attribution marketing : valeurs brutes uniquement. `lead_source`
    // reste calculé par le déclencheur serveur.
    const attribution = {
      utm_source: clean(body?.attribution?.utm_source, 80),
      utm_medium: clean(body?.attribution?.utm_medium, 80),
      utm_campaign: clean(body?.attribution?.utm_campaign, 120),
      landing_referrer: clean(body?.attribution?.landing_referrer, 300),
    };
    const otherMaterial = clean(body?.other_material, 300);
    const projectUsage = clean(body?.project_usage, 160);
    const quantityLabel = clean(body?.quantity_label, 160) ?? 'Je ne sais pas';
    const truckTypeKey = inList(body?.truck_type, TRUCK_KEYS);
    const quantityUnit = inList(body?.quantity_unit, QUANTITY_UNITS) ?? 'inconnu';
    const quantityValue = quantityUnit === 'inconnu' ? null : numOrNull(body?.quantity_value);
    const desiredDate = clean(body?.desired_date, 20);
    const timeframe = clean(body?.timeframe, 120);
    const accessHeavyTruck = clean(body?.access_heavy_truck, 120);
    const accessDetails = strArray(body?.access_details, 20, 120)
      .map((v) => inList(v, ACCESS_KEYS))
      .filter((v): v is string => Boolean(v));
    const photoEntries = Array.isArray(body?.photos)
      ? body.photos
          .filter((p: unknown) => p && typeof (p as { url?: string }).url === 'string')
          .slice(0, 20)
          .map((p: { url: string; category?: string }) => ({
            url: String(p.url).slice(0, 600),
            category: inList(p.category, PHOTO_KEYS) ?? 'autre',
          }))
      : [];

    type Geo = { lat: number; lng: number; address: string; city: string | null; postal_code: string | null };
    const outcome = await runClaimedCreate<{ geo: Geo | null }>(sb, {
      fingerprint: await parcoursFingerprint({ email, address, variant, quantityLabel, materials }),
      scope: `parcours-${variant}`,
      identity: email.toLowerCase(),
      honeypot: body?.website,
      formStartedAt: body?.form_started_at,
      freeText: [notes, name, otherMaterial].filter(Boolean).join(' '),
      ip: clientIp(req),
    }, { findByClaim: (id) => findSubmission(sb, id), create: async (claimId) => {
    // ---------- Adresse validée côté serveur (Google) ----------
    let geo: Geo | null = null;
    try {
      geo = await geocode(address);
    } catch (e) {
      // L'adresse reste enregistrée telle que saisie : la demande n'est jamais perdue.
      logEventAsync({
        source: 'submit_parcours', event: 'geocode.failed', level: 'warn',
        message: e instanceof Error ? e.message : String(e),
      });
    }

    const description = [
      variant === 'evacuation'
        ? 'Demande provenant de /depot-materiaux (matériaux à sortir).'
        : 'Demande provenant de /remblai (besoin de matériel de remplissage).',
      projectUsage ? `Projet : ${projectUsage}` : '',
      `Quantité : ${quantityLabel}`,
      truckTypeKey ? `Camion : ${TRUCK_LABELS[truckTypeKey]}` : '',
      desiredDate ? `Date souhaitée : ${desiredDate}` : '',
      timeframe ? `Délai : ${timeframe}` : '',
      otherMaterial ? `Précision matériau : ${otherMaterial}` : '',
      accessHeavyTruck ? `Accès camion lourd : ${accessHeavyTruck}` : '',
      accessDetails.length ? `Restrictions : ${accessDetails.map((k) => ACCESS_LABELS[k] ?? k).join(', ')}` : '',
      photoEntries.length
        ? `Photos : ${photoEntries.map((p) => `${p.category}`).join(', ')}`
        : '',
      notes ? `Notes du demandeur : ${notes}` : '',
    ].filter(Boolean).join('\n');

    const { data: lead, error } = await sb.from('submissions').insert({
      guard_claim_id: claimId,
      materials: materials.length ? materials : ['Je ne suis pas certain'],
      other_material: otherMaterial,
      property_type: projectUsage ?? 'Remplissage / remblai',
      quantity: quantityLabel,
      quantity_value: quantityValue,
      quantity_unit: quantityUnit,
      parcours_direction: variant,
      truck_type_key: truckTypeKey,
      access_criteria: accessDetails.length ? accessDetails : null,
      photos_meta: photoEntries.length ? photoEntries : null,
      tonnage: '',
      address,
      postal_code: geo?.postal_code ?? clean(body?.postal_code, 12) ?? '',
      city: geo?.city ?? null,
      name,
      email,
      phone,
      description,
      request_type: 'remblai',
      service_type: variant === 'evacuation' ? 'remblai_disposition' : 'materiel_remplissage',
      deliver_or_remove: variant === 'evacuation' ? 'À sortir du chantier' : 'À livrer',
      photos: photoEntries.map((p) => p.url),
      accessibility: truckTypeKey ? [truckTypeKey] : [],
      truck_types_allowed: truckTypeKey ? [truckTypeKey] : null,
      access_heavy_truck: accessHeavyTruck,
      access_details: (accessDetails.length || photoEntries.length)
        ? { criteres: accessDetails, photos: photoEntries }
        : null,
      desired_date: desiredDate,
      delivery_timeframe: timeframe,
      ...attribution,
    }).select('id').single();

    if (error) throw rejectedInsert(error);
    if (!lead?.id) throw new Error('création incertaine');

    // Le déclencheur public neutralise les coordonnées : on les réapplique.
    // Erreur ici = demande DÉJÀ créée : on journalise sans faire échouer
    // (sinon la réservation serait libérée et un renvoi créerait un double).
    if (lead?.id && geo) try {
      await sb.from('submissions').update({
        latitude: geo.lat,
        longitude: geo.lng,
        formatted_address: geo.address,
        geocoding_status: 'ok',
        geocoding_provider: 'google',
      }).eq('id', lead.id);
    } catch (e) {
      logEventAsync({ source: 'submit_parcours', event: 'geocode.apply_failed', level: 'warn', refId: String(lead.id), message: e instanceof Error ? e.message : String(e) });
    }

      return { ref: { submission_id: String(lead.id) }, data: { geo } };
    } });

    if (outcome.kind === 'in_progress') {
      // Une demande identique est en cours d'enregistrement (autre onglet,
      // double clic, autre instance) : jamais de faux succès ni de référence.
      logEventAsync({ source: 'submit_parcours', event: 'submission.in_progress', level: 'warn', context: { variant } });
      return json({ ok: false, retry: true, message: "Votre demande est en cours d'enregistrement. Patientez quelques secondes puis réessayez." });
    }
    if (outcome.kind === 'duplicate') {
      // Référence EXACTE mémorisée lors de la création initiale.
      // Aucun nouvel enregistrement. Courriel seulement sur demande explicite
      // de nouvelle tentative (écran d'échec) : rejeu idempotent du même dossier.
      logEventAsync({ source: 'submit_parcours', event: 'submission.duplicate', level: 'warn', refId: outcome.ref.submission_id, context: { variant } });
      const email_status = body?.resend_confirmation === true
        ? await sendClientConfirmation(outcome.ref.submission_id)
        : undefined;
      return json({ ok: true, duplicate: true, submission_id: outcome.ref.submission_id, ...(email_status ? { email_status } : {}) });
    }
    if (!outcome.remembered) {
      logEventAsync({ source: 'submit_parcours', event: 'guard.complete_failed', level: 'critical', refId: outcome.ref.submission_id, context: { variant } });
    }
    const geo = outcome.data.geo;
    const lead = { id: outcome.ref.submission_id };

    logEventAsync({ source: 'submit_parcours', event: 'lead.created', refId: String(lead?.id ?? ''), context: { variant } });

    // Confirmation client attendue : son vrai résultat est affiché au demandeur.
    // La notification interne reste en arrière-plan.
    const email_status = await sendClientConfirmation(lead.id);
    const adminMail = sendEmail({
      templateName: 'new-lead-notification',
      idempotencyKey: `new-lead-${lead.id}`,
      submissionId: lead.id,
    });
    const rt = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(adminMail); else await adminMail;

    return json({
      ok: true,
      submission_id: lead.id,
      email_status,
      latitude: geo?.lat ?? null,
      longitude: geo?.lng ?? null,
      formatted_address: geo?.address ?? null,
      city: geo?.city ?? null,
    });
  } catch (e) {
    if (e instanceof GuardError) {
      return json({ ok: false, retry: false, message: e.message }, e.status);
    }
    const message = e instanceof Error ? e.message : String(e);
    await logEvent({ source: 'submit_parcours', event: 'submit.failed', level: 'error', message });
    // Message générique côté client : les détails restent dans les logs serveur.
    return json({ ok: false, retry: false, message: "Une erreur est survenue. Veuillez réessayer." }, 400);
  }
});
