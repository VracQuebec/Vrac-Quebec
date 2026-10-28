import { privateTelemetryBlocked } from './privacy';
import { analyticsAllowed } from './consent';
import { GA4_MEASUREMENT_ID } from './ga4-id';
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export { GA4_MEASUREMENT_ID };

/** Espaces connectés et liens personnels : jamais mesurés. */
export function isPrivateAnalyticsPath(path: string): boolean {
  return /^\/(admin|entrepreneur|portail|partenaire|chauffeur|mission|compte|client|invitation|auth)(\/|$)/i.test(path);
}

/** Ne garde que les paramètres de campagne; retire codes, jetons et identifiants. */
export function sanitizeSearch(search: string): string {
  const src = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const [k, v] of src) if (/^utm_(source|medium|campaign|term|content)$/.test(k) && v.length <= 100) out.set(k, v);
  const s = out.toString();
  return s ? '?' + s : '';
}

function canSend(path: string): boolean {
  return analyticsAllowed() && !privateTelemetryBlocked() && !isPrivateAnalyticsPath(path)
    && typeof window.gtag === 'function';
}

/** Événements autorisés : aucun champ libre, aucune coordonnée, aucun numéro de dossier. */
const ALLOWED_EVENTS: Record<string, readonly string[]> = {
  lead_created: ['form', 'service', 'variant'],
  intent_select: ['intent'],
  home_cta: ['cta'],
  phone_click: ['page_slug'],
  whatsapp_click: ['page_slug'],
  form_submit: ['page_slug'],
};

/** Envoie un page_view GA4 pour la route SPA courante. */
export function trackPageView(pathWithSearch: string, title?: string): void {
  const [path, rawSearch = ''] = pathWithSearch.split('?');
  if (!canSend(path)) return;
  const clean = path + sanitizeSearch(rawSearch);
  window.gtag!("event", "page_view", {
    page_path: clean,
    page_location: window.location.origin + clean,
    page_referrer: '',
    page_title: title ?? document.title,
    send_to: GA4_MEASUREMENT_ID,
  });
}

/** Envoie un événement GA4 de la liste blanche (fire-and-forget, jamais bloquant). */
export function trackEvent(name: string, params: Record<string, unknown> = {}): void {
  if (!canSend(window.location.pathname)) return;
  const keys = ALLOWED_EVENTS[name];
  if (!keys) return;
  const safe: Record<string, string> = {};
  for (const k of keys) {
    const v = params[k];
    if (typeof v === 'string' && /^[a-z0-9_/-]{1,80}$/i.test(v)) safe[k] = v;
  }
  try {
    window.gtag!("event", name, { send_to: GA4_MEASUREMENT_ID, ...safe });
  } catch {
    /* noop */
  }
}

export {};
