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

export async function guardPublicRequest(sb: any, o: GuardOptions): Promise<GuardVerdict> {
  const windowMinutes = o.windowMinutes ?? 60;
  const maxPerWindow = o.maxPerWindow ?? 5;
  const dedupeMinutes = o.dedupeMinutes ?? 30;
  const minElapsed = o.minElapsedSeconds ?? 3;

  // 1. Piège à robots : un humain ne remplit jamais ce champ.
  if (typeof o.honeypot === "string" && o.honeypot.trim() !== "") {
    console.warn(`[guard:${o.scope}] honeypot rempli`, { ip: o.ip });
    throw new GuardError("Demande refusée.", 400, "bot_detected");
  }

  // 2. Délai humain : un formulaire envoyé instantanément vient d'un script.
  const started = Number(o.formStartedAt);
  if (Number.isFinite(started) && started > 0) {
    const elapsed = (Date.now() - started) / 1000;
    if (elapsed >= 0 && elapsed < minElapsed) {
      console.warn(`[guard:${o.scope}] envoi trop rapide (${elapsed}s)`, { ip: o.ip });
      throw new GuardError("Demande refusée.", 400, "bot_detected");
    }
  }

  // 3. Anti-pourriel sur le texte libre.
  if (looksLikeSpam(o.freeText)) {
    console.warn(`[guard:${o.scope}] contenu identifié comme pourriel`, { ip: o.ip });
    throw new GuardError("Votre message a été identifié comme indésirable.", 400, "spam_detected");
  }

  const sinceWindow = new Date(Date.now() - windowMinutes * 60000).toISOString();
  const sinceDedupe = new Date(Date.now() - dedupeMinutes * 60000).toISOString();
  const identities = [o.identity, o.ip].filter(Boolean) as string[];

  // 4. Limitation du débit (par courriel et par adresse IP).
  const { count, error: countError } = await sb
    .from("public_request_guard")
    .select("id", { count: "exact", head: true })
    .eq("scope", o.scope)
    .in("identity", identities)
    .gte("created_at", sinceWindow);
  if (countError) console.error(`[guard:${o.scope}] lecture impossible`, countError.message);
  if ((count ?? 0) >= maxPerWindow) {
    console.warn(`[guard:${o.scope}] limite atteinte`, { identity: o.identity, count });
    throw new GuardError(
      "Trop de demandes en peu de temps. Réessayez plus tard ou appelez-nous directement.",
      429,
      "rate_limited",
    );
  }

  // 5. Déduplication : demande identique déjà traitée récemment.
  const { data: dup } = await sb
    .from("public_request_guard")
    .select("payload,created_at")
    .eq("scope", o.scope)
    .eq("fingerprint", o.fingerprint)
    .gte("created_at", sinceDedupe)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 6. Journalisation de la tentative (sert de compteur et de mémoire).
  const { error: logError } = await sb.from("public_request_guard").insert({
    scope: o.scope,
    identity: o.identity,
    fingerprint: o.fingerprint,
    payload: { ip: o.ip },
  });
  if (logError) console.error(`[guard:${o.scope}] journalisation impossible`, logError.message);

  return { duplicate: Boolean(dup), previous: (dup?.payload as Record<string, unknown>) ?? null };
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
