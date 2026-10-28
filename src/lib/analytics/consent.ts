import { GA4_MEASUREMENT_ID } from './ga4-id';

/** Choix de témoins (Loi 25) : aucune mesure d'audience sans accord explicite. */
export const CONSENT_KEY = 'vq_consent_v1';
export const CONSENT_POLICY_VERSION = '2026-10-28';
export const CONSENT_EVENT = 'vq:consent-change';
export const OPEN_SETTINGS_EVENT = 'vq:consent-open';

export type ConsentChoice = {
  v: 1;
  analytics: boolean;
  /** Toujours false : aucun traceur publicitaire n'est utilisé. */
  advertising: false;
  decidedAt: string;
  policy: string;
};

export function readConsent(): ConsentChoice | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as ConsentChoice;
    if (c?.v !== 1 || typeof c.analytics !== 'boolean') return null;
    return c;
  } catch {
    return null;
  }
}

export function analyticsAllowed(): boolean {
  return readConsent()?.analytics === true;
}

export function saveConsent(analytics: boolean): ConsentChoice {
  const choice: ConsentChoice = {
    v: 1, analytics, advertising: false,
    decidedAt: new Date().toISOString(), policy: CONSENT_POLICY_VERSION,
  };
  const wasAllowed = analyticsAllowed();
  window.localStorage.setItem(CONSENT_KEY, JSON.stringify(choice));
  applyConsent();
  // Retrait après accord : recharger pour décharger complètement la balise déjà active
  // (sinon un événement déjà mis en file pourrait encore partir).
  if (wasAllowed && !analytics) { window.setTimeout(() => window.location.reload(), 0); }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
  return choice;
}

export function openConsentSettings(): void {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

function clearGaCookies(): void {
  const host = window.location.hostname;
  const domains = ['', host, '.' + host, '.' + host.replace(/^www\./, '')];
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim();
    if (!name || !/^_ga/.test(name)) continue;
    for (const d of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d ? '; domain=' + d : ''}`;
    }
  }
}

/** Charge GA seulement après accord; bloque et efface ses témoins après refus. */
export function applyConsent(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, unknown> & { gtag?: (...a: unknown[]) => void };
  const allowed = analyticsAllowed() && !w.__vqPersonalDocument;
  w['ga-disable-' + GA4_MEASUREMENT_ID] = !allowed;
  w.gtag?.('consent', 'update', {
    analytics_storage: allowed ? 'granted' : 'denied',
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
  });
  if (!allowed) { clearGaCookies(); return; }
  if (document.getElementById('vq-ga4')) return;
  const s = document.createElement('script');
  s.id = 'vq-ga4';
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
  document.head.appendChild(s);
}

if (typeof window !== 'undefined') {
  // Changement fait dans un autre onglet : appliqué immédiatement.
  window.addEventListener('storage', (e) => {
    if (e.key !== CONSENT_KEY) return;
    applyConsent();
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: readConsent() }));
  });
}
