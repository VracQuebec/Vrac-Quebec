// Singleton Google Maps JS API loader (async + callback pattern).
// Loads the Maps JS API + 'places' + 'marker' libraries once and resolves
// across all consumers. Safe to call from multiple components.

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
const TRACKING_ID = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

let loadPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if ((window as any).google?.maps?.Map) return Promise.resolve((window as any).google);
  if (loadPromise) return loadPromise;
  if (!BROWSER_KEY) {
    return Promise.reject(new Error("Clé Google Maps Browser manquante (VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY)."));
  }

  loadPromise = new Promise((resolve, reject) => {
    const cbName = "__lovableGmapsInit";
    (window as any)[cbName] = () => {
      resolve((window as any).google);
      try { delete (window as any)[cbName]; } catch { /* noop */ }
    };
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: BROWSER_KEY,
      loading: "async",
      callback: cbName,
      libraries: "places,marker",
      language: "fr",
      region: "CA",
    });
    if (TRACKING_ID) params.set("channel", TRACKING_ID);
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Échec du chargement de Google Maps"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}