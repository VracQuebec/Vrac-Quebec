// Vrac Québec OS — IA commerciale : analyse et notation automatique des demandes.
import { adminClient, callAI, corsHeaders, json, parseJsonLoose, quebecSeason, requireAdmin, AI_MODEL } from '../_shared/vqos-intel.ts';

type Scored = {
  stars: number; score: number; priority: string; client_type: string; project_type: string;
  potential_revenue: number; win_probability: number; recommended_rep: string; reasoning: string;
  signals: Record<string, unknown>;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const body = await req.json().catch(() => ({}));
    const admin = adminClient();

    // Cible : une demande précise, ou toutes les demandes non encore notées (mode automatique).
    let ids: string[] = [];
    if (body?.request_id) {
      ids = [String(body.request_id)];
    } else {
      const { data } = await admin
        .from('jsc_requests')
        .select('id, jsc_lead_scores(id)')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(Number(body?.limit ?? 15));
      ids = ((data ?? []) as { id: string; jsc_lead_scores: unknown[] }[])
        .filter((r) => !r.jsc_lead_scores?.length).map((r) => r.id);
    }
    if (!ids.length) return json({ scored: 0, results: [] });

    const { data: reps } = await admin
      .from('jsc_company_members').select('user_id, full_name, email, role')
      .is('archived_at', null).eq('is_active', true);

    const results: unknown[] = [];
    for (const id of ids) {
      const { data: request } = await admin.from('jsc_requests').select('*').eq('id', id).maybeSingle();
      if (!request) continue;

      const { data: client } = request.client_id
        ? await admin.from('jsc_clients').select('*').eq('id', request.client_id).maybeSingle()
        : { data: null };
      const { data: material } = request.material_id
        ? await admin.from('jsc_materials').select('name, category, unit, selling_price').eq('id', request.material_id).maybeSingle()
        : { data: null };
      const { data: history } = request.client_id
        ? await admin.from('jsc_orders').select('total, status, created_at').eq('client_id', request.client_id).limit(20)
        : { data: [] };
      const { data: learning } = await admin
        .from('jsc_learning_signals').select('outcome, amount').limit(200);

      const won = (learning ?? []).filter((l) => l.outcome === 'won');
      const context = {
        demande: {
          numero: request.request_number, quantite: request.quantity, unite: request.quantity_unit,
          ville: request.city, code_postal: request.postal_code, date_souhaitee: request.desired_date,
          notes: request.notes, source: request.source, statut: request.status,
        },
        materiau: material,
        client: client && {
          type: client.client_type, nom: client.name, ville: client.city,
          conditions: client.payment_terms, actif_depuis: client.created_at,
        },
        historique_client: {
          commandes: (history ?? []).length,
          valeur_totale: (history ?? []).reduce((s, o) => s + Number(o.total ?? 0), 0),
        },
        apprentissage: {
          signaux: (learning ?? []).length,
          taux_reussite_pct: (learning ?? []).length ? Math.round((won.length / (learning ?? []).length) * 100) : null,
          valeur_moyenne_gagnee: won.length ? Math.round(won.reduce((s, l) => s + Number(l.amount ?? 0), 0) / won.length) : null,
        },
        saison: quebecSeason(),
        representants: (reps ?? []).map((r) => ({ nom: r.full_name ?? r.email, role: r.role })),
      };

      const ai = await callAI([
        {
          role: 'system',
          content:
            "Tu es l'analyste commercial de Vrac Québec (transport de matériaux en vrac au Québec). " +
            "Tu qualifies une demande à partir de données réelles. N'invente aucun chiffre : déduis-les des données fournies. " +
            'Réponds UNIQUEMENT en JSON valide avec ces clés : stars (1-5), score (0-100), priority (basse|normale|haute|urgente), ' +
            'client_type, project_type, potential_revenue (nombre CAD), win_probability (0-100), recommended_rep (nom exact d\'un représentant fourni ou ""), ' +
            'reasoning (2 phrases max en français), signals (objet de facteurs clés).',
        },
        { role: 'user', content: `Données réelles :\n${JSON.stringify(context).slice(0, 20000)}` },
      ], { jsonMode: true });

      if (!ai.ok) return json({ error: ai.error }, ai.status);
      const parsed = parseJsonLoose<Scored>(ai.text);
      if (!parsed) continue;

      const rep = (reps ?? []).find((r) => (r.full_name ?? r.email) === parsed.recommended_rep);
      const row = {
        company_id: request.company_id,
        request_id: request.id,
        stars: Math.min(5, Math.max(1, Math.round(Number(parsed.stars) || 3))),
        score: Math.min(100, Math.max(0, Math.round(Number(parsed.score) || 50))),
        priority: String(parsed.priority ?? 'normale'),
        client_type: parsed.client_type ?? client?.client_type ?? null,
        project_type: parsed.project_type ?? null,
        potential_revenue: Number(parsed.potential_revenue) || 0,
        win_probability: Math.min(100, Math.max(0, Number(parsed.win_probability) || 0)),
        recommended_rep_user_id: rep?.user_id ?? null,
        recommended_rep_name: parsed.recommended_rep || null,
        reasoning: parsed.reasoning ?? null,
        signals: parsed.signals ?? {},
        model: AI_MODEL,
      };

      const { error } = await admin.from('jsc_lead_scores').upsert(row, { onConflict: 'request_id' });
      if (error) return json({ error: error.message }, 500);
      results.push({ request_id: request.id, ...row });
    }

    return json({ scored: results.length, results });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});