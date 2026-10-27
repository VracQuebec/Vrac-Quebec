import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

// Services installed on the server (0239–0245). Exposed in the preview build only until publication is
// separately authorized; never enabled by a URL flag. The server remains the sole authority on rights.
export const REQUEST_WORKBENCH_INSTALLED = import.meta.env.DEV === true;
export const requestFields = ["address", "materials", "material_description", "quantity_value", "quantity_unit", "desired_date", "desired_time", "truck_type_key", "access_instructions"] as const;
export const requestEditSchema = z.object({
  address: z.string().trim().min(5).max(500),
  materials: z.array(z.string().trim().min(1).max(120)).min(1).max(15),
  material_description: z.string().max(4000),
  quantity_value: z.number().positive().nullable(),
  quantity_unit: z.string().min(1).max(40),
  desired_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  desired_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
  truck_type_key: z.string().max(120).nullable(),
  access_instructions: z.string().max(4000),
}).strict();
export type RequestEdit = z.infer<typeof requestEditSchema>;
export type EditableRequest = { id: string; company_id: string; version: number; editable: boolean; reason: string | null; values: RequestEdit; history: Array<{ action: string; version: number; created_at: string; details: { changed?: string[] } }> };
export const requestFieldLabels: Record<typeof requestFields[number], string> = {
  address: "Chantier / adresse", materials: "Matériaux", material_description: "Composition et précisions", quantity_value: "Quantité", quantity_unit: "Unité d’origine", desired_date: "Date demandée", desired_time: "Heure demandée", truck_type_key: "Camion", access_instructions: "Contraintes et consignes",
};
export function changedRequestFields(before: RequestEdit, after: RequestEdit): Partial<RequestEdit> {
  requestEditSchema.parse(after);
  return Object.fromEntries(requestFields.filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k])).map(k => [k, after[k]]));
}
export async function requestWorkbenchCall<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!REQUEST_WORKBENCH_INSTALLED) throw new Error("La modification étendue et les réquisitions sont préparées, mais leur service n’est pas installé. Aucun changement enregistré.");
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Résultat non confirmé. Relisez le dossier avant une nouvelle tentative.");
  return data as T;
}
// Rattachement des anciennes demandes : préparé, non installé ; décision toujours prise par l'administration sur preuve.
export const REQUEST_OWNERSHIP_INSTALLED = false;
export const NOT_LINKED_MESSAGE = "Cette demande n’est pas encore rattachée à votre entreprise. Les nouvelles demandes faites depuis votre compte le sont automatiquement ; les anciennes sont rattachées par l’équipe Vrac Québec après vérification d’une preuve, jamais d’après un nom ou un courriel.";
export function isNotLinkedError(message: string) { return /Dossier ou entreprise non autorisés/.test(message); }
export type OwnershipState = "rattachee" | "non_rattachee" | "verification_en_attente" | "verification_refusee";
export async function requestOwnershipVerification(id: string, company: string, note: string, call = (name: string, args: Record<string, unknown>) => { if (!REQUEST_OWNERSHIP_INSTALLED) throw new Error("La demande de vérification du rattachement est préparée, mais son service n’est pas encore installé. Aucune demande envoyée."); return requestWorkbenchCall<{ ok: boolean; state: OwnershipState }>(name, args); }) {
  if (note.length > 1000) throw new Error("Précision trop longue (1000 caractères maximum).");
  const result = await call("submission_ownership_request", { _id: id, _company: company, _note: note.trim() });
  if (!result?.ok || result.state !== "verification_en_attente") throw new Error("Demande non confirmée par le serveur. Aucune réussite annoncée.");
  return result;
}
export async function saveRequestEdit(row: EditableRequest, after: RequestEdit, key: string, call = requestWorkbenchCall) {
  const result = await call<{ id: string; version: number; revalidation: boolean }>("submission_edit_save", {
    _id: row.id, _company: row.company_id, _version: row.version, _changes: changedRequestFields(row.values, after), _operation: key, _confirmed: true,
  });
  if (result.id !== row.id || result.version < row.version) throw new Error("Le serveur n’a pas confirmé le même dossier. Aucune réussite annoncée.");
  return result;
}