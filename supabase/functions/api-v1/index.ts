// ============================================================
// VRAC QUÉBEC OS — API PUBLIQUE v1 (multi-entreprises)
// Authentification par clé d'API : en-tête `X-Api-Key`.
// Chaque clé est rattachée à une entreprise : toutes les données
// retournées sont cloisonnées par company_id. Chaque appel est journalisé.
//
// GET  /docs                 documentation des routes
// POST /requests             création d'une demande
// GET  /quotes               soumissions de l'entreprise
// POST /orders               création d'une commande à partir d'une soumission
// GET  /deliveries           suivi des livraisons
// GET  /invoices             factures
// ============================================================
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

const DOCS = {
  version: '1.0',
  authentication: "Envoyez l'en-tête `X-Api-Key: vq_live_…`. Chaque clé est liée à une entreprise.",
  routes: [
    { method: 'GET', path: '/docs', scope: 'read', description: 'Documentation de l\'API.' },
    {
      method: 'POST', path: '/requests', scope: 'write',
      description: 'Crée une demande de matériaux.',
      body: {
        client_name: 'string (requis)', client_email: 'string', client_phone: 'string',
        material_id: 'uuid', quantity: 'number', quantity_unit: 'tonne | verge | m3',
        delivery_address: 'string', city: 'string', postal_code: 'string',
        desired_date: 'AAAA-MM-JJ', notes: 'string',
      },
    },
    { method: 'GET', path: '/quotes', scope: 'read', description: 'Liste des soumissions.', query: { status: 'optionnel', limit: '1-200' } },
    {
      method: 'POST', path: '/orders', scope: 'write',
      description: 'Transforme une soumission acceptée en commande.', body: { quote_id: 'uuid (requis)' },
    },
    { method: 'GET', path: '/deliveries', scope: 'read', description: 'Suivi des livraisons.', query: { from: 'AAAA-MM-JJ', to: 'AAAA-MM-JJ', status: 'optionnel' } },
    { method: 'GET', path: '/invoices', scope: 'read', description: 'Factures émises.', query: { status: 'optionnel', limit: '1-200' } },
  ],
  errors: {
    401: 'Clé absente, révoquée ou expirée.',
    403: 'Portée insuffisante pour cette route.',
    404: 'Route inconnue.',
    422: 'Corps de requête invalide.',
  },
};

