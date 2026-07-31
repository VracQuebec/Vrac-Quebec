// Vrac Québec OS — conseiller IA : analyse quotidienne et génération d'alertes/opportunités/risques.
import { adminClient, callAI, corsHeaders, json, parseJsonLoose, quebecSeason, requireAdmin, AI_MODEL } from '../_shared/vqos-intel.ts';

type Insight = {
  kind: string; severity: string; title: string; body: string; impact_amount?: number;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    let companyId: string | null = body?.company_id ?? null;
    if (!companyId) {
      const { data: def } = await admin.from('jsc_companies')
        .select('id').is('archived_at', null).order('is_default', { ascending: false }).limit(1).maybeSingle();
      companyId = def?.id ?? null;
    }

    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const [orders, invoices, estimates, deliveries, learning, requests] = await Promise.all([
      admin.from('jsc_orders').select('total, status, created_at, scheduled_date, carrier_id, supplier_id, client_id')
        .is('archived_at', null).gte('created_at', since).limit(1000),
      admin.from('jsc_invoices').select('total, balance, status, due_at, created_at')
        .is('archived_at', null).gte('created_at', since).limit(1000),
      admin.from('jsc_estimates').select('total, material_cost, transport_cost, margin, subtotal, created_at, is_selected')
        .gte('created_at', since).limit(1000),
      admin.from('jsc_deliveries').select('status, scheduled_date, delivered_at, driver_id, truck_id')
        .is('archived_at', null).gte('scheduled_date', since.slice(0, 10)).limit(1000),
      admin.from('jsc_learning_signals').select('outcome, amount, created_at').limit(500),
      admin.from('jsc_requests').select('status, created_at').is('archived_at', null).gte('created_at', since).limit(1000),
    ]);

    const sum = (rows: Record<string, unknown>[] | null, key: string) =>
      Math.round((rows ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0) * 100) / 100;

    const selected = (estimates.data ?? []).filter((e) => e.is_selected);
    const metrics = {
      periode: '90 derniers jours',
      saison: quebecSeason(),
      ventes: { commandes: (orders.data ?? []).length, valeur: sum(orders.data, 'total') },
      facturation: {
        facture: sum(invoices.data, 'total'),
        impaye: sum((invoices.data ?? []).filter((i) => Number(i.balance ?? 0) > 0), 'balance'),
        en_retard: (invoices.data ?? []).filter((i) => i.due_at && new Date(i.due_at) < new Date() && Number(i.balance ?? 0) > 0).length,
      },
      rentabilite: {
        revenu: sum(selected, 'subtotal'),
        cout_materiaux: sum(selected, 'material_cost'),
        cout_transport: sum(selected, 'transport_cost'),
        marge: sum(selected, 'margin'),
      },
      operations: {
        livraisons: (deliveries.data ?? []).length,
        livrees: (deliveries.data ?? []).filter((d) => d.delivered_at).length,
        sans_chauffeur: (deliveries.data ?? []).filter((d) => !d.driver_id).length,
        en_retard: (deliveries.data ?? []).filter((d) => !d.delivered_at && d.scheduled_date && new Date(`${d.scheduled_date}T00:00:00Z`) < new Date()).length,
      },
      demandes: {
        total: (requests.data ?? []).length,
        par_statut: (requests.data ?? []).reduce((acc: Record<string, number>, r) => {
          acc[String(r.status)] = (acc[String(r.status)] ?? 0) + 1; return acc;
        }, {}),
      },
      apprentissage: {
        gagnees: (learning.data ?? []).filter((l) => l.outcome === 'won').length,
        perdues: (learning.data ?? []).filter((l) => l.outcome === 'lost').length,
      },
    };

    const ai = await callAI([
      {
        role: 'system',
        content:
          "Tu es le conseiller stratégique de Vrac Québec (transport de matériaux en vrac). " +
          'Analyse les données réelles fournies et produis des constats actionnables. ' +
          "N'invente aucun chiffre. Réponds UNIQUEMENT en JSON valide : " +
          '{ "insights": [ { "kind": "alert|opportunity|risk|saving|recommendation", "severity": "info|warning|critical", ' +
          '"title": "titre court", "body": "2 à 3 phrases en français", "impact_amount": nombre CAD ou 0 } ] } ' +
          'Entre 4 et 8 constats, priorisés par impact.',
      },
      { role: 'user', content: `Données réelles :\n${JSON.stringify(metrics).slice(0, 22000)}` },
    ], { jsonMode: true });

    if (!ai.ok) return json({ error: ai.error }, ai.status);
    const parsed = parseJsonLoose<{ insights: Insight[] }>(ai.text);
    const insights = Array.isArray(parsed?.insights) ? parsed!.insights : [];
    if (!insights.length) return json({ error: 'Aucun constat généré' }, 502);

    const today = new Date().toISOString().slice(0, 10);
    const rows = insights.slice(0, 10).map((i) => ({
      company_id: companyId,
      kind: ['alert', 'opportunity', 'risk', 'saving', 'recommendation'].includes(i.kind) ? i.kind : 'recommendation',
      severity: ['info', 'warning', 'critical'].includes(i.severity) ? i.severity : 'info',
      title: String(i.title ?? '').slice(0, 200),
      body: String(i.body ?? ''),
      impact_amount: Number(i.impact_amount) || 0,
      payload: { metrics },
      period_start: since.slice(0, 10),
      period_end: today,
      model: AI_MODEL,
    }));

    // Les constats du jour remplacent ceux de la veille encore non traités.
    await admin.from('jsc_ai_insights').update({ status: 'archived' })
      .eq('status', 'new').lt('created_at', new Date(Date.now() - 20 * 3600 * 1000).toISOString());

    const { error } = await admin.from('jsc_ai_insights').insert(rows);
    if (error) return json({ error: error.message }, 500);

    return json({ created: rows.length, insights: rows, metrics });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});