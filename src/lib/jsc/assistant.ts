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
  lead_token?: string;
  truck_id?: string | null;
  desired_date?: string | null;
  contact: AssistantContact;
  attribution?: Record<string, string | null>;
  website?: string;
  form_started_at?: number;
}) =>
  call<{ request_number: string; submission_id?: string | null; deduplicated?: boolean; quote: { public: PublicQuote } }>(
    { action: "submit", ...input },
  );

/** Réponse de la demande de prix : `recorded` = demande enregistrée au CRM. */
export type RecordedEstimate = {
  recorded: boolean; ok: boolean; request_number?: number | null;
  quote?: PublicQuote; error?: string; manual?: boolean; decision?: string;
};

async function callSubmit(body: Record<string, unknown>): Promise<RecordedEstimate> {
  const { data, error } = await supabase.functions.invoke("quote-submit", { body });
  let res = data as RecordedEstimate | null;
  if (error) {
    const ctx = (error as { context?: Response }).context;
    try { res = ctx && typeof ctx.clone === "function" ? await ctx.clone().json() : null; } catch { res = null; }
  }
  return res ?? { recorded: false, ok: false, error: "Service momentanément indisponible." };
}

/** Enregistre la demande dans le CRM AVANT le calcul, puis y ajoute le résultat. */
export const recordAndEstimate = (input: {
  lead_token: string; material_id: string; quantity: number; unit: string; address: string;
  truck_id?: string | null; desired_date?: string | null; contact: AssistantContact;
  quantity_label: string; material_label: string; form_answers: Record<string, unknown>;
  website?: string; form_started_at?: number;
}) => callSubmit({ action: "estimate", source: "soumission", ...input });

/** Refus explicite par le client : aucune écriture du statut CRM, aucun courriel. */
export const declineEstimate = (lead_token: string) =>
  callSubmit({ action: "decision", decision: "refusee", lead_token });
