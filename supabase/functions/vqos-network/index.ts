// Vrac Québec OS — IA réseau (Sprint 5, Écosystème).
// Analyse l'ensemble du réseau : prix, pénuries, charge des transporteurs,
// délais et regroupements de livraisons possibles. Aucune donnée codée en dur.
import { adminClient, callAI, corsHeaders, json, parseJsonLoose, quebecSeason, requireAdmin, AI_MODEL } from '../_shared/vqos-intel.ts';

type Insight = {
  kind: string;
  severity: string;
  title: string;
  body: string;
  impact_amount?: number | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  try {
    const body = await req.json().catch(() => ({}));
    const companyId: string | null = body?.companyId ?? null;

    const db = adminClient();
    const scope = <T>(q: T): T => (companyId ? (q as never as { eq: (a: string, b: string) => T }).eq('company_id', companyId) : q);

    const [profiles, availability, listings, publicRequests, offers, trucks, deliveries, contracts] = await Promise.all([
      db.from('jsc_marketplace_profiles')
        .select('id,name,partner_type,city,region,rating_average,rating_count,service_radius_km,is_published')
        .is('archived_at', null).limit(200),
      db.from('jsc_availability')
        .select('id,profile_id,material_id,status,available_quantity,unit,lead_time_days,wait_time_minutes,daily_capacity_tonnes,price_indication,updated_at')
        .is('archived_at', null).limit(300),
      db.from('jsc_listings')
        .select('id,title,listing_type,material_label,quantity,quantity_unit,price,price_unit,city,status,created_at')
        .is('archived_at', null).eq('status', 'active').limit(200),
      db.from('jsc_public_requests')
        .select('id,title,material_label,quantity,quantity_unit,delivery_city,desired_date,status,created_at')
        .is('archived_at', null).limit(200),
      db.from('jsc_public_offers')
        .select('id,public_request_id,total_price,lead_time_days,status').is('archived_at', null).limit(300),
      scope(db.from('jsc_trucks').select('id,truck_type,capacity_tonnes,is_active').is('archived_at', null)).limit(200),
      scope(db.from('jsc_deliveries').select('id,status,scheduled_date,delivery_city,truck_id,driver_id,quantity').is('archived_at', null)).limit(400),
      scope(db.from('jsc_contracts').select('id,name,status,client_id,discount_percent,ends_on').is('archived_at', null)).limit(200),
    ]);

    const snapshot = {
      saison: quebecSeason(),
      date: new Date().toISOString().slice(0, 10),
      partenaires: profiles.data ?? [],
      disponibilites: availability.data ?? [],
      annonces: listings.data ?? [],
      demandes_publiques: publicRequests.data ?? [],
      offres: offers.data ?? [],
      camions: trucks.data ?? [],
      livraisons: deliveries.data ?? [],
      contrats: contracts.data ?? [],
    };

    const ai = await callAI([
      {
        role: 'system',
        content:
          "Tu es l'IA réseau de Vrac Québec, plateforme multi-fournisseurs et multi-transporteurs du vrac au Québec. " +
          "Analyse les données réelles fournies et produis des constats actionnables. " +
          "Catégories permises : meilleur_prix, penurie, recommandation_fournisseur, equilibrage_transporteurs, delai, regroupement_livraisons. " +
          "Gravités permises : info, opportunite, attention, critique. " +
          "Réponds uniquement en JSON : {\"insights\":[{\"kind\":\"...\",\"severity\":\"...\",\"title\":\"...\",\"body\":\"...\",\"impact_amount\":null}]}. " +
          "Maximum 8 constats, chacun en français, concret, chiffré quand les données le permettent, sans inventer de valeurs absentes.",
      },
      { role: 'user', content: JSON.stringify(snapshot).slice(0, 90000) },
    ], { jsonMode: true });

    if (!ai.ok) return json({ error: ai.error }, ai.status);

    const parsed = parseJsonLoose<{ insights: Insight[] }>(ai.text);
    const insights = (parsed?.insights ?? []).slice(0, 8);
    if (!insights.length) return json({ inserted: 0, insights: [] });

    const rows = insights.map((i) => ({
      company_id: companyId,
      kind: String(i.kind ?? 'reseau'),
      severity: String(i.severity ?? 'info'),
      title: String(i.title ?? 'Constat réseau'),
      body: String(i.body ?? ''),
      impact_amount: typeof i.impact_amount === 'number' ? i.impact_amount : null,
      payload: { source: 'vqos-network', snapshot_counts: {
        partenaires: snapshot.partenaires.length,
        disponibilites: snapshot.disponibilites.length,
        annonces: snapshot.annonces.length,
        demandes_publiques: snapshot.demandes_publiques.length,
      } },
      status: 'new',
      model: AI_MODEL,
    }));

    const { data, error } = await db.from('jsc_ai_insights').insert(rows).select('id,kind,severity,title,body,impact_amount,created_at');
    if (error) return json({ error: error.message }, 500);

    return json({ inserted: data?.length ?? 0, insights: data ?? [] });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur inattendue' }, 500);
  }
});
