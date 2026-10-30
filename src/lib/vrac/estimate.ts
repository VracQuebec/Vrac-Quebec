// ============================================================
// ESTIMATION AUTOMATIQUE — parcours « Acheter du matériel en vrac »
// Traduit le formulaire en requête pour le moteur unique (quote-engine)
// puis retourne le résultat public. Aucun prix, aucun tarif, aucune
// carrière, aucun camion ici : tout provient des paramètres admin.
// ============================================================
import { useCallback, useRef, useState } from "react";
import { type PublicQuote, type QuoteRequest } from "@/lib/jsc/engine";
import { supabase } from "@/integrations/supabase/client";
import { findVracMaterial, type VracDraft } from "@/lib/vrac/catalog";
// Facteurs de conversion : source unique (aucune duplication).
import { FT_TO_M, IN_TO_M } from "@/lib/vrac/calculator";

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
  const cat = draft.catalog;
  if (cat && cat.priceStatus !== "prix_disponible") {
    return { unsupported: "Sur demande : cette variante n'a pas de tarif; notre équipe confirmera le prix.", fixStep: 0 };
  }
  const label = cat ? [cat.name, cat.variantLabel].filter(Boolean).join(" — ") : material?.name ?? "";
  if (!material && !cat) return { unsupported: "Matériau non sélectionné : choisissez un matériau à l'étape 1.", fixStep: 0 };

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
  const ident = cat
    ? { material_catalog_id: cat.materialId, material_variant_id: cat.variantId ?? null, granulometry_id: cat.granulometryId ?? null }
    : { material_slug: material!.slug };
  const base = { ...ident, address, delivery, truck_id: draft.truckId ?? null };

  if (draft.quantityMode === "tonnes") {
    const quantity = Number(draft.tonnes);
    if (!(quantity > 0)) {
      return { unsupported: "Quantité invalide : entrez une quantité supérieure à 0.", fixStep: 1 };
    }
    const unit = draft.quantityUnit === "verge" ? "verge" : draft.quantityUnit === "m3" ? "m3" : "tonne";
    if (needsDensity(unit) && ctx.hasDensity === false) {
      return {
        unsupported: `Densité du matériau non configurée : impossible de convertir des ${unit === "m3" ? "m³" : "verges³"} en tonnes pour « ${label} ». Saisissez plutôt la quantité en tonnes.`,
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
        unsupported: `Densité du matériau non configurée : impossible de convertir un volume en tonnes pour « ${label} ». Saisissez plutôt la quantité en tonnes.`,
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
    // Conversion historique rétablie côté serveur : voyages × capacité du camion
    // configuré en tonnes; tarifs matériau et transport existants ensuite.
    return { ...base, quantity: trips, unit: "voyage" };
  }

  // Quantité réellement inconnue : aucune donnée à calculer.
  return {
    unsupported: "Quantité non précisée : indiquez une quantité, des dimensions ou un nombre de voyages pour obtenir votre prix instantané.",
    fixStep: 1,
  };
}

/** Clé stable identifiant une demande de calcul (variante incluse). */
export function quoteKey(req: QuoteRequest | QuoteBlock): string {
  return JSON.stringify(req);
}

/** Paramètres d'envoi propres au parcours public (jeton CRM, anti-robot). */
export type EstimateSend = { leadToken: string; honeypot: string; formStartedAt: number };

/** Demande enregistrée dans le CRM pour ce parcours (numéro de demande). */
export type RecordedLead = { request_number: number | null; decision: string };

/** Réponses du formulaire conservées avec la demande (sans coordonnées en double). */
function formAnswers(draft: VracDraft) {
  const { contact: _c, ...rest } = draft;
  return { ...rest, comments: draft.contact.comments || null };
}

function quantityText(draft: VracDraft): string {
  if (draft.quantityMode === "tonnes") {
    const u = draft.quantityUnit === "m3" ? "m³" : draft.quantityUnit === "verge" ? "verges³" : "tonnes";
    return `${draft.tonnes} ${u}`;
  }
  if (draft.quantityMode === "voyages") return `${draft.trips} voyage(s)`;
  if (draft.quantityMode === "dimensions") return `${draft.dims.length} pi × ${draft.dims.width} pi × ${draft.dims.depth} po`;
  return "À déterminer";
}

export function useVracEstimate() {
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [quoteKeyState, setQuoteKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<RecordedLead | null>(null);
  /** true = la demande n'a PAS pu être enregistrée : rien n'est confirmé. */
  const [recordFailed, setRecordFailed] = useState(false);
  const [manual, setManual] = useState(false);

  const seq = useRef(0);
  const inFlight = useRef(false);
  const reset = useCallback(() => { seq.current++; inFlight.current = false; setQuote(null); setQuoteKey(null); setError(null); setLoading(false); setManual(false); }, []);
  /**
   * Demande de prix : le serveur enregistre la demande dans le CRM AVANT
   * le calcul, puis y inscrit le résultat. `forceManual` transmet une demande
   * incalculable (information manquante) pour traitement manuel.
   */
  const calculate = useCallback(async (draft: VracDraft, ctx: QuoteContext = {}, send?: EstimateSend, forceManual = false) => {
    const request = buildQuoteRequest(draft, ctx);
    const blocked = "unsupported" in request;
    if (blocked && !forceManual) {
      setQuote(null); setQuoteKey(null);
      setError(request.unsupported);
      return;
    }
    if (!send) return;
    if (inFlight.current) return; // double clic : une seule requête
    inFlight.current = true;
    const id = ++seq.current;
    setQuote(null); setQuoteKey(null);
    setLoading(true);
    setError(null);
    setRecordFailed(false);
    const material = findVracMaterial(draft.materialId);
    const cat = draft.catalog;
    const ident = blocked
      ? (cat ? { material_catalog_id: cat.materialId, material_variant_id: cat.variantId ?? null, granulometry_id: cat.granulometryId ?? null }
        : material ? { material_slug: material.slug } : {})
      : {};
    const payload = blocked
      ? {
        ...ident,
        address: draft.address.trim(),
        delivery: draft.addressLat != null && draft.addressLng != null ? { lat: draft.addressLat, lng: draft.addressLng } : null,
        quantity: draft.quantityMode === "tonnes" ? Number(draft.tonnes) : draft.quantityMode === "voyages" ? Number(draft.trips) : null,
        unit: draft.quantityMode === "voyages" ? "voyage" : draft.quantityUnit,
        manual_reason: (request as QuoteBlock).unsupported,
        custom_material: cat ? null : (draft.customMaterial || null),
      }
      : request;
    try {
      const { data, error: fnError } = await supabase.functions.invoke("quote-submit", {
        body: {
          action: "estimate",
          ...payload,
          lead_token: send.leadToken,
          website: send.honeypot,
          form_started_at: send.formStartedAt,
          material_label: cat ? [cat.name, cat.variantLabel].filter(Boolean).join(" — ") : material?.name ?? null,
          quantity_label: quantityText(draft),
          desired_date: draft.date || null,
          access_notes: draft.addressNotes || null,
          form_answers: formAnswers(draft),
          contact: { name: draft.contact.name, phone: draft.contact.phone, email: draft.contact.email, company: draft.contact.company || null, comments: draft.contact.comments || null },
        },
      });
      let body = data as Record<string, unknown> | null;
      if (fnError) {
        const ctxRes = (fnError as { context?: Response }).context;
        try { body = ctxRes && typeof ctxRes.clone === "function" ? await ctxRes.clone().json() : null; } catch { body = null; }
      }
      if (id !== seq.current) return;
      if (!body?.recorded) {
        setRecordFailed(true);
        setError(typeof body?.error === "string" ? body.error
          : "Votre demande n'a pas pu être enregistrée. Vos réponses sont conservées : réessayez dans un instant.");
        return;
      }
      setRecorded({ request_number: (body.request_number as number) ?? null, decision: String(body.decision ?? "en_attente") });
      if (body.ok && body.quote) {
        setQuote(body.quote as PublicQuote);
        setQuoteKey(quoteKey(request));
      } else {
        setManual(Boolean(body.manual) || blocked);
        setError(typeof body.error === "string" ? body.error : "Estimation indisponible pour le moment.");
      }
    } catch (e) {
      if (id !== seq.current) return;
      setRecordFailed(true);
      setError(e instanceof Error ? e.message : "Envoi impossible pour le moment.");
    } finally {
      if (id === seq.current) setLoading(false);
      inFlight.current = false;
    }
  }, []);

  /** Vrai seulement si l'estimation affichée correspond exactement au formulaire actuel. */
  const isFresh = useCallback((draft: VracDraft, ctx: QuoteContext = {}) =>
    quoteKeyState !== null && quoteKeyState === quoteKey(buildQuoteRequest(draft, ctx)), [quoteKeyState]);

  return { quote, loading, error, calculate, reset, isFresh, key: quoteKeyState, recorded, recordFailed, manual };
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