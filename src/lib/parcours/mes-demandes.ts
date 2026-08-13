// ============================================================
// « MES DEMANDES » — espace entrepreneur.
// Lecture seule des demandes (submissions) appartenant réellement à
// l'utilisateur connecté, via la RPC sécurisée `get_my_submissions`
// (SECURITY DEFINER : la base reste la seule source de vérité).
// Aucune écriture, aucune création, aucune donnée inventée : un champ
// absent reste absent et sera affiché « À confirmer » par l'interface.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { RpcClient } from "@/lib/parcours/validation";

export interface MySubmission {
  id: string;
  number: number | null;
  createdAt: string | null;
  status: string | null;
  requestType: string | null;
  material: string | null;
  quantity: string | null;
  location: string | null;
  desiredDate: string | null;
  selectedSiteLabel: string | null;
  selectedSiteAddress: string | null;
  siteValidatedAt: string | null;
}

export type MySubmissionsResult =
  | { state: "ok"; submissions: MySubmission[] }
  | { state: "unauthorized" }
  | { state: "error"; message: string };

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
};

export const mapMySubmission = (row: unknown): MySubmission | null => {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (!r.id) return null;
  const materials = Array.isArray(r.materials) ? (r.materials as unknown[]).map(String) : [];
  const material = str(materials[0]) ?? str(r.other_material);
  const quantity = str(r.quantity) ?? str(r.tonnage);
  const location =
    str(r.city) ?? str(r.formatted_address) ?? str(r.address);
  return {
    id: String(r.id),
    number: typeof r.submission_number === "number" ? r.submission_number : null,
    createdAt: str(r.created_at),
    status: str(r.status),
    requestType: str(r.request_type),
    material,
    quantity,
    location,
    desiredDate: str(r.desired_date),
    selectedSiteLabel: str(r.selected_site_label),
    selectedSiteAddress: str(r.selected_site_address),
    siteValidatedAt: str(r.site_validated_at),
  };
};

/** Charge les demandes de l'utilisateur connecté. Jamais celles d'un autre. */
export const loadMySubmissions = async (
  client: RpcClient = supabase as unknown as RpcClient,
): Promise<MySubmissionsResult> => {
  const { data, error } = await client.rpc("get_my_submissions", {});
  if (error) {
    const m = (error.message || "").toLowerCase();
    if (m.includes("not_authorized") || m.includes("permission")) return { state: "unauthorized" };
    return { state: "error", message: error.message || "Lecture impossible." };
  }
  const rows = Array.isArray(data) ? data : [];
  return {
    state: "ok",
    submissions: rows.map(mapMySubmission).filter((s): s is MySubmission => s !== null),
  };
};
