// Deno edge function — Résumés IA du Centre d'Intelligence d'Affaires (Vrac Québec OS).
// Admin uniquement. Aucune donnée codée en dur : les métriques réelles sont fournies par le client.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SCOPES: Record<string, string> = {
  daily: 'un résumé quotidien',
  weekly: 'un résumé hebdomadaire',
  monthly: 'un résumé mensuel',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');

    const authed = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData } = await authed.auth.getUser();
    if (!userData?.user) return json({ error: 'Non autorisé' }, 401);

    const admin = createClient(url, service);
    const { data: role } = await admin.from('user_roles').select('role')
      .eq('user_id', userData.user.id).eq('role', 'admin').maybeSingle();
    if (!role) return json({ error: 'Accès admin requis' }, 403);

    const body = await req.json().catch(() => ({}));
    const scope = SCOPES[String(body?.scope ?? 'daily')] ?? SCOPES.daily;
    const metrics = body?.metrics ?? {};

    const key = Deno.env.get('LOVABLE_API_KEY');
    if (!key) return json({ error: 'Clé IA manquante' }, 500);

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key },
      body: JSON.stringify({
        model: 'openai/gpt-5.6-sol',
        reasoning_effort: 'none',
        messages: [
          {
            role: 'system',
            content:
              "Tu es l'analyste d'affaires de Vrac Québec (transport de matériaux en vrac au Québec). " +
              "Tu écris en français québécois professionnel, en markdown court. Structure obligatoire : " +
              "**Résumé**, **Explication des variations**, **Opportunités**, **Risques**, **Recommandations** (3 à 5 actions concrètes). " +
              "Utilise uniquement les chiffres fournis, n'invente aucune donnée, et reste sous 350 mots.",
          },
          { role: 'user', content: `Produis ${scope}. Données réelles (JSON) :\n${JSON.stringify(metrics).slice(0, 24000)}` },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      if (res.status === 429) return json({ error: 'Limite de requêtes IA atteinte, réessayez plus tard.' }, 429);
      if (res.status === 402) return json({ error: 'Crédits IA épuisés.' }, 402);
      return json({ error: 'Échec de la génération IA', details: detail }, res.status);
    }

    const data = await res.json();
    const brief = data?.choices?.[0]?.message?.content ?? '';
    return json({ brief, model: 'openai/gpt-5.6-sol', generated_at: new Date().toISOString() });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});