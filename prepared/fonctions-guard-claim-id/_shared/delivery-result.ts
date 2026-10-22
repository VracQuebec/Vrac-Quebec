import type { MailState } from './mail-status.ts';
// Only an explicit service response proves acceptance or rejection.
export function deliveryResult(httpOk: boolean, body: unknown): MailState {
  if (!body || typeof body !== 'object') return 'unknown';
  const value = body as { success?: unknown; reason?: unknown };
  if (value.reason === 'email_suppressed' || value.reason === 'no_client_email') return 'not_sent';
  if (httpOk && value.success === true) return 'queued';
  if (value.success === false) return 'failed';
  return 'unknown';
}
export function mailResponse(state: MailState) {
  return { email_status: state, email_sent: state === 'queued' ? true : state === 'unknown' ? null : false };
}