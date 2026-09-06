// ============================================================
// PLACE DE MARCHÉ — DÉPÔT D'UNE DEMANDE DE SOUMISSION (public)
// ------------------------------------------------------------
// Accepte une demande d'un visiteur ou d'un utilisateur connecté.
// Le propriétaire de la demande est TOUJOURS déduit du jeton
// d'authentification, jamais du corps de la requête.
// POST { category_slug, title, description, answers, contact..., lots? }
// ============================================================
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { clientIp, GuardError, guardPublicRequest, rememberResult } from '../_shared/public-guard.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const clean = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};

const db = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

/** Identité du demandeur connecté (jamais fournie par le client). */
async function currentUserId(sb: any, req: Request): Promise<string | null> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error) return null;
  return data?.user?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non permise.' }, 405);

  const sb = db();
  try {
    const body = await req.json().catch(() => ({}));
    const title = clean(body.title, 200);
    const description = clean(body.description, 4000);
    const email = clean(body.contact_email, 160)?.toLowerCase() ?? null;
    const phone = clean(body.contact_phone, 40);
    const city = clean(body.city, 120);

    if (!title) return json({ error: 'Veuillez décrire votre besoin.' }, 400);
    if (!email && !phone) return json({ error: 'Un téléphone ou un courriel est requis.' }, 400);

    const ip = clientIp(req);
    const fingerprint = [body.category_slug, title, city, email, phone].join('|').slice(0, 400);
    const verdict = await guardPublicRequest(sb, {
      scope: 'mkt_quote_request',
      identity: email ?? phone ?? ip ?? 'anonyme',
      fingerprint,
      honeypot: body.website_hp,
      formStartedAt: body.form_started_at,
      freeText: [description, clean(body.notes, 2000)].filter(Boolean).join(' '),
      ip,
      maxPerWindow: 6,
    });
    if (verdict.duplicate && verdict.previous?.request_number) {
      return json({ ok: true, request_number: verdict.previous.request_number, duplicate: true });
    }

    // Catégorie : résolue côté serveur à partir du slug public.
    let categoryId: string | null = null;
    const slug = clean(body.category_slug, 80);
    if (slug) {
      const { data: cat } = await sb.from('mkt_service_categories')
        .select('id').eq('slug', slug).eq('level', 'categorie').maybeSingle();
      categoryId = cat?.id ?? null;
    }

    const userId = await currentUserId(sb, req);

    const { data: inserted, error } = await sb.from('mkt_quote_requests').insert({
      client_user_id: userId,
      created_by: userId,
      client_type: clean(body.client_type, 40) ?? 'particulier',
      contact_name: clean(body.contact_name, 160),
      contact_phone: phone,
      contact_email: email,
      organization_name: clean(body.organization_name, 200),
      category_id: categoryId,
      title,
      description,
      answers: typeof body.answers === 'object' && body.answers ? body.answers : {},
      address: clean(body.address, 300),
      city,
      region: clean(body.region, 120),
      desired_date: clean(body.desired_date, 20),
      deadline_at: clean(body.deadline_at, 40),
      source: 'site_public',
      status: 'nouvelle',
    }).select('id, request_number').single();
    if (error) throw error;

    // Lots facultatifs (projets complexes).
    const lots = Array.isArray(body.lots) ? body.lots.slice(0, 30) : [];
    if (lots.length) {
      await sb.from('mkt_request_lots').insert(lots.map((l: any, i: number) => ({
        request_id: inserted.id,
        lot_number: clean(l.lot_number, 20) ?? String(i + 1).padStart(2, '0'),
        title: clean(l.title, 200) ?? `Lot ${i + 1}`,
        description: clean(l.description, 2000),
        sort_order: i,
      })));
    }

    await rememberResult(sb, 'mkt_quote_request', fingerprint, {
      ip, request_number: inserted.request_number, request_id: inserted.id,
    });

    return json({ ok: true, request_number: inserted.request_number, request_id: inserted.id });
  } catch (e) {
    if (e instanceof GuardError) return json({ error: e.message, code: e.code }, e.status);
    console.error('mkt-request-submit', e instanceof Error ? e.message : e);
    return json({ error: "La demande n'a pas pu être enregistrée." }, 500);
  }
});
