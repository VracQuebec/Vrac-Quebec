// Statut HONNÊTE du courriel de confirmation : « queued » seulement si le
// service d'envoi a réellement accepté le message (HTTP 2xx + success).
export type ConfirmationStatus = 'queued' | 'failed' | 'not_sent';

export function classifyConfirmation(httpOk: boolean, body: unknown): ConfirmationStatus {
  if (!httpOk || !body || typeof body !== 'object') return 'failed';
  const b = body as { success?: unknown; reason?: unknown };
  if (b.success === true) return 'queued';
  // Refus volontaire (désinscription, aucune adresse) : pas un échec technique.
  if (b.reason === 'email_suppressed' || b.reason === 'no_client_email') return 'not_sent';
  return 'failed';
}
