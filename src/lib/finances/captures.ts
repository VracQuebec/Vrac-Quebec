// FIN-12C — Reçus et documents : capture, lecture (suggestions) et validation.
// La base contrôle entreprise, droits et fichier; ce module ne fait que relayer.
import { supabase } from "@/integrations/supabase/client";
import { uploadProof, type BillForm, type CreditForm, emptyBill, emptyCredit, taxGap } from "@/lib/finances/purchases";

const db = supabase as any;
const err = (e: any) => { if (e) { const x = new Error(e.message || "Erreur serveur") as Error & { code?: string }; x.code = e.code; throw x; } };

export type ExLine = { description: string; quantity: number | null; unit: string | null; unit_price: number | null; amount: number | null };
export type ExDoc = { doc_type: "facture" | "recu" | "note_credit" | "releve" | "indetermine"; supplier_name: string | null; reference: string | null; doc_date: string | null; due_date: string | null;
  currency: string | null; subtotal: number | null; gst: number | null; qst: number | null; other_taxes: number | null; total: number | null; paid_mention: boolean; pages: string | null; lines: ExLine[]; uncertain: string[] };
export type Extraction = { documents: ExDoc[]; notes: string | null; model?: string };
export type CapStatus = "ajoute" | "lecture" | "a_verifier" | "echec" | "traite" | "ecarte";
export type CapResult = { kind: "bill" | "credit" | "attached"; id: string; index: number | null; key: string; at: string };
export type Capture = { id: string; company_id: string; file_id: string; file_sha256: string | null; status: CapStatus; extraction: Extraction | null; extracted_at: string | null;
  extract_error: string | null; extract_count: number; edits: Edits | null; results: CapResult[]; dismiss_reason: string | null; rev: number; created_at: string; created_by: string | null;
  file: { id: string; name: string; mime: string; size: number }; can_write: boolean; same_file: { id: string; status: string; results: CapResult[] }[] };
export type Edits = { index: number; kind: "bill" | "credit"; supplier_id: string; reference: string; doc_date: string; due_date: string; description: string;
  subtotal: string; gst: string; qst: string; total: string; employee_paid: boolean };

export const STATUS: Record<CapStatus, string> = { ajoute: "Document ajouté", lecture: "Lecture en cours", a_verifier: "À vérifier", echec: "Échec — réessayable", traite: "Traité", ecarte: "Écarté" };
export const TYPE_LABEL: Record<ExDoc["doc_type"], string> = { facture: "Facture", recu: "Reçu", note_credit: "Note de crédit", releve: "Relevé fournisseur", indetermine: "Indéterminé" };
export const LIMITS = "Photo JPG, PNG ou WEBP, ou PDF · 20 Mo au maximum · lecture automatique jusqu'à 10 pages. HEIC accepté comme pièce, mais lu seulement manuellement.";

export async function list(c: string) {
  const { data, error } = await db.from("fin_doc_captures").select("id,status,results,created_at,extracted_at,file:ent_crm_files(file_name,mime_type)").eq("company_id", c).order("created_at", { ascending: false }).limit(100);
  err(error); return (data ?? []) as { id: string; status: CapStatus; results: CapResult[]; created_at: string; extracted_at: string | null; file: { file_name: string; mime_type: string } | null }[];
}
export async function register(c: string, fileId: string) { const { data, error } = await db.rpc("fin_cap_register", { _company: c, _file: fileId }); err(error); return data as { id: string; replay?: boolean }; }
export async function addFile(c: string, file: File) { const up = await uploadProof(c, file); return register(c, up.id); }
export async function detail(id: string) { const { data, error } = await db.rpc("fin_cap_detail", { _id: id }); err(error); return data as Capture; }
export async function events(id: string) { const { data } = await db.from("fin_doc_capture_events").select("action,reason,created_at").eq("capture_id", id).order("created_at"); return (data ?? []) as { action: string; reason: string | null; created_at: string }[]; }
/** Lecture explicite seulement. Sans `force`, un résultat existant est réutilisé (aucune nouvelle consommation). */
export async function extract(id: string, force = false) {
  const { data, error } = await supabase.functions.invoke("fin-doc-extract", { body: { capture_id: id, force } });
  if (error) {
    let msg = "Échec de la lecture automatique";
    try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* corps illisible */ }
    throw new Error(msg);
  }
  return data as { status: "ok" | "cached"; documents?: number };
}
export async function saveEdits(id: string, e: Edits, rev: number) { const { data, error } = await db.rpc("fin_cap_save_edits", { _id: id, _edits: e, _rev: rev }); err(error); return data as { rev: number }; }
export async function create(id: string, kind: "bill" | "credit", index: number | null, p: Record<string, unknown>, dupReason: string | null) {
  const { data, error } = await db.rpc("fin_cap_create", { _id: id, _kind: kind, _index: index, _p: p, _dup_reason: dupReason }); err(error); return data as CapResult & { replay?: boolean };
}
export async function attach(id: string, bill: string) { const { data, error } = await db.rpc("fin_cap_attach", { _id: id, _bill: bill }); err(error); return data as CapResult & { replay?: boolean }; }
export async function dismiss(id: string, reason: string) { const { error } = await db.rpc("fin_cap_dismiss", { _id: id, _reason: reason }); err(error); }
export async function forBill(bill: string) { const { data, error } = await db.rpc("fin_cap_for_bill", { _bill: bill }); err(error); return (data ?? []) as { capture_id: string; file_id: string; name: string; kind: string; at: string }[]; }

