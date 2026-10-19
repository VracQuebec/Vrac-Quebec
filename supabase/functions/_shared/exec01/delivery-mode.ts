/** Server-only routing: test captures require registration; real mail is separately gated. */
export const EXEC01_NEW_REQUESTS_FROM = '2026-10-19T21:50:07Z';
export function isNewOwnerRequest(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && created >= Date.parse(EXEC01_NEW_REQUESTS_FROM);
}
export function deliveryCapture(email: string, registeredTest: boolean, realMailEnabled: boolean): boolean {
  const reserved = /@([^@]+\.)?(invalid|test|example|localhost)$|@example\.(com|org|net)$/i.test(email.trim());
  if (reserved) {
    if (!registeredTest) throw Error('Unregistered test contact');
    return true;
  }
  if (!realMailEnabled) throw Error('Real owner mail disabled');
  return false;
}