// Synchronisation Mailchimp (super admin seulement). Aucun envoi de campagne.
// - status : configuration, audience, dernière synchronisation, erreurs à traiter.
// - sync   : pousse seulement les consentements exprès documentés (statut « pending » = double confirmation),
//            pousse les retraits en « unsubscribed », ne réabonne jamais une personne désabonnée dans Mailchimp.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function md5(s: string) {
  const { crypto } = await import("https://deno.land/std@0.224.0/crypto/mod.ts");
  const h = await crypto.subtle.digest("MD5", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!, svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "Connexion requise" }, 401);
  const admin = createClient(url, svc);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "Accès réservé au super admin" }, 403);

  let action = "status";
  try { action = (await req.json())?.action ?? "status"; } catch { /* défaut */ }
  if (!["status", "sync"].includes(action)) return json({ error: "Action inconnue" }, 400);

  const key = Deno.env.get("MAILCHIMP_API_KEY"), list = Deno.env.get("MAILCHIMP_AUDIENCE_ID");
  const missing = [!key && "MAILCHIMP_API_KEY", !list && "MAILCHIMP_AUDIENCE_ID", !Deno.env.get("MAILCHIMP_WEBHOOK_SECRET") && "MAILCHIMP_WEBHOOK_SECRET"].filter(Boolean);
  const [{ count: toSync }, { count: errors }, { data: last }] = await Promise.all([
    admin.from("mkt_consents").select("id", { count: "exact", head: true }).eq("mc_status", "a_synchroniser"),
    admin.from("mkt_consents").select("id", { count: "exact", head: true }).eq("mc_status", "erreur"),
    admin.from("mkt_sync_log").select("at,ok,detail,action").order("at", { ascending: false }).limit(1),
  ]);
  const base = { configured: missing.length === 0 || (missing.length === 1 && missing[0] === "MAILCHIMP_WEBHOOK_SECRET"), missing, to_sync: toSync ?? 0, errors: errors ?? 0, last: last?.[0] ?? null };
  if (!key || !list) return json({ ...base, audience: null });

  const dc = key.split("-")[1];
  if (!dc) return json({ ...base, configured: false, missing: ["MAILCHIMP_API_KEY (format attendu : clé-usX)"] });
  const api = (path: string, init: RequestInit = {}) => fetch(`https://${dc}.api.mailchimp.com/3.0${path}`, {
    ...init, headers: { Authorization: `Basic ${btoa("vrac:" + key)}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

  const lr = await api(`/lists/${list}?fields=name,stats.member_count`);
  if (!lr.ok) { const t = await lr.text(); return json({ ...base, audience: null, audience_error: `[${lr.status}] ${t.slice(0, 300)}` }); }
  const audience = await lr.json();
  if (action === "status") return json({ ...base, audience });

  const { data: rows } = await admin.from("mkt_consents").select("*").eq("mc_status", "a_synchroniser").limit(200);
  let done = 0, failed = 0;
  for (const r of rows ?? []) {
    const h = await md5(r.email);
    const log = (ok: boolean, act: string, detail: string) => admin.from("mkt_sync_log").insert({ direction: "sortant", action: act, email: r.email, ok, detail });
    try {
      const cur = await api(`/lists/${list}/members/${h}?fields=status,last_changed`);
      const member = cur.ok ? await cur.json() : null;
      if (r.withdrawn_at) {
        if (member && member.status !== "unsubscribed") {
          const p = await api(`/lists/${list}/members/${h}`, { method: "PATCH", body: JSON.stringify({ status: "unsubscribed" }) });
          if (!p.ok) throw new Error(`[${p.status}] ${(await p.text()).slice(0, 200)}`);
        }
        await admin.from("mkt_consents").update({ mc_status: "unsubscribed", mc_last_sync_at: new Date().toISOString(), mc_error: null }).eq("id", r.id);
        await log(true, "retrait", "désabonné dans Mailchimp"); done++; continue;
      }
      // Désabonné dans Mailchimp après ce consentement : on respecte le retrait, jamais de réabonnement.
      if (member && ["unsubscribed", "cleaned"].includes(member.status) && (!member.last_changed || new Date(member.last_changed) >= new Date(r.accepted_at))) {
        await admin.from("mkt_consents").update({ withdrawn_at: member.last_changed ?? new Date().toISOString(), withdrawn_source: "mailchimp", mc_status: "unsubscribed", mc_last_sync_at: new Date().toISOString() }).eq("id", r.id);
        await log(true, "respect_retrait", `statut Mailchimp ${member.status} : aucun réabonnement`); done++; continue;
      }
      if (member && ["subscribed", "pending"].includes(member.status)) {
        await admin.from("mkt_consents").update({ mc_status: member.status, mc_last_sync_at: new Date().toISOString(), mc_error: null }).eq("id", r.id);
        await log(true, "deja_present", member.status); done++; continue;
      }
      const put = await api(`/lists/${list}/members/${h}`, { method: "PUT", body: JSON.stringify({
        email_address: r.email, status_if_new: "pending", status: "pending",
        marketing_permissions: undefined, tags: ["consentement-" + r.consent_version],
      }) });
      if (!put.ok) throw new Error(`[${put.status}] ${(await put.text()).slice(0, 200)}`);
      await admin.from("mkt_consents").update({ mc_status: "pending", mc_last_sync_at: new Date().toISOString(), mc_error: null, mc_attempts: r.mc_attempts + 1 }).eq("id", r.id);
      await log(true, "inscription", "pending — courriel de confirmation envoyé par Mailchimp"); done++;
    } catch (e) {
      failed++;
      await admin.from("mkt_consents").update({ mc_status: r.mc_attempts + 1 >= 5 ? "erreur" : "a_synchroniser", mc_error: String(e).slice(0, 300), mc_attempts: r.mc_attempts + 1 }).eq("id", r.id);
      await log(false, "erreur", String(e).slice(0, 300));
    }
  }
  return json({ ...base, audience, synced: done, failed });
});
