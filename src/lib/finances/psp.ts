// FIN-11 — interface prestataire de paiement. Un seul fournisseur : le simulateur (aucun appel externe).
// Toutes les décisions (rattachement, doublon, transitions, règlement) sont prises côté serveur par fin_psp_sim_event.
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type PspEventType = "payment.pending" | "payment.succeeded" | "payment.failed" | "payment.canceled" | "fee.known"
  | "refund.succeeded" | "payment.returned" | "dispute.opened" | "dispute.closed" | "payout.paid";
export type PspEvent = { event_id: string; type: PspEventType; payment_ref: string; invoice_id?: string; amount?: string; fee?: string;
  currency: string; occurred_at: string; adjustment_ref?: string; result?: "won" | "lost" };

/** Contrat commun du futur connecteur réel : seule l'implémentation « simulateur » existe. */
export interface PaymentProvider { readonly id: "simulateur"; readonly real: false; send(company: string, ev: PspEvent): Promise<J> }

export const simulator: PaymentProvider = {
  id: "simulateur", real: false,
  async send(company, ev) {
    const { data, error } = await db.rpc("fin_psp_sim_event", { _company: company, _ev: ev });
    if (error) throw Object.assign(new Error(error.message || "Erreur serveur"), { code: error.code });
    return data;
  },
};

export async function overview(company: string): Promise<J> {
  const { data, error } = await db.rpc("fin_psp_overview", { _company: company });
  if (error) throw Object.assign(new Error(error.message || "Erreur serveur"), { code: error.code });
  return data;
}

export const STATUS: Record<string, string> = { pending: "En cours (non confirmé)", succeeded: "Confirmé", failed: "Échoué", canceled: "Annulé" };
export const OUTCOME: Record<string, string> = { applied: "Appliqué", no_effect: "Sans effet (doublon)", stale: "Ignoré (reçu en retard)", review: "À examiner — aucune écriture" };
export const TYPE: Record<string, string> = { "payment.pending": "Paiement en cours", "payment.succeeded": "Paiement confirmé", "payment.failed": "Paiement échoué",
  "payment.canceled": "Paiement annulé", "fee.known": "Frais connus", "refund.succeeded": "Remboursement", "payment.returned": "Paiement retourné",
  "dispute.opened": "Litige ouvert", "dispute.closed": "Litige clos", "payout.paid": "Versement du net" };

export const newRef = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;
