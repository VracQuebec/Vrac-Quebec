// Vrac Québec OS — agent IA central : lit tous les modules et propose des décisions actionnables.
import { adminClient, callAI, corsHeaders, json, parseJsonLoose, quebecSeason, requireAdmin, AI_MODEL } from '../_shared/vqos-intel.ts';

type Proposal = {
  kind?: string; domain?: string; severity?: string; title?: string; rationale?: string;
  impact_amount?: number; confidence?: number; entity_type?: string; entity_id?: string;
  action?: { type?: string; params?: Record<string, unknown> };
};

const ACTIONS = [
  'send_quote', 'convert_quote_to_order', 'generate_deliveries',
  'assign_driver', 'create_invoice', 'notify', 'manual',
];

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

    const since = new Date(Date.now() - 60 * 86400000).toISOString();
    const [requests, quotes, orders, deliveries, invoices, alerts, drivers, trucks, existing] = await Promise.all([
      admin.from('jsc_requests').select('id, request_number, status, city, created_at')
        .is('archived_at', null).gte('created_at', since).limit(200),
      admin.from('jsc_quotes').select('id, quote_number, status, total, sent_at, created_at')
        .is('archived_at', null).gte('created_at', since).limit(200),
      admin.from('jsc_orders').select('id, order_number, status, total, scheduled_date, created_at')
        .is('archived_at', null).gte('created_at', since).limit(200),
      admin.from('jsc_deliveries').select('id, delivery_number, status, scheduled_date, driver_id, truck_id, delivered_at')
        .is('archived_at', null).limit(300),
      admin.from('jsc_invoices').select('id, invoice_number, status, total, balance, due_at')
        .is('archived_at', null).limit(200),
      admin.from('jsc_monitor_alerts').select('code, severity, title, detail, entity_type, entity_id, impact_amount')
        .eq('status', 'open').limit(150),
      admin.from('jsc_drivers').select('id, name, status, default_truck_id').is('archived_at', null).eq('is_active', true).limit(100),
      admin.from('jsc_trucks').select('id, name, capacity_tonnes, status').is('archived_at', null).eq('is_active', true).limit(100),
      admin.from('jsc_decisions').select('title, entity_id').eq('status', 'pending').is('archived_at', null).limit(100),
    ]);

    const context = {
      saison: quebecSeason(),
      demandes: requests.data ?? [],
      soumissions: quotes.data ?? [],
      commandes: orders.data ?? [],
      livraisons: deliveries.data ?? [],
      factures: invoices.data ?? [],
      alertes_ouvertes: alerts.data ?? [],
      chauffeurs: drivers.data ?? [],
      camions: trucks.data ?? [],
      decisions_deja_en_attente: (existing.data ?? []).map((d) => d.title),
    };

    const ai = await callAI([
      {
        role: 'system',
        content:
          "Tu es l'agent central autonome de Vrac Québec (transport de matériaux en vrac au Québec). " +
          "Tu analyses toutes les données réelles de la plateforme et tu proposes des DÉCISIONS concrètes " +
          "que la direction peut accepter, refuser ou modifier. N'invente aucune donnée et n'utilise que " +
          'les identifiants présents dans le contexte. Ne répète pas une décision déjà en attente. ' +
          'Réponds UNIQUEMENT en JSON valide : { "decisions": [ { ' +
          '"kind": "action|optimisation|relance|risque|opportunite", ' +
          '"domain": "ventes|operations|finance|flotte", "severity": "info|warning|critical", ' +
          '"title": "titre court", "rationale": "2 à 3 phrases en français", ' +
          '"impact_amount": nombre CAD ou 0, "confidence": nombre entre 0 et 1, ' +
          '"entity_type": "request|quote|order|delivery|invoice|truck|driver", "entity_id": "uuid du contexte", ' +
          `"action": { "type": "${ACTIONS.join('|')}", "params": { } } } ] } ` +
          'Entre 4 et 10 décisions, triées par impact décroissant. Utilise "manual" quand aucune action ' +
          'automatisable ne convient.',
      },
      { role: 'user', content: `Données réelles :\n${JSON.stringify(context).slice(0, 24000)}` },
    ], { jsonMode: true });

    if (!ai.ok) return json({ error: ai.error }, ai.status);
    const parsed = parseJsonLoose<{ decisions: Proposal[] }>(ai.text);
    const list = Array.isArray(parsed?.decisions) ? parsed!.decisions : [];
    if (!list.length) return json({ error: 'Aucune décision générée' }, 502);

    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const rows = list.slice(0, 12).map((d) => {
      const type = ACTIONS.includes(String(d.action?.type)) ? String(d.action?.type) : 'manual';
      return {
        company_id: companyId,
        kind: String(d.kind ?? 'recommendation').slice(0, 40),
        domain: String(d.domain ?? 'general').slice(0, 40),
        severity: ['info', 'warning', 'critical'].includes(String(d.severity)) ? String(d.severity) : 'info',
        title: String(d.title ?? 'Décision').slice(0, 200),
        rationale: String(d.rationale ?? ''),
        evidence: { generated_from: 'vqos-agent' },
        proposed_action: { type, params: d.action?.params ?? {} },
        entity_type: d.entity_type ?? null,
        entity_id: d.entity_id && uuid.test(d.entity_id) ? d.entity_id : null,
        impact_amount: Number(d.impact_amount) || 0,
        confidence: Math.max(0, Math.min(1, Number(d.confidence) || 0.5)),
        auto_executable: type !== 'manual',
        model: AI_MODEL,
      };
    });

    const { data: inserted, error } = await admin.from('jsc_decisions').insert(rows).select('id');
    if (error) return json({ error: error.message }, 500);

    return json({ created: inserted?.length ?? 0, decisions: rows });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
