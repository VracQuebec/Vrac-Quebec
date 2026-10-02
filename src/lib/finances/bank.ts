// FIN-13A — Relevés bancaires CSV et rapprochement confirmé. Lecture/correspondance pures (testables) ;
// le serveur (fin_bank_preview / fin_bank_commit / fin_bank_match …) revalide tout. Une ligne de relevé est une
// observation : jamais de facture, règlement, revenu ou dépense créés, jamais ajoutée à la trésorerie.
import { supabase } from "@/integrations/supabase/client";
import { parseCsv, norm, type NumFmt, type DateFmt } from "./csvImport";

const db = supabase as any;
export { parseCsv };
export type BField = "" | "date" | "amount" | "debit" | "credit" | "description" | "reference" | "bank_id" | "currency";
export const BFIELDS: { v: BField; l: string }[] = [
  { v: "", l: "— Ignorer —" }, { v: "date", l: "Date de l'opération" }, { v: "amount", l: "Montant signé" }, { v: "debit", l: "Débit (sortie)" },
  { v: "credit", l: "Crédit (entrée)" }, { v: "description", l: "Libellé" }, { v: "reference", l: "Référence" }, { v: "bank_id", l: "Identifiant bancaire de l'opération" }, { v: "currency", l: "Devise" },
];
const AL: Record<string, BField> = {
  date: "date", dateoperation: "date", datedoperation: "date", transactiondate: "date", dateval: "date",
  montant: "amount", amount: "amount", montantsigne: "amount", debit: "debit", retrait: "debit", sortie: "debit", withdrawal: "debit",
  credit: "credit", depot: "credit", entree: "credit", deposit: "credit", libelle: "description", description: "description", details: "description",
  reference: "reference", ref: "reference", nocheque: "reference", identifiant: "bank_id", idtransaction: "bank_id", transactionid: "bank_id", fitid: "bank_id",
  devise: "currency", currency: "currency",
};
export const autoMapBank = (h: string[]): BField[] => h.map((x) => AL[norm(x)] ?? "");
export type Settings = { date_fmt: DateFmt | null; num_fmt: NumFmt | null; mode: "signed" | "split" | null; sign: "positive_in" | "positive_out" | null };
export type SrcRow = { row_no: number; date: string; amount: string; debit: string; credit: string; description: string; reference: string; bank_id: string; currency: string; raw: Record<string, string> };

/** Lignes sources : valeurs originales conservées telles quelles (texte), aucune interprétation ici. */
export function buildRows(rows: string[][], map: BField[]): SrcRow[] {
  const headers = rows[0] ?? [];
  return rows.slice(1).map((r, i) => {
    const g = (f: BField) => { const k = map.indexOf(f); return k < 0 ? "" : (r[k] ?? "").trim(); };
    return { row_no: i + 2, date: g("date"), amount: g("amount"), debit: g("debit"), credit: g("credit"), description: g("description"), reference: g("reference"),
      bank_id: g("bank_id"), currency: g("currency"), raw: Object.fromEntries(headers.map((h, k) => [h || `col${k + 1}`, r[k] ?? ""])) };
  });
}
/** Contrôles de l'écran avant envoi (le serveur refait tout) : formats choisis explicitement. */
export function settingsProblem(map: BField[], s: Settings): string | null {
  if (!map.includes("date")) return "Associez la colonne de date.";
  if (!s.mode) return "Choisissez : une colonne de montant signé ou deux colonnes débit/crédit.";
  if (s.mode === "signed" && !map.includes("amount")) return "Associez la colonne de montant signé.";
  if (s.mode === "split" && (!map.includes("debit") || !map.includes("credit"))) return "Associez les colonnes débit et crédit.";
  if (s.mode === "signed" && !s.sign) return "Choisissez le sens du montant signé (positif = entrée ou positif = sortie).";
  if (!s.date_fmt) return "Choisissez le format des dates.";
  if (!s.num_fmt) return "Choisissez le format des nombres.";
  return null;
}

export type Eval = { row_no: number; outcome: "nouveau" | "deja_present" | "a_examiner" | "refuse"; reason: string | null; date: string | null; amount: number | null; description: string | null; reference: string | null; bank_id: string | null; existing: any[] };
export type Summary = { import_id: string; ajoutees: number; deja_presentes: number; doublons_confirmes: number; a_examiner: number; refusees: number; total_in: number; total_out: number; balance: any; rows: (Eval & { result: string; line_id?: string })[]; replay?: boolean };
const rpc = async (fn: string, args: Record<string, unknown>) => { const { data, error } = await db.rpc(fn, args); if (error) throw Object.assign(new Error(error.message), { code: error.code }); return data; };

