// Server-owned signup grant: never accept a role or approval flag from the request.
export function entrepreneurSignupRole(userId: string) {
  return { user_id: userId, role: "entrepreneur", approved: true };
}

/** Options imposées à la création : le courriel n'est JAMAIS confirmé par le serveur. */
export const SIGNUP_EMAIL_CONFIRMED = false;

export interface ExistingAuthUser {
  id: string;
  confirmed: boolean;
  requestedEntrepreneur: boolean;
  /** Rôles autres qu'« entrepreneur » (ex. admin) : jamais repris par l'inscription publique. */
  hasOtherRoles: boolean;
}

export type SignupDecision = "create" | "resend_pending" | "conflict";

/**
 * Inscription publique : une adresse ne peut être reprise que si elle n'a aucun
 * compte, ou si son seul compte est une inscription entrepreneur encore NON
 * confirmée (nouvel envoi du lien au propriétaire de la boîte). Un compte
 * confirmé, ou ayant déjà des rôles, n'est jamais modifié.
 */
export function decideSignup(existing: ExistingAuthUser | null, linkedProfileUserId: string | null): SignupDecision {
  if (!existing) return linkedProfileUserId ? "conflict" : "create";
  if (existing.confirmed || !existing.requestedEntrepreneur || existing.hasOtherRoles) return "conflict";
  if (linkedProfileUserId && linkedProfileUserId !== existing.id) return "conflict";
  return "resend_pending";
}

const ALLOWED_ORIGINS = /^https:\/\/((www\.)?vracquebec\.ca|[a-z0-9-]+\.lovable\.app)$/i;
export function confirmRedirect(origin: string | null): string {
  const base = origin && ALLOWED_ORIGINS.test(origin) ? origin : "https://vracquebec.ca";
  return `${base}/reset-password?bienvenue=entrepreneur`;
}

/**
 * Le mot de passe n'est JAMAIS fixé par la personne qui lance l'inscription :
 * seul le titulaire de la boîte le choisit après avoir ouvert le lien. Une
 * inscription en attente reprise reçoit un secret aléatoire jamais transmis,
 * ce qui invalide tout mot de passe choisi auparavant par un tiers.
 */
export function unusablePassword(): string {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("") + "Aa1!";
}
export const SIGNUP_ACCEPTS_PASSWORD = false;
