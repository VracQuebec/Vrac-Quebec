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

// ---------- Centre de soumissions des entreprises partenaires ----------
export type Opportunity = {
  invitation: Invitation;
  request: QuoteRequest;
  lot: RequestLot | null;
  bid: Bid | null;
};

/** Occasions transmises à une entreprise (invitations + demande + lot + soumission). */
export async function fetchOpportunities(companyId: string): Promise<Opportunity[]> {
  const invitations = await fetchInvitations({ companyId });
  const visibles = invitations.filter((i) => i.status !== "exclue");
  if (visibles.length === 0) return [];

  const requestIds = [...new Set(visibles.map((i) => i.request_id))];
  const lotIds = [...new Set(visibles.map((i) => i.lot_id).filter(Boolean))] as string[];

  const [{ data: reqRows }, { data: lotRows }, bids] = await Promise.all([
    table("mkt_quote_requests").select("*").in("id", requestIds),
    lotIds.length
      ? table("mkt_request_lots").select("*").in("id", lotIds)
      : Promise.resolve({ data: [] as Row[] }),
    fetchBids({ companyId }),
  ]);

  const requests = new Map((((reqRows ?? []) as unknown) as QuoteRequest[]).map((r) => [r.id, r]));
  const lots = new Map((((lotRows ?? []) as unknown) as RequestLot[]).map((l) => [l.id, l]));

  return visibles
    .map((invitation) => {
      const request = requests.get(invitation.request_id);
      if (!request) return null;
      const bid = bids.find(
        (b) => b.request_id === invitation.request_id && (b.lot_id ?? null) === (invitation.lot_id ?? null),
      ) ?? null;
      return {
        invitation,
        request,
        lot: invitation.lot_id ? lots.get(invitation.lot_id) ?? null : null,
        bid,
      } as Opportunity;
    })
    .filter(Boolean) as Opportunity[];
}

/** Marque l'invitation comme consultée (sans écraser une réponse déjà donnée). */
export async function markInvitationViewed(invitation: Invitation) {
  if (invitation.viewed_at) return;
  const updates: Row = { viewed_at: new Date().toISOString() };
  if (invitation.status === "envoyee") updates.status = "vue";
  const { error } = await table("mkt_invitations").update(updates).eq("id", invitation.id);
  if (error) throw error;
}

export async function declineInvitation(invitationId: string, reason: string) {
  const { error } = await table("mkt_invitations").update({
    status: "declinee",
    decline_reason: reason || null,
    responded_at: new Date().toISOString(),
  } as Row).eq("id", invitationId);
  if (error) throw error;
}

export async function markInvitationAnswered(invitationId: string) {
  const { error } = await table("mkt_invitations").update({
    status: "soumise",
    responded_at: new Date().toISOString(),
  } as Row).eq("id", invitationId);
  if (error) throw error;
}

/** Question d'une entreprise sur une demande : crée le fil interne et le premier message. */
export async function askQuestion(params: {
  requestId: string; lotId?: string | null; companyId: string; subject: string; body: string;
}) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? null;
  const { data: thread, error } = await table("mkt_threads").insert({
    request_id: params.requestId,
    lot_id: params.lotId ?? null,
    company_id: params.companyId,
    subject: params.subject,
    kind: "question",
    created_by: userId,
    last_message_at: new Date().toISOString(),
  } as Row).select("id").single();
  if (error) throw error;
  const threadId = (thread as { id: string }).id;

  await table("mkt_thread_participants").insert({
    thread_id: threadId, user_id: userId, company_id: params.companyId, party: "partenaire",
  } as Row);

  const { error: msgError } = await table("mkt_messages").insert({
    thread_id: threadId,
    author_user_id: userId,
    author_company_id: params.companyId,
    party: "partenaire",
    body: params.body,
  } as Row);
  if (msgError) throw msgError;
  return threadId;
}

