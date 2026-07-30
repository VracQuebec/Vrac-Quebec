// Client unique du moteur de calcul Vrac Québec.
// Tout appel d'estimation (site public, CRM, futurs canaux) passe ici :
// aucun calcul de prix ne doit être refait côté interface.
import { supabase } from "@/integrations/supabase/client";

export type QuoteUnit = "tonne" | "verge" | "m3";

export interface QuoteRequest {
  material_id: string;
  quantity: number;
  unit?: QuoteUnit;
  /** Adresse texte (géocodée par le moteur) ou coordonnées déjà connues */
  address?: string;
  delivery?: { lat: number; lng: number; address?: string };
  /** Restreindre à un transporteur précis (usage interne) */
  carrier_id?: string | null;
}

export interface ClientQuote {
  material: { id: string; name: string };
  tonnage: number;
  trips: number;
  estimated_duration_minutes: number;
  delivery_address: string | null;
  total_before_tax: number;
  computed_at: string;
}

/** Résultat complet (fournisseur, transporteur, camion, coûts) — administrateurs seulement. */
export interface InternalQuote extends Record<string, unknown> {
  selected: Record<string, unknown>;
  candidates_evaluated: Record<string, unknown>[];
  totals: {
    transport_cost: number;
    material_cost: number;
    surcharges: number;
    margin: number;
    total_before_tax: number;
  };
}

export type QuoteResponse =
  | { ok: true; scope: "client"; quote: ClientQuote }
  | { ok: true; scope: "internal"; quote: InternalQuote };

export async function getQuote(request: QuoteRequest): Promise<QuoteResponse> {
  const { data, error } = await supabase.functions.invoke("quote-engine", {
    body: { unit: "tonne", ...request },
  });

  if (error) {
    const details =
      typeof (error as { context?: { text?: () => Promise<string> } }).context?.text === "function"
        ? await (error as { context: { text: () => Promise<string> } }).context.text()
        : error.message;
    let message = details;
    try {
      const parsed = JSON.parse(details);
      if (parsed?.error) message = parsed.error;
    } catch { /* réponse non JSON */ }
    throw new Error(message || "Le moteur de calcul n'a pas pu produire d'estimation.");
  }

  if (!data?.ok) throw new Error(data?.error ?? "Estimation indisponible.");
  return data as QuoteResponse;
}
