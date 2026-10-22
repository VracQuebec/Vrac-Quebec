// ============================================================
// PROTECTION DES ENDPOINTS PUBLICS
// ------------------------------------------------------------
// Anti-robot (piège + délai humain), anti-pourriel, limitation du
// débit et déduplication des demandes. Aucune règle d'affaires ici :
// uniquement de la protection technique.
// ============================================================

export interface GuardOptions {
  scope: string;
  /** Adresse courriel / téléphone : identité fonctionnelle du demandeur. */
  identity: string;
  /** Empreinte de la demande (matériau + quantité + adresse + contact). */
  fingerprint: string;
  /** Champ piège : doit rester vide (rempli uniquement par les robots). */
  honeypot?: unknown;
  /** Horodatage d'ouverture du formulaire (ms) envoyé par le navigateur. */
  formStartedAt?: unknown;
  /** Texte libre soumis, analysé pour le pourriel. */
  freeText?: string | null;
  ip: string | null;
  /** Fenêtre de limitation (minutes) et nombre maximum de demandes. */
  windowMinutes?: number;
  maxPerWindow?: number;
  /** Fenêtre de déduplication (minutes). */
  dedupeMinutes?: number;
  /** Délai humain minimal entre l'ouverture du formulaire et l'envoi (s). */
  minElapsedSeconds?: number;
}

export class GuardError extends Error {
  constructor(message: string, readonly status = 429, readonly code = "rate_limited") {
    super(message);
  }
}

export interface GuardVerdict {
  /** Empreinte déjà reçue récemment : la demande est un doublon. */
  duplicate: boolean;
  previous: Record<string, unknown> | null;
}

const SPAM_PATTERNS = [
  /\b(?:https?:\/\/|www\.)\S+/gi,
  /\b(?:viagra|casino|crypto|bitcoin|loan|seo services|backlinks)\b/i,
  /<\s*(?:a|script|iframe)\b/i,
];

export function looksLikeSpam(text: string | null | undefined): boolean {
  if (!text) return false;
  const links = text.match(SPAM_PATTERNS[0]);
  if (links && links.length >= 2) return true;
  return SPAM_PATTERNS.slice(1).some((re) => re.test(text));
}

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : null) || req.headers.get("cf-connecting-ip") || null;
}

// ------------------------------------------------------------
// Mode de secours (fonctions SQL absentes ou en échec)
// ------------------------------------------------------------
// Le secours lit puis écrit en DEUX requêtes : il n'offre PAS la protection
// contre les requêtes simultanées du chemin SQL transactionnel. Il n'existe
// que pour la période précédant l'application de la migration ; son
// activation est journalisée (événement « guard.fallback_active ») et
// comptée pour être mesurable. Aucun courriel, nom ou adresse n'est journalisé.

export type RpcFailureKind = "migration_absente" | "erreur_inattendue";

export function classifyRpcError(err: unknown): RpcFailureKind {
  const e = (err ?? {}) as { code?: string; message?: string };
  const text = `${e.code ?? ""} ${e.message ?? String(err ?? "")}`;
  return /PGRST202|42883|could not find the function|function .* does not exist|rpc indisponible/i.test(text)
    ? "migration_absente"
    : "erreur_inattendue";
}

/** Compteur d'activations du secours (par instance), exposé pour la mesure. */
export const guardFallbackStats = { activations: 0, migrationAbsente: 0, erreurInattendue: 0 };

function reportFallback(scope: string, rpc: string, err: unknown): RpcFailureKind {
  const kind = classifyRpcError(err);
  guardFallbackStats.activations++;
  if (kind === "migration_absente") guardFallbackStats.migrationAbsente++;
  else guardFallbackStats.erreurInattendue++;
  const e = (err ?? {}) as { code?: string };
  const line = JSON.stringify({
    event: "guard.fallback_active",
    scope,
    rpc,
    reason: kind,
    code: e.code ?? null,
    protection_concurrence: "inactive",
    activations: guardFallbackStats.activations,
  });
  if (kind === "migration_absente") console.warn(line);
  else console.error(line);
  return kind;
}

