// ============================================================
// PLACE DE MARCHÉ VRAC QUÉBEC — accès aux données (fondations)
// Couche minimale réutilisable par les prochaines étapes
// (taxonomie, profil partenaire, demandes, matching, soumissions).
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type {
  Bid, Invitation, MarketplacePartner, QuoteRequest, RequestLot, ServiceCategory,
} from "@/lib/marketplace/types";

type Row = Record<string, unknown>;
// Les tables mkt_* sont récentes : on passe par un client non typé en attendant
// la régénération des types générés.
const db = supabase as unknown as {
  from: (name: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
const table = (name: string) => db.from(name);

// ---------- Taxonomie ----------
export async function fetchCategories(onlyActive = true): Promise<ServiceCategory[]> {
  let q = table("mkt_service_categories").select("*").order("sort_order").order("name");
  if (onlyActive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ServiceCategory[];
}

export function buildCategoryTree(rows: ServiceCategory[]) {
  const byParent = new Map<string | null, ServiceCategory[]>();
  rows.forEach((r) => {
    const list = byParent.get(r.parent_id) ?? [];
    list.push(r);
    byParent.set(r.parent_id, list);
  });
  const children = (id: string | null): Array<ServiceCategory & { children: ReturnType<typeof children> }> =>
    (byParent.get(id) ?? []).map((c) => ({ ...c, children: children(c.id) }));
  return children(null);
}

export async function saveCategory(payload: Partial<ServiceCategory> & { name: string; slug: string }) {
  const { data, error } = await table("mkt_service_categories")
    .upsert(payload as Row).select("id").maybeSingle();
  if (error) throw error;
  return data as { id: string } | null;
}

// ---------- Partenaires ----------
export async function fetchPartner(companyId: string): Promise<MarketplacePartner | null> {
  const { data, error } = await table("mkt_partners").select("*").eq("company_id", companyId).maybeSingle();
  if (error) throw error;
  return (data as unknown as MarketplacePartner) ?? null;
}

/** Crée la fiche place de marché d'une entreprise existante si elle n'existe pas encore. */
export async function ensurePartner(companyId: string): Promise<MarketplacePartner> {
  const existing = await fetchPartner(companyId);
  if (existing) return existing;
  const { data: company } = await table("jsc_companies")
    .select("name, legal_name, phone, email, address, website, logo_url").eq("id", companyId).maybeSingle();
  const c = (company ?? {}) as Row;
  const { data, error } = await table("mkt_partners").insert({
    company_id: companyId,
    trade_name: (c.name as string) ?? null,
    legal_name: (c.legal_name as string) ?? null,
    phone: (c.phone as string) ?? null,
    email: (c.email as string) ?? null,
    address: (c.address as string) ?? null,
    website: (c.website as string) ?? null,
    logo_url: (c.logo_url as string) ?? null,
  } as Row).select("*").single();
  if (error) throw error;
  return data as unknown as MarketplacePartner;
}

export async function savePartner(companyId: string, updates: Partial<MarketplacePartner>) {
  const { error } = await table("mkt_partners").update(updates as Row).eq("company_id", companyId);
  if (error) throw error;
}

const childTable = (name: string) => ({
  list: async (companyId: string) => {
    const { data, error } = await table(name).select("*").eq("company_id", companyId);
    if (error) throw error;
    return (data ?? []) as Row[];
  },
  save: async (row: Row) => {
    const { data, error } = await table(name).upsert(row).select("id").maybeSingle();
    if (error) throw error;
    return data as { id: string } | null;
  },
  remove: async (id: string) => {
    const { error } = await table(name).delete().eq("id", id);
    if (error) throw error;
  },
});

export const partnerBusinessRoles = childTable("mkt_partner_business_roles");
export const partnerServices = childTable("mkt_partner_services");
export const partnerTerritories = childTable("mkt_partner_territories");
export const partnerClientTypes = childTable("mkt_partner_client_types");
export const partnerEquipment = childTable("mkt_partner_equipment");
export const partnerDocuments = childTable("mkt_partner_documents");
export const partnerAvailability = childTable("mkt_partner_availability");

export async function fetchPartnerPreferences(companyId: string) {
  const { data, error } = await table("mkt_partner_preferences").select("*").eq("company_id", companyId).maybeSingle();
  if (error) throw error;
  return (data as Row) ?? null;
}

export async function savePartnerPreferences(companyId: string, updates: Row) {
  const { error } = await table("mkt_partner_preferences")
    .upsert({ company_id: companyId, ...updates }, { onConflict: "company_id" });
  if (error) throw error;
}

// ---------- Demandes de soumissions ----------
export async function createQuoteRequest(payload: Partial<QuoteRequest> & { title: string }) {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await table("mkt_quote_requests").insert({
    ...payload,
    client_user_id: auth?.user?.id ?? null,
    created_by: auth?.user?.id ?? null,
  } as Row).select("*").single();
  if (error) throw error;
  return data as unknown as QuoteRequest;
}

export async function fetchMyRequests(): Promise<QuoteRequest[]> {
  const { data, error } = await table("mkt_quote_requests").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as QuoteRequest[];
}

export async function fetchRequest(id: string): Promise<QuoteRequest | null> {
  const { data, error } = await table("mkt_quote_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as QuoteRequest) ?? null;
}

export async function fetchLots(requestId: string): Promise<RequestLot[]> {
  const { data, error } = await table("mkt_request_lots").select("*").eq("request_id", requestId).order("sort_order");
  if (error) throw error;
  return (data ?? []) as unknown as RequestLot[];
}

export async function saveLot(row: Partial<RequestLot> & { request_id: string; lot_number: string; title: string }) {
  const { error } = await table("mkt_request_lots").upsert(row as Row);
  if (error) throw error;
}

// ---------- Invitations et soumissions ----------
export async function fetchInvitations(filter: { requestId?: string; companyId?: string }) {
  let q = table("mkt_invitations").select("*").order("created_at", { ascending: false });
  if (filter.requestId) q = q.eq("request_id", filter.requestId);
  if (filter.companyId) q = q.eq("company_id", filter.companyId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Invitation[];
}

export async function saveInvitation(row: Partial<Invitation> & { request_id: string; company_id: string }) {
  const { error } = await table("mkt_invitations").upsert(row as Row, {
    onConflict: "request_id,lot_id,company_id",
  });
  if (error) throw error;
}

export async function fetchBids(filter: { requestId?: string; companyId?: string }) {
  let q = table("mkt_bids").select("*").order("created_at", { ascending: false });
  if (filter.requestId) q = q.eq("request_id", filter.requestId);
  if (filter.companyId) q = q.eq("company_id", filter.companyId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Bid[];
}

export async function saveBid(row: Partial<Bid> & { request_id: string; company_id: string }) {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await table("mkt_bids")
    .upsert({ submitted_by: auth?.user?.id ?? null, ...row } as Row).select("id").maybeSingle();
  if (error) throw error;
  return data as { id: string } | null;
}

export async function sendBid(bidId: string) {
  const { error } = await table("mkt_bids")
    .update({ status: "envoyee", submitted_at: new Date().toISOString() } as Row).eq("id", bidId);
  if (error) throw error;
}

// ---------- Réglages de la place de marché ----------
export type MarketplaceSettings = {
  id: string;
  distribution_mode: "auto" | "manuel";
  auto_top_n: number;
  auto_min_score: number;
  require_compliance: boolean;
  invite_expiry_hours: number;
};

export async function fetchMarketplaceSettings(): Promise<MarketplaceSettings> {
  const { data, error } = await table("mkt_settings").select("*").eq("id", "global").maybeSingle();
  if (error) throw error;
  return (data as MarketplaceSettings) ?? {
    id: "global", distribution_mode: "manuel", auto_top_n: 5,
    auto_min_score: 60, require_compliance: false, invite_expiry_hours: 72,
  };
}

export async function saveMarketplaceSettings(updates: Partial<MarketplaceSettings>) {
  const { error } = await table("mkt_settings")
    .upsert({ id: "global", ...updates, updated_at: new Date().toISOString() } as Row, { onConflict: "id" });
  if (error) throw error;
}

// ---------- Moteur de correspondance ----------
export type PartnerMatch = {
  company_id: string;
  partner_name: string;
  city: string | null;
  region: string | null;
  distance_km: number | null;
  score: number;
  reasons: Record<string, number>;
  matched_services: string[];
  availability_status: string | null;
  is_verified: boolean;
  already_invited: boolean;
  last_activity: string | null;
};

export async function matchPartners(requestId: string, lotId?: string | null): Promise<PartnerMatch[]> {
  const rpc = (supabase as unknown as { rpc: (n: string, a: Row) => Promise<{ data: unknown; error: unknown }> }).rpc;
  const { data, error } = await rpc.call(supabase, "mkt_match_partners", {
    _request_id: requestId, _lot_id: lotId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as PartnerMatch[];
}

export async function invitePartners(
  requestId: string, companyIds: string[], lotId?: string | null, mode: "auto" | "manuel" = "manuel",
): Promise<number> {
  const rpc = (supabase as unknown as { rpc: (n: string, a: Row) => Promise<{ data: unknown; error: unknown }> }).rpc;
  const { data, error } = await rpc.call(supabase, "mkt_invite_partners", {
    _request_id: requestId, _company_ids: companyIds, _lot_id: lotId ?? null, _mode: mode,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

/** Demandes de la place de marché pour l'administration. */
export async function fetchAdminRequests(status?: string): Promise<QuoteRequest[]> {
  let q = table("mkt_quote_requests").select("*").order("created_at", { ascending: false }).limit(200);
  if (status && status !== "toutes") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as QuoteRequest[];
}
