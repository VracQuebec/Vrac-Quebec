// ============================================================
// CRM ACTIONNABLE — validation admin du site sélectionné puis
// passage à la demande de transport.
// Aucune nouvelle submission n'est créée : la validation est un
// UPDATE idempotent sur la demande existante (RPC sécurisée
// `validate_selected_site`, réservée aux administrateurs).
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { normalizeMaterial, type MaterialKey } from "@/lib/entrepreneur/site-match";

export interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}

export type ValidationFailure =
  | "missing_submission"
  | "missing_selection"
  | "not_authorized"
  | "not_found"
  | "save_failed";

export interface ValidatedSite {
  submissionId: string;
  siteId: string | null;
  siteLabel: string | null;
  siteAddress: string | null;
  validatedAt: string | null;
}

export type ValidationResult =
  | { ok: true; validated: ValidatedSite }
  | { ok: false; code: ValidationFailure; message: string };

const MESSAGES: Record<ValidationFailure, string> = {
  missing_submission: "Aucune demande valide : la validation est impossible.",
  missing_selection: "Aucun site n'est sélectionné sur cette demande : validation impossible.",
  not_authorized: "Action réservée aux administrateurs.",
  not_found: "Cette demande est introuvable.",
  save_failed: "La validation n'a pas pu être enregistrée.",
};

/** Traduit l'erreur Postgres en code applicatif (aucune fausse confirmation). */
export const classifyError = (message: string): ValidationFailure => {
  const m = (message || "").toLowerCase();
  if (m.includes("not_authorized") || m.includes("permission")) return "not_authorized";
  if (m.includes("no_site_selected")) return "missing_selection";
  if (m.includes("submission_not_found")) return "not_found";
  if (m.includes("submission_id_required")) return "missing_submission";
  return "save_failed";
};

/**
 * Valide le site sélectionné sur la demande EXISTANTE.
 * Rejouée (double clic, revalidation) : même résultat, aucun doublon.
 */
export const validateSelectedSite = async (
  submissionId: string | null | undefined,
  opts: { hasSelection?: boolean } = {},
  client: RpcClient = supabase as unknown as RpcClient,
): Promise<ValidationResult> => {
  if (!submissionId) {
    return { ok: false, code: "missing_submission", message: MESSAGES.missing_submission };
  }
  if (opts.hasSelection === false) {
    return { ok: false, code: "missing_selection", message: MESSAGES.missing_selection };
  }

  const { data, error } = await client.rpc("validate_selected_site", {
    p_submission_id: submissionId,
  });
  if (error) {
    const code = classifyError(error.message);
    return { ok: false, code, message: MESSAGES[code] };
  }
  const row = data as Record<string, unknown> | null;
  if (!row || !row.submission_id) {
    return { ok: false, code: "save_failed", message: MESSAGES.save_failed };
  }
  return {
    ok: true,
    validated: {
      submissionId: String(row.submission_id),
      siteId: (row.selected_site_id as string | null) ?? null,
      siteLabel: (row.selected_site_label as string | null) ?? null,
      siteAddress: (row.selected_site_address as string | null) ?? null,
      validatedAt: (row.site_validated_at as string | null) ?? null,
    },
  };
};

/* ---------------- Transmission vers /demande-transport ---------------- */

const MATERIAL_TO_WIZARD: Record<MaterialKey, string> = {
  terre: "terre_propre",
  terre_vegetale: "terre_propre",
  sable: "sable",
  gravier: "gravier",
  pierre: "pierre",
  roc: "roc",
  beton: "beton",
  asphalte: "asphalte",
  remblai: "materiaux_mixtes",
  autre: "autre",
};

export interface TransportPrefillSource {
  id?: string | null;
  submission_id?: string | null;
  selected_site_id?: string | null;
  selected_site_label?: string | null;
  quote_material?: string | null;
  material?: string | null;
  materials?: string[] | null;
  quote_quantity?: number | string | null;
  quantity?: number | string | null;
  quote_unit?: string | null;
  unit?: string | null;
  quote_trips?: number | null;
  trips?: number | null;
  quote_truck?: string | null;
  truck?: string | null;
  quote_distance_km?: number | null;
  distance_km?: number | null;
  quote_duration_minutes?: number | null;
  duration_minutes?: number | null;
  desired_date?: string | null;
  delivery_timeframe?: string | null;
  timeframe?: string | null;
  formatted_address?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  access_details?: unknown;
  access_heavy_truck?: string | null;
  name?: string | null;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface TransportPrefill {
  submissionId: string | null;
  dumpId: string | null;
  dumpName: string | null;
  material: string;
  quantity: string;
  unit: string;
  trips: string;
  truckType: string;
  address: string;
  coords: { lat: number; lng: number } | null;
  desiredDate: string;
  timeframe: string;
  accessDetails: unknown;
  accessHeavyTruck: string;
  clientName: string;
  clientCompany: string;
  clientPhone: string;
  clientEmail: string;
  distance_km: number | null;
  duration_minutes: number | null;
}

const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Construit le préremplissage de /demande-transport à partir de la DEMANDE
 * (source de vérité). Aucune valeur inventée : un champ absent reste vide.
 */
export const buildTransportPrefill = (row: TransportPrefillSource | null): TransportPrefill | null => {
  if (!row) return null;
  const submissionId = str(row.id) || str(row.submission_id) || null;
  const rawMaterial =
    str(row.quote_material) || str(row.material) || str((row.materials ?? [])[0] ?? "");
  const key = rawMaterial ? normalizeMaterial(rawMaterial) : null;
  const lat = num(row.latitude);
  const lng = num(row.longitude);

  return {
    submissionId,
    dumpId: str(row.selected_site_id) || null,
    dumpName: str(row.selected_site_label) || null,
    material: key ? MATERIAL_TO_WIZARD[key] : "",
    quantity: str(row.quote_quantity ?? row.quantity),
    unit: str(row.quote_unit ?? row.unit),
    trips: str(row.quote_trips ?? row.trips),
    truckType: str(row.quote_truck ?? row.truck),
    address: str(row.formatted_address) || str(row.address),
    coords: lat != null && lng != null ? { lat, lng } : null,
    desiredDate: str(row.desired_date),
    timeframe: str(row.delivery_timeframe ?? row.timeframe),
    accessDetails: row.access_details ?? null,
    accessHeavyTruck: str(row.access_heavy_truck),
    clientName: str(row.name),
    clientCompany: str(row.company),
    clientPhone: str(row.phone),
    clientEmail: str(row.email),
    distance_km: num(row.quote_distance_km ?? row.distance_km),
    duration_minutes: num(row.quote_duration_minutes ?? row.duration_minutes),
  };
};