import { corsHeaders, GBP_SCOPES, REDIRECT_URI, requireAdmin, jsonRes, errRes } from "../_shared/gbp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { user, svc } = await requireAdmin(req);
    const clientId = Deno.env.get("GBP_GOOGLE_CLIENT_ID");
    if (!clientId) throw new Error("GBP_GOOGLE_CLIENT_ID manquant");

    const state = crypto.randomUUID();
    await svc.from("gbp_oauth_state").insert({ state, user_id: user.id });
    // Purge expired states opportunistically
    await svc.from("gbp_oauth_state").delete().lt("expires_at", new Date().toISOString());

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: `${GBP_SCOPES} https://www.googleapis.com/auth/userinfo.email openid`,
      access_type: "offline",
      prompt: "consent",
      state,
      include_granted_scopes: "true",
    });
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return jsonRes({ url });
  } catch (e) { return errRes(e, 401); }
});