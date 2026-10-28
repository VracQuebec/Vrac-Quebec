// PRÉPARÉ — NON DÉPLOYÉ. Lien de connexion à usage unique pour essais téléphone.
// Réservé aux administrateurs (has_role côté serveur). Un seul compte autorisé,
// fictif (@test.invalid) : aucun compte réel ne peut être visé, aucun droit n'est
// modifié, aucun mot de passe n'est créé ni affiché, aucun courriel n'est envoyé.
// Le lien est à usage unique et expire selon le délai OTP du projet.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_EMAIL = "test-a-proprietaire@test.invalid";
const ALLOWED_ORIGINS = [
  "https://id-preview--98eb41a2-bc5f-4dfb-98e3-d7f7569bb892.lovable.app",
  "http://localhost:8080",
];
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode refusée" }, 405);
  const origin = req.headers.get("Origin") ?? "";
  if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "Origine refusée" }, 403);

  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Non authentifié" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: u, error } = await anon.auth.getUser(token);
  if (error || !u.user) return json({ error: "Non authentifié" }, 401);
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: isAdmin } = await db.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "Réservé à l'administration" }, 403);

  const { data, error: le } = await db.auth.admin.generateLink({
    type: "magiclink",
    email: ALLOWED_EMAIL,
    options: { redirectTo: `${origin}/entrepreneur/crm?tab=clients` },
  });
  if (le || !data?.properties?.action_link) return json({ error: "Lien non créé" }, 500);
  console.log(JSON.stringify({ event: "test_phone_link", by: u.user.id, target: ALLOWED_EMAIL, at: new Date().toISOString() }));
  return json({ link: data.properties.action_link, account: ALLOWED_EMAIL });
});
