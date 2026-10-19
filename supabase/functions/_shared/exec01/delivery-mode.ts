/** Server-only routing: test captures require registration; real mail is separately gated. */
export function deliveryCapture(email: string, registeredTest: boolean, realMailEnabled: boolean): boolean {
  const reserved = /@([^@]+\.)?(invalid|test|example|localhost)$|@example\.(com|org|net)$/i.test(email.trim());
  if (reserved) {
    if (!registeredTest) throw Error('Unregistered test contact');
    return true;
  }
  if (!realMailEnabled) throw Error('Real owner mail disabled');
  return false;
}