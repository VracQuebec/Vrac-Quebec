// FIN-03 — Règlements déclarés (saisie manuelle, non rapprochée). Tous les calculs de solde sont faits par la base.
import { supabase } from "@/integrations/supabase/client";
import { FILE_MAX, FILE_MIME } from "@/lib/entcrm/catalog";

const db = supabase as any;
const err = (e: any) => { if (e) throw new Error(e.message || "Erreur serveur"); };

export const SETTLE_LABEL: Record<string, string> = {
  non_reglee: "Non réglée", partielle: "Partiellement réglée", reglee: "Réglée", a_confirmer: "Règlement à confirmer",
  a_completer: "À compléter", aucun: "Aucun montant à régler", annulee: "Annulée",
};
export const SETTLE_TONE: Record<string, string> = {
  non_reglee: "bg-secondary text-foreground", partielle: "bg-amber-500/15 text-amber-800", reglee: "bg-primary/15 text-foreground",
  a_confirmer: "bg-secondary text-muted-foreground", a_completer: "bg-secondary text-muted-foreground", aucun: "bg-secondary text-muted-foreground", annulee: "bg-secondary text-muted-foreground",
};
export const METHOD_LABEL: Record<string, string> = { interac: "Interac", virement: "Virement", cheque: "Chèque", especes: "Espèces", carte: "Carte", prelevement: "Prélèvement", autre: "Autre" };
export const PAY_STATUS: Record<string, string> = { draft: "Brouillon (sans effet sur les soldes)", validated: "Règlement déclaré — non rapproché", voided: "Saisie annulée", returned: "Paiement retourné / refusé" };
export const EVENT_LABEL: Record<string, string> = {
  payment: "Règlement déclaré", payment_draft: "Brouillon de règlement", payment_validate: "Brouillon validé", allocate: "Affectation", allocation_reversed: "Affectation retirée",
  payment_void: "Saisie annulée", payment_returned: "Paiement retourné / refusé", refund: "Remboursement reçu", refund_void: "Remboursement annulé", file: "Justificatif ajouté",
  confirm_unsettled: "Situation antérieure validée", protected: "Échéance conservée (règlement lié)", pause_lift: "Suspension levée",
};

export type Alloc = { occurrence_id: string; amount: number };
export type SaveResult = { rows: { occurrence_id: string; label: string; due: string; amount: number; quality: string; paid_before: number; alloc: number; balance_after: number }[]; total: number; remainder: number; payee: string; amount?: number; duplicates: { id: string; paid_on: string; amount: number }[]; payment_id?: string; replayed?: boolean; draft?: boolean };

export async function savePayment(c: string, p: Record<string, unknown>, dry: boolean) { const { data, error } = await db.rpc("fin_payment_save", { _company: c, _p: p, _dry: dry }); err(error); return data as SaveResult; }
export async function validateDraft(id: string, dry: boolean) { const { data, error } = await db.rpc("fin_payment_validate", { _payment: id, _dry: dry }); err(error); return data; }
export async function allocate(id: string, allocs: Alloc[], idem: string | null, dry: boolean) { const { data, error } = await db.rpc("fin_payment_allocate", { _payment: id, _allocs: allocs, _idem: idem, _dry: dry }); err(error); return data as SaveResult & { available: number }; }
export async function voidPayment(id: string, kind: "entry_error" | "returned", reason: string) { const { data, error } = await db.rpc("fin_payment_void", { _payment: id, _kind: kind, _reason: reason }); err(error); return data; }
export async function reverseAlloc(id: string, reason: string) { const { error } = await db.rpc("fin_allocation_reverse", { _alloc: id, _reason: reason }); err(error); }
export async function addRefund(id: string, amount: number, date: string, reason: string, dry: boolean) { const { data, error } = await db.rpc("fin_refund_add", { _payment: id, _amount: amount, _date: date, _reason: reason, _dry: dry }); err(error); return data; }
export async function voidRefund(id: string, reason: string) { const { error } = await db.rpc("fin_refund_void", { _refund: id, _reason: reason }); err(error); }
export async function confirmUnsettled(occ: string) { const { error } = await db.rpc("fin_confirm_unsettled", { _occ: occ }); err(error); }
export async function occDetail(occ: string) { const { data, error } = await db.rpc("fin_occurrence_detail", { _occ: occ }); err(error); return data; }
export async function payDetail(id: string) { const { data, error } = await db.rpc("fin_payment_detail", { _payment: id }); err(error); return data; }
export async function listPayments(c: string, from: string, to: string, f: Record<string, string | undefined>) {
  const clean = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const { data, error } = await db.rpc("fin_payments_list", { _company: c, _from: from, _to: to, _f: clean }); err(error); return (data ?? []) as any[];
}
export async function openForPayee(c: string, payee: string) { const { data, error } = await db.rpc("fin_open_for_payee", { _company: c, _payee: payee }); err(error); return (data ?? []) as { id: string; due_date: string; label: string; amount: number; amount_quality: string; balance: number }[]; }
export async function liftPause(id: string, eff: string, reason: string, dry: boolean) { const { data, error } = await db.rpc("fin_lift_pause", { _pause: id, _effective: eff, _reason: reason, _dry: dry }); err(error); return data as { restore: { due: string; amount: number | null }[]; not_applicable: { due: string }[]; kept_other: number; effective: string }; }
export async function seasonSample(c: string, p: Record<string, unknown>) { const { data, error } = await db.rpc("fin_season_sample", { _company: c, _p: p }); err(error); return (data ?? []) as { start: string; end: string; dates: string[] }[]; }

/** Justificatif : stockage privé existant, via une fonction serveur contrôlée par les droits Finances. */
export async function attachFile(_companyId: string, paymentId: string, file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!FILE_MIME[ext]) throw new Error("Format non accepté (PDF, JPG, PNG, WEBP, HEIC).");
  if (!file.size || file.size > FILE_MAX) throw new Error("Fichier vide ou trop lourd (20 Mo au maximum).");
  const fd = new FormData(); fd.append("payment_id", paymentId); fd.append("file", file);
  const { data, error } = await supabase.functions.invoke("fin-payment-file", { body: fd });
  if (error || data?.error) throw new Error(data?.error || (await (error as any)?.context?.json?.().catch(() => null))?.error || "Envoi refusé");
}
/** mode "view" : ouverture dans un nouvel onglet (aperçu du navigateur); "download" : téléchargement. Lien temporaire de 5 min, renouvelé à chaque clic après contrôle des droits. */
export async function openFile(paymentId: string, fileId: string, mode: "view" | "download" = "view") {
  const w = window.open("", "_blank");
  const { data, error } = await supabase.functions.invoke("fin-payment-file", { body: { payment_id: paymentId, file_id: fileId, mode } });
  if (error || !data?.url) { w?.close(); throw new Error("Consultation impossible : la pièce existe mais n'a pas pu être ouverte (accès refusé ou service indisponible). Réessayez."); }
  if (w) w.location.href = data.url; else window.open(data.url, "_blank", "noopener");
}
