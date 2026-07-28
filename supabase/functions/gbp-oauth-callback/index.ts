import { corsHeaders, REDIRECT_URI, serviceClient } from "../_shared/gbp.ts";

function html(status: string, message: string) {
  const isOk = status === "ok";
  return `<!doctype html><html lang="fr"><meta charset="utf-8">
  <title>Google Business — ${isOk ? "Connecté" : "Erreur"}</title>
  <style>body{font-family:system-ui,sans-serif;background:#0F172A;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .c{max-width:480px;padding:32px;background:#111;border:1px solid #7ED321;border-radius:12px;text-align:center}
  h1{color:#7ED321;margin-top:0} a{color:#7ED321}</style>
  <div class="c"><h1>${isOk ? "Connecté ✓" : "Erreur"}</h1><p>${message}</p>
  <p><a href="/admin/seo?tab=gbp">Retour au CRM SEO</a></p></div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  const respond = (body: string, status = 200) =>
    new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

  if (err) return respond(html("err", `Google a refusé la connexion : ${err}`), 400);
  if (!code || !state) return respond(html("err", "Paramètres manquants."), 400);

  try {
    const svc = serviceClient();
    const { data: st } = await svc.from("gbp_oauth_state").select("*").eq("state", state).maybeSingle();
    if (!st) return respond(html("err", "State invalide ou expiré."), 400);
    if (new Date(st.expires_at).getTime() < Date.now()) {
      await svc.from("gbp_oauth_state").delete().eq("state", state);
      return respond(html("err", "State expiré."), 400);
    }

    const clientId = Deno.env.get("GBP_GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GBP_GOOGLE_CLIENT_SECRET")!;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: REDIRECT_URI, grant_type: "authorization_code",
      }),
    });
    const tok = await tokenRes.json();
    if (!tokenRes.ok || !tok.refresh_token) {
      return respond(html("err", `Échange de code échoué : ${tok.error_description || tok.error || "refresh_token manquant (déjà consenti — révoquez l'accès dans votre compte Google puis réessayez)"}`), 400);
    }

    // Get user email
    let email: string | null = null;
    try {
      const uiRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      if (uiRes.ok) email = (await uiRes.json()).email ?? null;
    } catch { /* non bloquant */ }

    // Delete existing (singleton) and insert fresh
    await svc.from("gbp_config").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await svc.from("gbp_config").insert({
      refresh_token: tok.refresh_token,
      google_email: email,
      connected_by: st.user_id,
    });
    await svc.from("gbp_oauth_state").delete().eq("state", state);

    return respond(html("ok", `Connexion réussie${email ? ` (${email})` : ""}. Sélectionnez maintenant votre fiche dans le CRM.`));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return respond(html("err", msg), 500);
  }
});