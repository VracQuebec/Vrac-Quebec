import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json(500, { error: "Configuration serveur incomplète" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json(400, { error: "Corps de requête invalide" });
    }

    const email = String((body as Record<string, unknown>).email || "").trim().toLowerCase();
    const password = String((body as Record<string, unknown>).password || "");
    const company = String((body as Record<string, unknown>).company || "").trim();
    const phone = String((body as Record<string, unknown>).phone || "").trim();
    const name = String((body as Record<string, unknown>).name || "").trim();

    if (!email) return json(400, { error: "Courriel requis" });
    if (!password || password.length < 8) return json(400, { error: "Mot de passe minimum 8 caractères" });
    if (!name) return json(400, { error: "Nom requis" });

    const { data: existingRole } = await admin
      .from("entrepreneurs")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingRole) {
      return json(409, { error: "Un compte entrepreneur existe déjà avec ce courriel" });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        requested_role: "entrepreneur",
        name,
        company,
        phone,
      },
    });

    if (createErr || !created.user) {
      const message = createErr?.message || "Création du compte échouée";
      return json(400, { error: message });
    }

    const userId = created.user.id;

    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: "entrepreneur", approved: false });

    if (roleErr) {
      await admin.auth.admin.deleteUser(userId);
      return json(500, { error: `Rôle entrepreneur non assigné: ${roleErr.message}` });
    }

    const { error: profileErr } = await admin.from("entrepreneurs").insert({
      user_id: userId,
      name,
      email,
      company,
      phone,
    });

    if (profileErr) {
      await admin.from("user_roles").delete().eq("user_id", userId).eq("role", "entrepreneur");
      await admin.auth.admin.deleteUser(userId);
      return json(500, { error: `Profil entrepreneur non créé: ${profileErr.message}` });
    }

    return json(200, {
      ok: true,
      user_id: userId,
      email,
      approved: false,
      message: "Compte entrepreneur créé avec succès",
    });
  } catch (e) {
    return json(500, { error: (e as Error).message || "Erreur serveur" });
  }
});