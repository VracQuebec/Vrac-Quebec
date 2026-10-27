// Téléchargement contrôlé : chaque requête revérifie les droits (règles d'accès du stockage
// évaluées avec la session de l'utilisateur). Aucun lien signé n'est émis ni renvoyé.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BUCKETS = new Set(["company-docs", "asr-files"]);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const noStore = { "Cache-Control": "no-store, private, max-age=0", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...cors, ...noStore, "Content-Type": "application/json" } });

export function validPath(bucket: unknown, path: unknown): path is string {
  return typeof bucket === "string" && BUCKETS.has(bucket) && typeof path === "string" &&
    path.length > 0 && path.length <= 300 && !path.includes("..") && !path.startsWith("/") &&
    /^[0-9a-f-]{36}\//i.test(path);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return fail(405, "Méthode refusée");
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return fail(401, "Connexion requise");
  let body: { bucket?: unknown; path?: unknown };
  try { body = await req.json(); } catch { return fail(400, "Requête invalide"); }
  if (!validPath(body.bucket, body.path)) return fail(400, "Fichier invalide");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: u } = await db.auth.getUser();
  if (!u?.user) return fail(401, "Session expirée");
  // Point « authenticated » : jamais servi depuis le cache CDN, règles réévaluées à chaque requête
  // (le point public /object/{bucket}/… pouvait renvoyer une copie en cache après révocation — R4K).
  const enc = body.path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/authenticated/${body.bucket}/${enc}`, {
    headers: { Authorization: auth, apikey: Deno.env.get("SUPABASE_ANON_KEY")! }, cache: "no-store",
  });
  // Refus des règles d'accès ou fichier absent : même réponse, sans détail.
  if (!res.ok) { await res.body?.cancel(); return fail(403, "Accès refusé"); }
  const data = await res.blob();
  const name = body.path.split("/").pop()!.replace(/[^\w.\-]/g, "_");
  return new Response(data, {
    headers: { ...cors, ...noStore, "Content-Type": data.type || "application/octet-stream", "Content-Disposition": `attachment; filename="${name}"` },
  });
});
