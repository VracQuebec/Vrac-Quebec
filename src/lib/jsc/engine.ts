// Client unique des moteurs Vrac Québec OS (Decision + Calculation).
// Tout appel d'estimation (site public, calculateur, CRM, commandes,
// répartition) passe ici : aucune interface ne refait un calcul.
import { supabase } from "@/integrations/supabase/client";

export type QuoteUnit = "tonne" | "verge" | "m3";

export interface QuoteRequest {
  material_id?: string;
  /** Identifiant lisible du matériau (parcours public) : résolu par le moteur. */
  material_slug?: string;
  quantity: number;
  unit?: QuoteUnit;
  /** Adresse texte (géocodée par le moteur) ou coordonnées déjà connues */
  address?: string;
  delivery?: { lat: number; lng: number; address?: string };
  /** Restreindre à un transporteur précis (usage interne) */
  carrier_id?: string | null;
  /** Restreindre à un fournisseur précis (usage interne) */
  supplier_id?: string | null;
  /** Camion choisi par le client (jsc_trucks.id). Absent = camion recommandé. */
  truck_id?: string | null;
}

export interface TaxLine { name: string; code: string | null; rate_percent: number; amount: number }

/** Données publiques : jamais de fournisseur, transporteur, coût ni marge. */
export interface PublicQuote {
  material: { id: string; name: string };
  quantity: number;
  unit: string;
  tonnage: number;
  trips: number;
  estimated_duration_minutes: number;
  /** Temps réellement facturé par Transport JSC (tous voyages inclus). */
  billable_minutes?: number;
  billable_hours?: number;
  delivery_address: string | null;
  pickup: { name: string | null };
  truck: { name: string | null; type: string | null; capacity_tonnes: number | null };
  distance_km: number;
  round_trip_km: number;
  material_amount: number;
  transport_amount: number;
  subtotal: number;
  taxes: TaxLine[];
  tax_total: number;
  total: number;
}

/** Bloc technique complet (décision, options écartées, coûts, marge) — administrateurs seulement. */
export interface TechnicalQuote extends Record<string, unknown> {
  selected: Record<string, unknown>;
  options: Record<string, unknown>[];
  decision_trace: Record<string, unknown>;
  settings_used: Record<string, number>;
}

export type QuoteResponse =
  | { ok: true; scope: "client"; engine_version: string; computed_at: string; quote: { public: PublicQuote } }
  | {
      ok: true; scope: "internal"; engine_version: string; computed_at: string;
      quote: { public: PublicQuote; technical: TechnicalQuote };
    };

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

/** Raccourci : les données affichables côté client, quel que soit le rôle. */
export async function getPublicQuote(request: QuoteRequest): Promise<PublicQuote> {
  const response = await getQuote(request);
  return response.quote.public;
}
