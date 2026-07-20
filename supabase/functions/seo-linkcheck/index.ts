import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const isCron = req.headers.get("Lovable-Context") === "cron";
    if (!isCron) {
      const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
      const { data: u } = await supabase.auth.getUser(jwt);
      if (!u?.user?.id) return json({ error: "Non autorisé" }, 401);
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
      if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);
    }
    const r = await fetch("https://vracquebec.ca/sitemap.xml", { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return json({ error: "Sitemap inaccessible" }, 500);
    const xml = await r.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).slice(0, 500);
    const broken: Array<Record<string, unknown>> = [];
    let checked = 0;
    for (const url of urls) {
      try {
        const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(6000), redirect: "follow" });
        checked++;
        if (!res.ok) broken.push({ url, http_status: res.status, source_page: "sitemap.xml", checked_at: new Date().toISOString() });
      } catch (e) {
        broken.push({ url, http_status: 0, source_page: "sitemap.xml", error_message: String(e).slice(0, 200), checked_at: new Date().toISOString() });
      }
    }
    await supabase.from("seo_broken_links").update({ resolved: true }).eq("resolved", false);
    if (broken.length > 0) await supabase.from("seo_broken_links").upsert(broken, { onConflict: "url,source_page" });
    return json({ ok: true, checked, broken: broken.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});