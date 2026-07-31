// Deno edge function — Intelligence Centrale (Sprint Production 6).
// Orchestration des moteurs serveur (apprentissage, scores, prévisions, anomalies,
// optimisation), IA commerciale et rapport quotidien de direction.
// Aucune donnée simulée : toutes les entrées proviennent des tables réelles.
import { corsHeaders, json, adminClient, requireAdmin, callAI, parseJsonLoose, quebecSeason } from '../_shared/vqos-intel.ts';

type Body = {
  action?: 'run' | 'commercial' | 'daily_report';
  company_id?: string | null;
  email?: boolean;
  scope?: 'daily' | 'weekly';
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

    // ---------- 1..5 : moteurs déterministes ----------
    if (action === 'run') {
      const steps: Record<string, unknown> = {};
      for (const fn of ['jsc_intel_learn', 'jsc_intel_score_all', 'jsc_intel_predict',
        'jsc_intel_detect_anomalies', 'jsc_intel_optimize'] as const) {
        const { data, error } = await db.rpc(fn, { _company_id: companyId });
        if (error) return json({ error: `${fn} : ${error.message}` }, 500);
        steps[fn] = data;
      }
      return json({ ok: true, steps, ran_at: new Date().toISOString() });
    }

    // ---------- 6 : IA commerciale ----------
    if (action === 'commercial') {
      const [learning, scores, anomalies, optims] = await Promise.all([
        db.from('jsc_intel_learning').select('topic,subject_label,metrics,samples,confidence').limit(200),
        db.from('jsc_intel_scores').select('entity_type,label,score,grade,factors')
          .order('score', { ascending: false }).limit(60),
        db.from('jsc_intel_anomalies').select('code,severity,title,impact_amount')
          .eq('status', 'open').limit(40),
        db.from('jsc_intel_optimizations').select('kind,title,estimated_saving,confidence')
          .eq('status', 'pending').limit(40),
      ]);

      const payload = {
        saison: quebecSeason(),
        apprentissage: learning.data ?? [],
        scores: scores.data ?? [],
        anomalies: anomalies.data ?? [],
        optimisations: optims.data ?? [],
      };

      const ai = await callAI([
        {
          role: 'system',
          content:
            "Tu es le directeur commercial IA de Vrac Québec (transport de matériaux en vrac). " +
            "Tu réponds uniquement en JSON valide, en français québécois professionnel. " +
            "Structure : {\"suggestions\":[{\"type\":\"vente_croisee|promotion|relance|fournisseur_alternatif|risque_perte|projet_prioritaire\"," +
            "\"titre\":string,\"cible\":string,\"argumentaire\":string,\"impact_estime\":number,\"confiance\":number,\"preuves\":[string]}]}. " +
            "Maximum 8 suggestions. N'invente aucun chiffre : appuie-toi uniquement sur les données fournies " +
            "et cite les preuves utilisées. Si les données sont insuffisantes, retourne une liste vide.",
        },
        { role: 'user', content: `Données réelles de la plateforme (JSON) :\n${JSON.stringify(payload).slice(0, 24000)}` },
      ], { jsonMode: true });

      if (!ai.ok) return json({ error: ai.error }, ai.status);
      const parsed = parseJsonLoose<{ suggestions?: unknown[] }>(ai.text) ?? { suggestions: [] };

      await db.from('jsc_intel_reports').insert({
        company_id: companyId,
        scope: 'commercial',
        summary: null,
        metrics: { suggestions: parsed.suggestions ?? [], basis: { scores: payload.scores.length, learning: payload.apprentissage.length } },
      });

      return json({ ok: true, suggestions: parsed.suggestions ?? [] });
    }

    // ---------- 7 : rapport quotidien de direction ----------
    if (action === 'daily_report') {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const q = (t: string) => (companyId ? { company_id: companyId } : {});

      const [dash, orders, invoices, clients, late, anomalies, optims] = await Promise.all([
        db.rpc('jsc_intel_dashboard', { _company_id: companyId }),
        db.from('jsc_orders').select('id,total,status,created_at').gte('created_at', since).match(q('o')),
        db.from('jsc_invoices').select('total,amount_paid,balance,status').is('archived_at', null).match(q('i')),
        db.from('jsc_clients').select('id,name,created_at').gte('created_at', since).match(q('c')),
        db.from('jsc_deliveries').select('id,delivery_number,scheduled_date,status')
          .is('delivered_at', null).lt('scheduled_date', new Date().toISOString().slice(0, 10)).match(q('d')).limit(50),
        db.from('jsc_intel_anomalies').select('code,severity,title,impact_amount').eq('status', 'open').limit(30),
        db.from('jsc_intel_optimizations').select('kind,title,estimated_saving').eq('status', 'pending').limit(30),
      ]);

      const sum = (rows: { total?: number | null }[] | null, k = 'total') =>
        (rows ?? []).reduce((a, r) => a + Number((r as Record<string, unknown>)[k] ?? 0), 0);

      const metrics = {
        periode: '24 h',
        commandes_24h: orders.data?.length ?? 0,
        chiffre_affaires_24h: Math.round(sum(orders.data) * 100) / 100,
        nouveaux_clients_24h: clients.data?.length ?? 0,
        comptes_a_recevoir: Math.round(sum(invoices.data as never, 'balance') * 100) / 100,
        livraisons_en_retard: late.data?.length ?? 0,
        anomalies_ouvertes: anomalies.data ?? [],
        optimisations_en_attente: optims.data ?? [],
        intelligence: dash.data ?? null,
      };

      const ai = await callAI([
        {
          role: 'system',
          content:
            "Tu es l'analyste de direction de Vrac Québec. Écris en français québécois professionnel, en markdown court " +
            "(moins de 400 mots). Structure obligatoire : **Résumé**, **Chiffres clés**, **Problèmes**, " +
            "**Recommandations** (3 à 5 actions concrètes), **Décisions proposées**. " +
            "Utilise uniquement les chiffres fournis et n'invente aucune donnée.",
        },
        { role: 'user', content: `Rapport quotidien. Données réelles (JSON) :\n${JSON.stringify(metrics).slice(0, 24000)}` },
      ]);
      if (!ai.ok) return json({ error: ai.error }, ai.status);

      const today = new Date().toISOString().slice(0, 10);
      const { data: saved, error: saveErr } = await db.from('jsc_intel_reports')
        .insert({ company_id: companyId, scope: body.scope ?? 'daily', report_date: today, summary: ai.text, metrics })
        .select('id').single();
      if (saveErr) return json({ error: saveErr.message }, 500);

      let emailed = false;
      if (body.email) {
        const { data: company } = await db.from('jsc_companies')
          .select('name,notify_email,email').eq('id', companyId ?? '').maybeSingle();
        const to = company?.email ?? null;
        if (to) {
          const res = await db.functions.invoke('send-transactional-email', {
            body: {
              templateName: 'direction-daily-report',
              recipientEmail: to,
              idempotencyKey: `intel-daily-${saved.id}`,
              templateData: {
                companyName: company?.name ?? 'Vrac Québec',
                reportDate: today,
                summary: ai.text,
                revenue: metrics.chiffre_affaires_24h,
                orders: metrics.commandes_24h,
                newClients: metrics.nouveaux_clients_24h,
                lateDeliveries: metrics.livraisons_en_retard,
              },
            },
          });
          emailed = !res.error;
          if (emailed) await db.from('jsc_intel_reports').update({ emailed_at: new Date().toISOString() }).eq('id', saved.id);
        }
      }

      return json({ ok: true, report_id: saved.id, summary: ai.text, metrics, emailed });
    }

    return json({ error: 'Action inconnue' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});