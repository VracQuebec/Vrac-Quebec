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
  // Les coordonnées complètes passent par une fonction protégée : seuls les
  // membres de l'entreprise et l'administration peuvent les obtenir.
  const rpc = (supabase as unknown as { rpc: (n: string, a: Row) => Promise<{ data: unknown; error: unknown }> }).rpc;
  const { data, error } = await rpc.call(supabase, "mkt_partner_full", { _company_id: companyId });
  if (error) throw error;
  return (data as MarketplacePartner) ?? null;
}

/** Crée la fiche place de marché d'une entreprise existante si elle n'existe pas encore. */
export async function ensurePartner(companyId: string): Promise<MarketplacePartner> {
  const existing = await fetchPartner(companyId);
  if (existing) return existing;
  const { data: company } = await table("jsc_companies")
    .select("name, legal_name, phone, email, address, website, logo_url").eq("id", companyId).maybeSingle();
  const c = (company ?? {}) as Row;
  const { error } = await table("mkt_partners").insert({
    company_id: companyId,
    trade_name: (c.name as string) ?? null,
    legal_name: (c.legal_name as string) ?? null,
    phone: (c.phone as string) ?? null,
    email: (c.email as string) ?? null,
    address: (c.address as string) ?? null,
    website: (c.website as string) ?? null,
    logo_url: (c.logo_url as string) ?? null,
  } as Row);
  if (error) throw error;
  const created = await fetchPartner(companyId);
  if (!created) throw new Error("Fiche entreprise introuvable après création.");
  return created;
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
  contact_reveal_default: string;
};

