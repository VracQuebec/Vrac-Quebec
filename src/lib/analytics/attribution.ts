// ============================================================
// Attribution marketing — première touche (first-touch)
// Le navigateur ne fait que TRANSMETTRE les paramètres bruts :
// la provenance finale (`lead_source`) est décidée côté serveur.
// ============================================================
export type Attribution = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_referrer: string | null;
};

const KEY = "vq_attribution_v1";
const EMPTY: Attribution = {
  utm_source: null, utm_medium: null, utm_campaign: null, landing_referrer: null,
};

const trim = (v: string | null, max: number) => {
  const s = (v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

/** Lit (et mémorise une seule fois) la provenance de la visite courante. */
export function getAttribution(): Attribution {
  if (typeof window === "undefined") return EMPTY;
  try {
    const stored = window.sessionStorage.getItem(KEY);
    if (stored) return { ...EMPTY, ...(JSON.parse(stored) as Partial<Attribution>) };
  } catch { /* stockage indisponible */ }

  const params = new URLSearchParams(window.location.search);
  const referrer = document.referrer && !document.referrer.includes(window.location.host)
    ? document.referrer
    : null;
  const value: Attribution = {
    utm_source: trim(params.get("utm_source"), 80),
    utm_medium: trim(params.get("utm_medium"), 80),
    utm_campaign: trim(params.get("utm_campaign"), 120),
    landing_referrer: trim(referrer, 300),
  };
  try { window.sessionStorage.setItem(KEY, JSON.stringify(value)); } catch { /* ignore */ }
  return value;
}
