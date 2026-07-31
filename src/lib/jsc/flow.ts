// ============================================================
// VRAC QUÉBEC OS — Moteur de conversion documentaire (client)
// ------------------------------------------------------------
// Aucune règle de calcul ici : toutes les conversions
// (Estimation → Soumission → Commande → Livraisons → Facture)
// sont exécutées côté serveur, dans une transaction unique.
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export type FlowStage = "estimate" | "quote" | "order";

export interface FlowResult {
  next: "quote" | "order" | "invoice";
  id: string;
  deliveries?: number;
}

type RpcFn = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const rpc = supabase.rpc as unknown as RpcFn;

/** Fait avancer un dossier d'une étape : crée automatiquement le document suivant. */
export async function advanceFlow(stage: FlowStage, id: string): Promise<FlowResult> {
  const { data, error } = await rpc("jsc_advance_flow", { _entity_type: stage, _entity_id: id });
  if (error) throw new Error(error.message);
  return data as FlowResult;
}

/** Retient une estimation (une seule par demande). */
export async function selectEstimate(estimateId: string): Promise<string> {
  const { data, error } = await rpc("jsc_select_estimate", { _estimate_id: estimateId });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Génère (ou récupère) les livraisons d'une commande, un enregistrement par voyage. */
export async function generateDeliveries(orderId: string): Promise<number> {
  const { data, error } = await rpc("jsc_generate_deliveries", { _order_id: orderId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export const NEXT_STAGE_LABEL: Record<FlowStage, string> = {
  estimate: "Créer la soumission",
  quote: "Créer la commande",
  order: "Créer la facture",
};

export const NEXT_STAGE_DONE: Record<FlowStage, string> = {
  estimate: "Soumission créée",
  quote: "Commande et livraisons créées",
  order: "Facture créée",
};
