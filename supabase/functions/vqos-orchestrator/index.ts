// Deno edge function — Orchestrateur Global (Sprint Production 7).
// Cycle complet : risques, règles configurables, indicateurs, puis IA stratégique.
// Aucune donnée simulée : toutes les entrées proviennent des tables réelles.
import { corsHeaders, json, adminClient, requireAdmin, callAI, parseJsonLoose, quebecSeason } from '../_shared/vqos-intel.ts';

type Body = {
  action?: 'run' | 'strategy' | 'simulate';
  company_id?: string | null;
  name?: string;
  scenario_type?: string;
  inputs?: Record<string, unknown>;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const body = (await req.json().catch(() => ({}))) as Body;
    const action = body.action ?? 'run';
    const companyId = body.company_id ?? null;
    const db = adminClient();

    // ---------- Cycle d'orchestration ----------
    if (action === 'run') {
      const steps: Record<string, unknown> = {};
      for (const fn of ['jsc_orch_detect_risks', 'jsc_orch_rules_eval'] as const) {
        const { data, error } = await db.rpc(fn, { _company_id: companyId });
        if (error) return json({ error: `${fn} : ${error.message}` }, 500);
        steps[fn] = data;
      }
      const { data: control, error: ctlErr } = await db.rpc('jsc_orch_control', { _company_id: companyId });
      if (ctlErr) return json({ error: ctlErr.message }, 500);
      await db.rpc('jsc_emit_event', {
        _company_id: companyId, _event_type: 'orchestrator_cycle',
        _label: "Cycle d'orchestration exécuté", _entity_type: 'system',
        _entity_id: null, _severity: 'info', _payload: steps,
      });
      return json({ ok: true, steps, control, ran_at: new Date().toISOString() });
    }

    // ---------- Simulation ----------
    if (action === 'simulate') {
      const { data, error } = await db.rpc('jsc_orch_simulate', {
        _company_id: companyId,
        _name: body.name ?? 'Scénario',
        _scenario_type: body.scenario_type ?? 'custom',
        _inputs: body.inputs ?? {},
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, result: data });
    }

    // ---------- IA stratégique ----------
    if (action === 'strategy') {
      const [control, twin, map, learning] = await Promise.all([
        db.rpc('jsc_orch_control', { _company_id: companyId }),
        db.rpc('jsc_orch_twin', { _company_id: companyId }),
        db.rpc('jsc_orch_map', { _company_id: companyId }),
        db.from('jsc_intel_learning').select('topic,subject_label,metrics,samples,confidence').limit(150),
      ]);
      if (control.error) return json({ error: control.error.message }, 500);

      const mapData = (map.data ?? {}) as Record<string, unknown>;
      const payload = {
        saison: quebecSeason(),
        controle: control.data,
        inventaire: (twin.data as { counts?: unknown } | null)?.counts ?? null,
        villes_rentables: mapData.city_stats ?? [],
        villes_sans_approvisionnement: mapData.shortage_cities ?? [],
        apprentissage: learning.data ?? [],
      };

      const ai = await callAI([
        {
          role: 'system',
          content:
            "Tu es le stratège en chef de Vrac Québec (plateforme de matériaux en vrac au Québec). " +
            "Tu réponds uniquement en JSON valide, en français québécois professionnel. Structure : " +
            "{\"recommandations\":[{\"kind\":\"territoire|partenaire|materiau|opportunite|fournisseur_ajout|fournisseur_retrait|investissement|economie\"," +
            "\"titre\":string,\"justification\":string,\"impact_estime\":number,\"confiance\":number," +
            "\"horizon\":\"court_terme|moyen_terme|long_terme\",\"preuves\":[string]}]}. " +
            "Maximum 8 recommandations. N'invente aucun chiffre : appuie-toi uniquement sur les données fournies " +
            "et cite les preuves. Si les données sont insuffisantes, retourne une liste vide.",
        },
        { role: 'user', content: `Données réelles de la plateforme (JSON) :\n${JSON.stringify(payload).slice(0, 24000)}` },
      ], { jsonMode: true });

      if (!ai.ok) return json({ error: ai.error }, ai.status);
      const parsed = parseJsonLoose<{ recommandations?: Record<string, unknown>[] }>(ai.text) ?? {};
      const list = parsed.recommandations ?? [];

      if (list.length) {
        const rows = list.slice(0, 8).map((r) => ({
          company_id: companyId,
          kind: String(r.kind ?? 'opportunite'),
          title: String(r.titre ?? 'Recommandation'),
          rationale: String(r.justification ?? ''),
          evidence: { preuves: r.preuves ?? [], basis: { villes: (payload.villes_rentables as unknown[]).length } },
          impact_estimate: Number(r.impact_estime ?? 0),
          confidence: Number(r.confiance ?? 0),
          horizon: String(r.horizon ?? 'court_terme'),
        }));
        const { error: insErr } = await db.from('jsc_strategies').insert(rows);
        if (insErr) return json({ error: insErr.message }, 500);
      }

      return json({ ok: true, count: list.length, recommandations: list });
    }

    return json({ error: 'Action inconnue' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