const s = (n: number | null | undefined) => (n == null ? "" : String(n));
/** Suggestion → champs du formulaire. Inconnu = vide (« À compléter »), jamais 0; échéance seulement si écrite. */
export function editsFrom(doc: ExDoc | null, index: number, supplierId: string): Edits {
  const desc = doc?.lines?.length ? doc.lines.map((l) => [l.description, l.quantity != null ? `${l.quantity}${l.unit ? " " + l.unit : ""}` : null, l.amount != null ? `${l.amount} $` : null].filter(Boolean).join(" · ")).join("\n") : "";
  return { index, kind: doc?.doc_type === "note_credit" ? "credit" : "bill", supplier_id: supplierId, reference: doc?.reference ?? "", doc_date: doc?.doc_date ?? "", due_date: doc?.due_date ?? "",
    description: desc.slice(0, 2000), subtotal: s(doc?.subtotal), gst: s(doc?.gst), qst: s(doc?.qst), total: s(doc?.total), employee_paid: false };
}
/** Fournisseur proposé seulement sur correspondance exacte (insensible à la casse/accents); sinon aucun. */
export function matchSupplier(name: string | null, sups: { id: string; name: string; archived: boolean }[]) {
  if (!name) return { exact: null as string | null, close: [] as { id: string; name: string }[] };
  const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const n = norm(name); const act = sups.filter((x) => !x.archived);
  const exact = act.find((x) => norm(x.name) === n)?.id ?? null;
  const close = exact ? [] : act.filter((x) => { const m = norm(x.name); return m && (m.includes(n) || n.includes(m) || m.split(" ")[0] === n.split(" ")[0]); }).slice(0, 5);
  return { exact, close };
}
/** Incohérences signalées (jamais corrigées). */
export function warnings(doc: ExDoc | null, e: Edits): string[] {
  const w: string[] = [];
  const g = taxGap({ ...emptyBill(), subtotal: e.subtotal, gst: e.gst, qst: e.qst, total: e.total });
  if (g != null && g !== 0) w.push(`Écart de ${g.toFixed(2)} $ entre le total et avant taxes + TPS + TVQ.`);
  if (doc?.lines?.length) {
    const amts = doc.lines.map((l) => l.amount);
    if (amts.every((a) => a != null) && doc.subtotal != null) { const sum = Math.round(amts.reduce((a, b) => a + (b as number), 0) * 100) / 100; if (Math.abs(sum - doc.subtotal) > 0.01) w.push(`Somme des lignes lue (${sum.toFixed(2)} $) différente du sous-total lu (${doc.subtotal.toFixed(2)} $).`); }
  }
  if (doc?.other_taxes != null && doc.other_taxes !== 0) w.push(`Autre taxe lue (${doc.other_taxes} $) : à classer manuellement.`);
  if (doc?.currency && !["CAD", "$", "CA$", "$CA"].includes(doc.currency.toUpperCase().replace(/\s/g, ""))) w.push(`Devise lue « ${doc.currency} » : seul le CAD est pris en charge.`);
  return w;
}
export function toBillForm(e: Edits): BillForm { return { ...emptyBill(e.supplier_id), reference: e.reference, doc_date: e.doc_date, due_date: e.due_date, description: e.description, subtotal: e.subtotal, gst: e.gst, qst: e.qst, total: e.total }; }
export function toCreditForm(e: Edits): CreditForm { return { ...emptyCredit(e.supplier_id), reference: e.reference, doc_date: e.doc_date, description: e.description, subtotal: e.subtotal, gst: e.gst, qst: e.qst, total: e.total }; }