// ---------- Lots et projets complexes (étape 8) ----------
export async function deleteLot(lotId: string) {
  const { error } = await table("mkt_request_lots").delete().eq("id", lotId);
  if (error) throw error;
}

export type LotBid = Bid & { partner_name: string };

/** Soumissions d'une demande enrichies du nom de l'entreprise. */
export async function fetchRequestBids(requestId: string): Promise<LotBid[]> {
  const bids = await fetchBids({ requestId });
  const ids = [...new Set(bids.map((b) => b.company_id))];
  if (ids.length === 0) return [];
  const { data } = await table("mkt_partners").select("company_id, trade_name, legal_name").in("company_id", ids);
  const names = new Map(((data ?? []) as Row[]).map((p) => [
    p.company_id as string, (p.trade_name as string) || (p.legal_name as string) || "Entreprise",
  ]));
  return bids.map((b) => ({ ...b, partner_name: names.get(b.company_id) ?? "Entreprise" }));
}

export type LotStrategy = {
  key: string;
  label: string;
  detail: string;
  total: number;
  covered: number;
  missing: string[];
};

/**
 * Compare les stratégies d'attribution d'un projet découpé en lots :
 * meilleur prix lot par lot, offre globale d'une entreprise, regroupements par entreprise.
 */
export function buildLotStrategies(lots: RequestLot[], bids: LotBid[]): LotStrategy[] {
  const sent = bids.filter((b) => b.status !== "brouillon" && b.status !== "retiree" && b.amount != null);
  const strategies: LotStrategy[] = [];

  // 1. Meilleur prix lot par lot
  const bestByLot = new Map<string, LotBid>();
  lots.forEach((lot) => {
    const candidats = sent.filter((b) => b.lot_id === lot.id);
    const best = candidats.sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0))[0];
    if (best) bestByLot.set(lot.id, best);
  });
  if (bestByLot.size > 0) {
    const total = [...bestByLot.values()].reduce((s, b) => s + (b.amount ?? 0), 0);
    const missing = lots.filter((l) => !bestByLot.has(l.id)).map((l) => `${l.lot_number} ${l.title}`);
    strategies.push({
      key: "meilleur-par-lot",
      label: "Meilleur prix lot par lot",
      detail: [...bestByLot.entries()]
        .map(([lotId, b]) => `${lots.find((l) => l.id === lotId)?.lot_number ?? "?"} → ${b.partner_name}`)
        .join(" · "),
      total,
      covered: bestByLot.size,
      missing,
    });
  }

  // 2. Offres globales (soumission sans lot = projet complet)
  sent.filter((b) => !b.lot_id).forEach((b) => {
    strategies.push({
      key: `global-${b.id}`,
      label: `${b.partner_name} — projet complet`,
      detail: "Offre unique pour l'ensemble du projet",
      total: b.amount ?? 0,
      covered: lots.length,
      missing: [],
    });
  });

  // 3. Regroupements : tous les lots soumissionnés par une même entreprise
  const parCompagnie = new Map<string, LotBid[]>();
  sent.filter((b) => b.lot_id).forEach((b) => {
    const list = parCompagnie.get(b.company_id) ?? [];
    list.push(b);
    parCompagnie.set(b.company_id, list);
  });
  parCompagnie.forEach((list, companyId) => {
    if (list.length < 2) return;
    const numeros = list
      .map((b) => lots.find((l) => l.id === b.lot_id)?.lot_number ?? "?")
      .sort();
    strategies.push({
      key: `groupe-${companyId}`,
      label: `${list[0].partner_name} — lots ${numeros.join(" + ")}`,
      detail: "Regroupement chez une même entreprise",
      total: list.reduce((s, b) => s + (b.amount ?? 0), 0),
      covered: list.length,
      missing: lots.filter((l) => !list.some((b) => b.lot_id === l.id)).map((l) => `${l.lot_number} ${l.title}`),
    });
  });

  return strategies.sort((a, b) => b.covered - a.covered || a.total - b.total);
}