async function preChecks(sb: any, o: GuardOptions) {
  const windowMinutes = o.windowMinutes ?? 60;
  const maxPerWindow = o.maxPerWindow ?? 5;
  const minElapsed = o.minElapsedSeconds ?? 3;

  if (!o.fingerprint || !o.fingerprint.trim()) {
    throw new GuardError("Demande refusée.", 400, "invalid_fingerprint");
  }

  // 1. Piège à robots : un humain ne remplit jamais ce champ.
  if (typeof o.honeypot === "string" && o.honeypot.trim() !== "") {
    console.warn(`[guard:${o.scope}] honeypot rempli`);
    throw new GuardError("Demande refusée.", 400, "bot_detected");
  }

  // 2. Délai humain : un formulaire envoyé instantanément vient d'un script.
  const started = Number(o.formStartedAt);
  if (Number.isFinite(started) && started > 0) {
    const elapsed = (Date.now() - started) / 1000;
    if (elapsed >= 0 && elapsed < minElapsed) {
      console.warn(`[guard:${o.scope}] envoi trop rapide (${elapsed}s)`);
      throw new GuardError("Demande refusée.", 400, "bot_detected");
    }
  }

  // 3. Anti-pourriel sur le texte libre.
  if (looksLikeSpam(o.freeText)) {
    console.warn(`[guard:${o.scope}] contenu identifié comme pourriel`);
    throw new GuardError("Votre message a été identifié comme indésirable.", 400, "spam_detected");
  }

  // 4. Limitation du débit (par courriel et par adresse IP).
  const sinceWindow = new Date(Date.now() - windowMinutes * 60000).toISOString();
  const identities = [o.identity, o.ip].filter(Boolean) as string[];
  const { count, error: countError } = await sb
    .from("public_request_guard")
    .select("id", { count: "exact", head: true })
    .eq("scope", o.scope)
    .in("identity", identities)
    .gte("created_at", sinceWindow);
  if (countError) console.error(`[guard:${o.scope}] lecture impossible`, countError.message);
  if ((count ?? 0) >= maxPerWindow) {
    console.warn(`[guard:${o.scope}] limite atteinte`, { count });
    throw new GuardError(
      "Trop de demandes en peu de temps. Réessayez plus tard ou appelez-nous directement.",
      429,
      "rate_limited",
    );
  }
}

export async function guardPublicRequest(sb: any, o: GuardOptions): Promise<GuardVerdict> {
  const dedupeMinutes = o.dedupeMinutes ?? 30;
  await preChecks(sb, o);
  const sinceDedupe = new Date(Date.now() - dedupeMinutes * 60000).toISOString();

  // 5+6. Déduplication ET journalisation en une seule transaction côté base
  // (RPC guard_check_and_log, verrou consultatif).
  const { data: verdict, error: rpcError } = typeof sb.rpc === "function"
    ? await sb.rpc("guard_check_and_log", {
      p_scope: o.scope,
      p_identity: o.identity,
      p_fingerprint: o.fingerprint,
      p_payload: { ip: o.ip },
      p_dedupe_minutes: dedupeMinutes,
    })
    : { data: null, error: { message: "rpc indisponible" } };
  if (!rpcError && verdict) {
    return {
      duplicate: Boolean(verdict.duplicate),
      previous: (verdict.previous as Record<string, unknown>) ?? null,
    };
  }
  // Ce chemin est partagé par plusieurs fonctions (quote-submit,
  // mkt-request-submit…) : il reste en secours dans les deux cas, mais
  // l'activation est désormais toujours journalisée et comptée.
  reportFallback(o.scope, "guard_check_and_log", rpcError ?? { message: "réponse vide" });

  const { data: dup } = await sb
    .from("public_request_guard")
    .select("payload,created_at")
    .eq("scope", o.scope)
    .eq("fingerprint", o.fingerprint)
    .gte("created_at", sinceDedupe)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: logError } = await sb.from("public_request_guard").insert({
    scope: o.scope,
    identity: o.identity,
    fingerprint: o.fingerprint,
    payload: { ip: o.ip },
  });
  if (logError) console.error(`[guard:${o.scope}] journalisation impossible`, logError.message);

  return { duplicate: Boolean(dup), previous: (dup?.payload as Record<string, unknown>) ?? null };
}

