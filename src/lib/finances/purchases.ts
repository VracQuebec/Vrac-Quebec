// FIN-12A — Fournisseurs et factures d'achat. Toute la sécurité (droits, entreprise, doublons,
// remplacement d'estimation) est vérifiée par la base ; l'entreprise passée ici n'est qu'une demande.
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
const err = (e: any) => { if (e) { const x = new Error(e.message || "Erreur serveur") as Error & { code?: string }; x.code = e.code; throw x; } };
export const FILE_BUCKET = "entcrm-files";
export const TZ = "America/Toronto";

export type BillForm = {
  supplier_id: string; reference: string; doc_date: string; due_date: string; description: string;
  category_id: string; truck_id: string; project_id: string;
  subtotal: string; gst: string; qst: string; total: string; file_id: string; file_sha256: string; file_name: string;
};
export const emptyBill = (supplier = ""): BillForm => ({ supplier_id: supplier, reference: "", doc_date: "", due_date: "", description: "", category_id: "", truck_id: "", project_id: "", subtotal: "", gst: "", qst: "", total: "", file_id: "", file_sha256: "", file_name: "" });

export type BillRow = { id: string; supplier_id: string; supplier: string; reference: string | null; doc_date: string | null; due_date: string | null; status: "draft" | "confirmed" | "void";
  total: number | null; paid: number; rest: number | null; overpaid: number | null; tax_status: string; replaced: boolean; estimate: number | null; occurrence_id: string | null; file_id: string | null; created_at: string; updated_at: string };
export type BillTotals = { count: number; confirmed_total: number; paid: number; rest: number; rest_due_known: number; rest_due_unknown: number; overpaid: number; drafts: number; tax_incomplete: number };
export type Dups = { exact: { id: string; reference: string | null; status: string; total: number | null; doc_date: string | null; why: string }[]; probable: { id: string; reference: string | null; status: string; total: number | null; doc_date: string | null; why: string }[] };
export type Preview = { mode: "new" | "replace"; label?: string; due_date?: string; estimate: number | null; estimate_quality?: string; real: number | null; diff: number | null; paid: number; rest: number | null; overpaid: number; taken_by?: string | null; payee_match?: boolean; status?: string };

/** Conversion du formulaire vers le document : montants du fournisseur tels que saisis (jamais recalculés). */
export function toPayload(f: BillForm) {
  const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  return { supplier_id: f.supplier_id || null, reference: f.reference, doc_date: f.doc_date || null, due_date: f.due_date || null, description: f.description,
    category_id: f.category_id || null, truck_id: f.truck_id || null, project_id: f.project_id || null,
    subtotal: n(f.subtotal), gst: n(f.gst), qst: n(f.qst), total: n(f.total), file_id: f.file_id || null, file_sha256: f.file_sha256 || null, currency: "CAD" };
}

/** Aide à la saisie : écart entre le total du document et sous-total + taxes. Signalé, jamais corrigé. */
export function taxGap(f: BillForm): number | null {
  const v = [f.subtotal, f.gst, f.qst, f.total].map((s) => (s.trim() === "" ? null : Number(s.replace(",", "."))));
  if (v.some((x) => x == null || !Number.isFinite(x))) return null;
  const [s, g, q, t] = v as number[];
  return Math.round((t - (s + g + q)) * 100) / 100;
}
export const taxComplete = (f: BillForm) => [f.subtotal, f.gst, f.qst].every((s) => s.trim() !== "");

