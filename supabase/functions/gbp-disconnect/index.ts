import { corsHeaders, requireAdmin, serviceClient, jsonRes, errRes } from "../_shared/gbp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireAdmin(req);
    const svc = serviceClient();
    const { data: cfg } = await svc.from("gbp_config").select("refresh_token").maybeSingle();
    if (cfg?.refresh_token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(cfg.refresh_token)}`, { method: "POST" });
      } catch { /* ignore */ }
    }
    await svc.from("gbp_config").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    return jsonRes({ ok: true });
  } catch (e) { return errRes(e); }
});