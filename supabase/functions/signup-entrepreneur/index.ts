import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { confirmRedirect, decideSignup, entrepreneurSignupRole, type ExistingAuthUser, SIGNUP_EMAIL_CONFIRMED } from "./role.ts";
import { clientIp, enforceIpQuota, GuardError } from "../_shared/public-guard.ts";

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

    // Limites anti-abus : par adresse IP et par courriel visé (évite l'envoi
    // répété de courriels de confirmation à une même personne).
    try {
      await enforceIpQuota(admin, "signup-entrepreneur-ip", clientIp(req), 8, 60);
      await enforceIpQuota(admin, "signup-entrepreneur-email", email, 3, 60);
    } catch (e) {
      if (e instanceof GuardError) return json(429, { error: e.message });
      throw e;
    }

    const { data: matchingProfiles } = await admin
      .from("entrepreneurs")
      .select("id,user_id")
      .eq("email", email)
      .limit(1);
    const matchingProfile = matchingProfiles?.[0] || null;

    const metadata = { requested_role: "entrepreneur", name, company, phone };
    const existingUser = await findUserByEmail(admin, email);
    let existing: ExistingAuthUser | null = null;
    if (existingUser) {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", existingUser.id);
      existing = {
        id: existingUser.id,
        confirmed: Boolean(existingUser.email_confirmed_at || existingUser.confirmed_at),
        requestedEntrepreneur: existingUser.user_metadata?.requested_role === "entrepreneur",
        hasOtherRoles: (roles ?? []).some((r: any) => r.role !== "entrepreneur"),
      };
    }
    const decision = decideSignup(existing, matchingProfile?.user_id ?? null);
    if (decision === "conflict") {
      return json(409, { error: "Un compte existe déjà avec ce courriel. Connectez-vous ou utilisez Mot de passe oublié." });
    }

    // Le serveur ne confirme jamais le courriel : le service d'authentification
    // envoie lui-même le lien à la boîte indiquée; la connexion reste refusée
    // tant que ce lien n'a pas été ouvert.
    const redirectTo = confirmRedirect(req.headers.get("origin"));
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { ...(existingUser?.user_metadata ?? {}), ...metadata },
      redirectTo,
    });
    if (inviteErr || !invited?.user) {
      console.error("signup-entrepreneur invite:", inviteErr?.message);
      return json(400, { error: "Création du compte échouée. Réessayez plus tard." });
    }
    const userId = invited.user.id;
    const createdNewUser = decision === "create";
    if (SIGNUP_EMAIL_CONFIRMED !== false || invited.user.email_confirmed_at) {
      console.error("signup-entrepreneur: courriel confirmé sans preuve — refus");
      if (createdNewUser) await admin.auth.admin.deleteUser(userId);
      return json(500, { error: "Erreur serveur" });
    }
    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password });
    if (pwErr) {
      if (createdNewUser) await admin.auth.admin.deleteUser(userId);
      console.error("signup-entrepreneur password:", pwErr.message);
      return json(400, { error: "Création du compte échouée" });
    }

    if (createdNewUser) {
      const { error: roleErr } = await admin.from("user_roles").insert(entrepreneurSignupRole(userId));
      if (roleErr) {
        await admin.auth.admin.deleteUser(userId);
        console.error("signup-entrepreneur role:", roleErr.message);
        return json(500, { error: "Création du compte incomplète. Contactez-nous." });
      }
      const profilePayload = { user_id: userId, name, email, company, phone };
      const { error: profileErr } = matchingProfile
        ? await admin.from("entrepreneurs").update(profilePayload).eq("id", matchingProfile.id).is("user_id", null)
        : await admin.from("entrepreneurs").insert(profilePayload);
      if (profileErr) {
        await admin.from("user_roles").delete().eq("user_id", userId).eq("role", "entrepreneur");
        await admin.auth.admin.deleteUser(userId);
        console.error("signup-entrepreneur profile:", profileErr.message);
        return json(500, { error: "Création du compte incomplète. Contactez-nous." });
      }
    }

    return json(200, {
      ok: true,
      email,
      confirmation_required: true,
      message: "Vérifiez votre courriel pour confirmer votre adresse et activer votre compte.",
    });
  } catch (e) {
    console.error("signup-entrepreneur:", (e as Error).message);
    return json(500, { error: "Erreur serveur" });
  }
});