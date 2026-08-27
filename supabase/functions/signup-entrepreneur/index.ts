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

const findUserByEmail = async (admin: ReturnType<typeof createClient>, email: string) => {
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u: any) => (u.email || "").toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 200) break;
  }
  return null;
};

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

    const { data: matchingProfiles } = await admin
      .from("entrepreneurs")
      .select("id,user_id")
      .eq("email", email)
      .limit(1);

    const matchingProfile = matchingProfiles?.[0] || null;
    if (matchingProfile?.user_id) {
      return json(409, { error: "Un compte entrepreneur existe déjà avec ce courriel" });
    }

    let userId = "";
    let createdNewUser = false;
    const metadata = {
      requested_role: "entrepreneur",
      name,
      company,
      phone,
    };

    const existingUser = await findUserByEmail(admin, email);
    if (existingUser) {
      const { data: existingRoles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", existingUser.id);
      if (existingRoles && existingRoles.length > 0) {
        return json(409, { error: "Un compte existe déjà avec ce courriel. Connectez-vous ou utilisez Mot de passe oublié." });
      }
      const wasEntrepreneurSignup = existingUser.user_metadata?.requested_role === "entrepreneur";
      const isUnconfirmed = !existingUser.email_confirmed_at && !existingUser.confirmed_at;
      if (!isUnconfirmed || !wasEntrepreneurSignup) {
        return json(409, { error: "Un compte existe déjà avec ce courriel. Connectez-vous ou utilisez Mot de passe oublié." });
      }

      const { data: updated, error: updateErr } = await admin.auth.admin.updateUserById(existingUser.id, {
        password,
        email_confirm: true,
        user_metadata: { ...existingUser.user_metadata, ...metadata },
      });
      if (updateErr || !updated.user) {
        return json(400, { error: updateErr?.message || "Mise à jour du compte échouée" });
      }
      userId = updated.user.id;
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });

      if (createErr || !created.user) {
        const message = createErr?.message || "Création du compte échouée";
        return json(400, { error: message });
      }

      userId = created.user.id;
      createdNewUser = true;
    }

    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: "entrepreneur", approved: false });

    if (roleErr) {
      if (createdNewUser) await admin.auth.admin.deleteUser(userId);
      return json(500, { error: `Rôle entrepreneur non assigné: ${roleErr.message}` });
    }

    const profilePayload = { user_id: userId, name, email, company, phone };
    const { error: profileErr } = matchingProfile
      ? await admin.from("entrepreneurs").update(profilePayload).eq("id", matchingProfile.id)
      : await admin.from("entrepreneurs").insert(profilePayload);

    if (profileErr) {
      await admin.from("user_roles").delete().eq("user_id", userId).eq("role", "entrepreneur");
      if (createdNewUser) await admin.auth.admin.deleteUser(userId);
      return json(500, { error: `Profil entrepreneur non créé: ${profileErr.message}` });
    }

    // Notifier l'administration pour la validation manuelle du compte.
    await admin.from("admin_notifications").insert({
      title: "Nouvelle inscription entrepreneur à valider",
      body: `${company || name} (${email}) attend une approbation pour accéder au réseau.`,
      level: "warn",
      link: "/admin",
      meta: { user_id: userId, email, company, phone, source: "signup-entrepreneur" },
    });

    return json(200, {
      ok: true,
      user_id: userId,
      email,
      approved: false,
      message:
        "Compte entrepreneur créé. Votre accès aux demandes et aux sites du réseau sera actif dès la validation par l'équipe Vrac Québec.",
    });
  } catch (e) {
    return json(500, { error: (e as Error).message || "Erreur serveur" });
  }
});