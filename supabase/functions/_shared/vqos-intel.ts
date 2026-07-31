// Vrac Québec OS — utilitaires partagés d'intelligence commerciale.
// Aucune donnée d'affaires codée en dur : tout provient de la base.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export { corsHeaders };

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/** Autorise un administrateur connecté, ou un appel serveur (cron / service role). */
export async function requireAdmin(req: Request): Promise<{ ok: true; userId: string | null } | { ok: false; res: Response }> {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (token && token === service) return { ok: true, userId: null };

  if (!token) return { ok: false, res: json({ error: 'Non autorisé' }, 401) };

  const authed = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await authed.auth.getUser();
  const user = data?.user;
  if (!user) return { ok: false, res: json({ error: 'Session invalide' }, 401) };

  const admin = adminClient();
  const { data: role } = await admin
    .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
  if (!role) return { ok: false, res: json({ error: 'Accès admin requis' }, 403) };
  return { ok: true, userId: user.id };
}

export const AI_MODEL = 'openai/gpt-5.6-sol';

/** Appel du Lovable AI Gateway. Retourne le texte brut du modèle. */
export async function callAI(
  messages: { role: string; content: string }[],
  opts: { jsonMode?: boolean } = {},
): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) return { ok: false, status: 500, error: 'Clé IA manquante' };

  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key },
    body: JSON.stringify({
      model: AI_MODEL,
      reasoning_effort: 'none',
      messages,
      ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 429) return { ok: false, status: 429, error: 'Limite de requêtes IA atteinte, réessayez plus tard.' };
    if (res.status === 402) return { ok: false, status: 402, error: 'Crédits IA épuisés.' };
    return { ok: false, status: res.status, error: `Échec IA : ${detail.slice(0, 500)}` };
  }

  const data = await res.json();
  return { ok: true, text: data?.choices?.[0]?.message?.content ?? '' };
}

/** Extraction tolérante d'un objet JSON dans une réponse de modèle. */
export function parseJsonLoose<T>(text: string): T | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned) as T; } catch { /* continue */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)) as T; } catch { /* continue */ }
  }
  return null;
}

/** Saison québécoise déduite de la date (utilisée par le moteur de recommandation). */
export function quebecSeason(d = new Date()): string {
  const m = d.getUTCMonth() + 1;
  if (m <= 3 || m === 12) return 'hiver';
  if (m <= 5) return 'printemps (dégel, restrictions de charge)';
  if (m <= 8) return 'été (haute saison de construction)';
  return 'automne';
}