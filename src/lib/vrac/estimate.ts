// ============================================================
// ESTIMATION AUTOMATIQUE — parcours « Acheter du matériel en vrac »
// Traduit le formulaire en requête pour le moteur unique (quote-engine)
// puis retourne le résultat public. Aucun prix, aucun tarif, aucune
// carrière, aucun camion ici : tout provient des paramètres admin.
// ============================================================
import { useCallback, useState } from "react";
import { getPublicQuote, type PublicQuote, type QuoteRequest } from "@/lib/jsc/engine";
import { findVracMaterial, type VracDraft } from "@/lib/vrac/catalog";

const FT_TO_M = 0.3048;
const IN_TO_M = 0.0254;

/**
 * Contexte administrable nécessaire à certaines conversions.
 * `truckCapacityTonnes` : capacité du camion de référence (voyages → tonnes).
 * `hasDensity` : densité configurée pour le matériau (volume → tonnes).
 */
export type QuoteContext = {
  truckCapacityTonnes?: number | null;
  hasDensity?: boolean;
};

/** Raison exacte pour laquelle le calcul est impossible (jamais de message générique). */
export type QuoteBlock = { unsupported: string; fixStep?: number };

const needsDensity = (unit: string) => unit === "m3" || unit === "verge";

/** Convertit la quantité saisie en une entrée compréhensible par le moteur. */
export function buildQuoteRequest(draft: VracDraft, ctx: QuoteContext = {}): QuoteRequest | QuoteBlock {
  const material = findVracMaterial(draft.materialId);
  if (!material) return { unsupported: "Matériau non sélectionné : choisissez un matériau à l'étape 1.", fixStep: 0 };

  const address = draft.address.trim();
  if (address.length < 5) {
    return { unsupported: "Adresse de livraison manquante : indiquez l'adresse où livrer.", fixStep: 2 };
  }
  if (draft.addressLat == null || draft.addressLng == null) {
    return {
      unsupported: "Adresse de livraison invalide : sélectionnez une adresse proposée par Google pour obtenir la distance exacte.",
      fixStep: 2,
    };
  }
  const delivery = { lat: draft.addressLat, lng: draft.addressLng, address };
  // Le camion choisi par le client prime sur le camion recommandé.
  const base = { material_slug: material.slug, address, delivery, truck_id: draft.truckId ?? null };

  if (draft.quantityMode === "tonnes") {
    const quantity = Number(draft.tonnes);
    if (!(quantity > 0)) {
      return { unsupported: "Quantité invalide : entrez une quantité supérieure à 0.", fixStep: 1 };
    }
    const unit = draft.quantityUnit === "verge" ? "verge" : draft.quantityUnit === "m3" ? "m3" : "tonne";
    if (needsDensity(unit) && ctx.hasDensity === false) {
      return {
        unsupported: `Densité du matériau non configurée : impossible de convertir des ${unit === "m3" ? "m³" : "verges³"} en tonnes pour « ${material.name} ». Saisissez plutôt la quantité en tonnes.`,
        fixStep: 1,
      };
    }
    // Le moteur convertit lui-même m³ / verges³ en tonnes selon la densité du matériau.
    return { ...base, quantity, unit };
  }

  if (draft.quantityMode === "dimensions") {
    const l = Number(draft.dims.length) * FT_TO_M;
    const w = Number(draft.dims.width) * FT_TO_M;
    const d = Number(draft.dims.depth) * IN_TO_M;
    const m3 = l * w * d;
    if (!(m3 > 0)) {
      return { unsupported: "Dimensions invalides : longueur, largeur et épaisseur doivent être supérieures à 0.", fixStep: 1 };
    }
    if (ctx.hasDensity === false) {
      return {
        unsupported: `Densité du matériau non configurée : impossible de convertir un volume en tonnes pour « ${material.name} ». Saisissez plutôt la quantité en tonnes.`,
        fixStep: 1,
      };
    }
    return { ...base, quantity: Number(m3.toFixed(3)), unit: "m3" };
  }

  if (draft.quantityMode === "voyages") {
    const trips = Number(draft.trips);
    if (!(trips > 0)) {
      return { unsupported: "Nombre de voyages invalide : entrez un nombre supérieur à 0.", fixStep: 1 };
    }
    const capacity = Number(ctx.truckCapacityTonnes);
    if (!(capacity > 0)) {
      return {
        unsupported: "Capacité de camion non configurée : impossible de convertir des voyages en tonnes. Indiquez plutôt une quantité.",
        fixStep: 1,
      };
    }
    // Un voyage = la capacité du camion de référence configuré en administration.
    return { ...base, quantity: Number((trips * capacity).toFixed(3)), unit: "tonne" };
  }

  // Quantité réellement inconnue : aucune donnée à calculer.
  return {
    unsupported: "Quantité non précisée : indiquez une quantité, des dimensions ou un nombre de voyages pour obtenir votre prix instantané.",
    fixStep: 1,
  };
}

export function useVracEstimate() {
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculate = useCallback(async (draft: VracDraft, ctx: QuoteContext = {}) => {
    const request = buildQuoteRequest(draft, ctx);
    if ("unsupported" in request) {
      setQuote(null);
      setError(request.unsupported);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setQuote(await getPublicQuote(request));
    } catch (e) {
      setQuote(null);
      setError(e instanceof Error ? e.message : "Estimation indisponible pour le moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  return { quote, loading, error, calculate };
}

const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });
export const formatMoney = (value: number) => money.format(value);
export const formatKm = (value: number) => `${value.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} km`;

/** Temps facturable affiché en heures et minutes (ex. « 2 h 15 »). */
export const formatDuration = (minutes: number) => {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
};