const limitOf = (url: URL) => Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50) || 50, 1), 200);
const clean = <T extends Record<string, unknown>>(rows: T[] | null) =>
  (rows ?? []).map(({ internal_notes: _i, estimated_cost: _e, ...rest }) => rest);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const started = Date.now();
  const url = new URL(req.url);
  const path = '/' + url.pathname.replace(/^\/functions\/v1/, '').replace(/^\/api-v1/, '').replace(/^\/+/, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  let keyRow: { id: string; company_id: string | null; scopes: string[] } | null = null;
  let status = 200;
  let errorMessage: string | null = null;

  const finish = async (body: unknown, code: number) => {
    status = code;
    await db.from('jsc_api_requests').insert({
      api_key_id: keyRow?.id ?? null,
      company_id: keyRow?.company_id ?? null,
      method: req.method,
      path,
      status_code: code,
      duration_ms: Date.now() - started,
      ip_address: req.headers.get('x-forwarded-for'),
      error: errorMessage,
    });
    return json(body, code);
  };

  try {
    if (req.method === 'GET' && (path === '/docs' || path === '/')) return json(DOCS, 200);

    const apiKey = req.headers.get('x-api-key') ?? '';
    if (!apiKey.startsWith('vq_')) {
      errorMessage = 'missing_api_key';
      return await finish({ error: 'Clé d\'API requise dans l\'en-tête X-Api-Key.' }, 401);
    }

    const { data: found } = await db
      .from('jsc_api_keys')
      .select('id,company_id,scopes,expires_at,revoked_at')
      .eq('key_hash', await sha256(apiKey))
      .maybeSingle();

    if (!found || found.revoked_at || (found.expires_at && new Date(found.expires_at) < new Date())) {
      errorMessage = 'invalid_api_key';
      return await finish({ error: 'Clé d\'API invalide, révoquée ou expirée.' }, 401);
    }
    keyRow = found as typeof keyRow;
    const scopes = keyRow!.scopes ?? [];
    const companyId = keyRow!.company_id;
    void db.from('jsc_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow!.id);

    const requireScope = (scope: string) => scopes.includes(scope) || scopes.includes('admin');
    const scoped = (q: any) => (companyId ? q.eq('company_id', companyId) : q);

    if (req.method === 'GET' && path === '/quotes') {
      if (!requireScope('read')) { errorMessage = 'scope'; return await finish({ error: 'Portée « read » requise.' }, 403); }
      let q = scoped(db.from('jsc_quotes').select('*').is('archived_at', null))
        .order('created_at', { ascending: false }).limit(limitOf(url));
      const s = url.searchParams.get('status');
      if (s) q = q.eq('status', s);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return await finish({ data: clean(data as Record<string, unknown>[]) }, 200);
    }

    if (req.method === 'GET' && path === '/deliveries') {
      if (!requireScope('read')) { errorMessage = 'scope'; return await finish({ error: 'Portée « read » requise.' }, 403); }
      let q = scoped(db.from('jsc_deliveries').select('*').is('archived_at', null))
        .order('scheduled_date', { ascending: false }).limit(limitOf(url));
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const s = url.searchParams.get('status');
      if (from) q = q.gte('scheduled_date', from);
      if (to) q = q.lte('scheduled_date', to);
      if (s) q = q.eq('status', s);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return await finish({ data: clean(data as Record<string, unknown>[]) }, 200);
    }

    if (req.method === 'GET' && path === '/invoices') {
      if (!requireScope('read')) { errorMessage = 'scope'; return await finish({ error: 'Portée « read » requise.' }, 403); }
      let q = scoped(db.from('jsc_invoices').select('*').is('archived_at', null))
        .order('created_at', { ascending: false }).limit(limitOf(url));
      const s = url.searchParams.get('status');
      if (s) q = q.eq('status', s);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return await finish({ data: clean(data as Record<string, unknown>[]) }, 200);
    }

    if (req.method === 'POST' && path === '/requests') {
      if (!requireScope('write')) { errorMessage = 'scope'; return await finish({ error: 'Portée « write » requise.' }, 403); }
      const body = await req.json().catch(() => null) as Record<string, unknown> | null;
      const name = typeof body?.client_name === 'string' ? body.client_name.trim() : '';
      const quantity = Number(body?.quantity ?? 0);
      if (name.length < 2 || name.length > 200) {
        errorMessage = 'validation'; return await finish({ error: 'client_name requis (2 à 200 caractères).' }, 422);
      }
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) {
        errorMessage = 'validation'; return await finish({ error: 'quantity invalide.' }, 422);
      }
      const unit = ['tonne', 'verge', 'm3'].includes(String(body?.quantity_unit)) ? String(body?.quantity_unit) : 'tonne';

      const { data: client, error: clientError } = await db.from('jsc_clients').insert({
        company_id: companyId,
        name,
        email: typeof body?.client_email === 'string' ? body.client_email.slice(0, 255) : null,
        phone: typeof body?.client_phone === 'string' ? body.client_phone.slice(0, 40) : null,
        city: typeof body?.city === 'string' ? body.city.slice(0, 120) : null,
        postal_code: typeof body?.postal_code === 'string' ? body.postal_code.slice(0, 12) : null,
      }).select('id').single();
      if (clientError) throw new Error(clientError.message);

      const { data: request, error } = await db.from('jsc_requests').insert({
        company_id: companyId,
        client_id: client.id,
        material_id: typeof body?.material_id === 'string' ? body.material_id : null,
        quantity,
        quantity_unit: unit,
        delivery_address: typeof body?.delivery_address === 'string' ? body.delivery_address.slice(0, 300) : null,
        city: typeof body?.city === 'string' ? body.city.slice(0, 120) : null,
        postal_code: typeof body?.postal_code === 'string' ? body.postal_code.slice(0, 12) : null,
        desired_date: typeof body?.desired_date === 'string' ? body.desired_date : null,
        notes: typeof body?.notes === 'string' ? body.notes.slice(0, 2000) : null,
        source: 'api',
      }).select('*').single();
      if (error) throw new Error(error.message);

      await db.rpc('jsc_notify', {
        _company_id: companyId, _event_code: 'request_created',
        _title: 'Nouvelle demande via API',
        _body: `Demande ${request.request_number ?? ''} créée par API pour ${name}.`,
        _audience: 'internal', _entity_type: 'request', _entity_id: request.id,
      });

      return await finish({ data: clean([request as Record<string, unknown>])[0] }, 201);
    }

    if (req.method === 'POST' && path === '/orders') {
      if (!requireScope('write')) { errorMessage = 'scope'; return await finish({ error: 'Portée « write » requise.' }, 403); }
      const body = await req.json().catch(() => null) as Record<string, unknown> | null;
      const quoteId = typeof body?.quote_id === 'string' ? body.quote_id : '';
      if (quoteId.length < 10) { errorMessage = 'validation'; return await finish({ error: 'quote_id requis.' }, 422); }

      const { data: quote } = await db.from('jsc_quotes').select('id,company_id').eq('id', quoteId).maybeSingle();
      if (!quote || (companyId && quote.company_id !== companyId)) {
        errorMessage = 'not_found'; return await finish({ error: 'Soumission introuvable pour cette entreprise.' }, 404);
      }
      const { data, error } = await db.rpc('jsc_convert_quote_to_order', { _quote_id: quoteId });
      if (error) throw new Error(error.message);
      return await finish({ data }, 201);
    }

    errorMessage = 'not_found';
    return await finish({ error: 'Route inconnue. Consultez GET /docs.' }, 404);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : 'unknown';
    console.error('api-v1 failed:', errorMessage, 'path:', path, 'status:', status);
    // Détails techniques conservés dans les logs uniquement.
    return await finish({ error: 'internal_error' }, 500);
  }
});
