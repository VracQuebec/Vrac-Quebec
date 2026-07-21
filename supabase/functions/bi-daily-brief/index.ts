import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authed = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData } = await authed.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const admin = createClient(url, service);
    const { data: roleData } = await admin.from('user_roles').select('role').eq('user_id', userData.user.id).eq('role', 'admin').eq('approved', true).maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Accès admin requis' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { metrics } = await req.json().catch(() => ({ metrics: {} }));

    const key = Deno.env.get('LOVABLE_API_KEY');
    if (!key) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY manquant' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const prompt = `Tu es le copilote de direction de Vrac Québec (connecteur logistique de matériaux en vrac dans la région de Québec/Lévis).
À partir des indicateurs suivants (JSON), rédige un briefing exécutif du matin en français, ton clair, concret, orienté action.
Structure attendue (markdown, courte, sans redondance) :

**Résumé** : 2-3 phrases clés (variations, faits marquants).
**Ce qui monte** : puces avec chiffres réels et % de variation.
**Ce qui inquiète** : puces avec risques ou baisses (peut être vide).
**Actions du jour** : 3 à 5 recommandations concrètes et priorisées.
**Opportunités** : villes / matériaux / partenaires à développer selon les données.

Utilise les chiffres exacts fournis. N'invente aucune donnée absente.

Données :
\`\`\`json
${JSON.stringify(metrics, null, 2)}
\`\`\``;

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      return new Response(JSON.stringify({ error: 'AI Gateway a échoué', status: resp.status, details: body }), { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const json = await resp.json();
    const brief = json?.choices?.[0]?.message?.content ?? '';
    return new Response(JSON.stringify({ brief }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});