export async function fetchMarketplaceSettings(): Promise<MarketplaceSettings> {
  const { data, error } = await table("mkt_settings").select("*").eq("id", "global").maybeSingle();
  if (error) throw error;
  return (data as MarketplaceSettings) ?? {
    id: "global", distribution_mode: "manuel", auto_top_n: 5,
    auto_min_score: 60, require_compliance: false, invite_expiry_hours: 72,
    contact_reveal_default: "apres_attribution",
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
  const { data } = await table("mkt_partners_public").select("company_id, trade_name, legal_name").in("company_id", ids);
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

// ---------- Espace client (étape 9) ----------
export type ClientBid = Bid & {
  partner_name: string;
  partner_city: string | null;
  partner_score: number | null;
};

/** Demandes déposées par le client connecté. */
export async function fetchClientRequests(): Promise<QuoteRequest[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return [];
  const { data, error } = await table("mkt_quote_requests")
    .select("*").eq("client_user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as QuoteRequest[];
}

/** Soumissions visibles par le client pour une demande (jamais les brouillons). */
export async function fetchClientBids(requestId: string): Promise<ClientBid[]> {
  const { data, error } = await table("mkt_bids")
    .select("*").eq("request_id", requestId).order("amount", { ascending: true });
  if (error) throw error;
  const bids = ((data ?? []) as unknown as Bid[])
    .filter((b) => ["envoyee", "vue", "preselectionnee", "retenue", "non_retenue", "expiree"].includes(b.status));
  if (bids.length === 0) return [];

  const ids = [...new Set(bids.map((b) => b.company_id))];
  const [{ data: partners }, { data: scores }] = await Promise.all([
    table("mkt_partners_public").select("company_id, trade_name, legal_name, city").in("company_id", ids),
    table("mkt_partner_scores").select("company_id, public_score, show_public_score").in("company_id", ids),
  ]);
  const infos = new Map(((partners ?? []) as Row[]).map((p) => [p.company_id as string, p]));
  const notes = new Map(((scores ?? []) as Row[]).map((s) => [s.company_id as string, s]));

  return bids.map((b) => {
    const p = infos.get(b.company_id) ?? {};
    const s = notes.get(b.company_id) ?? {};
    return {
      ...b,
      partner_name: ((p.trade_name as string) || (p.legal_name as string) || "Entreprise partenaire"),
      partner_city: (p.city as string) ?? null,
      partner_score: s.show_public_score ? ((s.public_score as number) ?? null) : null,
    } as ClientBid;
  });
}

/** Attributions liées aux demandes du client. */
export async function fetchClientAwards(requestIds: string[]) {
  if (requestIds.length === 0) return [] as Row[];
  const { data, error } = await table("mkt_awards").select("*").in("request_id", requestIds);
  if (error) throw error;
  return (data ?? []) as Row[];
}

/** Documents rattachés aux demandes du client (jamais les documents internes). */
export async function fetchClientDocuments(requestIds: string[]) {
  if (requestIds.length === 0) return [] as Row[];
  const { data, error } = await table("mkt_documents")
    .select("*").in("request_id", requestIds).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Row[];
}

/** Le client retient une soumission : passe par la fonction sécurisée côté base. */
export async function retainBid(bidId: string): Promise<string> {
  const rpc = (supabase as unknown as { rpc: (n: string, a: Row) => Promise<{ data: unknown; error: unknown }> }).rpc;
  const { data, error } = await rpc.call(supabase, "mkt_client_select_bid", { _bid_id: bidId });
  if (error) throw error;
  return data as string;
}

/**
 * Message du client : question à une entreprise (companyId) ou demande de conseil
 * à Vrac Québec (companyId nul, type « support »).
 */
export async function clientMessage(params: {
  requestId: string; lotId?: string | null; companyId?: string | null;
  subject: string; body: string; kind?: "client_partenaire" | "support";
}) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? null;
  const { data: thread, error } = await table("mkt_threads").insert({
    request_id: params.requestId,
    lot_id: params.lotId ?? null,
    company_id: params.companyId ?? null,
    subject: params.subject,
    kind: params.kind ?? "client_partenaire",
    created_by: userId,
    last_message_at: new Date().toISOString(),
  } as Row).select("id").single();
  if (error) throw error;
  const threadId = (thread as { id: string }).id;

  await table("mkt_thread_participants").insert({
    thread_id: threadId, user_id: userId, company_id: null, party: "client",
  } as Row);

  const { error: msgError } = await table("mkt_messages").insert({
    thread_id: threadId, author_user_id: userId, party: "client", body: params.body,
  } as Row);
  if (msgError) throw msgError;
  return threadId;
}

/** Fils de discussion du client pour ses demandes. */
export async function fetchClientThreads(requestIds: string[]) {
  if (requestIds.length === 0) return [] as Row[];
  const { data, error } = await table("mkt_threads")
    .select("*").in("request_id", requestIds).order("last_message_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Row[];
}

// ---------- Messagerie interne et confidentialité (étape 10) ----------
export type Thread = {
  id: string; request_id: string; lot_id: string | null; bid_id: string | null;
  company_id: string | null; subject: string; kind: string; status: string;
  last_message_at: string | null; created_by: string | null; created_at: string;
};
export type Message = {
  id: string; thread_id: string; author_user_id: string | null;
  author_company_id: string | null; party: string; body: string;
  attachments: unknown[]; is_internal: boolean; created_at: string;
};

/** Fils visibles par la personne connectée (la base filtre déjà les fils internes). */
export async function fetchThreads(filter: { requestId?: string; companyId?: string } = {}) {
  let q = table("mkt_threads").select("*").order("last_message_at", { ascending: false }).limit(200);
  if (filter.requestId) q = q.eq("request_id", filter.requestId);
  if (filter.companyId) q = q.eq("company_id", filter.companyId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Thread[];
}

export async function fetchMessages(threadId: string) {
  const { data, error } = await table("mkt_messages")
    .select("*").eq("thread_id", threadId).order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as Message[];
}

/** Envoi d'un message dans un fil existant. */
export async function sendMessage(params: {
  threadId: string; body: string; party: "client" | "partenaire" | "vrac_quebec";
  companyId?: string | null; attachments?: unknown[]; isInternal?: boolean;
}) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? null;
  const { error } = await table("mkt_messages").insert({
    thread_id: params.threadId,
    author_user_id: userId,
    author_company_id: params.companyId ?? null,
    party: params.party,
    body: params.body,
    attachments: params.attachments ?? [],
    is_internal: params.isInternal ?? false,
  } as Row);
  if (error) throw error;
  await table("mkt_threads")
    .update({ last_message_at: new Date().toISOString() } as Row).eq("id", params.threadId);
}

/** S'assure que la personne connectée participe au fil, puis le marque comme lu. */
export async function markThreadRead(threadId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return;
  const { data: existing } = await table("mkt_thread_participants")
    .select("id").eq("thread_id", threadId).eq("user_id", userId).maybeSingle();
  if (!existing) return;
  const rpc = (supabase as unknown as { rpc: (n: string, a: Row) => Promise<{ error: unknown }> }).rpc;
  await rpc.call(supabase, "mkt_thread_mark_read", { _thread_id: threadId });
}

export async function fetchUnreadCounts(threadIds: string[]): Promise<Record<string, number>> {
  if (threadIds.length === 0) return {};
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return {};
  const [{ data: parts }, { data: msgs }] = await Promise.all([
    table("mkt_thread_participants").select("thread_id, last_read_at").in("thread_id", threadIds).eq("user_id", userId),
    table("mkt_messages").select("thread_id, created_at, author_user_id").in("thread_id", threadIds),
  ]);
  const lus = new Map(((parts ?? []) as Row[]).map((p) => [p.thread_id as string, p.last_read_at as string | null]));
  const counts: Record<string, number> = {};
  ((msgs ?? []) as Row[]).forEach((m) => {
    if (m.author_user_id === userId) return;
    const lu = lus.get(m.thread_id as string);
    if (!lu || new Date(m.created_at as string) > new Date(lu)) {
      counts[m.thread_id as string] = (counts[m.thread_id as string] ?? 0) + 1;
    }
  });
  return counts;
}

export type ContactReveal = {
  visible: boolean;
  rule: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  extra: string | null;
};

const rpcCall = async (name: string, args: Row) => {
  const rpc = (supabase as unknown as { rpc: (n: string, a: Row) => Promise<{ data: unknown; error: unknown }> }).rpc;
  const { data, error } = await rpc.call(supabase, name, args);
  if (error) throw error;
  return data;
};

/** Coordonnées du client, dévoilées seulement si la règle de la plateforme le permet. */
export async function fetchClientContact(requestId: string, companyId: string): Promise<ContactReveal> {
  const rows = (await rpcCall("mkt_client_contact", { _request_id: requestId, _company_id: companyId })) as Row[];
  const r = (rows ?? [])[0] ?? {};
  return {
    visible: Boolean(r.visible), rule: (r.rule as string) ?? "",
    name: (r.contact_name as string) ?? null, phone: (r.contact_phone as string) ?? null,
    email: (r.contact_email as string) ?? null, address: (r.address as string) ?? null,
    extra: (r.organization_name as string) ?? null,
  };
}

/** Coordonnées de l'entreprise, dévoilées selon la même règle. */
export async function fetchPartnerContact(requestId: string, companyId: string): Promise<ContactReveal> {
  const rows = (await rpcCall("mkt_partner_contact", { _request_id: requestId, _company_id: companyId })) as Row[];
  const r = (rows ?? [])[0] ?? {};
  return {
    visible: Boolean(r.visible), rule: (r.rule as string) ?? "",
    name: (r.trade_name as string) ?? null, phone: (r.phone as string) ?? null,
    email: (r.email as string) ?? null, address: (r.address as string) ?? null,
    extra: (r.website as string) ?? null,
  };
}

/** Dévoilement (ou masquage) manuel des coordonnées par Vrac Québec. */
export async function revealContact(requestId: string, reveal = true) {
  await rpcCall("mkt_reveal_contact", { _request_id: requestId, _reveal: reveal });
}

export const CONTACT_RULES = [
  { value: "toujours_cachees", label: "Toujours cachées" },
  { value: "apres_soumission", label: "Révélées après soumission" },
  { value: "apres_preselection", label: "Révélées après présélection" },
  { value: "apres_attribution", label: "Révélées après attribution" },
  { value: "manuelle", label: "Révélées manuellement" },
  { value: "visibles", label: "Visibles dès le départ" },
] as const;

export const contactRuleLabel = (v: string) =>
  CONTACT_RULES.find((r) => r.value === v)?.label ?? "Selon le réglage de la plateforme";

/** Règle de confidentialité propre à une demande (null = réglage global). */
export async function setRequestContactRule(requestId: string, rule: string | null) {
  const { error } = await table("mkt_quote_requests")
    .update({ contact_visibility: rule, updated_at: new Date().toISOString() } as Row).eq("id", requestId);
  if (error) throw error;
}

// ============================================================
// CENTRE ADMINISTRATIF — Gestion des soumissions
// ============================================================
export type BoardRow = {
  id: string;
  request_number: string | null;
  title: string | null;
  status: string;
  city: string | null;
  region: string | null;
  client_type: string | null;
  contact_name: string | null;
  organization_name: string | null;
  estimated_value: number | null;
  created_at: string;
  deadline_at: string | null;
  desired_date: string | null;
  invitations_count: number;
  invitations_sent_at: string | null;
  responses_count: number;
  bids_count: number;
  bids_total: number | null;
  last_bid_at: string | null;
  award_status: string | null;
  award_amount: number | null;
  awarded_at: string | null;
  commission_status: string | null;
  commission_amount: number | null;
  notes_count: number;
  last_activity_at: string | null;
};

export async function fetchAdminBoard(): Promise<BoardRow[]> {
  const data = await rpcCall("mkt_admin_board", {});
  return (data ?? []) as BoardRow[];
}

export type AdminNote = {
  id: string; request_id: string; body: string; pinned: boolean;
  created_by: string | null; created_at: string;
};

export async function fetchAdminNotes(requestId: string): Promise<AdminNote[]> {
  const { data, error } = await table("mkt_admin_notes")
    .select("*").eq("request_id", requestId).order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdminNote[];
}

export async function addAdminNote(requestId: string, body: string, pinned = false) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await table("mkt_admin_notes")
    .insert({ request_id: requestId, body, pinned, created_by: auth?.user?.id ?? null } as Row);
  if (error) throw error;
}

export async function deleteAdminNote(id: string) {
  const { error } = await table("mkt_admin_notes").delete().eq("id", id);
  if (error) throw error;
}

export type ActivityEntry = {
  id: string; request_id: string | null; company_id: string | null;
  entity: string; entity_id: string | null; action: string;
  detail: Record<string, unknown>; actor_id: string | null; created_at: string;
};

export async function fetchActivityLog(requestId?: string, limit = 100): Promise<ActivityEntry[]> {
  let q = table("mkt_activity_log").select("*").order("created_at", { ascending: false }).limit(limit);
  if (requestId) q = q.eq("request_id", requestId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ActivityEntry[];
}

export async function setRequestStatus(requestId: string, status: string, note?: string) {
  await rpcCall("mkt_admin_set_status", { _request_id: requestId, _status: status, _note: note ?? null });
}

/** Files de travail du centre administratif (calculées à partir du tableau de bord). */
export const WORK_QUEUES = [
  { key: "nouvelles", label: "Nouvelles demandes" },
  { key: "a_qualifier", label: "À qualifier" },
  { key: "a_matcher", label: "À jumeler" },
  { key: "invitations", label: "Invitations envoyées" },
  { key: "sans_soumission", label: "Sans soumission" },
  { key: "soumissions", label: "Soumissions reçues" },
  { key: "relance_client", label: "Client à relancer" },
  { key: "attribution", label: "Attribution à confirmer" },
  { key: "en_cours", label: "Projet en cours" },
  { key: "termine", label: "Projet terminé" },
  { key: "commission", label: "Commission à facturer" },
  { key: "probleme", label: "Problèmes / litiges" },
] as const;
export type WorkQueue = (typeof WORK_QUEUES)[number]["key"];

const heures = (iso: string | null | undefined) =>
  iso ? (Date.now() - new Date(iso).getTime()) / 3600000 : 0;

export function queueOf(r: BoardRow, delaiSansSoumission = 48, delaiRelance = 72): WorkQueue {
  if (r.status === "litige") return "probleme";
  if (r.commission_status && ["a_confirmer", "a_facturer"].includes(r.commission_status)) return "commission";
  if (r.status === "terminee" || r.award_status === "termine") return "termine";
  if (r.award_status && ["confirme", "en_cours"].includes(r.award_status)) return "en_cours";
  if (r.award_status === "a_confirmer" || r.status === "attribution_a_confirmer") return "attribution";
  if (r.bids_count > 0) {
    return heures(r.last_bid_at) > delaiRelance ? "relance_client" : "soumissions";
  }
  if (r.invitations_count > 0) {
    return heures(r.invitations_sent_at) > delaiSansSoumission ? "sans_soumission" : "invitations";
  }
  if (r.status === "a_qualifier") return "a_qualifier";
  if (r.status === "nouvelle") return "nouvelles";
  return "a_matcher";
}

// ============================================================
// MODÈLE COMMERCIAL — règles tarifaires et commissions
// ============================================================
export const PRICING_MODELS = [
  { value: "commission_pourcentage", label: "Commission en pourcentage" },
  { value: "commission_fixe", label: "Commission fixe" },
  { value: "marge", label: "Marge ajoutée au prix" },
  { value: "frais_par_lead", label: "Frais par demande transmise" },
  { value: "frais_deblocage", label: "Frais pour débloquer une occasion" },
  { value: "abonnement", label: "Abonnement" },
  { value: "credits", label: "Crédits" },
  { value: "gratuit", label: "Gratuit" },
  { value: "entente_personnalisee", label: "Entente personnalisée" },
] as const;
export const pricingModelLabel = (v: string | null) =>
  PRICING_MODELS.find((m) => m.value === v)?.label ?? "—";

export const COMMISSION_STATUSES = [
  { value: "a_confirmer", label: "À confirmer" },
  { value: "a_facturer", label: "À facturer" },
  { value: "facturee", label: "Facturée" },
  { value: "payee", label: "Payée" },
  { value: "annulee", label: "Annulée" },
  { value: "contestee", label: "Contestée" },
] as const;
export const commissionStatusLabel = (v: string | null) =>
  COMMISSION_STATUSES.find((s) => s.value === v)?.label ?? "—";

export type PricingRule = {
  id: string;
  company_id: string | null;
  category_id: string | null;
  label: string;
  model: string;
  scope: string;
  rate_percent: number | null;
  fixed_amount: number | null;
  subscription_amount: number | null;
  credits: number | null;
  min_amount: number | null;
  max_amount: number | null;
  valid_from: string | null;
  valid_until: string | null;
  priority: number;
  status: string;
  is_default: boolean;
  notes: string | null;
  created_at?: string;
};

export async function fetchPricingRules(): Promise<PricingRule[]> {
  const { data, error } = await table("mkt_pricing_rules")
    .select("*").order("priority", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PricingRule[];
}

export async function savePricingRule(row: Partial<PricingRule> & { label: string; model: string }) {
  const { error } = await table("mkt_pricing_rules").upsert(row as Row);
  if (error) throw error;
}

export async function deletePricingRule(id: string) {
  const { error } = await table("mkt_pricing_rules").delete().eq("id", id);
  if (error) throw error;
}

export type CommissionRow = {
  id: string;
  request_id: string | null;
  request_number: string | null;
  request_title: string | null;
  company_id: string | null;
  partner_name: string | null;
  model: string | null;
  label: string | null;
  base_amount: number | null;
  amount: number | null;
  status: string;
  awarded_at: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
  created_at: string;
};

export async function fetchCommissions(): Promise<CommissionRow[]> {
  const data = await rpcCall("mkt_commission_board", {});
  return (data ?? []) as CommissionRow[];
}

export async function setCommissionStatus(id: string, status: string, note?: string) {
  await rpcCall("mkt_set_commission_status", { _commission_id: id, _status: status, _note: note ?? null });
}

/** Entreprises partenaires (pour associer une règle tarifaire). */
export async function fetchPartnerCompanies(): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await table("jsc_companies").select("id, name").order("name");
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string }>;
}

// ============================================================
// TRANSACTIONS MATÉRIAUX + TRANSPORT (prix, tarifs, offres)
// ============================================================
export const DEAL_MODES = [
  { value: "manuel", label: "Manuel — un administrateur prépare le prix" },
  { value: "semi", label: "Semi-automatique — le système suggère" },
  { value: "auto", label: "Automatique — calcul direct (préparation)" },
] as const;

export const PRICE_UNITS = ["tonne", "verge", "voyage", "unite", "heure", "km"] as const;
export const TRUCK_TYPES = ["10_roues", "12_roues", "semi_dompeur", "fardier", "6_roues", "autre"] as const;

export type SupplyPrice = {
  id: string; company_id: string; category_id: string | null; material_label: string;
  unit: string; price: number; min_fee: number; surcharge_percent: number;
  pickup_address: string | null; pickup_city: string | null; latitude: number | null; longitude: number | null;
  is_taxable: boolean; valid_from: string | null; valid_until: string | null; notes: string | null; is_active: boolean;
};

export type TransportRate = {
  id: string; company_id: string; truck_type: string; price_model: string; price: number;
  price_per_km: number; min_fee: number; surcharge_percent: number;
  capacity_tonnes: number | null; capacity_verges: number | null; max_distance_km: number | null;
  base_city: string | null; latitude: number | null; longitude: number | null;
  valid_from: string | null; valid_until: string | null; notes: string | null; is_active: boolean;
};

export type Deal = {
  id: string; request_id: string | null; mode: string;
  supplier_company_id: string | null; carrier_company_id: string | null;
  supply_price_id: string | null; transport_rate_id: string | null;
  material_label: string | null; quantity: number | null; unit: string | null;
  truck_type: string | null; trips: number | null; distance_km: number | null;
  material_cost: number; transport_cost: number; margin_percent: number; margin_amount: number;
  subtotal: number; gst: number; qst: number; total: number;
  breakdown: Record<string, unknown>; status: string; notes: string | null; created_at?: string;
};

export async function fetchSupplyPrices(companyId?: string): Promise<SupplyPrice[]> {
  let q = table("mkt_supply_prices").select("*").order("material_label");
  if (companyId) q = q.eq("company_id", companyId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SupplyPrice[];
}
export async function saveSupplyPrice(row: Partial<SupplyPrice> & { company_id: string; material_label: string }) {
  const { error } = await table("mkt_supply_prices").upsert(row as Row);
  if (error) throw error;
}
export async function deleteSupplyPrice(id: string) {
  const { error } = await table("mkt_supply_prices").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchTransportRates(companyId?: string): Promise<TransportRate[]> {
  let q = table("mkt_transport_rates").select("*").order("truck_type");
  if (companyId) q = q.eq("company_id", companyId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TransportRate[];
}
export async function saveTransportRate(row: Partial<TransportRate> & { company_id: string; truck_type: string }) {
  const { error } = await table("mkt_transport_rates").upsert(row as Row);
  if (error) throw error;
}
export async function deleteTransportRate(id: string) {
  const { error } = await table("mkt_transport_rates").delete().eq("id", id);
  if (error) throw error;
}

export type DealSuggestion = {
  request_id: string; material: string | null; quantity: number; unit: string;
  suppliers: Array<Record<string, unknown>>; carriers: Array<Record<string, unknown>>;
};

export async function suggestDeal(requestId: string, material?: string, quantity?: number, unit = "tonne"): Promise<DealSuggestion> {
  const data = await rpcCall("mkt_deal_suggest", {
    _request_id: requestId, _material: material ?? null, _quantity: quantity ?? null, _unit: unit,
  });
  return data as unknown as DealSuggestion;
}

/** Calcul d'une offre matériaux + transport (taxes Québec). */
export function computeDeal(input: {
  materialCost: number; transportCost: number; marginPercent: number; taxable?: boolean;
}) {
  const base = (input.materialCost || 0) + (input.transportCost || 0);
  const margeAmount = Math.round(base * ((input.marginPercent || 0) / 100) * 100) / 100;
  const subtotal = Math.round((base + margeAmount) * 100) / 100;
  const taxable = input.taxable !== false;
  const gst = taxable ? Math.round(subtotal * 0.05 * 100) / 100 : 0;
  const qst = taxable ? Math.round(subtotal * 0.09975 * 100) / 100 : 0;
  return { margeAmount, subtotal, gst, qst, total: Math.round((subtotal + gst + qst) * 100) / 100 };
}

export async function fetchDeals(requestId?: string): Promise<Deal[]> {
  let q = table("mkt_deals").select("*").order("created_at", { ascending: false });
  if (requestId) q = q.eq("request_id", requestId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Deal[];
}
export async function saveDeal(row: Partial<Deal>) {
  const { error } = await table("mkt_deals").upsert(row as Row);
  if (error) throw error;
}
export async function deleteDeal(id: string) {
  const { error } = await table("mkt_deals").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// NOTIFICATIONS
// ============================================================
export type MktNotification = {
  id: string; user_id: string | null; company_id: string | null; audience: string;
  event: string; title: string; body: string | null; level: string;
  request_id: string | null; link: string | null; channels: string[];
  read_at: string | null; created_at: string;
};

export async function fetchNotifications(limit = 50): Promise<MktNotification[]> {
  const { data, error } = await table("mkt_notifications")
    .select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as MktNotification[];
}
export async function markNotificationRead(id: string) {
  const { error } = await table("mkt_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
export async function fetchNotificationPrefs(userId: string) {
  const { data, error } = await table("mkt_notification_prefs").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data as Row) ?? null;
}
export async function saveNotificationPrefs(userId: string, updates: Row) {
  const { error } = await table("mkt_notification_prefs")
    .upsert({ user_id: userId, ...updates }, { onConflict: "user_id" });
  if (error) throw error;
}

export const NOTIFICATION_EVENTS = [
  { value: "nouvelle_opportunite", label: "Nouvelle opportunité", audience: "partenaire" },
  { value: "rappel_invitation", label: "Rappel d'invitation", audience: "partenaire" },
  { value: "question", label: "Nouvelle question", audience: "partenaire" },
  { value: "soumission_expire", label: "Soumission bientôt expirée", audience: "partenaire" },
  { value: "confirmation_attribution", label: "Attribution à confirmer", audience: "partenaire" },
  { value: "document_expire", label: "Document expirant", audience: "partenaire" },
  { value: "soumission_recue", label: "Soumission reçue", audience: "client" },
  { value: "relance_client", label: "Relance de décision", audience: "client" },
  { value: "evaluation", label: "Demande d'évaluation", audience: "client" },
] as const;

// ============================================================
// SCORES PARTENAIRES
// ============================================================
export type PartnerScore = {
  id: string; company_id: string; internal_score: number | null; public_score: number | null;
  show_public_score: boolean; profile_completion: number | null; response_rate: number | null;
  avg_response_hours: number | null; invitations_count: number; bids_count: number;
  awards_count: number; completed_count: number; cancelled_count: number; disputes_count: number;
  satisfaction: number | null; last_activity_at: string | null; computed_at: string | null;
};

export async function fetchPartnerScores(): Promise<Array<PartnerScore & { partner_name?: string }>> {
  const { data, error } = await table("mkt_partner_scores").select("*").order("internal_score", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as PartnerScore[];
  const { data: partners } = await table("mkt_partners").select("company_id, trade_name, legal_name");
  const byCompany = new Map(((partners ?? []) as Row[]).map((p) => [
    String(p.company_id), String(p.trade_name || p.legal_name || "Entreprise"),
  ]));
  return rows.map((r) => ({ ...r, partner_name: byCompany.get(r.company_id) ?? "Entreprise" }));
}

export async function recomputeScores(): Promise<number> {
  const data = await rpcCall("mkt_recompute_scores", {});
  return Number(data ?? 0);
}

export async function setPublicScoreVisibility(companyId: string, visible: boolean) {
  const { error } = await table("mkt_partner_scores")
    .upsert({ company_id: companyId, show_public_score: visible }, { onConflict: "company_id" });
  if (error) throw error;
}

// ============================================================
// ANALYTIQUE
// ============================================================
export type Analytics = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function fetchAnalytics(from: string, to: string): Promise<Analytics> {
  const data = await rpcCall("mkt_analytics", { _from: from, _to: to });
  return (data ?? {}) as Analytics;
}

// ============================================================
// AUTOMATISATIONS
// ============================================================
export type AutomationRule = {
  id: string; key: string; label: string; description: string | null;
  is_active: boolean; delay_hours: number; max_runs: number;
  params: Record<string, unknown>; last_run_at: string | null;
};

export async function fetchAutomationRules(): Promise<AutomationRule[]> {
  const { data, error } = await table("mkt_automation_rules").select("*").order("label");
  if (error) throw error;
  return (data ?? []) as AutomationRule[];
}
export async function saveAutomationRule(row: Partial<AutomationRule> & { id: string }) {
  const { error } = await table("mkt_automation_rules").update(row as Row).eq("id", row.id);
  if (error) throw error;
}
export async function runAutomations(): Promise<{ actions: number }> {
  const data = await rpcCall("mkt_run_automations", {});
  return (data ?? { actions: 0 }) as { actions: number };
}
export async function fetchAutomationRuns(limit = 100) {
  const { data, error } = await table("mkt_automation_runs")
    .select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as Array<Record<string, unknown>>;
}

// ============================================================
// ANNUAIRE PUBLIC
// ============================================================
export type DirectoryEntry = {
  company_id: string; name: string; description: string | null; logo_url: string | null;
  city: string | null; region: string | null; services: string[]; territories: string[];
  public_score: number | null; is_verified: boolean;
};

export async function fetchDirectory(params: {
  service?: string | null; city?: string | null; region?: string | null; categorySlug?: string | null; limit?: number;
}): Promise<DirectoryEntry[]> {
  const data = await rpcCall("mkt_directory", {
    _service: params.service || null, _city: params.city || null, _region: params.region || null,
    _category_slug: params.categorySlug || null, _limit: params.limit ?? 60,
  });
  return (data ?? []) as DirectoryEntry[];
}
