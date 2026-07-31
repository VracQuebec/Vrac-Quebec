// Vrac Québec OS — pilote automatique : exécute les décisions acceptées (ou auto-approuvées).
// Chaque action est journalisée dans jsc_autopilot_log. Rien n'est exécuté hors des réglages admin.
import { adminClient, corsHeaders, json, requireAdmin } from '../_shared/vqos-intel.ts';

type Settings = {
  company_id: string | null; enabled: boolean;
  auto_send_quotes: boolean; auto_schedule_deliveries: boolean; auto_invoices: boolean;
  auto_assign_drivers: boolean; auto_dispatch_orders: boolean; auto_execute_decisions: boolean;
  max_auto_amount: number; min_confidence: number;
};

const GATE: Record<string, keyof Settings> = {
  send_quote: 'auto_send_quotes',
  convert_quote_to_order: 'auto_dispatch_orders',
  generate_deliveries: 'auto_schedule_deliveries',
  assign_driver: 'auto_assign_drivers',
  create_invoice: 'auto_invoices',
  notify: 'enabled',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const decisionId: string | null = body?.decision_id ?? null;
    let companyId: string | null = body?.company_id ?? null;
    if (!companyId) {
      const { data: def } = await admin.from('jsc_companies')
        .select('id').is('archived_at', null).order('is_default', { ascending: false }).limit(1).maybeSingle();
      companyId = def?.id ?? null;
    }

    const { data: s } = await admin.from('jsc_autopilot_settings')
      .select('*').eq('company_id', companyId).maybeSingle();
    const settings: Settings = (s as Settings) ?? {
      company_id: companyId, enabled: false, auto_send_quotes: false, auto_schedule_deliveries: false,
      auto_invoices: false, auto_assign_drivers: false, auto_dispatch_orders: false,
      auto_execute_decisions: false, max_auto_amount: 0, min_confidence: 1,
    };

    // Sélection des décisions à exécuter.
    let query = admin.from('jsc_decisions').select('*').is('archived_at', null);
    if (decisionId) query = query.eq('id', decisionId);
    else {
      if (!settings.enabled) return json({ executed: 0, skipped: 'Pilote automatique désactivé' });
      query = query.eq('status', 'accepted').eq('company_id', companyId).limit(25);
    }
    const { data: decisions, error: qErr } = await query;
    if (qErr) return json({ error: qErr.message }, 500);

    const results: Record<string, unknown>[] = [];

    for (const d of decisions ?? []) {
      const action = (d.proposed_action ?? {}) as { type?: string; params?: Record<string, unknown> };
      const type = String(action.type ?? 'manual');
      const params = action.params ?? {};
      let status = 'ok';
      let detail = '';

      const gate = GATE[type];
      const manualRun = Boolean(decisionId); // exécution explicite par un administrateur
      const autoAllowed = settings.enabled && settings.auto_execute_decisions
        && (!gate || settings[gate] === true)
        && Number(d.confidence ?? 0) >= Number(settings.min_confidence ?? 1)
        && Number(d.impact_amount ?? 0) <= Number(settings.max_auto_amount ?? 0);

      if (!manualRun && !autoAllowed) {
        results.push({ id: d.id, status: 'skipped', detail: 'Hors des limites du pilote automatique' });
        continue;
      }

      try {
        if (type === 'send_quote' && d.entity_id) {
          const { error } = await admin.from('jsc_quotes')
            .update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', d.entity_id);
          if (error) throw error;
          detail = 'Soumission envoyée';
        } else if (type === 'convert_quote_to_order' && d.entity_id) {
          const { data: orderId, error } = await admin.rpc('jsc_convert_quote_to_order', { _quote_id: d.entity_id });
          if (error) throw error;
          detail = `Commande créée (${orderId})`;
        } else if (type === 'generate_deliveries' && d.entity_id) {
          const { data: created, error } = await admin.rpc('jsc_generate_deliveries', { _order_id: d.entity_id });
          if (error) throw error;
          detail = `${created ?? 0} livraison(s) générée(s)`;
        } else if (type === 'assign_driver' && d.entity_id) {
          const driverId = params.driver_id as string | undefined;
          if (!driverId) throw new Error('Chauffeur non précisé');
          const { data: drv } = await admin.from('jsc_drivers').select('default_truck_id').eq('id', driverId).maybeSingle();
          const { error } = await admin.from('jsc_deliveries')
            .update({ driver_id: driverId, truck_id: (params.truck_id as string) ?? drv?.default_truck_id ?? null })
            .eq('id', d.entity_id);
          if (error) throw error;
          detail = 'Chauffeur assigné';
        } else if (type === 'create_invoice' && d.entity_id) {
          const { data: invId, error } = await admin.rpc('jsc_convert_order_to_invoice', { _order_id: d.entity_id });
          if (error) throw error;
          detail = `Facture créée (${invId})`;
        } else if (type === 'notify') {
          const { error } = await admin.rpc('jsc_notify', {
            _company_id: d.company_id, _event_code: 'autopilot',
            _title: String(d.title), _body: String(d.rationale ?? ''),
            _audience: 'admin', _user_id: null,
            _entity_type: d.entity_type ?? null, _entity_id: d.entity_id ?? null,
          });
          if (error) throw error;
          detail = 'Notification envoyée';
        } else {
          status = 'skipped';
          detail = 'Action manuelle : intervention humaine requise';
        }
      } catch (e) {
        status = 'error';
        detail = (e as Error).message;
      }

      if (status === 'ok') {
        await admin.from('jsc_decisions').update({
          status: 'executed', executed_at: new Date().toISOString(),
          execution_result: { detail }, decided_at: d.decided_at ?? new Date().toISOString(),
          decided_by: d.decided_by ?? auth.userId,
        }).eq('id', d.id);
      }

      await admin.from('jsc_autopilot_log').insert({
        company_id: d.company_id ?? companyId, action: type,
        entity_type: d.entity_type, entity_id: d.entity_id, decision_id: d.id,
        status, detail, payload: { params, manual: manualRun },
      });

      results.push({ id: d.id, status, detail });
    }

    return json({
      executed: results.filter((r) => r.status === 'ok').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
