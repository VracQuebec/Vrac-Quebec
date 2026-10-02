// FIN-12D — Notes de frais, avances, remboursements. Toute écriture passe par les RPC fin_exp_* (droits revérifiés côté serveur).
import { supabase } from "@/integrations/supabase/client";
import type { Extraction } from "./captures";

const db = supabase as any;
const err = (e: any) => { if (e) { const x = new Error(e.message || "Erreur serveur") as Error & { code?: string }; x.code = e.code; throw x; } };
const call = async <T = any>(fn: string, args: Record<string, unknown>) => { const { data, error } = await db.rpc(fn, args); err(error); return data as T; };
export const key = () => (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export type Payer = "employe" | "avance" | "entreprise";
export const PAYER_LABEL: Record<Payer, string> = { employe: "Payé personnellement par l'employé", avance: "Financé par une avance de l'entreprise", entreprise: "Payé directement par l'entreprise" };
export const STATUS_LABEL: Record<string, string> = { brouillon: "Brouillon", soumise: "Soumise — à examiner", a_corriger: "À corriger", approuvee: "Approuvée", refusee: "Refusée" };
export const ADV_LABEL: Record<string, string> = { prevue: "Prévue (à approuver)", approuvee: "Approuvée — non versée", versee: "Versée", refusee: "Refusée", annulee: "Annulée" };
export const EVENT_LABEL: Record<string, string> = { create: "Note créée", submit: "Soumise", return: "Retournée à corriger", refuse: "Refusée", approve: "Approuvée", adjust: "Correction après approbation",
  alloc: "Avance affectée", alloc_void: "Affectation d'avance retirée", adv_create: "Avance préparée", adv_approve: "Avance approuvée", adv_refuse: "Avance refusée", adv_pay: "Avance versée",
  adv_pay_void: "Versement d'avance annulé", restitution: "Restitution reçue", restitution_void: "Restitution annulée" };

export type Company = { id: string; name: string; role: string; can_approve: boolean; can_correct: boolean };
export type Line = { id?: string; pos?: number; spent_on: string; merchant: string; description: string; category: string; doc_amount: string; gst: string; qst: string; business_amount: string;
  payer: Payer; file_id: string | null; file_name?: string | null; supplier_bill_id: string; truck_id: string; project_id: string; missing_receipt_note: string; split_reason: string;
  accepted_amount?: number | null; decision_reason?: string | null; missing_accepted_reason?: string | null; uses?: any[] };
export const emptyLine = (): Line => ({ spent_on: "", merchant: "", description: "", category: "", doc_amount: "", gst: "", qst: "", business_amount: "", payer: "employe", file_id: null, supplier_bill_id: "", truck_id: "", project_id: "", missing_receipt_note: "", split_reason: "" });
const s = (v: unknown) => (v == null ? "" : String(v));
export const lineFromRow = (r: any): Line => ({ id: r.id, pos: r.pos, spent_on: s(r.spent_on), merchant: s(r.merchant), description: s(r.description), category: s(r.category), doc_amount: s(r.doc_amount), gst: s(r.gst), qst: s(r.qst),
  business_amount: s(r.business_amount), payer: r.payer, file_id: r.file_id, file_name: r.file_name, supplier_bill_id: s(r.supplier_bill_id), truck_id: s(r.truck_id), project_id: s(r.project_id),
  missing_receipt_note: s(r.missing_receipt_note), split_reason: s(r.split_reason), accepted_amount: r.accepted_amount == null ? null : Number(r.accepted_amount), decision_reason: r.decision_reason, missing_accepted_reason: r.missing_accepted_reason, uses: r.uses ?? [] });
const num = (v: string) => { const t = v.replace(/\s/g, "").replace(",", "."); return t === "" ? "" : t; };
export const linePayload = (l: Line) => ({ spent_on: l.spent_on, merchant: l.merchant, description: l.description, category: l.category, doc_amount: num(l.doc_amount), gst: num(l.gst), qst: num(l.qst),
  business_amount: num(l.business_amount), payer: l.payer, file_id: l.file_id ?? "", supplier_bill_id: l.payer === "entreprise" ? l.supplier_bill_id : "", truck_id: l.truck_id, project_id: l.project_id,
  missing_receipt_note: l.missing_receipt_note, split_reason: l.split_reason });

/** Montant remboursable d'une note = lignes acceptées payées par l'employé ou financées par une avance; jamais celles payées par l'entreprise. */
export function summarize(lines: { payer: Payer; accepted_amount?: number | null; business_amount: string | number }[], allocated: number, reimbursed: number) {
  const n = (v: unknown) => Number(v ?? 0) || 0;
  const approved = lines.reduce((t, l) => t + n(l.accepted_amount), 0);
  const reimbursable = lines.filter((l) => l.payer !== "entreprise").reduce((t, l) => t + n(l.accepted_amount), 0);
  const company = lines.filter((l) => l.payer === "entreprise").reduce((t, l) => t + n(l.accepted_amount), 0);
  const due = Math.max(0, Math.round((reimbursable - allocated - reimbursed) * 100) / 100);
  return { approved, reimbursable, company, due };
}

export const myCompanies = () => call<Company[]>("fin_exp_my_companies", {});
export const lookups = (c: string) => call<{ trucks: { id: string; name: string }[]; projects: { id: string; name: string }[]; members: { id: string; name: string; role: string }[] }>("fin_exp_lookups", { _company: c });
export const overview = (c: string, mine: boolean) => call<any>("fin_exp_overview", { _company: c, _mine: mine });
export const detail = (id: string) => call<any>("fin_exp_report_detail", { _id: id });
export const save = (c: string, id: string | null, p: Record<string, unknown>, rev: number | null) => call<{ id: string; rev: number }>("fin_exp_save", { _company: c, _id: id, _p: p, _base_rev: rev });
export const submit = (id: string, rev: number) => call("fin_exp_submit", { _id: id, _expect_rev: rev });
export const decide = (id: string, decision: "approve" | "return" | "refuse", lines: any[], version: number, hash: string, note: string, selfReason: string, due: string | null, k: string) =>
  call("fin_exp_decide", { _id: id, _decision: decision, _lines: lines, _expect_version: version, _expect_hash: hash, _note: note, _self_reason: selfReason, _due: due || null, _key: k });
export const adjust = (line: string, accepted: number, reason: string) => call("fin_exp_adjust", { _line: line, _accepted: accepted, _reason: reason });
export const reimburse = (report: string, p: Record<string, unknown>) => call("fin_exp_reimburse", { _report: report, _p: p });
export const advSave = (c: string, p: Record<string, unknown>) => call("fin_exp_adv_save", { _company: c, _p: p });
export const advDecide = (id: string, d: "approve" | "refuse", note: string, selfReason: string, k: string) => call("fin_exp_adv_decide", { _id: id, _decision: d, _note: note, _self_reason: selfReason, _key: k });
export const advPay = (id: string, p: Record<string, unknown>) => call("fin_exp_adv_pay", { _id: id, _p: p });
export const alloc = (adv: string, report: string, amount: number, k: string) => call("fin_exp_alloc", { _advance: adv, _report: report, _amount: amount, _key: k });
export const allocVoid = (id: string, reason: string) => call("fin_exp_alloc_void", { _id: id, _reason: reason });
export const restitute = (adv: string, p: Record<string, unknown>) => call("fin_exp_restitute", { _advance: adv, _p: p });
export const restitutionVoid = (id: string, reason: string) => call("fin_exp_restitution_void", { _id: id, _reason: reason });
export const voidPayment = (id: string, reason: string) => call("fin_payment_void", { _payment: id, _kind: "entry_error", _reason: reason });

// ---- Justificatifs privés (bucket fin-expense-files, dossier company/<entreprise>/<auteur>/) ----
export const MAX_BYTES = 20 * 1024 * 1024;
const MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };
export const LIMITS = "Photo JPG, PNG, WEBP ou HEIC (iPhone), ou PDF · 20 Mo au maximum · lecture automatique jusqu'à 10 pages.";
async function sha256(b: Blob) { const h = await crypto.subtle.digest("SHA-256", await b.arrayBuffer()); return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join(""); }
async function uid() { const { data } = await supabase.auth.getUser(); if (!data.user) throw new Error("Connexion requise"); return data.user.id; }
async function put(c: string, me: string, blob: Blob, ext: string) {
  const path = `company/${c}/${me}/${key()}.${ext}`;
  const { error } = await supabase.storage.from("fin-expense-files").upload(path, blob, { contentType: MIME[ext], upsert: false }); if (error) throw new Error(`Téléversement impossible : ${error.message}`);
  return path;
}
export async function uploadFile(c: string, file: File | Blob, name: string) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (!MIME[ext]) throw new Error("Format non pris en charge (JPG, PNG, WEBP, HEIC ou PDF)");
  if (file.size > MAX_BYTES) throw new Error("Fichier trop lourd (20 Mo au maximum)");
  const me = await uid(); const sha = await sha256(file); const path = await put(c, me, file, ext);
  const r = await call<{ id: string }>("fin_exp_file_add", { _company: c, _path: path, _name: name.slice(0, 200), _mime: MIME[ext], _size: file.size, _sha: sha, _converted: null });
  return { id: r.id, mime: MIME[ext], name };
}
export async function fileRow(id: string) { const { data } = await db.from("fin_exp_files").select("id,name,mime,storage_path,converted_path,extraction,extract_status,extract_error,extract_count,owner_id").eq("id", id).maybeSingle(); return data as any; }
export async function openUrl(path: string) { const { data, error } = await supabase.storage.from("fin-expense-files").createSignedUrl(path, 120); if (error || !data) throw new Error("Lien privé indisponible"); return data.signedUrl; }
export async function convertHeic(c: string, id: string) {
  const f = await fileRow(id); if (!f) throw new Error("Pièce inaccessible");
  const dl = await supabase.storage.from("fin-expense-files").download(f.storage_path); if (dl.error || !dl.data) throw new Error("Téléchargement de l'original impossible");
  let out: Blob;
  try { const { default: heic2any } = await import("heic2any"); const r = await heic2any({ blob: dl.data, toType: "image/jpeg", quality: 0.92 }); out = Array.isArray(r) ? r[0] : r; }
  catch (e: any) { throw new Error(`Conversion impossible (${e?.message || "photo HEIC illisible"})`); }
  if (out.size > MAX_BYTES) throw new Error("Version convertie trop lourde (20 Mo au maximum)");
  const path = await put(c, await uid(), out, "jpg");
  await call("fin_exp_file_set_converted", { _id: id, _converted: path });
}
export async function extract(id: string, force = false) {
  const { data, error } = await supabase.functions.invoke("fin-exp-extract", { body: { file_id: id, force } });
  if (error) { let m = error.message; try { m = (await (error as any).context?.json())?.error ?? m; } catch { /* corps illisible */ } throw new Error(m); }
  return data as { status: string };
}
/** Suggestions d'une ligne depuis une lecture (rien n'est appliqué sans clic; taxe non lue = vide, jamais 0). */
export function lineFromExtraction(ex: Extraction | null, l: Line): Line {
  const d = ex?.documents?.[0]; if (!d) return l;
  const v = (x: number | null | undefined) => (x == null ? "" : String(x));
  return { ...l, spent_on: d.doc_date ?? l.spent_on, merchant: d.supplier_name ?? l.merchant, doc_amount: v(d.total) || l.doc_amount, gst: v(d.gst), qst: v(d.qst),
    business_amount: l.business_amount || v(d.total), description: l.description || d.lines.map((x) => x.description).filter(Boolean).slice(0, 5).join(" · ") };
}
/** FIN-12C → FIN-12D : copie privée de la pièce dans le dossier des notes de frais et reprise de la lecture existante (aucune nouvelle consommation). */
export async function fromCapture(c: string, capId: string) {
  const { data: cap } = await db.from("fin_doc_captures").select("id,file_id").eq("id", capId).maybeSingle(); if (!cap) throw new Error("Document inaccessible");
  const { data: row } = await db.from("ent_crm_files").select("storage_path,file_name,name").eq("id", cap.file_id).maybeSingle(); if (!row) throw new Error("Pièce inaccessible");
  const dl = await supabase.storage.from("entcrm-files").download(row.storage_path); if (dl.error || !dl.data) throw new Error("Téléchargement impossible");
  const name = String(row.file_name ?? row.name ?? row.storage_path.split("/").pop());
  const f = await uploadFile(c, dl.data, name);
  await call("fin_exp_file_from_capture", { _file: f.id, _capture: capId, _reason: "Orienté vers une note de frais (payé par un employé)" });
  return f;
}
