// ============================================================
// Demande CRM durable du parcours public « achat de vrac »
// ------------------------------------------------------------
// Une seule ligne `submissions` par parcours, identifiée par un jeton
// secret généré dans le navigateur (public_lead_token). La demande est
// enregistrée AVANT tout calcul ; recalculs, reprises, acceptation ou
// refus mettent à jour la même ligne. Le statut de suivi CRM (`status`)
// n'est jamais modifié ici : le résultat du calcul et la décision du
// client vivent dans des champs séparés.
// ============================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const validLeadToken = (v: unknown): string | null =>
  typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : null;

/** Réponses du formulaire : objet borné (8 Ko), jamais de contenu arbitraire volumineux. */
export function cleanAnswers(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  try {
    const s = JSON.stringify(v);
    if (s.length > 8000) return null;
    return JSON.parse(s);
  } catch { return null; }
}

export interface LeadFields {
  name: string; email: string; phone: string; company: string | null;
  address: string; city?: string | null; postal_code?: string | null;
  lat?: number | null; lng?: number | null;
  materialLabel: string; quantityLabel: string;
  quantityValue: number | null; quantityUnit: string | null;
  desiredDate: string | null; description: string;
  answers: Record<string, unknown> | null;
}

export async function findLead(sb: any, token: string) {
  const { data, error } = await sb.from('submissions')
    .select('id,submission_number,quote_client_decision,quote_number')
    .eq('public_lead_token', token).maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; submission_number: number; quote_client_decision: string | null; quote_number: string | null } | null;
}

/**
 * Crée ou met à jour la demande du parcours. Lève une erreur si
 * l'enregistrement échoue : l'appelant ne doit alors rien confirmer.
 */
export async function upsertLead(sb: any, token: string, f: LeadFields, extra: Record<string, unknown> = {}) {
  const common = {
    materials: [f.materialLabel], property_type: 'Non spécifié',
    quantity: f.quantityLabel, tonnage: f.quantityUnit === 'tonne' && f.quantityValue ? String(f.quantityValue) : '',
    quantity_value: f.quantityValue, quantity_unit: f.quantityUnit,
    address: f.address, postal_code: f.postal_code ?? '', city: f.city ?? null,
    name: f.name, email: f.email, phone: f.phone, company: f.company,
    description: f.description, desired_date: f.desiredDate,
    ...(f.answers ? { form_answers: f.answers } : {}),
    ...extra,
  };
  let lead = await findLead(sb, token);
  if (lead) {
    const { error } = await sb.from('submissions').update(common).eq('id', lead.id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await sb.from('submissions').insert({
      request_type: 'vrac', service_type: 'vrac_achat', ...common,
      public_lead_token: token, quote_client_decision: 'en_attente',
    }).select('id,submission_number,quote_client_decision,quote_number').single();
    if (error) {
      // Course entre deux clics : l'autre requête a créé la ligne.
      if ((error as { code?: string }).code === '23505') {
        lead = await findLead(sb, token);
        if (!lead) throw new Error(error.message);
        const { error: e2 } = await sb.from('submissions').update(common).eq('id', lead.id);
        if (e2) throw new Error(e2.message);
      } else throw new Error(error.message);
    } else lead = data;
  }
  // Coordonnées neutralisées à l'insertion publique : réappliquées (adresse validée Google).
  if (lead && f.lat != null && f.lng != null) {
    await sb.from('submissions').update({
      latitude: f.lat, longitude: f.lng, formatted_address: f.address,
      geocoding_status: 'ok', geocoding_provider: 'google',
    }).eq('id', lead!.id);
  }
  return lead!;
}

export async function patchLead(sb: any, id: string, patch: Record<string, unknown>) {
  const { error } = await sb.from('submissions').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}
