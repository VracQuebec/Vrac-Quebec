// FIN-01 — Accès aux obligations. Toute la sécurité est vérifiée par la base
// (fin_can_read / fin_can_write) ; l'entreprise choisie ici n'est qu'une demande.
import { supabase } from "@/integrations/supabase/client";
import type { Occ } from "./period";

const db = supabase as any;
export type Base = "due" | "planned";
export type Filters = { q?: string; payee?: string; category_id?: string; status?: "active" | "cancelled" | "all"; quality?: string; frequency?: string; seasonal?: string; truck_id?: string; project_id?: string; settle?: string; method?: string; paid_from?: string; paid_to?: string };
export type Totals = { confirmed: number; estimated: number; known: number; unknown_count: number; count: number; from: string; to: string; base: Base;
  remaining?: number; remaining_estimated?: number; to_confirm_amount?: number; paid_on_these?: number; late_count?: number; late_amount?: number; by_settle?: Record<string, number>;
  declared?: number; declared_count?: number; declared_by_method?: Record<string, number>; refunds?: number; returned?: number; drafts?: number; unallocated?: number; unallocated_count?: number };

const clean = (f: Filters) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== ""));
const err = (e: any) => { if (e) throw new Error(e.message || "Erreur serveur"); };

export async function myFinanceCompanies(isAdmin: boolean) {
  if (isAdmin) {
    const { data } = await db.from("jsc_companies").select("id,name").is("archived_at", null).order("name");
    return (data ?? []) as { id: string; name: string }[];
  }
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const { data } = await db.from("jsc_company_members").select("role, jsc_companies(id,name)").eq("user_id", u.user.id).eq("is_active", true).is("archived_at", null);
  return ((data ?? []) as any[]).filter((r) => ["proprietaire", "gestionnaire", "comptabilite", "lecture"].includes(r.role)).map((r) => r.jsc_companies).filter(Boolean);
}
export async function role(companyId: string) { const { data } = await db.rpc("entcrm_role", { _company_id: companyId }); return data as string | null; }
export async function periodTotals(c: string, from: string, to: string, base: Base, f: Filters = {}): Promise<Totals> {
  const { data, error } = await db.rpc("fin_period_totals", { _company: c, _from: from, _to: to, _base: base, _f: clean(f) }); err(error);
  return { ...data, confirmed: Number(data.confirmed), estimated: Number(data.estimated), known: Number(data.known) };
}
export async function listOcc(c: string, from: string, to: string, base: Base, f: Filters, sort = "date_asc", limit = 50, offset = 0): Promise<{ rows: Occ[]; total: number }> {
  const { data, error } = await db.rpc("fin_list", { _company: c, _from: from, _to: to, _base: base, _f: clean(f), _sort: sort, _limit: limit, _offset: offset }); err(error);
  return { rows: (data.rows ?? []).map((r: any) => ({ ...r, amount: r.amount == null ? null : Number(r.amount) })), total: data.total };
}
export async function saveObligation(c: string, id: string | null, p: Record<string, unknown>) { const { data, error } = await db.rpc("fin_save_obligation", { _company: c, _id: id, _p: p }); err(error); return data as string; }
export async function editAmount(occ: string, scope: "this" | "following", amount: number | null, quality: string, dry = false) { const { data, error } = await db.rpc("fin_edit_amount", { _occ: occ, _scope: scope, _amount: amount, _quality: quality, _dry: dry }); err(error); return data as { count: number; dates?: string[] }; }
export async function reschedule(occ: string, planned: string) { const { error } = await db.rpc("fin_reschedule", { _occ: occ, _planned: planned }); err(error); }
export async function cancelOcc(occ: string, reason: string) { const { error } = await db.rpc("fin_cancel_occurrence", { _occ: occ, _reason: reason }); err(error); }
export async function archiveObligation(id: string, eff: string) { const { data, error } = await db.rpc("fin_archive_obligation", { _id: id, _effective: eff }); err(error); return data as number; }
export async function seedCategories(c: string) { const { data, error } = await db.rpc("fin_seed_categories", { _company: c }); err(error); return data as number; }
export async function categories(c: string) { const { data } = await db.from("fin_categories").select("id,name,is_suggested,archived_at").eq("company_id", c).order("name"); return (data ?? []) as { id: string; name: string; is_suggested: boolean; archived_at: string | null }[]; }
export async function obligation(id: string) { const { data } = await db.from("fin_obligations").select("*").eq("id", id).maybeSingle(); return data; }
export async function history(oblId: string) { const { data } = await db.from("fin_events").select("action,reason,before,after,created_at,is_support").eq("obligation_id", oblId).order("created_at", { ascending: false }).limit(50); return data ?? []; }
export async function versions(oblId: string) { const { data } = await db.from("fin_obligation_versions").select("effective_from,amount,amount_quality,created_at").eq("obligation_id", oblId).order("created_at"); return data ?? []; }
export async function lookups(c: string) {
  const [cl, tr, pj] = await Promise.all([
    db.from("ent_crm_clients").select("id,name").eq("company_id", c).is("archived_at", null).order("name").limit(500),
    db.from("jsc_trucks").select("id,name").eq("company_id", c).is("archived_at", null).order("name").limit(200),
    db.from("ent_crm_projects").select("id,name").eq("company_id", c).is("archived_at", null).order("name").limit(300),
  ]);
  return { clients: cl.data ?? [], trucks: tr.data ?? [], projects: pj.data ?? [] } as Record<"clients" | "trucks" | "projects", { id: string; name: string }[]>;
}

// FIN-02 — aperçu (même moteur que la génération), changement de cadence, suspension
export type Preview = { count: number; confirmed: number; estimated: number; unknown_count: number; dates: { key: string; due: string; planned: string; amount: number | null; quality: string }[]; next: { due: string; planned: string; amount: number | null; quality: string }[]; collisions: string[]; from: string; to: string };
export async function preview(c: string, p: Record<string, unknown>, from: string, to: string) { const { data, error } = await db.rpc("fin_preview", { _company: c, _p: p, _from: from, _to: to }); err(error); return data as Preview; }
export async function changeRule(id: string, rev: number | null, p: Record<string, unknown>, effective: string, dry: boolean) { const { data, error } = await db.rpc("fin_change_rule", { _id: id, _rev: rev, _p: p, _effective: effective, _dry: dry }); err(error); return data as { kept: number; cancelled: any; exceptions?: number; new: { due: string; planned: string }[] }; }
export async function addPause(id: string, start: string, end: string, reason: string, dry: boolean) { const { data, error } = await db.rpc("fin_add_pause", { _id: id, _start: start, _end: end, _reason: reason, _dry: dry }); err(error); return data as { affected: { id: string; due: string; amount: number | null }[]; cancelled?: number }; }
export async function pauses(oblId: string) { const { data } = await db.from("fin_pauses").select("id,start_date,end_date,reason,created_at,lifted_from,lift_reason").eq("obligation_id", oblId).order("start_date"); return (data ?? []) as { id: string; start_date: string; end_date: string; reason: string; lifted_from: string | null; lift_reason: string | null }[]; }
