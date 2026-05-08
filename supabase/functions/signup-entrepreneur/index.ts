import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Public endpoint: registers an entrepreneur AFTER they have signed up via
 * supabase.auth.signUp on the client. The client passes their newly created
 * user_id; we validate it actually corresponds to a user created moments ago
 * and that the email matches, then insert an unapproved entrepreneur role.
 * The account stays inactive until an admin approves it from the CRM.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const userId = String(body.user_id || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const company = String(body.company || "").trim();
    const phone = String(body.phone || "").trim();
    const name = String(body.name || "").trim();

    if (!userId || !email) return json(400, { error: "user_id et email requis" });

    // Verify the user exists, was created within the last 5 minutes, and the email matches
    const { data: u, error: ue } = await admin.auth.admin.getUserById(userId);
    if (ue || !u?.user) return json(404, { error: "Utilisateur introuvable" });
    if ((u.user.email || "").toLowerCase() !== email) return json(403, { error: "Courriel non concordant" });
    const createdAt = new Date(u.user.created_at).getTime();
    if (Date.now() - createdAt > 5 * 60 * 1000) {
      return json(403, { error: "Inscription expirée. Recommencez." });
    }

    // Insert unapproved entrepreneur role (idempotent — ignore duplicates)
    const { data: existing } = await admin
      .from("user_roles").select("id").eq("user_id", userId).eq("role", "entrepreneur").maybeSingle();
    if (!existing) {
      const { error: roleErr } = await admin
        .from("user_roles").insert({ user_id: userId, role: "entrepreneur", approved: false });
      if (roleErr) return json(500, { error: roleErr.message });
    }

    // Optional entrepreneur profile (best-effort)
    if (name || company || phone) {
      await admin.from("entrepreneurs").insert({
        user_id: userId,
        name: name || email,
        email,
        company,
        phone,
      });
    }

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});