export const preview = (company: string, account: string, rows: SrcRow[], s: Settings) => rpc("fin_bank_preview", { _company: company, _account: account, _rows: rows, _settings: s }) as Promise<Eval[]>;
/** Original conservé en privé (base, lecture limitée aux droits financiers de l'entreprise); empreinte calculée côté serveur. */
export async function uploadStatement(company: string, name: string, text: string) {
  if (new Blob([text]).size > 2 * 1024 * 1024) throw new Error("Fichier trop lourd (2 Mo au maximum).");
  const r = await rpc("fin_bank_file_put", { _company: company, _name: name, _content: text });
  return { id: null as string | null, sha: r.sha as string };
}
export async function downloadOriginal(importId: string) {
  const r = await rpc("fin_bank_file_get", { _import: importId });
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([r.content], { type: "text/csv;charset=utf-8" })); a.download = r.file_name; a.click();
}
export const commit = (a: { company: string; account: string; rows: SrcRow[]; settings: Settings; fileName: string; sha: string; fileId: string | null; key: string; decisions: Record<string, "add" | "skip">; opening: number | null; closing: number | null; complete: boolean }) =>
  rpc("fin_bank_commit", { _company: a.company, _account: a.account, _rows: a.rows, _settings: a.settings, _file_name: a.fileName, _file_sha: a.sha, _file_id: a.fileId,
    _request_key: a.key, _decisions: a.decisions, _opening: a.opening, _closing: a.closing, _complete: a.complete }) as Promise<Summary>;

export type Line = { id: string; date: string; amount: number; description: string | null; reference: string | null; bank_id: string | null; status: "a_rapprocher" | "a_examiner" | "rapproche" | "exclu"; reason: string | null; rev: number; distinct: boolean; import_id: string; row_no: number; raw: Record<string, string>; suggest: boolean; twins: number;
  match: { id: string; at: string; items: { kind: string; id: string; amount: number; label: string | null; date: string | null }[] } | null; history: { kind: string; at: string; detail: any }[] | null };
export type Overview = { lines: Line[]; totals: Record<string, number>; imports: any[]; internal: { count: number; in: number; out: number; rows: Cand[] }; fully_reconciled: boolean; period_from: string | null; period_to: string | null };
export type Cand = { kind: string; id: string; dir: "in" | "out"; amount: number; date: string; label: string; party: string | null; reference: string | null; account_id: string | null; exact?: boolean; days?: number; reasons?: string[] };
export const overview = (company: string, account: string) => rpc("fin_bank_overview", { _company: company, _account: account }) as Promise<Overview>;
export const candidates = (line: string, q: string, days: number) => rpc("fin_bank_candidates", { _line: line, _q: q || null, _days: days }) as Promise<Cand[]>;
export const match = (line: string, items: { kind: string; id: string }[], key: string) => rpc("fin_bank_match", { _line: line, _items: items, _idem: key });
export const unmatch = (id: string, reason: string) => rpc("fin_bank_unmatch", { _match: id, _reason: reason });
export const setStatus = (line: string, status: string, reason: string, rev: number) => rpc("fin_bank_set_status", { _line: line, _status: status, _reason: reason, _rev: rev });

/** Statut affiché : « Suggestion disponible » = à rapprocher avec au moins un mouvement de même montant proche. */
export const displayStatus = (l: Pick<Line, "status" | "suggest">) => l.status === "a_rapprocher" && l.suggest ? "suggestion" : l.status;
export const STATUS_LABEL: Record<string, string> = { a_rapprocher: "À rapprocher", suggestion: "Suggestion disponible", rapproche: "Rapproché", a_examiner: "À examiner", exclu: "Exclu" };
export const KIND_LINK: Record<string, string> = { payment: "reglements", receipt: "factures", refund: "achats", credit_refund: "achats", restitution: "frais" };
export const TEMPLATE = "Date;Libellé;Référence;Identifiant;Débit;Crédit;Devise\n2026-10-02;PAIEMENT FOURNISSEUR DEMO;CHQ-0001;TEST-0001;1 200,00;;CAD\n2026-10-02;REMBOURSEMENT FOURNISSEUR DEMO;;TEST-0002;;50,00;CAD\n2026-10-03;FRAIS FICTIFS;;TEST-0003;2,50;;CAD\n";
