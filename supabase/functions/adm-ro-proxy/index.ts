// Relais serveur du compte « Administration — Lecture seule ».
// Seul chemin qui donne des données à ce compte : la base n'accorde la lecture que si la requête porte
// l'en-tête secret ajouté ici. Chaque requête est journalisée avec l'identité tirée de la session vérifiée.
// Écritures refusées ici (et par la base : transaction en lecture seule, aucune politique d'écriture).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer, range, range-unit, accept-profile, content-profile, x-adm-ro-section",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "content-range, content-profile",
};
const SENSITIVE = /(token|secret|password|api_?key|key_hash|code_hash)/i;
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

let secret: string | null = null;
async function getSecret() {
  if (secret) return secret;
  const { data } = await admin.from("adm_ro_secret").select("secret").eq("id", true).single();
  secret = data?.secret ?? null;
  return secret;
}
// Retire les champs de type jeton/secret de toute réponse (défense en profondeur).
function scrub(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (!(SENSITIVE.test(k) && !/_tokens$/i.test(k))) o[k] = scrub(x);
    return o;
  }
  return v;
}
async function log(uid: string, action: string, section: string | null, rtype: string | null, rid: string | null, result: string, detail: Record<string, unknown>) {
  await admin.from("adm_activity_log").insert({ user_id: uid, action, section, resource_type: rtype, resource_id: rid, result, source: "serveur", detail });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { message: "Connexion requise" });
  const { data: u } = await admin.auth.getUser(token);
  const uid = u?.user?.id;
  if (!uid) return json(401, { message: "Session expirée" });
  const { data: ro } = await admin.from("adm_readonly_users").select("active").eq("user_id", uid).maybeSingle();
  if (!ro?.active) return json(403, { message: "Relais réservé au compte lecture seule" });

  const url = new URL(req.url);
  const rest = url.pathname.replace(/^.*?\/adm-ro-proxy/, "") || "/";
  const section = (req.headers.get("x-adm-ro-section") ?? "").slice(0, 120) || null;
  const isRpc = rest.startsWith("/rpc/");
  const target = rest.replace(/^\/(rpc\/)?/, "").split("/")[0].slice(0, 80);
  const params = [...url.searchParams.keys()].filter(k => !["select", "order", "limit", "offset"].includes(k));
  const idMatch = url.search.match(/[?&]id=eq\.([0-9a-f-]{36}|\d+)/i);
  const detail: Record<string, unknown> = { methode: req.method };
  if (params.length) detail.filtres = params.slice(0, 15); // noms de colonnes filtrées, jamais les valeurs

  if (!isRpc && !["GET", "HEAD"].includes(req.method)) {
    await log(uid, "ecriture_refusee", section, target, idMatch?.[1] ?? null, "refuse", detail);
    return json(403, { code: "42501", message: "Accès en lecture seule : écriture refusée par le serveur." });
  }
  if (isRpc && target === "adm_ro_log") {
    // Événement de navigation : transmis tel quel, la base attribue la ligne au compte de la session.
  }
  const s = await getSecret();
  if (!s) return json(500, { message: "Relais indisponible" });
  const fwd = new Headers();
  for (const h of ["accept", "accept-profile", "content-profile", "content-type", "prefer", "range", "range-unit"]) {
    const v = req.headers.get(h); if (v) fwd.set(h, v);
  }
  fwd.set("Authorization", `Bearer ${token}`);
  fwd.set("apikey", ANON);
  fwd.set("x-adm-ro-proxy", s);
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await req.text();
  const res = await fetch(`${URL_}/rest/v1${rest}${url.search}`, { method: req.method, headers: fwd, body });
  const result = res.ok ? "reussi" : res.status === 401 || res.status === 403 ? "refuse" : "erreur";
  const ctype = res.headers.get("content-type") ?? "";
  let out: BodyInit | null = null;
  let rows: number | null = null;
  if (ctype.includes("json")) {
    const text = await res.text();
    try { const parsed = text ? JSON.parse(text) : null; rows = Array.isArray(parsed) ? parsed.length : null; out = JSON.stringify(res.ok ? scrub(parsed) : parsed); }
    catch { out = text; }
  } else out = await res.text();
  if (target !== "adm_ro_log") {
    if (rows !== null) detail.lignes = rows;
    if (!res.ok) detail.statut = res.status;
    const action = isRpc ? (result === "reussi" ? "fonction_lecture" : "fonction_refusee") : req.method === "HEAD" ? "comptage" : idMatch ? "consultation_fiche" : "lecture_donnees";
    await log(uid, action, section, target, idMatch?.[1] ?? null, result, detail);
  }
  const h = new Headers({ ...cors, "Content-Type": ctype || "application/json", "Cache-Control": "no-store" });
  for (const k of ["content-range", "content-profile"]) { const v = res.headers.get(k); if (v) h.set(k, v); }
  const noBody = req.method === "HEAD" || res.status === 204 || res.status === 304;
  return new Response(noBody ? null : out, { status: res.status, headers: h });
});
