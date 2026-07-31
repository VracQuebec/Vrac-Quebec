// Vrac Québec OS — moteur d'automatisation CRM + livraisons.
// Exécuté par cron (service role) ou manuellement par un administrateur.
import { adminClient, corsHeaders, json, requireAdmin } from '../_shared/vqos-intel.ts';

type Log = { rule: string; entity: string; id: string | null; detail: string; status?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const admin = adminClient();
    const logs: Log[] = [];
    const now = Date.now();

    const record = async (l: Log, companyId: string | null, result: Record<string, unknown> = {}) => {
      logs.push(l);
      await admin.from('jsc_automation_runs').upsert({
        company_id: companyId, rule_code: l.rule, entity_type: l.entity, entity_id: l.id,
        status: l.status ?? 'done', detail: l.detail, result, executed_at: new Date().toISOString(),
      }, { onConflict: 'rule_code,entity_type,entity_id' });
    };

    const alreadyRan = async (rule: string, entity: string, id: string) => {
      const { data } = await admin.from('jsc_automation_runs').select('id')
        .eq('rule_code', rule).eq('entity_type', entity).eq('entity_id', id).maybeSingle();
      return !!data;
    };

    // Règles actives (paramétrables en admin). Par défaut : toutes actives.
    const { data: rules } = await admin.from('jsc_automation_rules').select('code, is_active').is('archived_at', null);
    const enabled = (code: string) => {
      const r = (rules ?? []).find((x) => x.code === code);
      return r ? r.is_active !== false : true;
    };

    // 1) Nouvelles demandes non notées → notation IA commerciale.
    if (enabled('score_new_requests')) {
      const { data: unscored } = await admin.from('jsc_requests')
        .select('id, company_id, jsc_lead_scores(id)').is('archived_at', null)
        .order('created_at', { ascending: false }).limit(10);
      const pending = ((unscored ?? []) as { id: string; company_id: string; jsc_lead_scores: unknown[] }[])
        .filter((r) => !r.jsc_lead_scores?.length);
      if (pending.length) {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/vqos-ai-score`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ limit: 10 }),
        });
        const out = await res.json().catch(() => ({}));
        await record(
          { rule: 'score_new_requests', entity: 'batch', id: null, detail: `${out?.scored ?? 0} demande(s) notée(s)`, status: res.ok ? 'done' : 'error' },
          pending[0]?.company_id ?? null, out,
        );
      }
    }

    // 2) Notification du représentant recommandé sur les demandes prioritaires.
    if (enabled('notify_rep')) {
      const { data: hot } = await admin.from('jsc_lead_scores')
        .select('request_id, company_id, stars, priority, recommended_rep_user_id, recommended_rep_name, jsc_requests(request_number, city)')
        .in('priority', ['haute', 'urgente']).limit(25);
      for (const s of (hot ?? []) as Record<string, never>[]) {
        const rid = String(s.request_id);
        if (await alreadyRan('notify_rep', 'request', rid)) continue;
        const r = (s as Record<string, { request_number?: string; city?: string }>).jsc_requests ?? {};
        await admin.rpc('jsc_notify', {
          _company_id: s.company_id ?? null,
          _event_code: 'lead_priority',
          _title: `Demande prioritaire ${r.request_number ?? ''} (${'★'.repeat(Number(s.stars) || 3)})`,
          _body: `Ville : ${r.city ?? '—'}. Représentant recommandé : ${s.recommended_rep_name ?? 'à assigner'}.`,
          _audience: s.recommended_rep_user_id ? 'user' : 'admin',
          _user_id: s.recommended_rep_user_id ?? null,
          _entity_type: 'request', _entity_id: rid,
        });
        await record({ rule: 'notify_rep', entity: 'request', id: rid, detail: 'Représentant notifié' }, s.company_id ?? null);
      }
    }

    // 3) Relances automatiques des soumissions envoyées (24 h puis 72 h).
    for (const [code, hours] of [['relance_24h', 24], ['relance_72h', 72]] as [string, number][]) {
      if (!enabled(code)) continue;
      const cutoff = new Date(now - hours * 3600 * 1000).toISOString();
      const { data: quotes } = await admin.from('jsc_quotes')
        .select('id, company_id, quote_number, sent_at, status, client_id')
        .eq('status', 'sent').not('sent_at', 'is', null).lt('sent_at', cutoff).limit(50);
      for (const q of quotes ?? []) {
        if (await alreadyRan(code, 'quote', q.id)) continue;
        await admin.rpc('jsc_notify', {
          _company_id: q.company_id,
          _event_code: code,
          _title: `Relance ${hours} h — soumission ${q.quote_number ?? ''}`,
          _body: `Aucune réponse depuis ${hours} heures. Relance à effectuer auprès du client.`,
          _audience: 'admin', _user_id: null,
          _entity_type: 'quote', _entity_id: q.id,
        });
        await record({ rule: code, entity: 'quote', id: q.id, detail: `Relance ${hours} h déclenchée` }, q.company_id);
      }
    }

    // 4) Soumissions acceptées → conversion en commande.
    if (enabled('quote_to_order')) {
      const { data: accepted } = await admin.from('jsc_quotes')
        .select('id, company_id, quote_number').eq('status', 'accepted').is('archived_at', null).limit(30);
      for (const q of accepted ?? []) {
        const { data: existing } = await admin.from('jsc_orders').select('id').eq('quote_id', q.id).maybeSingle();
        if (existing || await alreadyRan('quote_to_order', 'quote', q.id)) continue;
        const { data: orderId, error } = await admin.rpc('jsc_convert_quote_to_order', { _quote_id: q.id });
        await record({
          rule: 'quote_to_order', entity: 'quote', id: q.id,
          detail: error ? `Échec : ${error.message}` : `Commande créée`,
          status: error ? 'error' : 'done',
        }, q.company_id, { order_id: orderId ?? null });
      }
    }

    // 5) Commandes confirmées → génération automatique des livraisons.
    if (enabled('order_to_deliveries')) {
      const { data: orders } = await admin.from('jsc_orders')
        .select('id, company_id, order_number, status').is('archived_at', null)
        .in('status', ['confirmed', 'accepted', 'planned', 'scheduled']).limit(40);
      for (const o of orders ?? []) {
        const { count } = await admin.from('jsc_deliveries')
          .select('id', { count: 'exact', head: true }).eq('order_id', o.id).is('archived_at', null);
        if ((count ?? 0) > 0) continue;
        const { data: created, error } = await admin.rpc('jsc_generate_deliveries', { _order_id: o.id });
        await record({
          rule: 'order_to_deliveries', entity: 'order', id: o.id,
          detail: error ? `Échec : ${error.message}` : `${created ?? 0} livraison(s) générée(s)`,
          status: error ? 'error' : 'done',
        }, o.company_id, { created });
      }
    }

    // 6) Assignation automatique chauffeur + camion sur les livraisons planifiées.
    if (enabled('auto_assign_driver')) {
      const { data: pending } = await admin.from('jsc_deliveries')
        .select('id, company_id, scheduled_date, truck_id, driver_id, delivery_number')
        .is('archived_at', null).is('driver_id', null)
        .not('scheduled_date', 'is', null).limit(40);
      if (pending?.length) {
        const { data: drivers } = await admin.from('jsc_drivers')
          .select('id, company_id, default_truck_id, status').is('archived_at', null)
          .eq('is_active', true).eq('status', 'disponible');
        for (const d of pending) {
          const { data: busy } = await admin.from('jsc_deliveries')
            .select('driver_id').eq('scheduled_date', d.scheduled_date).not('driver_id', 'is', null);
          const taken = new Set((busy ?? []).map((b) => b.driver_id));
          const free = (drivers ?? []).find((x) => x.company_id === d.company_id && !taken.has(x.id))
            ?? (drivers ?? []).find((x) => !taken.has(x.id));
          if (!free) continue;
          const { error } = await admin.from('jsc_deliveries').update({
            driver_id: free.id,
            truck_id: d.truck_id ?? free.default_truck_id ?? null,
          }).eq('id', d.id);
          if (!error) {
            await admin.rpc('jsc_notify', {
              _company_id: d.company_id, _event_code: 'delivery_assigned',
              _title: `Livraison assignée ${d.delivery_number ?? ''}`,
              _body: `Livraison planifiée le ${d.scheduled_date}.`,
              _audience: 'driver', _user_id: null,
              _entity_type: 'delivery', _entity_id: d.id,
            });
          }
          await record({
            rule: 'auto_assign_driver', entity: 'delivery', id: d.id,
            detail: error ? `Échec : ${error.message}` : 'Chauffeur et camion assignés',
            status: error ? 'error' : 'done',
          }, d.company_id);
        }
      }
    }

    // 7) Livraisons complétées → notification client.
    if (enabled('notify_client_delivered')) {
      const { data: delivered } = await admin.from('jsc_deliveries')
        .select('id, company_id, delivery_number, client_id, delivered_at')
        .not('delivered_at', 'is', null)
        .gt('delivered_at', new Date(now - 7 * 86400000).toISOString()).limit(50);
      for (const d of delivered ?? []) {
        if (await alreadyRan('notify_client_delivered', 'delivery', d.id)) continue;
        await admin.rpc('jsc_notify', {
          _company_id: d.company_id, _event_code: 'delivery_completed',
          _title: `Livraison complétée ${d.delivery_number ?? ''}`,
          _body: 'Votre livraison a été complétée. Merci de votre confiance.',
          _audience: 'client', _user_id: null,
          _entity_type: 'delivery', _entity_id: d.id,
        });
        await record({ rule: 'notify_client_delivered', entity: 'delivery', id: d.id, detail: 'Client notifié' }, d.company_id);
      }
    }

    // 8) Commandes terminées → facturation automatique.
    if (enabled('order_to_invoice')) {
      const { data: done } = await admin.from('jsc_orders')
        .select('id, company_id, order_number').is('archived_at', null)
        .in('status', ['completed', 'delivered']).limit(30);
      for (const o of done ?? []) {
        const { data: inv } = await admin.from('jsc_invoices').select('id').eq('order_id', o.id).maybeSingle();
        if (inv || await alreadyRan('order_to_invoice', 'order', o.id)) continue;
        const { data: invoiceId, error } = await admin.rpc('jsc_convert_order_to_invoice', { _order_id: o.id });
        await record({
          rule: 'order_to_invoice', entity: 'order', id: o.id,
          detail: error ? `Échec : ${error.message}` : 'Facture générée',
          status: error ? 'error' : 'done',
        }, o.company_id, { invoice_id: invoiceId ?? null });
      }
    }

    return json({ executed: logs.length, logs });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});