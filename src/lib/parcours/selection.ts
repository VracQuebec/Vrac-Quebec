// ============================================================
// RATTACHEMENT DE LA SÉLECTION À LA DEMANDE EXISTANTE (CRM).
// La sélection du comparateur est écrite sur la submission déjà
// créée, via la fonction sécurisée `save_comparateur_selection`.
// Aucune nouvelle demande n'est créée : l'écriture est un UPDATE
// par `submissionId`, donc idempotente par construction.
// Aucune valeur n'est inventée : un champ absent reste absent.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { ComparateurSelection } from "@/lib/parcours/handoff";

export interface PersistedSelection {
  submissionId: string;
  submissionNumber: number | null;
  siteId: string | null;
  siteLabel: string | null;
  siteAddress: string | null;
  siteLat: number | null;
  siteLng: number | null;
  material: string | null;
  quantity: number | null;
  unit: string | null;
  tonnes: number | null;
  trips: number | null;
  truck: string | null;
  distanceKm: number | null;
  durationMinutes: number | null;
  desiredDate: string | null;
  timeframe: string | null;
  accessDetails: unknown;
  updatedAt: string | null;
}

export type PersistFailure =
  | "missing_submission"
  | "missing_selection"
  | "save_failed";

export type PersistResult =
  | { ok: true; saved: PersistedSelection }
  | { ok: false; code: PersistFailure; message: string };

/** Client minimal requis (facilite les tests unitaires). */
export interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}

const numOrNull = (v: string | number | null | undefined): number | null => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
};

const strOrNull = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

/** Date ISO (YYYY-MM-DD) uniquement : rien d'autre n'est envoyé au CRM. */
const dateOrNull = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
};

export const mapPersisted = (row: Record<string, unknown> | null): PersistedSelection | null => {
  if (!row || typeof row !== "object" || !row.submission_id) return null;
  return {
    submissionId: String(row.submission_id),
    submissionNumber: numOrNull(row.submission_number as number | null),
    siteId: (row.selected_site_id as string | null) ?? null,
    siteLabel: (row.selected_site_label as string | null) ?? null,
    siteAddress: (row.selected_site_address as string | null) ?? null,
    siteLat: numOrNull(row.selected_site_latitude as number | null),
    siteLng: numOrNull(row.selected_site_longitude as number | null),
    material: (row.material as string | null) ?? null,
    quantity: numOrNull(row.quantity as number | null),
    unit: (row.unit as string | null) ?? null,
    tonnes: numOrNull(row.tonnage as number | null),
    trips: numOrNull(row.trips as number | null),
    truck: (row.truck as string | null) ?? null,
    distanceKm: numOrNull(row.distance_km as number | null),
    durationMinutes: numOrNull(row.duration_minutes as number | null),
    desiredDate: (row.desired_date as string | null) ?? null,
    timeframe: (row.timeframe as string | null) ?? null,
    accessDetails: row.access_details ?? null,
    updatedAt: (row.selection_updated_at as string | null) ?? null,
  };
};

/**
 * Enregistre (ou met à jour) la sélection sur la demande existante.
 * Rejoué deux fois avec les mêmes valeurs : même résultat, aucun doublon.
 */
export const persistSelection = async (
  sel: ComparateurSelection | null,
  client: RpcClient = supabase as unknown as RpcClient,
): Promise<PersistResult> => {
  if (!sel || !sel.siteId) {
    return { ok: false, code: "missing_selection", message: "Aucun site sélectionné." };
  }
  if (!sel.submissionId) {
    return {
      ok: false,
      code: "missing_submission",
      message:
        "Cette sélection n'est rattachée à aucune demande existante : reprenez le parcours depuis votre demande.",
    };
  }

  const { data, error } = await client.rpc("save_comparateur_selection", {
    p_submission_id: sel.submissionId,
    p_site_id: sel.siteId,
    p_site_label: strOrNull(sel.siteLabel),
    p_material: strOrNull(sel.materialLabel) ?? strOrNull(sel.materialKey),
    p_quantity: numOrNull(sel.quantityValue),
    p_unit: strOrNull(sel.quantityUnit),
    p_tonnage: sel.tonnes ?? null,
    p_trips: sel.trips ?? null,
    p_truck: strOrNull(sel.truckLabel) ?? strOrNull(sel.truckKey),
    p_distance_km: sel.distanceKm ?? null,
    p_duration_minutes: sel.durationMinutes != null ? Math.round(sel.durationMinutes) : null,
    p_desired_date: dateOrNull(sel.desiredDate),
    p_timeframe: strOrNull(sel.timeframe),
    p_access_details: sel.accessDetails?.length ? sel.accessDetails : null,
  });

  if (error) return { ok: false, code: "save_failed", message: error.message };

  const saved = mapPersisted(data as Record<string, unknown> | null);
  if (!saved) {
    return { ok: false, code: "save_failed", message: "Réponse inattendue du serveur." };
  }
  return { ok: true, saved };
};

/** Relit la sélection réellement enregistrée sur la demande (après reload). */
export const fetchPersistedSelection = async (
  submissionId: string | null,
  client: RpcClient = supabase as unknown as RpcClient,
): Promise<PersistedSelection | null> => {
  if (!submissionId) return null;
  const { data, error } = await client.rpc("get_comparateur_selection", {
    p_submission_id: submissionId,
  });
  if (error) return null;
  return mapPersisted(data as Record<string, unknown> | null);
};
