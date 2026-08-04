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

/** Convertit la quantité saisie en une entrée compréhensible par le moteur. */
export function buildQuoteRequest(draft: VracDraft): QuoteRequest | { unsupported: string } {
  const material = findVracMaterial(draft.materialId);
  if (!material) return { unsupported: "Sélectionnez d'abord un matériau." };
  const address = draft.address.trim();
  if (address.length < 5) return { unsupported: "Adresse de livraison requise." };

  if (draft.quantityMode === "tonnes") {
    const tonnes = Number(draft.tonnes);
    if (!(tonnes > 0)) return { unsupported: "Quantité invalide." };
    return { material_slug: material.slug, quantity: tonnes, unit: "tonne", address };
  }

  if (draft.quantityMode === "dimensions") {
    const l = Number(draft.dims.length) * FT_TO_M;
    const w = Number(draft.dims.width) * FT_TO_M;
    const d = Number(draft.dims.depth) * IN_TO_M;
    const m3 = l * w * d;
    if (!(m3 > 0)) return { unsupported: "Dimensions invalides." };
    return { material_slug: material.slug, quantity: Number(m3.toFixed(3)), unit: "m3", address };
  }

  // Voyages / quantité inconnue : le nombre de tonnes dépend du camion retenu,
  // c'est notre équipe qui confirme la quantité avant l'estimation officielle.
  return {
    unsupported:
      draft.quantityMode === "voyages"
        ? "Indiquez un tonnage ou des dimensions pour obtenir une estimation automatique."
        : "Nous confirmerons la quantité avec vous avant de calculer l'estimation.",
  };
}

export function useVracEstimate() {
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculate = useCallback(async (draft: VracDraft) => {
    const request = buildQuoteRequest(draft);
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