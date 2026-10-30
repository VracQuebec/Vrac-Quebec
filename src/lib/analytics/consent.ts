import { GA4_MEASUREMENT_ID } from './ga4-id';

/** Choix de témoins (Loi 25) : aucune mesure d'audience sans accord explicite. */
export const CONSENT_KEY = 'vq_consent_v1';
export const CONSENT_POLICY_VERSION = '2026-10-28';
/** Version du texte du bandeau présenté (à changer quand le texte ou les catégories changent). */
export const CONSENT_BANNER_VERSION = 'banniere-2026-10-30';
export const CONSENT_ID_KEY = 'vq_consent_id';
export type ConsentSource = 'banniere' | 'preferences';
export const CONSENT_EVENT = 'vq:consent-change';
export const OPEN_SETTINGS_EVENT = 'vq:consent-open';

export type ConsentChoice = {
  v: 1;
  analytics: boolean;
  /** Toujours false : aucun traceur publicitaire n'est utilisé. */
  advertising: false;
  decidedAt: string;
  policy: string;
  banner?: string;
  /** Refus appliqué localement mais pas encore inscrit au registre. */
  pending?: ConsentSource;
  /** Acceptation confirmée par le registre. Sans cette preuve, un ancien accord local est redemandé. */
  recorded?: true;
};

export function readConsent(): ConsentChoice | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as ConsentChoice;
    if (c?.v !== 1 || typeof c.analytics !== 'boolean') return null;
    // Ancien accord local sans preuve d'inscription au registre : on redemande le choix.
    if (c.analytics && c.recorded !== true) return null;
    return c;
  } catch {
    return null;
  }
}

export function analyticsAllowed(): boolean {
  return readConsent()?.analytics === true;
}

export function saveConsent(analytics: boolean, pending?: ConsentSource, reloadOnWithdraw = true): ConsentChoice {
  const choice: ConsentChoice = {
    v: 1, analytics, advertising: false,
    decidedAt: new Date().toISOString(), policy: CONSENT_POLICY_VERSION, banner: CONSENT_BANNER_VERSION,
    ...(pending ? { pending } : {}),
    ...(analytics ? { recorded: true as const } : {}),
  };
  const wasAllowed = analyticsAllowed();
  window.localStorage.setItem(CONSENT_KEY, JSON.stringify(choice));
  applyConsent();
  // Retrait après accord : recharger pour décharger complètement la balise déjà active
  // (sinon un événement déjà mis en file pourrait encore partir).
  if (reloadOnWithdraw && wasAllowed && !analytics) { window.setTimeout(() => window.location.reload(), 0); }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { ...choice, granted: analytics && !wasAllowed } }));
  return choice;
}

/** Identifiant aléatoire propre au navigateur (aucune empreinte) + secret pour qu'un autre navigateur ne puisse pas le modifier. */
export function consentIdentity(): { id: string; secret: string } {
  try {
    const raw = window.localStorage.getItem(CONSENT_ID_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (v && /^[0-9a-f-]{36}$/.test(v.id) && typeof v.secret === 'string' && v.secret.length >= 32) return v;
  } catch { /* nouvel identifiant */ }
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const v = { id: crypto.randomUUID(), secret };
  window.localStorage.setItem(CONSENT_ID_KEY, JSON.stringify(v));
  return v;
}

export type ConsentRecorder = (args: {
  id: string; secret: string; analytics: boolean; banner: string; policy: string; source: ConsentSource;
}) => Promise<void>;

let recorder: ConsentRecorder | null = null;
export function setConsentRecorder(r: ConsentRecorder): void { recorder = r; }

async function record(analytics: boolean, source: ConsentSource): Promise<void> {
  if (!recorder) throw new Error('registre indisponible');
  const { id, secret } = consentIdentity();
  await recorder({ id, secret, analytics, banner: CONSENT_BANNER_VERSION, policy: CONSENT_POLICY_VERSION, source });
}

/**
 * Choix du visiteur. Accepter n'active la mesure qu'APRÈS inscription réussie au registre
 * (un échec n'est jamais un consentement). Refuser s'applique immédiatement, même si
 * l'inscription échoue (elle sera retentée au prochain chargement).
 */
let decisionSeq = 0;
export async function decideConsent(analytics: boolean, source: ConsentSource): Promise<{ ok: boolean }> {
  const mine = ++decisionSeq;
  if (analytics) {
    try { await record(true, source); } catch { return { ok: false }; }
    // Une décision plus récente (refus/retrait) l'emporte toujours sur une ancienne tentative.
    if (mine !== decisionSeq) return { ok: false };
    saveConsent(true);
    return { ok: true };
  }
  const wasAllowed = analyticsAllowed();
  saveConsent(false, source, false); // GA désactivé et témoins _ga effacés tout de suite
  try {
    await Promise.race([record(false, source), new Promise((_, rej) => setTimeout(() => rej(new Error('délai')), 5000))]);
    if (mine === decisionSeq && !analyticsAllowed()) saveConsent(false, undefined, false);
  } catch { /* refus conservé localement, inscription retentée plus tard */ }
  // Retrait : recharger pour décharger complètement la balise déjà active.
  if (wasAllowed) window.setTimeout(() => window.location.reload(), 0);
  return { ok: true };
}

/** Retente l'inscription d'un refus resté en attente. */
export async function flushPendingConsent(): Promise<void> {
  const c = readConsent();
  if (!c?.pending || c.analytics) return;
  try { await record(false, c.pending); } catch { return; }
  const cur = readConsent();
  if (cur && !cur.analytics && cur.pending) {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ ...cur, pending: undefined }));
  }
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
  if (!allowed) { clearGaCookies(); document.getElementById('vq-ga4')?.remove(); return; }
  if (document.getElementById('vq-ga4')) return;
  const s = document.createElement('script');
  s.id = 'vq-ga4';
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
  document.head.appendChild(s);
}

/** Bloque toute transmission de mesure d'audience non autorisée (y compris un événement déjà en file). */
export function isAnalyticsHit(url: string): boolean {
  return /^https:\/\/([a-z0-9-]+\.)*(google-analytics\.com|analytics\.google\.com)\//i.test(url)
    || /^https:\/\/www\.googletagmanager\.com\/(g|[a-z]\/)?collect/i.test(url);
}
function hitBlocked(url: unknown): boolean {
  const u = typeof url === 'string' ? url : url instanceof URL ? url.href : (url as Request)?.url ?? '';
  return isAnalyticsHit(String(u)) && (!analyticsAllowed() || !!(window as unknown as Record<string, unknown>).__vqPersonalDocument);
}
if (typeof window !== 'undefined' && !(window as unknown as Record<string, unknown>).__vqHitGuard) {
  (window as unknown as Record<string, unknown>).__vqHitGuard = true;
  const beacon = navigator.sendBeacon?.bind(navigator);
  if (beacon) navigator.sendBeacon = (url, data) => (hitBlocked(url) ? true : beacon(url, data));
  const f = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    hitBlocked(input) ? Promise.resolve(new Response(null, { status: 204 })) : f(input, init)) as typeof fetch;
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, m: string, url: string | URL, ...rest: unknown[]) {
    if (hitBlocked(url)) url = 'data:,';
    return (open as (...a: unknown[]) => void).call(this, m, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
}

if (typeof window !== 'undefined') {
  // Changement fait dans un autre onglet : appliqué immédiatement.
  window.addEventListener('storage', (e) => {
    if (e.key !== CONSENT_KEY) return;
    applyConsent();
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: readConsent() }));
  });
}
