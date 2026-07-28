import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

export const GBP_SCOPES = "https://www.googleapis.com/auth/business.manage";
export const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gbp-oauth-callback`;

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) throw new Error("Missing Authorization header");
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: { user }, error } = await anon.auth.getUser();
  if (error || !user) throw new Error("Session invalide");
  const svc = serviceClient();
  const { data: role } = await svc
    .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  if (!role) throw new Error("Accès admin requis");
  return { user, svc };
}

export async function refreshAccessToken(refresh_token: string): Promise<string> {
  const clientId = Deno.env.get("GBP_GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GBP_GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("GBP client credentials not configured");
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${j.error_description || j.error || JSON.stringify(j)}`);
  return j.access_token as string;
}

export async function getConfigWithToken() {
  const svc = serviceClient();
  const { data: cfg, error } = await svc.from("gbp_config").select("*").maybeSingle();
  if (error) throw error;
  if (!cfg) throw new Error("Google Business non connecté");
  const accessToken = await refreshAccessToken(cfg.refresh_token);
  return { cfg, accessToken, svc };
}

export async function gapi(url: string, accessToken: string, init: RequestInit = {}) {
  const attempt = async () => fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  let res = await attempt();
  if (res.status === 429 || res.status >= 500) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await attempt();
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = typeof body === "object" && body && "error" in body
      ? (body as { error: { message?: string } }).error?.message || JSON.stringify(body)
      : text;
    throw new Error(`Google API ${res.status}: ${msg}`);
  }
  return body;
}

export function jsonRes(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errRes(e: unknown, status = 400) {
  const message = e instanceof Error ? e.message : String(e);
  return jsonRes({ error: message }, status);
}