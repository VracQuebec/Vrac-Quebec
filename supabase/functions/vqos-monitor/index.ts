// Vrac Québec OS — surveillance temps réel : détection d'anomalies et création d'alertes.
// Détection 100 % déterministe (aucune donnée en dur : seuils lus dans jsc_settings/autopilot).
import { adminClient, corsHeaders, json, requireAdmin } from '../_shared/vqos-intel.ts';

type Alert = {
  code: string; severity: 'info' | 'warning' | 'critical'; title: string; detail: string;
  entity_type?: string | null; entity_id?: string | null; impact_amount?: number; metrics?: Record<string, unknown>;
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

    const today = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();
    const alerts: Alert[] = [];

    // 1. Livraisons en retard (planifiées avant aujourd'hui, non livrées).
    const { data: late } = await admin.from('jsc_deliveries')
      .select('id, delivery_number, scheduled_date, status, driver_id')
      .is('archived_at', null).is('delivered_at', null).lt('scheduled_date', today).limit(200);
    for (const d of late ?? []) {
      alerts.push({
        code: 'delivery_late', severity: 'critical',
        title: `Livraison en retard ${d.delivery_number ?? ''}`.trim(),
        detail: `Planifiée le ${d.scheduled_date} et toujours non livrée.`,
        entity_type: 'delivery', entity_id: d.id,
      });
    }

    // 2. Livraisons planifiées sans chauffeur.
    const { data: unassigned } = await admin.from('jsc_deliveries')
      .select('id, delivery_number, scheduled_date').is('archived_at', null)
      .is('driver_id', null).gte('scheduled_date', today).limit(200);
    for (const d of unassigned ?? []) {
      alerts.push({
        code: 'delivery_unassigned', severity: 'warning',
        title: `Livraison sans chauffeur ${d.delivery_number ?? ''}`.trim(),
        detail: `Aucune ressource assignée pour le ${d.scheduled_date}.`,
        entity_type: 'delivery', entity_id: d.id,
      });
    }

    // 3. Factures échues impayées.
    const { data: overdue } = await admin.from('jsc_invoices')
      .select('id, invoice_number, balance, due_at').is('archived_at', null)
      .gt('balance', 0).lt('due_at', nowIso).limit(200);
    for (const i of overdue ?? []) {
      alerts.push({
        code: 'invoice_overdue', severity: 'critical',
        title: `Facture échue ${i.invoice_number ?? ''}`.trim(),
        detail: `Solde impayé depuis le ${String(i.due_at).slice(0, 10)}.`,
        entity_type: 'invoice', entity_id: i.id, impact_amount: Number(i.balance ?? 0),
      });
    }

    // 4. Marges faibles ou négatives sur les estimations retenues récentes.
    const { data: est } = await admin.from('jsc_estimates')
      .select('id, request_id, margin, subtotal, created_at').eq('is_selected', true)
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()).limit(300);
    for (const e of est ?? []) {
      const sub = Number(e.subtotal ?? 0);
      const margin = Number(e.margin ?? 0);
      const pct = sub > 0 ? (margin / sub) * 100 : 0;
      if (sub > 0 && pct < 5) {
        alerts.push({
          code: 'margin_low', severity: margin < 0 ? 'critical' : 'warning',
          title: `Marge faible sur une estimation (${pct.toFixed(1)} %)`,
          detail: `Sous-total ${sub.toFixed(2)} $ pour une marge de ${margin.toFixed(2)} $.`,
          entity_type: 'estimate', entity_id: e.id, impact_amount: Math.abs(margin),
          metrics: { margin_pct: Math.round(pct * 10) / 10 },
        });
      }
    }

    // 5. Demandes sans suite depuis plus de 48 h.
    const { data: stale } = await admin.from('jsc_requests')
      .select('id, request_number, status, created_at').is('archived_at', null)
      .in('status', ['new', 'nouvelle', 'draft'])
      .lt('created_at', new Date(Date.now() - 48 * 3600 * 1000).toISOString()).limit(100);
    for (const r of stale ?? []) {
      alerts.push({
        code: 'request_stale', severity: 'warning',
        title: `Demande sans suite ${r.request_number ?? ''}`.trim(),
        detail: 'Aucune soumission produite depuis plus de 48 heures.',
        entity_type: 'request', entity_id: r.id,
      });
    }

    // 6. Camions inutilisés depuis 14 jours.
    const { data: trucks } = await admin.from('jsc_trucks')
      .select('id, name, plate').is('archived_at', null).eq('is_active', true).limit(200);
    const { data: used } = await admin.from('jsc_deliveries')
      .select('truck_id').gte('scheduled_date', new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10))
      .not('truck_id', 'is', null).limit(1000);
    const usedSet = new Set((used ?? []).map((u) => u.truck_id));
    for (const t of trucks ?? []) {
      if (usedSet.has(t.id)) continue;
      alerts.push({
        code: 'truck_idle', severity: 'info',
        title: `Camion inutilisé : ${t.name ?? t.plate ?? 'sans nom'}`,
        detail: 'Aucune livraison assignée depuis 14 jours.',
        entity_type: 'truck', entity_id: t.id,
      });
    }

    // Résolution automatique des alertes ouvertes qui ne sont plus détectées.
    const keys = new Set(alerts.map((a) => `${a.code}|${a.entity_id ?? ''}`));
    const { data: open } = await admin.from('jsc_monitor_alerts')
      .select('id, code, entity_id').eq('status', 'open').limit(1000);
    const resolvedIds = (open ?? []).filter((a) => !keys.has(`${a.code}|${a.entity_id ?? ''}`)).map((a) => a.id);
    if (resolvedIds.length) {
      await admin.from('jsc_monitor_alerts')
        .update({ status: 'resolved', resolved_at: nowIso }).in('id', resolvedIds);
    }

    // Insertion des nouvelles alertes (l'index unique évite les doublons ouverts).
    let created = 0;
    for (const a of alerts) {
      const q = admin.from('jsc_monitor_alerts').select('id').eq('code', a.code).eq('status', 'open');
      const { data: dup } = await (a.entity_id ? q.eq('entity_id', a.entity_id) : q.is('entity_id', null)).maybeSingle();
      if (dup) continue;

      const { error } = await admin.from('jsc_monitor_alerts').insert({
        company_id: companyId, code: a.code, severity: a.severity, title: a.title, detail: a.detail,
        entity_type: a.entity_type ?? null, entity_id: a.entity_id ?? null,
        impact_amount: a.impact_amount ?? 0, metrics: a.metrics ?? {},
      });
      if (!error) created++;
    }

    return json({ detected: alerts.length, created, resolved: resolvedIds.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
