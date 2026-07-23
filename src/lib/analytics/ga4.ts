declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export const GA4_MEASUREMENT_ID = "G-T6HYZVY8E0";

/** Envoie un page_view GA4 pour la route SPA courante. */
export function trackPageView(pathWithSearch: string, title?: string): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", "page_view", {
    page_path: pathWithSearch,
    page_location: window.location.origin + pathWithSearch,
    page_title: title ?? document.title,
    send_to: GA4_MEASUREMENT_ID,
  });
}

/** Envoie un événement personnalisé GA4 (fire-and-forget, jamais bloquant). */
export function trackEvent(name: string, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", name, { send_to: GA4_MEASUREMENT_ID, ...params });
  } catch {
    /* noop */
  }
}

export {};