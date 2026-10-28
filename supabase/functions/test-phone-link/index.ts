// Essais téléphone — compte fictif TEST A uniquement. Hors publication générale; à désactiver après les essais.
// create : administrateur vérifié serveur (has_role) -> jeton aléatoire 256 bits, seule son empreinte
//          SHA-256 est stockée, expiration serveur 2 min, usage unique.
// redeem : consomme le jeton de façon atomique, puis émet une preuve de connexion pour TEST A seulement,
//          à vérifier immédiatement par le navigateur. Aucun jeton n'est écrit dans les journaux.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_EMAIL = "test-a-proprietaire@test.invalid";
const TTL_MS = 120_000;
const ALLOWED_ORIGINS = [
  "https://id-preview--98eb41a2-bc5f-4dfb-98e3-d7f7569bb892.lovable.app",
  "http://localhost:8080",
];
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
  status: s, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const sha256 = async (t: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t))))
  .map((b) => b.toString(16).padStart(2, "0")).join("");
const log = (event: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ event, ...extra, at: new Date().toISOString() }));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode refusée" }, 405);
  const origin = req.headers.get("Origin") ?? "";
  if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "Origine refusée" }, 403);
  let body: { action?: unknown; token?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Requête invalide" }, 400); }
  const url = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  if (body.action === "create") {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Non authentifié" }, 401);
    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
    const { data: c, error } = await anon.auth.getClaims(auth.slice(7));
    const uid = c?.claims?.sub;
    if (error || !uid) return json({ error: "Non authentifié" }, 401);
    const { data: isAdmin } = await db.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (isAdmin !== true) { log("test_phone_link_denied", { by: uid }); return json({ error: "Réservé à l'administration" }, 403); }
    const raw = new Uint8Array(32); crypto.getRandomValues(raw);
    const token = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const expires = new Date(Date.now() + TTL_MS).toISOString();
    const { error: ie } = await db.from("test_phone_tokens").insert({ token_hash: await sha256(token), created_by: uid, expires_at: expires });
    if (ie) return json({ error: "Jeton non créé" }, 500);
    log("test_phone_link_created", { by: uid });
    // Fragment (#) : jamais transmis au serveur web ni aux outils de mesure.
    return json({ url: `${origin}/essai-telephone#t=${token}`, expires_at: expires });
  }

  if (body.action === "redeem") {
    if (typeof body.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) return json({ error: "Lien invalide" }, 400);
    const { data: used } = await db.from("test_phone_tokens").update({ used_at: new Date().toISOString() })
      .eq("token_hash", await sha256(body.token)).is("used_at", null).gt("expires_at", new Date().toISOString()).select("created_by");
    if (!used?.length) { log("test_phone_link_refused"); return json({ error: "Lien expiré ou déjà utilisé" }, 410); }
    const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email: ALLOWED_EMAIL });
    const hashed = data?.properties?.hashed_token;
    if (error || !hashed) return json({ error: "Connexion impossible" }, 500);
    log("test_phone_link_redeemed", { by: used[0].created_by });
    return json({ token_hash: hashed, account: ALLOWED_EMAIL });
  }
  return json({ error: "Action inconnue" }, 400);
});
