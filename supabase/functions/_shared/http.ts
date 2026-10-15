// Appels externes bornés : délai d'expiration explicite sur chaque fetch
// sortant. Sans cela, une API tierce lente (Google, IA, courriel) peut
// consommer tout le budget d'exécution de la fonction et laisser
// l'utilisateur attendre indéfiniment.
//
// Usage : fetchWithTimeout(url, init, 10000) — lève une erreur
// « fetch_timeout_<ms>ms » reconnaissable dans les journaux.

export class FetchTimeoutError extends Error {
  constructor(public readonly ms: number) {
    super(`fetch_timeout_${ms}ms`);
    this.name = "FetchTimeoutError";
  }
}

export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  ms = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  // Conserver un signal fourni par l'appelant : le premier des deux l'emporte.
  const upstream = init.signal;
  if (upstream) {
    if (upstream.aborted) controller.abort(upstream.reason);
    else upstream.addEventListener("abort", () => controller.abort(upstream.reason), { once: true });
  }
  const timer = setTimeout(() => controller.abort(new FetchTimeoutError(ms)), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    // Normaliser le dépassement en erreur nommée, distincte des autres aborts.
    if (controller.signal.aborted && controller.signal.reason instanceof FetchTimeoutError) {
      throw controller.signal.reason;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** true si l'erreur est un dépassement du délai fetchWithTimeout. */
export function isFetchTimeout(e: unknown): e is FetchTimeoutError {
  return e instanceof FetchTimeoutError;
}
