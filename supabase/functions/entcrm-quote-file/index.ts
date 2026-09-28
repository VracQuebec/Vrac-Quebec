// Téléchargement d'une pièce partagée avec le client via le lien de soumission.
// Le jeton doit correspondre à la soumission et la pièce doit être cochée « pour le client ».
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non permise" }, 405);
  let body: { token?: string; file_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Requête invalide" }, 400); }
  const { token, file_id } = body;
  if (!token || !file_id || !UUID.test(token) || !UUID.test(file_id)) return json({ error: "Lien invalide" }, 400);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: q } = await db.from("ent_crm_quotes").select("id,company_id").eq("share_token", token).maybeSingle();
  if (!q) return json({ error: "Lien invalide ou retiré" }, 404);
  const { data: link } = await db.from("ent_crm_file_links").select("file:ent_crm_files(storage_path,file_name,company_id,archived_at)")
    .eq("owner_type", "quote").eq("owner_id", q.id).eq("file_id", file_id).eq("client_visible", true).maybeSingle();
  const f = (link as any)?.file;
  if (!f || f.archived_at || f.company_id !== q.company_id) return json({ error: "Pièce non disponible" }, 403);
  const { data, error } = await db.storage.from("entcrm-files").createSignedUrl(f.storage_path, 300, { download: f.file_name });
  if (error || !data) return json({ error: "Téléchargement momentanément impossible, réessayez." }, 500);
  return json({ url: data.signedUrl });
});
