// Catalogue commun : chaque entreprise crée ses propres éléments (privés);
// le partage à tous passe par catalog_propose puis l'accord du Super Admin (catalog_decide).
// L'adoption (catalog_adopt) crée une COPIE dans l'entreprise — jamais de fiche partagée.
import { supabase } from "@/integrations/supabase/client";

export type CatalogKind = "supplier" | "expense_category" | "unit_category";
export type CatalogItem = {
  id: string; kind: CatalogKind; name: string; payload: Record<string, string>;
  source_company_id: string; source_id: string | null; status: "proposed" | "approved" | "rejected";
  reason: string | null; created_at: string; decided_at: string | null;
};
export const KIND_LABEL: Record<CatalogKind, string> = {
  supplier: "Fournisseur", expense_category: "Catégorie de dépense", unit_category: "Équipement",
};
const db = supabase as unknown as { from: typeof supabase.from; rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
const err = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

export async function listCatalog(status?: CatalogItem["status"]) {
  let q = supabase.from("shared_catalog_items").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q; err(error);
  return (data ?? []) as unknown as CatalogItem[];
}
export async function propose(kind: CatalogKind, company: string, sourceId: string) {
  const { data, error } = await db.rpc("catalog_propose", { _kind: kind, _company: company, _source: sourceId }); err(error); return data as string;
}
export async function decide(id: string, approve: boolean, name?: string, reason?: string) {
  const { error } = await db.rpc("catalog_decide", { _id: id, _approve: approve, _name: name ?? null, _reason: reason ?? null }); err(error);
}
export async function adopt(id: string, company: string) {
  const { data, error } = await db.rpc("catalog_adopt", { _id: id, _company: company }); err(error); return data as string;
}
