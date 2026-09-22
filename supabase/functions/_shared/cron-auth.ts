// ============================================================
// AUTHENTIFICATION DES TÂCHES PLANIFIÉES (CRON)
// ------------------------------------------------------------
// L'en-tête « Lovable-Context: cron » est rejouable par n'importe
// qui : il ne prouve rien. Une tâche interne doit présenter soit la
// clé de service (appel de fonction à fonction), soit le secret
// interne `x-cron-secret` conservé en base (table public.cron_auth,
// lisible uniquement par le rôle de service et par le planificateur).
// ============================================================

let cachedSecret: string | null = null;

/** Retourne vrai uniquement si l'appelant est le planificateur ou une fonction interne. */
export async function isTrustedCron(req: Request, svc: { from: (t: string) => any }): Promise<boolean> {
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && bearer === serviceKey) return true;

  const provided = (req.headers.get("x-cron-secret") || "").trim();
  if (!provided) return false;

  if (!cachedSecret) {
    try {
      const { data } = await svc.from("cron_auth").select("secret").limit(1).maybeSingle();
      cachedSecret = (data?.secret as string | undefined) ?? null;
    } catch (_e) {
      cachedSecret = null;
    }
  }
  return Boolean(cachedSecret) && provided === cachedSecret;
}

/** En-têtes à utiliser pour un appel interne de fonction à fonction. */
export function internalHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    apikey: key,
    "Lovable-Context": "cron",
    ...extra,
  };
}