export async function sha256(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function overview(c: string, f: { supplier_id?: string; status?: string; q?: string }, limit = 25, offset = 0) {
  const { data, error } = await db.rpc("fin_bills_overview", { _company: c, _f: Object.fromEntries(Object.entries(f).filter(([, v]) => v)), _limit: limit, _offset: offset }); err(error);
  const num = (x: any) => (x == null ? null : Number(x));
  return { rows: (data.rows ?? []).map((r: any) => ({ ...r, total: num(r.total), paid: Number(r.paid ?? 0), rest: num(r.rest), overpaid: num(r.overpaid), estimate: num(r.estimate) })) as BillRow[],
    total: Number(data.total ?? 0), totals: Object.fromEntries(Object.entries(data.totals ?? {}).map(([k, v]) => [k, Number(v)])) as unknown as BillTotals };
}
export async function suppliers(c: string) {
  const { data, error } = await db.from("fin_supplier_profiles").select("client_id, archived_at, client:ent_crm_clients(id,name)").eq("company_id", c); err(error);
  return ((data ?? []) as any[]).filter((r) => r.client).map((r) => ({ id: r.client_id as string, name: r.client.name as string, archived: !!r.archived_at })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
export async function contacts(c: string) {
  const { data } = await db.from("ent_crm_clients").select("id,name").eq("company_id", c).is("archived_at", null).order("name").limit(500);
  return (data ?? []) as { id: string; name: string }[];
}
export async function saveSupplier(c: string, id: string | null, p: Record<string, unknown>) { const { data, error } = await db.rpc("fin_supplier_save", { _company: c, _client: id, _p: p }); err(error); return data as string; }
export async function supplierDetail(c: string, id: string) { const { data, error } = await db.rpc("fin_supplier_detail", { _company: c, _supplier: id }); err(error); return data; }
export async function bill(id: string) { const { data, error } = await db.from("fin_supplier_bills").select("*").eq("id", id).maybeSingle(); err(error); return data; }
export async function billEvents(id: string) { const { data } = await db.from("fin_supplier_bill_events").select("action,reason,detail,created_at").eq("bill_id", id).order("created_at"); return data ?? []; }
export async function saveBill(c: string, id: string | null, f: BillForm, rev: number | null, createKey: string | null) {
  const { data, error } = await db.rpc("fin_bill_save", { _company: c, _id: id, _p: toPayload(f), _base_rev: rev, _create_key: createKey }); err(error); return data as { id: string; rev: number; replay?: boolean };
}
export async function dups(c: string, id: string | null, f: BillForm) { const { data, error } = await db.rpc("fin_bill_dups", { _company: c, _id: id, _p: toPayload(f) }); err(error); return data as Dups; }
export async function preview(id: string, occ: string | null) { const { data, error } = await db.rpc("fin_bill_preview", { _id: id, _occ: occ }); err(error); return data as Preview; }
export async function confirm(id: string, occ: string | null, rev: number, key: string, dupReason: string | null) {
  const { data, error } = await db.rpc("fin_bill_confirm", { _id: id, _occ: occ, _expect_rev: rev, _key: key, _dup_reason: dupReason }); err(error); return data as { id: string; occurrence_id: string; replay?: boolean };
}
export async function voidBill(id: string, rev: number, reason: string) { const { error } = await db.rpc("fin_bill_void", { _id: id, _expect_rev: rev, _reason: reason }); err(error); }
/** Estimations compatibles (même entreprise, actives, non confirmées, même fournisseur ou sans fournisseur), non déjà remplacées. */
export async function candidates(c: string, supplier: string) {
  const [o, b] = await Promise.all([
    db.from("fin_occurrences").select("id,due_date,amount,amount_quality,obligation:fin_obligations!inner(label,payee_client_id)").eq("company_id", c).eq("status", "active").neq("amount_quality", "confirmed").order("due_date").limit(300),
    db.from("fin_supplier_bills").select("occurrence_id").eq("company_id", c).eq("status", "confirmed"),
  ]);
  err(o.error);
  const taken = new Set(((b.data ?? []) as any[]).map((x) => x.occurrence_id));
  return ((o.data ?? []) as any[]).filter((x) => !taken.has(x.id) && (!x.obligation.payee_client_id || x.obligation.payee_client_id === supplier))
    .map((x) => ({ id: x.id as string, due_date: x.due_date as string, amount: x.amount == null ? null : Number(x.amount), quality: x.amount_quality as string, label: x.obligation.label as string }));
}
export async function companyFiles(c: string) {
  const { data } = await db.from("ent_crm_files").select("id,file_name,mime_type,created_at").eq("company_id", c).is("archived_at", null).order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as { id: string; file_name: string; mime_type: string; created_at: string }[];
}
const MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };
/** Envoi au stockage privé existant : la fiche n'est créée qu'après l'envoi; jamais d'écrasement. */
export async function uploadProof(c: string, file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!MIME[ext]) throw new Error("Format non accepté (PDF, JPG, PNG, WEBP ou HEIC).");
  if (file.size > 20 * 1024 * 1024) throw new Error("Fichier trop lourd (20 Mo au maximum).");
  const hash = await sha256(file);
  const path = `company/${c}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(FILE_BUCKET).upload(path, file, { contentType: MIME[ext], upsert: false });
  if (up.error) throw new Error(`Envoi refusé : ${up.error.message}`);
  const { data, error } = await db.from("ent_crm_files").insert({ company_id: c, storage_path: path, file_name: file.name, mime_type: MIME[ext], size_bytes: file.size, title: file.name.replace(/\.[^.]+$/, ""), category: "autre", description: "Facture fournisseur" }).select("id").single();
  if (error) { await supabase.storage.from(FILE_BUCKET).remove([path]); throw new Error(`Enregistrement refusé : ${error.message}`); }
  return { id: data.id as string, sha: hash, name: file.name };
}
export async function openFile(fileId: string) {
  const { data } = await db.from("ent_crm_files").select("storage_path").eq("id", fileId).maybeSingle();
  if (!data) throw new Error("Pièce inaccessible");
  const { data: s, error } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(data.storage_path, 300);
  if (error || !s) throw new Error("Pièce inaccessible");
  return s.signedUrl;
}
export const fmtStamp = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("fr-CA", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }) : "—";
export const STATUS_LABEL: Record<string, string> = { draft: "Brouillon", confirmed: "Confirmée", void: "Annulée" };
export const EVENT_LABEL: Record<string, string> = { draft_create: "Brouillon créé", confirm: "Document confirmé", void: "Annulée" };
