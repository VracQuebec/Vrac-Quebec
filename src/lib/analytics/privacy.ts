/** Fail closed for a personal document, including delayed callbacks after navigation. */
export function isPersonalPath(path: string): boolean {
  return /^\/(portail\/remblai|admin\/apercu-suivi-remblai)(\/|$)/.test(path);
}
export function privateTelemetryBlocked(): boolean {
  if (typeof window === 'undefined') return true;
  return Boolean((window as unknown as Record<string, unknown>).__vqPersonalDocument)
    || isPersonalPath(window.location.pathname)
    || /(?:[?#&])(secret|linkId|requestId|code|invitation)=/i.test(window.location.search + window.location.hash);
}