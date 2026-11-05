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

const RO_BUCKETS = new Set(["asr-files","blog-media","company-docs","cpn-photos","crm-docs","entcrm-files","fin-expense-files","fin-invoices","lead-photos","log-files","obl-proofs","parcours-preview-photos","partner-photos","rds-photos"]);
async function readonlyDownload(auth: string, body: { bucket?: unknown; path?: unknown; section?: unknown }): Promise<Response | null> {
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: u } = await svc.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  const uid = u?.user?.id;
  if (!uid) return null;
  const { data: r } = await svc.from("adm_readonly_users").select("active").eq("user_id", uid).maybeSingle();
  if (!r?.active) return null;
  const bucket = typeof body.bucket === "string" ? body.bucket : "";
  const path = typeof body.path === "string" ? body.path : "";
  const section = typeof body.section === "string" ? body.section.slice(0, 120) : null;
  const ok = RO_BUCKETS.has(bucket) && path.length > 0 && path.length <= 400 && !path.includes("..") && !path.startsWith("/");
  if (!ok) {
    await svc.from("adm_activity_log").insert({ user_id: uid, action: "document_ouverture", section, resource_type: bucket || "stockage", resource_id: path.slice(0, 120) || null, result: "refuse", source: "serveur" });
    return fail(403, "Accès refusé");
  }
  const { data, error } = await svc.storage.from(bucket).download(path);
  await svc.from("adm_activity_log").insert({ user_id: uid, action: "document_ouverture", section, resource_type: bucket, resource_id: path.slice(0, 120), result: error ? "erreur" : "reussi", source: "serveur" });
  if (error || !data) return fail(403, "Accès refusé");
  const name = (path.split("/").pop() ?? "document").replace(/[^\w.\-]/g, "_");
  return new Response(data, { headers: { ...cors, ...noStore, "Content-Type": data.type || "application/octet-stream", "Content-Disposition": `attachment; filename="${name}"` } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return fail(405, "Méthode refusée");
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return fail(401, "Connexion requise");
  let body: { bucket?: unknown; path?: unknown; section?: unknown };
  try { body = await req.json(); } catch { return fail(400, "Requête invalide"); }
  // Compte « Administration — Lecture seule » : lecture de tout document privé, journalisée côté serveur.
  const ro = await readonlyDownload(auth, body);
  if (ro) return ro;
  if (!validPath(body.bucket, body.path)) return fail(400, "Fichier invalide");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: u } = await db.auth.getUser();
  if (!u?.user) return fail(401, "Session expirée");
  // Point « authenticated » + paramètre unique : contourne toute copie en cache (le cache ignore la session),
  // règles d'accès réévaluées à chaque requête.
  // (le point public /object/{bucket}/… pouvait renvoyer une copie en cache après révocation — R4K).
  const enc = body.path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/authenticated/${body.bucket}/${enc}?nocache=${crypto.randomUUID()}`, {
    headers: { Authorization: auth, apikey: Deno.env.get("SUPABASE_ANON_KEY")! }, cache: "no-store",
  });
  // Refus des règles d'accès ou fichier absent : même réponse, sans détail.
  if (!res.ok) { await res.body?.cancel(); return fail(403, "Accès refusé"); }
  const name = (body.path.split("/").pop() ?? "document").replace(/[^\w.\-]/g, "_");
  // Préparé : transmettre après autorisation sans attendre la copie entière en mémoire.
  // Aucun cache, lien réutilisable ni changement de bucket/droits.
  const length = res.headers.get("content-length");
  return new Response(res.body, {
    headers: { ...cors, ...noStore, "Content-Type": res.headers.get("content-type") || "application/octet-stream", "Content-Disposition": `attachment; filename="${name}"`, ...(length ? { "Content-Length": length } : {}), "Access-Control-Expose-Headers": "Content-Length" },
  });
});
