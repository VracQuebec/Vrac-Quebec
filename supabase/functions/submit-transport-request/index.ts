// Edge Function: submit-transport-request
// Serveur autoritaire pour l'Assistant Transport.
// - service-role (bypass RLS) → jamais bloqué par une policy fragile
// - idempotence via idempotency_key : rejoue = même résultat, jamais de doublon
// - toutes les erreurs sont capturées et journalisées dans transport_request_errors
// - la réponse au client est toujours normalisée : { ok, request_number?, retry? }
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Payload = {
  idempotency_key: string;
  client_name: string;
  client_phone: string;
  client_company?: string | null;
  client_email?: string | null;
  site_address: string;
  site_latitude?: number | null;
  site_longitude?: number | null;
  site_city?: string | null;
  material_type: string;
  material_other?: string | null;
  quantity?: number | null;
  quantity_unit?: string | null;
  dump_submission_id?: string | null;
  dump_name?: string | null;
  distance_km?: number | null;
  travel_time_minutes?: number | null;
  truck_type?: string | null;
  estimated_trips?: number | null;
  desired_date?: string | null;
  desired_time?: string | null;
  source?: string | null;
  user_id?: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isNonEmptyString(v: unknown, max = 500): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}

function sanitize(s: unknown, max = 500): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function validate(p: Partial<Payload>): { ok: true; data: Payload } | { ok: false; error: string } {
  if (!isNonEmptyString(p.idempotency_key, 128)) return { ok: false, error: "idempotency_key requis" };
  if (!isNonEmptyString(p.client_name, 200)) return { ok: false, error: "client_name requis" };
  if (!isNonEmptyString(p.client_phone, 40)) return { ok: false, error: "client_phone requis" };
  if (!isNonEmptyString(p.site_address, 500)) return { ok: false, error: "site_address requis" };
  if (!isNonEmptyString(p.material_type, 100)) return { ok: false, error: "material_type requis" };
  return {
    ok: true,
    data: {
      idempotency_key: p.idempotency_key!.trim(),
      client_name: p.client_name!.trim(),
      client_phone: p.client_phone!.trim(),
      client_company: sanitize(p.client_company),
      client_email: sanitize(p.client_email, 200),
      site_address: p.site_address!.trim(),
      site_latitude: typeof p.site_latitude === "number" ? p.site_latitude : null,
      site_longitude: typeof p.site_longitude === "number" ? p.site_longitude : null,
      site_city: sanitize(p.site_city, 120),
      material_type: p.material_type!.trim().slice(0, 100),
      material_other: sanitize(p.material_other, 200),
      quantity: typeof p.quantity === "number" && isFinite(p.quantity) ? p.quantity : null,
      quantity_unit: sanitize(p.quantity_unit, 20),
      dump_submission_id: typeof p.dump_submission_id === "string" ? p.dump_submission_id : null,
      dump_name: sanitize(p.dump_name, 200),
      distance_km: typeof p.distance_km === "number" ? p.distance_km : null,
      travel_time_minutes: typeof p.travel_time_minutes === "number" ? Math.round(p.travel_time_minutes) : null,
      truck_type: sanitize(p.truck_type, 100),
      estimated_trips: typeof p.estimated_trips === "number" ? Math.round(p.estimated_trips) : null,
      desired_date: sanitize(p.desired_date, 20),
      desired_time: sanitize(p.desired_time, 20),
      source: sanitize(p.source, 60) ?? "wizard_public",
      user_id: typeof p.user_id === "string" ? p.user_id : null,
    },
  };
}

