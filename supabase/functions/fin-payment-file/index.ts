// FIN-03 — Justificatifs de règlement : envoi et téléchargement contrôlés par les droits Finances
// (fin_can_write / fin_can_read), indépendamment des droits CRM commerciaux.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", pdf: "application/pdf" };
const MAX = 20 * 1024 * 1024;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non permise" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Connexion requise" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ct = req.headers.get("content-type") ?? "";

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const pid = String(form?.get("payment_id") ?? ""); const file = form?.get("file");
    if (!UUID.test(pid) || !(file instanceof File)) return json({ error: "Requête invalide" }, 400);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!MIME[ext]) return json({ error: "Format non accepté (PDF, JPG, PNG, WEBP, HEIC)." }, 400);
    if (!file.size || file.size > MAX) return json({ error: "Fichier vide ou trop lourd (20 Mo au maximum)." }, 400);
    // Lecture autorisée ? (contrôle d'entreprise par la base)
    const { data: p, error: e1 } = await user.rpc("fin_payment_detail", { _payment: pid });
    if (e1 || !p) return json({ error: "Accès refusé" }, 403);
    const { data: can } = await user.rpc("fin_can_write", { _company_id: p.company_id });
    if (can !== true) return json({ error: "Accès refusé" }, 403);
    const path = `company/${p.company_id}/fin/${crypto.randomUUID()}.${ext}`;
    const up = await admin.storage.from("entcrm-files").upload(path, file, { contentType: MIME[ext], upsert: false });
    if (up.error) return json({ error: "Envoi impossible, réessayez." }, 500);
    const { data: fid, error: e2 } = await user.rpc("fin_attach_file", { _payment: pid, _path: path, _name: file.name, _mime: MIME[ext], _size: file.size });
    if (e2) { await admin.storage.from("entcrm-files").remove([path]); return json({ error: e2.message }, 403); }
    return json({ file_id: fid });
  }

  let body: { payment_id?: string; file_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Requête invalide" }, 400); }
  if (!body.payment_id || !body.file_id || !UUID.test(body.payment_id) || !UUID.test(body.file_id)) return json({ error: "Requête invalide" }, 400);
  const { data: p, error } = await user.rpc("fin_payment_detail", { _payment: body.payment_id });
  if (error || !p) return json({ error: "Accès refusé" }, 403);
  const f = (p.files ?? []).find((x: any) => x.id === body.file_id);
  if (!f) return json({ error: "Pièce non disponible" }, 403);
  const { data, error: e3 } = await admin.storage.from("entcrm-files").createSignedUrl(f.storage_path, 300, { download: f.file_name });
  if (e3 || !data) return json({ error: "Téléchargement momentanément impossible, réessayez." }, 500);
  return json({ url: data.signedUrl });
});