// ------------------------------------------------------------
// Réservation en 3 temps (claim → complete | release)
// ------------------------------------------------------------
// Utilisée par submit-parcours. Une demande n'est « traitée » (doublon
// possible) qu'après guard_complete, appelé une fois la création confirmée
// avec la référence réelle. Un échec appelle guard_release sur la
// réservation EXACTE (par id) : jamais de suppression aveugle.

export interface Claim {
  state: "new" | "duplicate" | "in_progress";
  claimId: string | null;
  /** Résultat mémorisé de la demande initiale (duplicate seulement). */
  result: Record<string, unknown> | null;
  /** Réservation « pending » expirée dont l'issue est inconnue. */
  staleAt: string | null;
  staleClaimId: string | null;
  protection: "transactionnelle" | "secours_non_atomique";
}

export async function claimPublicRequest(
  sb: any,
  o: GuardOptions & { pendingSeconds?: number },
): Promise<Claim> {
  const dedupeMinutes = o.dedupeMinutes ?? 30;
  const pendingSeconds = o.pendingSeconds ?? 120;
  await preChecks(sb, o);

  const { data, error } = typeof sb.rpc === "function"
    ? await sb.rpc("guard_claim", {
      p_scope: o.scope,
      p_identity: o.identity,
      p_fingerprint: o.fingerprint,
      p_payload: { ip: o.ip },
      p_dedupe_minutes: dedupeMinutes,
      p_pending_seconds: pendingSeconds,
    })
    : { data: null, error: { message: "rpc indisponible" } };

  if (!error && data && typeof data.state === "string") {
    return {
      state: data.state,
      claimId: data.claim_id ?? null,
      result: (data.result as Record<string, unknown>) ?? null,
      staleAt: data.stale_at ?? null,
      staleClaimId: data.stale_claim_id ?? null,
      protection: "transactionnelle",
    };
  }

  const kind = reportFallback(o.scope, "guard_claim", error ?? { message: "réponse vide" });
  // Erreur inattendue (base indisponible, paramètre refusé…) : on n'invente
  // pas de verdict. La demande n'est pas créée et l'erreur remonte.
  if (kind === "erreur_inattendue") {
    throw new GuardError("Service momentanément indisponible. Réessayez dans un instant.", 503, "guard_unavailable");
  }

  // Secours (migration absente) : lecture puis insertion, non atomique.
  const since = new Date(Date.now() - dedupeMinutes * 60000).toISOString();
  const { data: rows } = await sb
    .from("public_request_guard")
    .select("id,payload,created_at")
    .eq("scope", o.scope)
    .eq("fingerprint", o.fingerprint)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  const list = (Array.isArray(rows) ? rows : []) as Array<{ id: string; payload: any; created_at: string }>;
  const done = list.find((r) => r.payload?.state === "done");
  if (done) {
    return { state: "duplicate", claimId: done.id, result: done.payload?.result ?? null, staleAt: null, staleClaimId: null, protection: "secours_non_atomique" };
  }
  const pendingCut = new Date(Date.now() - pendingSeconds * 1000).toISOString();
  const pending = list.find((r) => r.payload?.state === "pending" && r.created_at >= pendingCut);
  if (pending) {
    return { state: "in_progress", claimId: pending.id, result: null, staleAt: null, staleClaimId: null, protection: "secours_non_atomique" };
  }
  const stale = list.find((r) => r.payload?.state === "pending");
  const { data: ins, error: insError } = await sb
    .from("public_request_guard")
    .insert({ scope: o.scope, identity: o.identity, fingerprint: o.fingerprint, payload: { ip: o.ip, state: "pending" } })
    .select("id")
    .single();
  if (insError || !ins?.id) {
    throw new GuardError("Service momentanément indisponible. Réessayez dans un instant.", 503, "guard_unavailable");
  }
  return {
    state: "new", claimId: ins.id, result: null,
    staleAt: stale?.created_at ?? null, staleClaimId: stale?.id ?? null,
    protection: "secours_non_atomique",
  };
}

