// Client de l'Assistant intelligent de soumission.
// Aucune logique métier ici : uniquement le transport vers l'API
// `quote-assistant`, qui appelle les moteurs Vrac Québec OS.
import { supabase } from "@/integrations/supabase/client";
import type { PublicQuote } from "./engine";

export interface AssistantMaterial {
  id: string;
  name: string;
  code: string | null;
  category_id: string | null;
  category: string | null;
  unit: string;
  density_kg_per_m3: number | null;
  public_description: string | null;
}

export interface AssistantCategory {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
}

export interface AssistantRecommendation {
  material: AssistantMaterial;
  reason: string | null;
}

/** Camions actifs (paramétrables dans le panneau administrateur) — utilisés
 *  uniquement pour convertir « nombre de voyages » en tonnage. */
export interface AssistantTruck {
  id: string;
  name: string;
  truck_type: string | null;
  capacity_tonnes: number;
  capacity_m3: number | null;
}

export interface AssistantContact {
  name: string;
  phone: string;
  email: string;
  company?: string;
  comments?: string;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("quote-assistant", { body });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
    if (typeof ctx?.text === "function") {
      const raw = await ctx.text();
      try { message = JSON.parse(raw)?.error ?? raw; } catch { message = raw || message; }
    }
    throw new Error(message || "Service momentanément indisponible.");
  }
  if (!data?.ok) throw new Error(data?.error ?? "Service momentanément indisponible.");
  return data as T;
}

export const fetchCatalog = () =>
  call<{ categories: AssistantCategory[]; materials: AssistantMaterial[]; trucks?: AssistantTruck[] }>({
    action: "catalog",
  });

export const askAdvisor = (answers: Record<string, string>) =>
  call<{ recommendations: AssistantRecommendation[] }>({ action: "advise", answers });

export const requestEstimate = (input: {
  material_id: string;
  quantity: number;
  unit: "tonne" | "verge" | "m3";
  address: string;
}) => call<{ quote: { public: PublicQuote }; engine_version: string }>({ action: "quote", ...input });

export const confirmEstimate = (input: {
  material_id: string;
  quantity: number;
  unit: "tonne" | "verge" | "m3";
  address: string;
  desired_date?: string | null;
  contact: AssistantContact;
}) => call<{ request_number: string; quote: { public: PublicQuote } }>({ action: "submit", ...input });
