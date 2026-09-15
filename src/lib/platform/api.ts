// ============================================================
// CRM-01 — Accès données des paramètres de plateforme.
// Lecture seule pour les compteurs, écritures journalisées
// pour les forfaits, secteurs et abonnements.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { PlatformPlan, PlatformSubscription } from "./plans";

/* ------------------------------ Journal ------------------------------ */

export async function logChange(entry: {
  scope: string;
  entityTable: string;
  entityId?: string | null;
  action: string;
  changes?: Record<string, unknown>;
  companyId?: string | null;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("platform_change_log").insert({
    scope: entry.scope,
    entity_table: entry.entityTable,
    entity_id: entry.entityId ?? null,
    action: entry.action,
    changes: (entry.changes ?? {}) as never,
    company_id: entry.companyId ?? null,
    actor_id: user.id,
    actor_email: user.email ?? null,
  });
}

export async function fetchChangeLog(limit = 25) {
  const { data, error } = await supabase
    .from("platform_change_log")
    .select("id, scope, entity_table, action, changes, actor_email, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/* ------------------------------ Forfaits ------------------------------ */

const toPlan = (row: Record<string, unknown>): PlatformPlan => ({
  ...(row as unknown as PlatformPlan),
  features: Array.isArray(row.features) ? (row.features as string[]) : [],
});

export async function fetchPlans(): Promise<PlatformPlan[]> {
  const { data, error } = await supabase
    .from("platform_plans").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => toPlan(r as Record<string, unknown>));
}

export async function savePlan(plan: Partial<PlatformPlan> & { slug: string }): Promise<PlatformPlan> {
  const payload = {
    slug: plan.slug,
    name: plan.name ?? "",
    description: plan.description ?? null,
    billing_interval: plan.billing_interval ?? "month",
    currency: plan.currency ?? "CAD",
    price_cents: plan.price_cents ?? null,
    features: (plan.features ?? []) as never,
    audience: plan.audience ?? "entreprise",
    status: plan.status ?? "draft",
    notes: plan.notes ?? null,
  };
  const { data, error } = await supabase
    .from("platform_plans").upsert(payload, { onConflict: "slug" }).select().single();
  if (error) throw error;
  await logChange({
    scope: "Forfaits et abonnements", entityTable: "platform_plans",
    entityId: (data as { id: string }).id, action: plan.id ? "update" : "create",
    changes: payload as unknown as Record<string, unknown>,
  });
  return toPlan(data as Record<string, unknown>);
}

/* ---------------------------- Abonnements ---------------------------- */

export async function fetchSubscriptions(): Promise<PlatformSubscription[]> {
  const { data, error } = await supabase
    .from("platform_subscriptions")
    .select("id, company_id, plan_id, status, amount_cents, currency, current_period_end, last_payment_failed_at, is_test");
  if (error) throw error;
  return (data ?? []) as PlatformSubscription[];
}

/* ------------------------------ Secteurs ------------------------------ */

export interface Sector { id: string; slug: string; name: string; description: string | null; is_active: boolean }

export async function fetchSectors(): Promise<Sector[]> {
  const { data, error } = await supabase
    .from("platform_sectors").select("id, slug, name, description, is_active").order("name");
  if (error) throw error;
  return (data ?? []) as Sector[];
}

export async function createSector(name: string, description: string | null) {
  const slug = name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const { data, error } = await supabase
    .from("platform_sectors").insert({ slug, name: name.trim(), description }).select().single();
  if (error) throw error;
  await logChange({ scope: "Secteurs et services", entityTable: "platform_sectors", entityId: data.id, action: "create", changes: { name } });
  return data as Sector;
}

export async function setSectorActive(id: string, isActive: boolean) {
  const { error } = await supabase.from("platform_sectors").update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
  await logChange({ scope: "Secteurs et services", entityTable: "platform_sectors", entityId: id, action: "update", changes: { is_active: isActive } });
}

export async function fetchCompanySectors(companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("platform_company_sectors").select("sector_id").eq("company_id", companyId);
  if (error) throw error;
  return (data ?? []).map((r) => r.sector_id as string);
}

export async function toggleCompanySector(companyId: string, sectorId: string, on: boolean) {
  if (on) {
    const { error } = await supabase.from("platform_company_sectors").insert({ company_id: companyId, sector_id: sectorId });
    if (error) throw error;
  } else {
    const { error } = await supabase.from("platform_company_sectors")
      .delete().eq("company_id", companyId).eq("sector_id", sectorId);
    if (error) throw error;
  }
  await logChange({
    scope: "Secteurs et services", entityTable: "platform_company_sectors",
    entityId: sectorId, action: on ? "link" : "unlink", companyId, changes: { sector_id: sectorId },
  });
}

/* ----------------------------- Compteurs ----------------------------- */

export interface PlatformCounters {
  submissionsTotal: number;
  remblai: number;
  vrac: number;
  jscRequestsPending: number;
  jscClientsActive: number;
  followUpsOverdue: number;
  quotesToFollow: number;
  ordersToPlan: number;
  companies: number;
}

const count = async (
  p: PromiseLike<{ count: number | null; error: { message: string } | null }>,
) => {
  const { count: n, error } = await p;
  if (error) throw new Error(error.message);
  return n ?? 0;
};

const head = { count: "exact" as const, head: true };

/** Compteurs réels. Chaque chiffre correspond exactement à une liste filtrée. */
export async function fetchPlatformCounters(): Promise<PlatformCounters> {
  const nowIso = new Date().toISOString();
  const [
    submissionsTotal, remblai, vrac, jscRequestsPending, jscClientsActive,
    followUpsOverdue, quotesToFollow, ordersToPlan, companies,
  ] = await Promise.all([
    count(supabase.from("submissions").select("id", head)),
    count(supabase.from("submissions").select("id", head).eq("request_type", "remblai")),
    count(supabase.from("submissions").select("id", head).neq("request_type", "remblai")),
    count(supabase.from("jsc_requests").select("id", head).eq("status", "nouvelle")),
    count(supabase.from("jsc_clients").select("id", head).not("is_active", "is", false)),
    count(supabase.from("submissions").select("id", head).lt("next_follow_up_at", nowIso)),
    count(supabase.from("jsc_quotes").select("id", head).eq("status", "envoyee")),
    count(supabase.from("jsc_orders").select("id", head).eq("status", "a_planifier")),
    count(supabase.from("jsc_companies").select("id", head).is("archived_at", null)),
  ]);
  return {
    submissionsTotal, remblai, vrac, jscRequestsPending, jscClientsActive,
    followUpsOverdue, quotesToFollow, ordersToPlan, companies,
  };
}

export interface Company { id: string; name: string; is_default: boolean | null }

export async function fetchCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from("jsc_companies").select("id,name,is_default").is("archived_at", null).order("created_at");
  if (error) throw error;
  return (data ?? []) as Company[];
}