/** Mémorise le résultat RÉEL sur la réservation exacte. Vrai si mémorisé. */
export async function completeClaim(
  sb: any,
  scope: string,
  claimId: string,
  result: { submission_id: string } & Record<string, unknown>,
): Promise<boolean> {
  if (!result?.submission_id) throw new Error("completeClaim: référence de demande absente");
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = typeof sb.rpc === "function"
      ? await sb.rpc("guard_complete", { p_claim_id: claimId, p_result: result })
      : { error: { message: "rpc indisponible" } };
    if (!error) return true;
    if (classifyRpcError(error) === "migration_absente") {
      reportFallback(scope, "guard_complete", error);
      const { data: row } = await sb.from("public_request_guard").select("payload").eq("id", claimId).maybeSingle();
      const { error: upErr } = await sb.from("public_request_guard")
        .update({ payload: { ...(row?.payload ?? {}), state: "done", result } })
        .eq("id", claimId);
      if (!upErr) return true;
    }
  }
  console.error(JSON.stringify({ event: "guard.complete_failed", scope }));
  return false;
}

/** Libère la réservation exacte après un échec de création. */
export async function releaseClaim(sb: any, scope: string, claimId: string, reason: string): Promise<void> {
  const { error } = typeof sb.rpc === "function"
    ? await sb.rpc("guard_release", { p_claim_id: claimId, p_reason: reason })
    : { error: { message: "rpc indisponible" } };
  if (!error) return;
  if (classifyRpcError(error) === "migration_absente") {
    reportFallback(scope, "guard_release", error);
    const { data: row } = await sb.from("public_request_guard").select("payload").eq("id", claimId).maybeSingle();
    if (row?.payload?.state === "pending") {
      await sb.from("public_request_guard").update({ payload: { ...row.payload, state: "failed", reason } }).eq("id", claimId);
    }
    return;
  }
  console.error(JSON.stringify({ event: "guard.release_failed", scope }));
}

/** Complète l'entrée du journal avec le résultat (numéro de soumission). */
export async function rememberResult(
  sb: any,
  scope: string,
  fingerprint: string,
  payload: Record<string, unknown>,
) {
  const { error } = await sb
    .from("public_request_guard")
    .update({ payload })
    .eq("scope", scope)
    .eq("fingerprint", fingerprint)
    .gte("created_at", new Date(Date.now() - 5 * 60000).toISOString());
  if (error) console.error(`[guard:${scope}] mémorisation impossible`, error.message);
}

/**
 * Quota simple par adresse IP pour les points d'entrée publics qui
 * déclenchent des appels payants (Google, IA). Empêche qu'une clé
 * publique serve à consommer le budget de l'entreprise.
 */
export async function enforceIpQuota(
  sb: any,
  scope: string,
  ip: string | null,
  maxPerWindow = 30,
  windowMinutes = 60,
): Promise<void> {
  const identity = ip ?? "inconnu";
  const since = new Date(Date.now() - windowMinutes * 60000).toISOString();
  const { count, error } = await sb
    .from("public_request_guard")
    .select("id", { count: "exact", head: true })
    .eq("scope", scope)
    .eq("identity", identity)
    .gte("created_at", since);
  if (error) console.error(`[quota:${scope}] lecture impossible`, error.message);
  if ((count ?? 0) >= maxPerWindow) {
    throw new GuardError("Trop de requêtes en peu de temps. Réessayez plus tard.", 429, "rate_limited");
  }
  const { error: logError } = await sb
    .from("public_request_guard")
    .insert({ scope, identity, fingerprint: `${scope}:${identity}:${Date.now()}`, payload: { ip } });
  if (logError) console.error(`[quota:${scope}] journalisation impossible`, logError.message);
}
