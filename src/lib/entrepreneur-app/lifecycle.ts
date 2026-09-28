// Étapes de suivi (Phase 1) — libellés exacts des valeurs `lifecycle_status`
// enregistrées en base. Aucune règle métier ici : le serveur décide.
import { supabase } from "@/integrations/supabase/client";

export type LifecycleTone = "pending" | "active" | "done" | "refused" | "neutral";

export const LIFECYCLE: Record<string, { label: string; tone: LifecycleTone; filter: "pending" | "active" | "done" | "cancelled" }> = {
  a_valider: { label: "À valider", tone: "pending", filter: "pending" },
  attente_confirmation_dompe: { label: "Attente confirmation dompe", tone: "pending", filter: "pending" },
  confirmee: { label: "Confirmée", tone: "active", filter: "active" },
  revalidation_requise: { label: "Revalidation requise", tone: "refused", filter: "pending" },
  prete_transport: { label: "Prête pour transport", tone: "active", filter: "active" },
  en_cours: { label: "En cours", tone: "active", filter: "active" },
  terminee: { label: "Terminée", tone: "done", filter: "done" },
  annulee: { label: "Annulée", tone: "refused", filter: "cancelled" },
  refusee: { label: "Refusée", tone: "refused", filter: "cancelled" },
  expiree: { label: "Expirée", tone: "neutral", filter: "cancelled" },
};

export const lifecycleMeta = (s: string | null | undefined) => (s ? LIFECYCLE[s] ?? null : null);

export const FIELD_LABELS: Record<string, string> = {
  site_address: "Adresse du chantier",
  loading_point: "Point de chargement",
  truck_type: "Type de camion",
  trailer_type: "Type de remorque",
  truck_config: "Configuration du camion",
  material_type: "Matériau",
  material_other: "Matériau (autre)",
  desired_date: "Date",
  desired_time: "Heure",
  quantity: "Quantité",
  quantity_unit: "Unité",
  estimated_trips: "Nombre de voyages",
  access_conditions: "Conditions d'accès",
  client_notes: "Notes",
  dump_submission_id: "Dompe",
};

export const ACTION_LABELS: Record<string, string> = {
  creee: "Demande créée",
  modifiee: "Demande modifiée",
  revalidation_requise: "Modification critique — revalidation requise",
  annulee: "Demande annulée",
  annulation_demandee: "Demande d'annulation envoyée",
  transition: "Changement d'étape",
};

/** Mêmes conditions que le serveur, uniquement pour afficher les bons boutons. */
export const canEdit = (r: { lifecycle_status?: unknown; driver_id?: unknown; truck_id?: unknown }) =>
  !["terminee", "annulee", "refusee", "expiree", "en_cours", "prete_transport"].includes(String(r.lifecycle_status)) && !r.driver_id && !r.truck_id;

export const cancelMode = (r: { lifecycle_status?: unknown; driver_id?: unknown; truck_id?: unknown }): "direct" | "request" | "none" => {
  const s = String(r.lifecycle_status);
  if (["terminee", "annulee", "refusee", "expiree"].includes(s)) return "none";
  if (["prete_transport", "en_cours"].includes(s) || r.driver_id || r.truck_id) return "request";
  return "direct";
};

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;

export const ERRORS: Record<string, string> = {
  not_authorized: "Cette demande ne fait pas partie de votre compte.",
  not_editable: "Cette demande ne peut plus être modifiée.",
  transport_assigned: "Un transport est déjà assigné : contactez Vrac Québec.",
  reason_required: "Le motif est obligatoire.",
  not_cancellable: "Cette demande ne peut plus être annulée.",
  field_not_allowed: "Un des champs ne peut pas être modifié.",
};
export const friendlyError = (m: string) => {
  const key = Object.keys(ERRORS).find((k) => m.includes(k));
  return key ? ERRORS[key] : "L'opération n'a pas pu être enregistrée. Réessayez.";
};

export const updateRequest = (id: string, changes: Record<string, unknown>) => rpc("request_update", { _id: id, _changes: changes });
export const cancelRequest = (id: string, reason: string) => rpc("request_cancel", { _id: id, _reason: reason });
export const askCancellation = (id: string, reason: string) => rpc("request_cancel_request", { _id: id, _reason: reason });