async function logError(
  admin: ReturnType<typeof createClient>,
  ctx: {
    idempotency_key: string | null;
    request_id?: string | null;
    stage: string;
    error_code?: string | null;
    error_message: string;
    payload?: unknown;
    attempt?: number;
    duration_ms?: number;
    user_agent?: string | null;
    ip?: string | null;
  },
) {
  try {
    await admin.from("transport_request_errors").insert({
      idempotency_key: ctx.idempotency_key,
      request_id: ctx.request_id ?? null,
      stage: ctx.stage,
      error_code: ctx.error_code ?? null,
      error_message: ctx.error_message.slice(0, 2000),
      payload: ctx.payload ?? null,
      attempt: ctx.attempt ?? 1,
      duration_ms: ctx.duration_ms ?? null,
      user_agent: ctx.user_agent ?? null,
      ip: ctx.ip ?? null,
    });
  } catch (_e) {
    // swallow — logging must never take down the submission
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const start = Date.now();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const userAgent = req.headers.get("user-agent");
  const ip = req.headers.get("x-forwarded-for");

  // Resolve the authenticated user (if any) from the caller's JWT. We do not
  // trust `payload.user_id` — a public caller could send any UUID. The edge
  // function is publicly callable (verify_jwt=false) so the JWT is optional.
  let authenticatedUserId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    try {
      const { data: claims } = await admin.auth.getClaims(token);
      const sub = claims?.claims?.sub;
      if (typeof sub === "string" && sub.length > 0) authenticatedUserId = sub;
    } catch {
      // Bad/expired JWT is fine — treat as anonymous.
    }
  }

  let raw: Partial<Payload> = {};
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ ok: false, retry: false, message: "Requête invalide" }, 400);
  }

  const attempt = Number(req.headers.get("x-attempt") ?? 1) || 1;

  const v = validate(raw);
  if (!v.ok) {
    await logError(admin, {
      idempotency_key: (raw?.idempotency_key as string) ?? null,
      stage: "validation",
      error_message: v.error,
      payload: raw,
      attempt,
      duration_ms: Date.now() - start,
      user_agent: userAgent,
      ip,
    });
    // Client should NOT retry validation failures — they will never succeed as-is.
    return jsonResponse({ ok: false, retry: false, message: v.error }, 400);
  }

  const data = v.data;

  // Idempotency: if the same key already produced a row, return the same result.
  try {
    const { data: existing, error: exErr } = await admin
      .from("transport_requests")
      .select("id, request_number")
      .eq("idempotency_key", data.idempotency_key)
      .maybeSingle();
    if (exErr) throw exErr;
    if (existing) {
      return jsonResponse({
        ok: true,
        deduplicated: true,
        request_number: existing.request_number,
        request_id: existing.id,
      });
    }
  } catch (e) {
    // A failed lookup is not fatal — we can still try the insert.
    await logError(admin, {
      idempotency_key: data.idempotency_key,
      stage: "insert",
      error_code: "idem_lookup_failed",
      error_message: (e as Error).message ?? String(e),
      attempt,
      user_agent: userAgent,
      ip,
    });
  }

  // Insert via service-role. Triggers still enforce internal defaults for
  // non-admin callers (enforce_transport_request_insert_defaults), and we
  // never trust anything the client sent for status/dispatch fields.
  try {
    const { data: inserted, error } = await admin
      .from("transport_requests")
      .insert({
        idempotency_key: data.idempotency_key,
        client_name: data.client_name,
        client_company: data.client_company,
        client_phone: data.client_phone,
        client_email: data.client_email,
        user_id: data.user_id,
        site_address: data.site_address,
        site_latitude: data.site_latitude,
        site_longitude: data.site_longitude,
        site_city: data.site_city,
        material_type: data.material_type,
        material_other: data.material_other,
        quantity: data.quantity,
        quantity_unit: data.quantity_unit,
        dump_submission_id: data.dump_submission_id,
        dump_name: data.dump_name,
        distance_km: data.distance_km,
        travel_time_minutes: data.travel_time_minutes,
        truck_type: data.truck_type,
        estimated_trips: data.estimated_trips,
        desired_date: data.desired_date,
        desired_time: data.desired_time,
        source: data.source,
      })
      .select("id, request_number")
      .single();

    if (error) {
      // Unique violation on idempotency_key → race with a parallel retry.
      // Re-read the winning row and return success.
      if ((error as any).code === "23505") {
        const { data: winner } = await admin
          .from("transport_requests")
          .select("id, request_number")
          .eq("idempotency_key", data.idempotency_key)
          .maybeSingle();
        if (winner) {
          return jsonResponse({
            ok: true,
            deduplicated: true,
            request_number: winner.request_number,
            request_id: winner.id,
          });
        }
      }

      await logError(admin, {
        idempotency_key: data.idempotency_key,
        stage: "insert",
        error_code: (error as any).code ?? null,
        error_message: error.message ?? "insert failed",
        payload: data,
        attempt,
        duration_ms: Date.now() - start,
        user_agent: userAgent,
        ip,
      });
      // Transient — client should retry.
      return jsonResponse({ ok: false, retry: true, message: "temporary_failure" }, 503);
    }

    // The BEFORE INSERT trigger unconditionally nulls user_id when auth.uid()
    // is NULL (which is the case under service-role). Reattach the id here so
    // authenticated users can see their own requests in the CRM.
    if (authenticatedUserId && inserted?.id) {
      try {
        await admin
          .from("transport_requests")
          .update({ user_id: authenticatedUserId })
          .eq("id", inserted.id);
      } catch (_e) {
        // best-effort — the row is already persisted
      }
    }

    return jsonResponse({
      ok: true,
      request_number: inserted?.request_number,
      request_id: inserted?.id,
    });
  } catch (e) {
    await logError(admin, {
      idempotency_key: data.idempotency_key,
      stage: "unexpected",
      error_message: (e as Error).message ?? String(e),
      payload: data,
      attempt,
      duration_ms: Date.now() - start,
      user_agent: userAgent,
      ip,
    });
    return jsonResponse({ ok: false, retry: true, message: "temporary_failure" }, 500);
  }
});
