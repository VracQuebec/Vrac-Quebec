// Notify Google (Search Console) that the sitemap has been updated.
// Submits the live sitemap URL via the Search Console API through the Lovable
// connector gateway. Idempotent: GSC just re-registers the sitemap.
// Called by cron (Lovable-Context: cron) after new publications and manually
// from the admin UI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";
const SITE_URL = "sc-domain:vracquebec.ca";
const SITEMAP_URLS = [
  "https://vracquebec.ca/sitemap.xml",
  `${(Deno.env.get("SUPABASE_URL") || "").replace(".supabase.co", ".functions.supabase.co")}/sitemap-live`,
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const isCron = req.headers.get("Lovable-Context") === "cron";
    if (!isCron) {
      const authHeader = req.headers.get("Authorization") || "";
      const { data: u } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      const uid = u?.user?.id;
      if (!uid) return json({ error: "Non autorisé" }, 401);
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);
    }

    const gcsKey = Deno.env.get("GOOGLE_SEARCH_CONSOLE_API_KEY");
    const lvlKey = Deno.env.get("LOVABLE_API_KEY");
    if (!gcsKey || !lvlKey) return json({ error: "GSC connector unavailable" }, 503);

    const results: Record<string, { status: number; body: string }> = {};
    for (const sm of SITEMAP_URLS) {
      const path = `/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/sitemaps/${encodeURIComponent(sm)}`;
      const r = await fetch(`${GATEWAY}${path}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${lvlKey}`,
          "X-Connection-Api-Key": gcsKey,
        },
      });
      const text = await r.text();
      results[sm] = { status: r.status, body: text.slice(0, 300) };
    }

    // Log the notification for the dashboard.
    await supabase.from("seo_page_events").insert({
      event_type: "sitemap_submitted",
      details: { site: SITE_URL, sitemaps: SITEMAP_URLS, results },
    }).select().maybeSingle().then(() => {}).catch(() => {});

    return json({ ok: true, site: SITE_URL, results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});