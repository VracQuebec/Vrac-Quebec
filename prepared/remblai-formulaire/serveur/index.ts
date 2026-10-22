// EXEC-01 — suivi des demandes de remblai sans compte.
// Captures fictives enregistrées; courrier réel uniquement avec EXEC01_REAL_MAIL_ENABLED.
// Activation publique contrôlée par EXEC01_ENABLED; le bouton des vrais courriels reste désactivé.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.118.0/cors';
import { makeEndpoint } from './endpoint.ts';
import { digest } from './lib/service.ts';
import { cleanFictionalPhotos } from './photo-cleanup.ts';
import { deliveryCapture } from './delivery-mode.ts';
const env = (key: string) => { const value = Deno.env.get(key); if (!value) throw Error('Missing configuration'); return value; };
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const origin = env('EXEC01_PORTAL_ORIGIN');
async function photoRpc(p: Record<string, unknown>) {
  const { data, error } = await db.rpc('exec01_photo_manage', { p });
  if (error || data?.denied) throw Error('Photo operation unavailable'); return data;
}
const handler = makeEndpoint({ portalOrigin: origin, corsOrigin: origin,
  enabled: Deno.env.get('EXEC01_ENABLED') === 'true',
  quota: async request => {
    const ip = request.headers.get('cf-connecting-ip');
    if (!ip) return false; // En-tête de passerelle de confiance requis, aucun repli contrôlé par l'appelant.
    const { data, error } = await db.rpc('exec01_quota', { _identity: await digest(ip) });
    return !error && data === true;
  },
  cleanup: async (requestId, paths) => cleanFictionalPhotos(requestId, paths, {
    claim: async (_id, path) => photoRpc({ kind: 'claim', requestId, path }),
    remove: async path => { const { error } = await db.storage.from('lead-photos').remove([path]); if (error) throw Error('Storage removal unavailable'); },
    finish: async (_id, path, claimId, removed) => { const result = await photoRpc({ kind: 'finish', requestId, path, claimId, removed }); if (result.ok !== true) throw Error('History unavailable'); },
  }),
  dispatchMail: async (p, message) => {
    // Never trust a browser-supplied recipient or capture flag. SQL rechecks the
    // locked dossier/contact and commits link/code and existing queue atomically.
    const requestId = p.requestId;
    if (typeof requestId !== 'string') throw Error('Request required');
    const { data: dossier, error: dossierError } = await db.from('submissions').select('email').eq('id', requestId).single();
    const { data: fixture, error: fixtureError } = await db.from('exec01_test_dossiers').select('submission_id').eq('submission_id', requestId).maybeSingle();
    if (dossierError || fixtureError || !dossier?.email) throw Error('Mail routing unavailable');
    const capture = deliveryCapture(dossier.email, Boolean(fixture), Deno.env.get('EXEC01_REAL_MAIL_ENABLED') === 'true');
    const { data, error } = await db.rpc('exec01_dispatch_mail', { p, message: { ...message, from: 'Vrac Québec <noreply@notify.vracquebec.ca>', sender_domain: 'notify.vracquebec.ca' }, capture });
    if (error) throw Error('Mail transaction unavailable'); return data;
  },
  storage: {
    put: async (path, bytes, mime) => {
      const { data, error: leaseError } = await db.rpc('exec01_photo_manage', { p: { kind: 'begin', requestId: path.split('/')[1], path } });
      if (leaseError || data?.ok !== true) throw Error('Photo lease unavailable');
      const { error } = await db.storage.from('lead-photos').upload(path, bytes, { contentType: mime, upsert: false });
      if (error && !String(error.message).includes('already exists')) throw Error('Private storage unavailable');
    },
    sign: async (path, seconds) => { const { data, error } = await db.storage.from('lead-photos').createSignedUrl(path, seconds); if (error || !data) throw Error('Private photo unavailable'); return data.signedUrl; },
  },
  rpc: async p => { const { data, error } = await db.rpc('exec01_dispatch', { p }); if (error) throw Error('RPC unavailable'); return data; },
  isAdmin: async request => {
    const token = request.headers.get('authorization')?.replace(/^Bearer /i, ''); if (!token) return false;
    const { data, error } = await db.auth.getUser(token); if (error || !data.user) return false;
    const role = await db.rpc('has_role', { _user_id: data.user.id, _role: 'admin' }); return !role.error && role.data === true;
  },
  captureOrSend: async () => { throw Error('Separate delivery is forbidden; atomic dispatch required'); },
});
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try { return await handler(request); } catch { return Response.json({ error: 'Service indisponible.' }, { status: 503, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } }); }
});
