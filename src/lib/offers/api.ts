// ============================================================
// LOT 20 — ACCÈS DONNÉES DES OFFRES DE MATÉRIAUX (admin seulement)
// ------------------------------------------------------------
// Toute écriture est protégée par le drapeau `material_offers_v1`
// (FAUX en production) ET par les politiques RLS admin de la base.
// Aucune confirmation de match, aucune communication.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { isFeatureEnabled } from "@/lib/flags";
import type { MaterialOffer, MaterialOfferInput, OfferStatus } from "./types";

const TABLE = "material_offers";

const guard = () => {
  if (!isFeatureEnabled("material_offers_v1")) {
    throw new Error("Offres de matériaux désactivées (material_offers_v1).");
  }
};

export async function listMaterialOffers(limit = 200): Promise<MaterialOffer[]> {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as MaterialOffer[];
}

export async function createMaterialOffer(input: MaterialOfferInput): Promise<MaterialOffer> {
  guard();
  const { data, error } = await (supabase as any).from(TABLE).insert(input).select("*").single();
  if (error) throw new Error(error.message);
  return data as MaterialOffer;
}

export async function updateMaterialOfferStatus(id: string, status: OfferStatus): Promise<void> {
  guard();
  const { error } = await (supabase as any).from(TABLE).update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

export const archiveMaterialOffer = (id: string) => updateMaterialOfferStatus(id, "archived");
