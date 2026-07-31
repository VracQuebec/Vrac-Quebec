// Vrac Québec OS — IA conversationnelle branchée sur les données réelles de la plateforme.
import { adminClient, callAI, corsHeaders, json, requireAdmin, AI_MODEL } from '../_shared/vqos-intel.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const body = await req.json().catch(() => ({}));
    const messages: { role: string; content: string }[] = Array.isArray(body?.messages) ? body.messages : [];
    if (!messages.length) return json({ error: 'messages requis' }, 400);

    const admin = adminClient();
    const companyId: string | null = body?.company_id ?? null;
    const today = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - 365 * 86400000).toISOString();
    const scope = <T extends { company_id?: string | null }>(rows: T[] | null) =>
      (rows ?? []).filter((r) => !companyId || r.company_id === companyId);

    const [orders, invoices, clients, suppliers, carriers, deliveries, estimates, materials, scores, insights] =
      await Promise.all([
        admin.from('jsc_orders').select('id, company_id, order_number, status, total, created_at, scheduled_date, client_id, supplier_id, carrier_id, material_id')
          .is('archived_at', null).gte('created_at', since).limit(1000),
        admin.from('jsc_invoices').select('company_id, invoice_number, status, total, balance, due_at, created_at, client_id')
          .is('archived_at', null).gte('created_at', since).limit(1000),
        admin.from('jsc_clients').select('id, company_id, name, client_type, city, created_at').is('archived_at', null).limit(500),
        admin.from('jsc_suppliers').select('id, company_id, name, city').is('archived_at', null).limit(200),
        admin.from('jsc_companies').select('id, name, availability, priority').is('archived_at', null).limit(50),
        admin.from('jsc_deliveries').select('company_id, status, scheduled_date, delivered_at, distance_km, estimated_cost, driver_id')
          .is('archived_at', null).gte('scheduled_date', since.slice(0, 10)).limit(1000),
        admin.from('jsc_estimates').select('company_id, request_id, total, subtotal, material_cost, transport_cost, margin, surcharges, trips, distance_km, is_selected, created_at, decision')
          .gte('created_at', since).limit(500),
        admin.from('jsc_materials').select('id, company_id, name, category, unit, selling_price, purchase_price').is('archived_at', null).limit(300),
        admin.from('jsc_lead_scores').select('company_id, request_id, stars, priority, potential_revenue, win_probability, client_type, project_type').limit(200),
        admin.from('jsc_ai_insights').select('kind, severity, title, body, impact_amount, created_at').eq('status', 'new').limit(20),
      ]);

    const clientById = new Map((clients.data ?? []).map((c) => [c.id, c.name]));
    const supplierById = new Map((suppliers.data ?? []).map((s) => [s.id, s.name]));
    const carrierById = new Map((carriers.data ?? []).map((c) => [c.id, c.name]));
    const materialById = new Map((materials.data ?? []).map((m) => [m.id, m.name]));

    const ordersScoped = scope(orders.data as { company_id: string }[]) as Record<string, never>[];
    const agg = (key: string, label: (v: unknown) => string) => {
      const map = new Map<string, { name: string; commandes: number; revenu: number }>();
      ordersScoped.forEach((o: Record<string, unknown>) => {
        const name = label(o[key]);
        const cur = map.get(name) ?? { name, commandes: 0, revenu: 0 };
        cur.commandes += 1; cur.revenu += Number(o.total ?? 0);
        map.set(name, cur);
      });
      return [...map.values()].sort((a, b) => b.revenu - a.revenu).slice(0, 15);
    };

    const lastOrderByClient = new Map<string, string>();
    ordersScoped.forEach((o: Record<string, unknown>) => {
      const id = String(o.client_id ?? '');
      const d = String(o.created_at ?? '');
      if (!id) return;
      if (!lastOrderByClient.has(id) || (lastOrderByClient.get(id) ?? '') < d) lastOrderByClient.set(id, d);
    });
    const sixMonthsAgo = new Date(Date.now() - 182 * 86400000).toISOString();

    const context = {
      aujourdhui: today,
      ventes: {
        aujourdhui: ordersScoped.filter((o: Record<string, unknown>) => String(o.created_at ?? '').slice(0, 10) === today)
          .reduce((s: number, o: Record<string, unknown>) => s + Number(o.total ?? 0), 0),
        commandes_aujourdhui: ordersScoped.filter((o: Record<string, unknown>) => String(o.created_at ?? '').slice(0, 10) === today).length,
        annee: ordersScoped.reduce((s: number, o: Record<string, unknown>) => s + Number(o.total ?? 0), 0),
        par_statut: ordersScoped.reduce((acc: Record<string, number>, o: Record<string, unknown>) => {
          acc[String(o.status)] = (acc[String(o.status)] ?? 0) + 1; return acc;
        }, {}),
      },
      top_clients: agg('client_id', (v) => clientById.get(String(v)) ?? 'Inconnu'),
      top_fournisseurs: agg('supplier_id', (v) => supplierById.get(String(v)) ?? 'Inconnu'),
      top_transporteurs: agg('carrier_id', (v) => carrierById.get(String(v)) ?? 'Inconnu'),
      top_materiaux: agg('material_id', (v) => materialById.get(String(v)) ?? 'Inconnu'),
      clients_inactifs_6_mois: (clients.data ?? [])
        .filter((c) => !companyId || c.company_id === companyId)
        .filter((c) => (lastOrderByClient.get(c.id) ?? '') < sixMonthsAgo)
        .map((c) => ({ nom: c.name, type: c.client_type, ville: c.city, derniere_commande: lastOrderByClient.get(c.id) ?? 'jamais' }))
        .slice(0, 50),
      facturation: {
        total: (invoices.data ?? []).reduce((s, i) => s + Number(i.total ?? 0), 0),
        impaye: (invoices.data ?? []).reduce((s, i) => s + Number(i.balance ?? 0), 0),
        en_retard: (invoices.data ?? []).filter((i) => i.due_at && i.due_at < today && Number(i.balance ?? 0) > 0).length,
      },
      operations: {
        livraisons: (deliveries.data ?? []).length,
        livrees: (deliveries.data ?? []).filter((d) => d.delivered_at).length,
        aujourdhui: (deliveries.data ?? []).filter((d) => d.scheduled_date === today).length,
        sans_chauffeur: (deliveries.data ?? []).filter((d) => !d.driver_id).length,
      },
      estimations_recentes: (estimates.data ?? []).slice(0, 40),
      catalogue: (materials.data ?? []).slice(0, 80),
      demandes_notees: scores.data ?? [],
      constats_ia: insights.data ?? [],
    };

    const ai = await callAI([
      {
        role: 'system',
        content:
          "Tu es le copilote IA de Vrac Québec OS. Tu réponds aux dirigeants en français québécois professionnel, en markdown court. " +
          'Tu réponds UNIQUEMENT à partir du contexte de données réelles fourni (montants en CAD). ' +
          "Si une donnée n'est pas disponible, dis-le clairement et propose comment l'obtenir. N'invente jamais de chiffre. " +
          "Pour expliquer le prix d'une soumission, décompose coût matériaux, coût transport, surcharges, marge et taxes à partir des estimations fournies. " +
          'Sois concis : maximum 250 mots, et utilise des listes ou tableaux quand c\'est utile.',
      },
      { role: 'system', content: `Contexte de données réelles (JSON) :\n${JSON.stringify(context).slice(0, 40000)}` },
      ...messages.slice(-12).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content ?? '').slice(0, 4000),
      })),
    ]);

    if (!ai.ok) return json({ error: ai.error }, ai.status);
    return json({ reply: ai.text, model: AI_MODEL, generated_at: new Date().toISOString() });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});