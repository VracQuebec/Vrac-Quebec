// ============================================================
// ENVOI DES NOTIFICATIONS PUSH (Web Push / iOS Home Screen)
// ------------------------------------------------------------
// Actions :
//   config   → clé publique VAPID (accès public, non sensible)
//   dispatch → envoie les notifications en attente (cron interne ou admin)
//   test     → envoi d'essai à l'administrateur connecté
// Aucune donnée CRM n'est dupliquée : la notification pousse un
// titre court + un lien direct vers l'élément concerné.
// ============================================================
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:info@vracquebec.ca';

function db() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

async function currentAdmin(sb: ReturnType<typeof db>, req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  if (!token) return null;
  const { data } = await sb.auth.getUser(token);
  if (!data?.user) return null;
  const { data: ok } = await sb.rpc('has_role', { _user_id: data.user.id, _role: 'admin' });
  return ok === true ? data.user : null;
}

const ICON = '/icons/icon-192.png';

interface Sub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  categories: Record<string, boolean>;
  is_enabled: boolean;
}

async function sendTo(sub: Sub, payload: Record<string, unknown>, sb: ReturnType<typeof db>) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 3600 },
    );
    await sb.from('crm_push_subscriptions')
      .update({ last_success_at: new Date().toISOString(), last_error: null })
      .eq('id', sub.id);
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    const message = String((err as Error)?.message ?? err);
    // 404/410 : l'appareil a désinstallé l'app ou révoqué l'autorisation
    if (status === 404 || status === 410) {
      await sb.from('crm_push_subscriptions').delete().eq('id', sub.id);
    } else {
      await sb.from('crm_push_subscriptions').update({ last_error: message }).eq('id', sub.id);
    }
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch { /* corps vide */ } }
  const action = String(body.action ?? url.searchParams.get('action') ?? 'config');

  if (action === 'config') {
    return json({ ok: true, publicKey: PUBLIC_KEY });
  }

  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    return json({ ok: false, message: 'Clés VAPID absentes' }, 500);
  }
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

  const sb = db();
  const cronSecret = Deno.env.get('CRM_PUSH_CRON_SECRET') ?? '';
  const isCron = cronSecret.length > 0 && req.headers.get('x-cron-secret') === cronSecret;
  const admin = isCron ? null : await currentAdmin(sb, req);
  if (!isCron && !admin) return json({ ok: false, message: 'Non autorisé' }, 401);

  if (action === 'test') {
    const { data: subs } = await sb
      .from('crm_push_subscriptions')
      .select('id, endpoint, p256dh, auth, categories, is_enabled')
      .eq('user_id', admin!.id)
      .eq('is_enabled', true);
    let sent = 0;
    for (const s of (subs ?? []) as Sub[]) {
      if (await sendTo(s, {
        title: 'Vrac Québec',
        body: '🔔 Test de notification — tout fonctionne.',
        url: '/admin/notifications',
        tag: 'test',
        badge: 0,
        icon: ICON,
      }, sb)) sent++;
    }
    return json({ ok: true, sent, devices: (subs ?? []).length });
  }

  if (action !== 'dispatch') return json({ ok: false, message: 'Action inconnue' }, 400);

  const { data: pending } = await sb
    .from('crm_notifications')
    .select('id, category, type, priority, title, body, action_url, client_name, lead_number, created_at')
    .eq('push_status', 'pending')
    .in('status', ['unread', 'read', 'in_progress'])
    .order('created_at', { ascending: true })
    .limit(25);

  if (!pending?.length) return json({ ok: true, sent: 0, notifications: 0 });

  const { data: settings } = await sb
    .from('crm_notification_settings').select('push_categories').eq('scope', 'global').maybeSingle();
  const globalPush = (settings?.push_categories ?? {}) as Record<string, boolean>;

  const { data: subsRaw } = await sb
    .from('crm_push_subscriptions')
    .select('id, endpoint, p256dh, auth, categories, is_enabled')
    .eq('is_enabled', true);
  const subs = (subsRaw ?? []) as Sub[];

  // Compteur badge = notifications ouvertes non lues
  const { count: unread } = await sb
    .from('crm_notifications').select('id', { count: 'exact', head: true }).eq('status', 'unread');

  let sent = 0;
  const DAY = 24 * 3600 * 1000;
  for (const n of pending) {
    const allowedGlobally = globalPush[n.category] !== false;
    const stale = Date.now() - new Date(n.created_at as string).getTime() > DAY;
    // Aucun appareil abonné : on garde la notification « en attente » pendant 24 h
    // pour que le premier iPhone activé reçoive les alertes récentes.
    if (subs.length === 0 && allowedGlobally && !stale) continue;
    if (!allowedGlobally || subs.length === 0) {
      await sb.from('crm_notifications')
        .update({ push_status: 'skipped', push_sent_at: new Date().toISOString() }).eq('id', n.id);
      continue;
    }
    const targets = subs.filter((s) => (s.categories ?? {})[n.category] !== false);
    let ok = targets.length === 0;
    for (const s of targets) {
      if (await sendTo(s, {
        title: 'Vrac Québec',
        body: [n.title, n.body].filter(Boolean).join('\n'),
        url: n.action_url ?? '/admin/notifications',
        tag: n.id,
        notificationId: n.id,
        badge: unread ?? 0,
        icon: ICON,
        urgent: n.priority === 'urgente',
      }, sb)) { ok = true; sent++; }
    }
    await sb.from('crm_notifications').update({
      push_status: ok ? 'sent' : 'failed',
      push_sent_at: new Date().toISOString(),
    }).eq('id', n.id);
  }

  return json({ ok: true, sent, notifications: pending.length, devices: subs.length });
});
