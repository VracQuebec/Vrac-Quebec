// FIN-04 — Accès serveur de la recherche, des vues enregistrées et des exports.
import { supabase } from "@/integrations/supabase/client";
import * as api from "./api";
import type { Occ } from "./period";
import { serverFilters, type Ctx, type FinQuery } from "./query";

const db = supabase as any;
const err = (e: any) => { if (e) throw new Error(e.message || "Erreur serveur"); };

export type PayRow = { id: string; payee_name: string; amount: number; paid_on: string; entered_on: string; method: string; reference: string | null; source_label: string | null; status: string; allocated: number; available: number; refunded: number; files: number; scoped: boolean; selected: number };
export type PayTotals = { count: number; declared: number; declared_count: number; selected: number; scoped: boolean; refunds: number; returned: number; returned_count: number; voided_count: number; drafts: number; unallocated: number; unallocated_count: number; no_file_count: number; net: number; from: string; to: string; date_base: string };

const num = (r: any) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, ["amount", "allocated", "available", "refunded", "selected", "files", "declared", "refunds", "returned", "unallocated", "net"].includes(k) && v != null ? Number(v) : v]));

export async function searchPayments(c: string, from: string, to: string, qy: FinQuery, limit = 25, offset = 0) {
  const { data, error } = await db.rpc("fin_payments_search", { _company: c, _from: from, _to: to, _f: serverFilters(qy), _sort: qy.sort, _limit: limit, _offset: offset }); err(error);
  return { rows: (data.rows ?? []).map(num) as PayRow[], total: data.total as number, totals: num(data.totals) as unknown as PayTotals };
}
export async function allocationsPage(c: string, from: string, to: string, qy: FinQuery, limit = 500, offset = 0) {
  const { data, error } = await db.rpc("fin_allocations_export", { _company: c, _from: from, _to: to, _f: serverFilters(qy), _limit: limit, _offset: offset }); err(error);
  return (data ?? []).map(num) as { allocation_id: string; payment_id: string; paid_on: string; payee_name: string; occurrence_id: string; obligation_id: string; label: string; category: string | null; due_date: string; amount: number; in_selection: boolean }[];
}
export async function searchOcc(c: string, from: string, to: string, qy: FinQuery, limit = 25, offset = 0): Promise<{ rows: Occ[]; total: number }> {
  return api.listOcc(c, from, to, qy.base, serverFilters(qy) as any, qy.sort, limit, offset);
}
export async function occTotals(c: string, from: string, to: string, qy: FinQuery) { return api.periodTotals(c, from, to, qy.base, serverFilters(qy) as any); }
export async function contractRefs(ids: string[]) {
  const out: Record<string, { contract_ref: string | null; nature: string | null; status: string }> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("fin_obligations").select("id,contract_ref,nature,status").in("id", ids.slice(i, i + 200));
    (data ?? []).forEach((o: any) => (out[o.id] = o));
  }
  return out;
}

// ---------- Vues enregistrées ----------
export type SavedView = { id: string; name: string; context: Ctx; shared: boolean; is_default: boolean; params: unknown; user_id: string };
export async function listViews(c: string, ctx: Ctx) {
  const { data, error } = await db.from("fin_saved_views").select("id,name,context,shared,is_default,params,user_id").eq("company_id", c).eq("context", ctx).order("name"); err(error);
  return (data ?? []) as SavedView[];
}
export async function createView(c: string, ctx: Ctx, name: string, params: FinQuery, shared: boolean) {
  const { data, error } = await db.from("fin_saved_views").insert({ company_id: c, context: ctx, name: name.trim(), params, shared }).select("id").single(); err(error); return data.id as string;
}
export async function updateView(id: string, patch: Partial<Pick<SavedView, "name" | "shared">> & { params?: FinQuery }) {
  const { error } = await db.from("fin_saved_views").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id); err(error);
}
export async function setDefaultView(c: string, ctx: Ctx, uid: string, id: string | null) {
  const { error } = await db.from("fin_saved_views").update({ is_default: false }).eq("company_id", c).eq("context", ctx).eq("user_id", uid).eq("is_default", true); err(error);
  if (id) { const r = await db.from("fin_saved_views").update({ is_default: true }).eq("id", id); err(r.error); }
}
export async function deleteView(id: string) { const { error } = await db.from("fin_saved_views").delete().eq("id", id); err(error); }
