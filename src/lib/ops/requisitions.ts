import { z } from "zod";
import { requestWorkbenchCall } from "@/lib/parcours/request-edit";
export const requisitionStates = ["prepared", "transmitted", "accepted", "refused", "running", "completed", "cancelled", "incident", "revalidation"] as const;
export type RequisitionState = typeof requisitionStates[number];
export const requisitionLabels: Record<RequisitionState, string> = { prepared: "Préparée", transmitted: "Transmise", accepted: "Acceptée", refused: "Refusée", running: "En cours", completed: "Terminée", cancelled: "Annulée", incident: "Incident", revalidation: "À revalider" };
export const requisitionSchema = z.object({ company_id: z.string().uuid(), request_id: z.string().uuid(), driver_id: z.string().uuid(), truck_id: z.string().uuid(), destination_id: z.string().uuid(), material: z.string().min(1).max(120), quantity: z.number().positive(), unit: z.string().min(1).max(40), starts_at: z.string().datetime({ offset: true }), instructions: z.string().max(4000) }).strict();
export type RequisitionDraft = z.infer<typeof requisitionSchema>;
export type RequisitionOptions = { requests: Array<{id:string;label:string;version:number}>, drivers: Array<{id:string;label:string}>, trucks: Array<{id:string;label:string}>, destinations: Array<{id:string;request_id:string;label:string}> };
export type Requisition = { id: string; request_number: string; company_id: string; version: number; state: RequisitionState; values: RequisitionDraft; destination: string; actions: string[]; history: Array<{ action: string; created_at: string; reason: string | null }> };
export async function requisitionAction(row: Requisition, action: string, reason: string, operation: string, call = requestWorkbenchCall) {
  if (!row.actions.includes(action)) throw new Error("Cette action n’est pas autorisée dans l’état actuel.");
  const result = await call<{ id: string; version: number; state: RequisitionState }>("requisition_action", { _id: row.id, _company: row.company_id, _version: row.version, _action: action, _reason: reason, _operation: operation, _confirmed: true });
  if (result.id !== row.id || result.version < row.version) throw new Error("Résultat non confirmé pour cette réquisition.");
  return result;
}