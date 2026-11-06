// Constant-time comparison of the caller bearer with the service key.
export function isServiceCaller(token: string, serviceKey: string): boolean {
  if (!token || !serviceKey || token.length !== serviceKey.length) return false
  let diff = 0
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ serviceKey.charCodeAt(i)
  return diff === 0
}


/**
 * Déclenchement public (navigateur) d'un modèle lié à une demande : une référence
 * n'est pas une autorisation. Seule une demande créée dans les dernières minutes,
 * et jamais encore déclenchée publiquement pour ce modèle, peut provoquer un envoi
 * (le formulaire envoie juste après sa propre insertion). Les fonctions serveur
 * (clé de service) ne passent pas par cette règle.
 */
export const PUBLIC_TRIGGER_WINDOW_MS = 15 * 60_000
export type PublicTriggerVerdict = 'allow' | 'too_old' | 'already_triggered'
export function publicTriggerVerdict(createdAt: string | null | undefined, now: number, alreadyTriggered: boolean): PublicTriggerVerdict {
  const t = createdAt ? Date.parse(createdAt) : NaN
  if (!Number.isFinite(t) || now - t > PUBLIC_TRIGGER_WINDOW_MS || t - now > 60_000) return 'too_old'
  return alreadyTriggered ? 'already_triggered' : 'allow'
}
