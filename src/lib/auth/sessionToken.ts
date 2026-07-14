import { supabase } from "@/integrations/supabase/client";

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

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
  let response = await supabase.functions.invoke<TResult>(functionName, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  const message = response.error?.message ?? (response.data as { error?: string } | null)?.error ?? "";
  if (/401|session invalide|jwt|expired|unauthorized|non autoris/i.test(message)) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session?.access_token) throw new Error("Session expirée — reconnectez-vous.");
    token = refreshed.session.access_token;
    response = await supabase.functions.invoke<TResult>(functionName, {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  return response;
}