// ============================================================
// LOT 20 — OFFRE DE MATÉRIAU RÉELLE (entité métier persistée)
// ------------------------------------------------------------
// Types purs, alignés sur la table `material_offers`. Aucune
// confirmation, aucune communication, aucune écriture ici.
// ============================================================
import type { MaterialKey } from "@/lib/matching/interpreter";

export const MATERIAL_OFFER_VERSION = "material-offer-v1";

export type OfferStatus =
  | "draft" | "parsed" | "needs_confirmation" | "ready_for_matching"
  | "archived" | "fulfilled" | "cancelled";

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  draft: "Brouillon",
  parsed: "Interprétée",
  needs_confirmation: "À confirmer",
  ready_for_matching: "Prête pour le matching",
  archived: "Archivée",
  fulfilled: "Complétée",
  cancelled: "Annulée",
};

export type OfferSourceType =
  | "admin_manual" | "free_text_parser" | "user_form"
  | "transport_request" | "chantier" | "quote_request" | "historical_import";

export type OfferQuantityUnit = "tonnes" | "voyages" | "m3" | "verges3";

/**
 * Déclarations environnementales : une déclaration N'EST PAS une preuve,
 * ni une analyse, ni une certification.
 */
export type EnvironmentalDeclaration =
  | "unknown" | "stated_clean_by_user" | "stated_contaminated_by_user"
  | "characterized" | "not_characterized";

export const ENVIRONMENTAL_LABELS: Record<EnvironmentalDeclaration, string> = {
  unknown: "Statut environnemental inconnu",
  stated_clean_by_user: "Déclaré propre par l'utilisateur — non vérifié",
  stated_contaminated_by_user: "Déclaré contaminé par l'utilisateur — non vérifié",
  characterized: "Caractérisation environnementale déclarée — à valider",
  not_characterized: "Non caractérisé",
};

export type OfferQualificationStatus = "unqualified" | "partially_qualified" | "qualified";

export interface MaterialOffer {
  id: string;
  created_at: string;
  updated_at: string;
  source_type: OfferSourceType;
  source_id: string | null;
  owner_user_id: string | null;
  status: OfferStatus;
  qualification_status: OfferQualificationStatus;
  raw_description: string | null;
  quantity_value: number | null;
  quantity_unit: OfferQuantityUnit | null;
  quantity_approximate: boolean;
  trip_count: number | null;
  vehicle_type: string | null;
  principal_material: MaterialKey | null;
  secondary_materials: MaterialKey[];
  trace_materials: MaterialKey[];
  granulometry_min_inches: number | null;
  granulometry_max_inches: number | null;
  granulometry_approximate: boolean;
  declared_clean: boolean | null;
  declared_contaminated: boolean | null;
  environmental_status: EnvironmentalDeclaration;
  location_raw: string | null;
  address: string | null;
  sector: string | null;
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoding_source: string | null;
  availability_start: string | null;
  availability_end: string | null;
  max_radius_km: number | null;
  notes: string | null;
  parser_confidence: number | null;
  parser_version: string | null;
}

/** Champs acceptés à l'insertion (le reste est calculé par la base). */
export type MaterialOfferInput = Partial<Omit<MaterialOffer, "id" | "created_at" | "updated_at">>;
