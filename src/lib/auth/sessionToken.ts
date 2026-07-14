import { supabase } from "@/integrations/supabase/client";

const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export async function getFreshAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("Impossible de lire la session — reconnectez-vous.");

  let session = data.session;
  const expiresAtMs = (session?.expires_at ?? 0) * 1000;

  if (!session || expiresAtMs - Date.now() < REFRESH_MARGIN_MS) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw new Error("Session expirée — reconnectez-vous.");
    session = refreshed.session;
  }

  const token = session?.access_token;
  if (!token) throw new Error("Session expirée — reconnectez-vous.");

  return token;
}

export async function invokeWithFreshSession<TBody extends Record<string, unknown>, TResult = unknown>(
  functionName: string,
  body: TBody,
) {
  let token = await getFreshAccessToken();
  let response = await callEdgeFunction<TBody, TResult>(functionName, body, token);

  const message = response.error?.message ?? (response.data as { error?: string } | null)?.error ?? "";
  if (/401|session invalide|jwt|expired|unauthorized|non autoris/i.test(message)) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session?.access_token) throw new Error("Session expirée — reconnectez-vous.");
    token = refreshed.session.access_token;
    response = await callEdgeFunction<TBody, TResult>(functionName, body, token);
  }

  return response;
}

async function callEdgeFunction<TBody extends Record<string, unknown>, TResult>(
  functionName: string,
  body: TBody,
  token: string,
): Promise<{ data: TResult | null; error: Error | null }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const data = text ? safeJsonParse<TResult>(text) : null;

  if (!response.ok) {
    const errorMessage = (data as { error?: string; message?: string } | null)?.error
      ?? (data as { error?: string; message?: string } | null)?.message
      ?? `Edge function returned ${response.status}`;
    return { data, error: new Error(`Edge function returned ${response.status}: ${errorMessage}`) };
  }

  return { data, error: null };
}

function safeJsonParse<TResult>(text: string): TResult | null {
  try {
    return JSON.parse(text) as TResult;
  } catch {
    return null;
  }
}