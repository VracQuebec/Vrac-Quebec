import type { MailState } from './_shared/mail-status.ts';
// Inactive client contract. Public screens must opt in after separate approval.
export function recordedConfirmation(body: unknown) {
  if (!body || typeof body !== 'object') throw Error('Enregistrement non confirmé.');
  const value = body as Record<string, unknown>;
  if (![value.submission_id, value.request_number, value.quote_number].some(v => typeof v === 'string' && v.trim().length > 0)) throw Error('Enregistrement non confirmé.');
  const explicit = value.email_status;
  const state: MailState = explicit === 'queued' || explicit === 'failed' || explicit === 'not_sent' || explicit === 'unknown'
    ? explicit : value.email_sent === true ? 'queued' : value.email_sent === false ? 'failed' : 'unknown';
  const message = state === 'queued' ? 'Votre demande est enregistrée. Le service a accepté le courriel de confirmation.'
    : state === 'failed' ? 'Votre demande est enregistrée. Le courriel n’a pas été accepté; vous pouvez réessayer sans nouvelle demande.'
    : state === 'not_sent' ? 'Votre demande est enregistrée. Aucun courriel de confirmation n’a été envoyé.'
    : 'Votre demande est enregistrée. Le statut du courriel est inconnu; aucun nouvel envoi automatique n’est effectué.';
  return { state, message, email_sent: state === 'queued' ? true : state === 'unknown' ? null : false };
}