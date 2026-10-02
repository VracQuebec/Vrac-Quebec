// FIN-12E — Import CSV des achats fournisseurs. Lecture et regroupement purs (testables) ;
// le serveur (fin_csv_check / fin_csv_commit) revalide tout et ne crée que des brouillons.
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type Field = "" | "type" | "supplier" | "reference" | "doc_date" | "due_date" | "currency" | "description" | "quantity" | "unit" | "unit_price"
  | "line_amount" | "subtotal" | "gst" | "qst" | "total" | "paid" | "balance";
export const FIELDS: { v: Field; l: string }[] = [
  { v: "", l: "— Ignorer —" }, { v: "type", l: "Type (facture / note de crédit)" }, { v: "supplier", l: "Fournisseur" }, { v: "reference", l: "Numéro du document" },
  { v: "doc_date", l: "Date du document" }, { v: "due_date", l: "Échéance" }, { v: "currency", l: "Devise" }, { v: "description", l: "Description de ligne" },
  { v: "quantity", l: "Quantité" }, { v: "unit", l: "Unité" }, { v: "unit_price", l: "Prix unitaire" }, { v: "line_amount", l: "Montant de ligne" },
  { v: "subtotal", l: "Sous-total du document" }, { v: "gst", l: "TPS" }, { v: "qst", l: "TVQ" }, { v: "total", l: "Total du document" },
  { v: "paid", l: "Montant payé / réglé" }, { v: "balance", l: "Solde restant" },
];
export const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const ALIASES: Record<string, Field> = {
  type: "type", typedocument: "type", typededocument: "type", document: "type", fournisseur: "supplier", supplier: "supplier", vendor: "supplier",
  numero: "reference", numerodefacture: "reference", nofacture: "reference", facture: "reference", reference: "reference", ref: "reference", invoice: "reference", invoiceno: "reference", numerodocument: "reference",
  date: "doc_date", datefacture: "doc_date", datedocument: "doc_date", datedufacture: "doc_date", invoicedate: "doc_date",
  echeance: "due_date", dateecheance: "due_date", datedecheance: "due_date", duedate: "due_date", devise: "currency", currency: "currency", monnaie: "currency",
  description: "description", libelle: "description", article: "description", quantite: "quantity", qte: "quantity", qty: "quantity", unite: "unit", unit: "unit",
  prixunitaire: "unit_price", unitprice: "unit_price", montantligne: "line_amount", montantdeligne: "line_amount", lineamount: "line_amount",
  soustotal: "subtotal", subtotal: "subtotal", tps: "gst", gst: "gst", tvq: "qst", qst: "qst", total: "total", totalfacture: "total", montanttotal: "total",
  paye: "paid", montantpaye: "paid", montantregle: "paid", regle: "paid", paid: "paid", solde: "balance", solderestant: "balance", balance: "balance",
};

/** CSV : séparateur , ; tabulation ou |, guillemets, BOM UTF-8. Toutes les valeurs restent du texte (zéros initiaux conservés). */
export function parseCsv(text: string): { delim: string; rows: string[][] } {
  text = text.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const cands = [";", ",", "\t", "|"];
  const count = (d: string) => { let n = 0, q = false; for (const c of first) { if (c === '"') q = !q; else if (!q && c === d) n++; } return n; };
  const delim = cands.reduce((a, b) => (count(b) > count(a) ? b : a), ",");
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return { delim, rows: rows.filter((r) => r.some((v) => v.trim() !== "")) };
}
export const autoMap = (headers: string[]): Field[] => headers.map((h) => ALIASES[norm(h)] ?? "");

export type NumFmt = "fr" | "en";
export type DateFmt = "iso" | "dmy" | "mdy";
/** Nombre : "1 234,56" (fr) ou "1,234.56" (en). Retourne null si vide, NaN si illisible. */
export function parseNum(s: string, fmt: NumFmt): number | null {
  let t = (s ?? "").replace(/[\s\u00a0\u202f$]/g, "").replace(/CAD$/i, "");
  if (!t) return null;
  t = fmt === "fr" ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(t) ? Math.round(Number(t) * 100) / 100 : NaN;
}
/** Un nombre est ambigu s'il ne contient qu'un seul séparateur suivi de 3 chiffres (ex. 1,234 ou 1.234). */
export const numAmbiguous = (s: string) => /^-?\d{1,3}[.,]\d{3}$/.test((s ?? "").replace(/[\s$]/g, ""));
export const numHint = (vals: string[]): NumFmt | null => {
  for (const v of vals) { const t = (v ?? "").replace(/[\s$]/g, ""); if (/,\d{1,2}$/.test(t)) return "fr"; if (/\.\d{1,2}$/.test(t)) return "en"; }
  return null;
};
/** Date : ISO AAAA-MM-JJ toujours acceptée ; JJ/MM/AAAA ou MM/JJ/AAAA seulement si le format a été choisi. */
export function parseDate(s: string, fmt: DateFmt | null): { v: string | null; err?: string } {
  const t = (s ?? "").trim(); if (!t) return { v: null };
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) {
    const a = +m[1], b = +m[2]; y = +m[3];
    if (fmt === "dmy") { d = a; mo = b; } else if (fmt === "mdy") { mo = a; d = b; }
    else if (a > 12 && b <= 12) return { v: null, err: `Date « ${t} » : choisissez le format des dates (jour/mois ou mois/jour)` };
    else return { v: null, err: `Date ambiguë « ${t} » : choisissez le format des dates` };
  } else return { v: null, err: `Date illisible « ${t} »` };
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { v: null, err: `Date invalide « ${t} »` };
  return { v: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}
export const hasSlashDates = (vals: string[]) => vals.some((v) => /^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test((v ?? "").trim()));

export type Sup = { id: string; name: string; archived?: boolean };
export type Doc = {
  key: string; kind: "facture" | "credit" | "releve" | "inconnu"; supplierName: string; supplierId: string | null; supplierChoices: Sup[];
  reference: string; rows: number[]; errors: string[];
  p: { supplier_id: string | null; reference: string; doc_date: string | null; due_date: string | null; currency: string; description: string;
    subtotal: number | null; gst: number | null; qst: number | null; total: number | null; lines: { description: string; quantity: number | null; unit: string; unit_price: number | null; amount: number | null }[] };
  hash: string;
};
const kindOf = (s: string): Doc["kind"] => {
  const n = norm(s); if (!n || n.startsWith("fact") || n === "invoice") return "facture";
  if (n.includes("credit")) return "credit"; if (n.includes("releve") || n.includes("statement")) return "releve"; return "inconnu";
};
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };

/** Regroupe les lignes en documents (type + fournisseur + numéro). Une erreur sur une ligne invalide tout le document. */
export function buildDocs(rows: string[][], map: Field[], o: { num: NumFmt; date: DateFmt | null; supplierMap: Record<string, string>; sups: Sup[] }): Doc[] {
  const col = (f: Field) => map.indexOf(f);
  const get = (r: string[], f: Field) => { const i = col(f); return i < 0 ? "" : (r[i] ?? "").trim(); };
  const groups = new Map<string, { idx: number; r: string[] }[]>();
  rows.forEach((r, i) => {
    const k = `${kindOf(get(r, "type"))}|${norm(get(r, "supplier"))}|${get(r, "reference").toLowerCase()}`;
    if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push({ idx: i + 2, r });
  });
  const out: Doc[] = [];
  for (const [key, g] of groups) {
    const errors: string[] = []; const r0 = g[0].r;
    const kind = kindOf(get(r0, "type")); const supplierName = get(r0, "supplier"); const reference = get(r0, "reference");
    const same = (f: Field, label: string) => { const vals = new Set(g.map((x) => get(x.r, f)).filter(Boolean)); if (vals.size > 1) errors.push(`${label} différent(e) entre les lignes ${g.map((x) => x.idx).join(", ")}`); return [...vals][0] ?? ""; };
    const num = (s: string, label: string, rowNo: number) => { const n = parseNum(s, o.num); if (Number.isNaN(n)) { errors.push(`Ligne ${rowNo} : ${label} illisible « ${s} »`); return null; } return n; };
    if (kind === "releve") errors.push("Relevé fournisseur : il reprend des dettes déjà enregistrées et n'est jamais importé comme nouvelle facture");
    if (kind === "inconnu") errors.push(`Type de document non reconnu « ${get(r0, "type")} »`);
    if (!supplierName) errors.push("Fournisseur manquant");
    if (!reference) errors.push("Numéro du document manquant");
    const dd = parseDate(same("doc_date", "Date"), o.date); if (dd.err) errors.push(dd.err); if (!dd.v && !dd.err) errors.push("Date du document manquante");
    const due = parseDate(same("due_date", "Échéance"), o.date); if (due.err) errors.push(due.err);
    const cur = (same("currency", "Devise") || "CAD").toUpperCase(); if (cur !== "CAD") errors.push(`Devise ${cur} non prise en charge (CAD seulement)`);
    const dn = (f: Field, l: string) => num(same(f, l), l, g[0].idx);
    const subtotal = dn("subtotal", "Sous-total"), gst = dn("gst", "TPS"), qst = dn("qst", "TVQ"), total = dn("total", "Total");
    const paid = dn("paid", "Montant payé"), balance = dn("balance", "Solde restant");
    if (total == null) errors.push("Total du document manquant");
    if (paid != null && paid !== 0) errors.push("Montant déjà payé indiqué : l'import ne crée aucun règlement ; saisissez ce document et son règlement par le parcours existant");
    if (balance != null && total != null && Math.abs(balance - total) > 0.005) errors.push("Solde restant différent du total : un historique de paiement serait nécessaire (non pris en charge par l'import)");
    const lines = g.map((x) => ({ description: get(x.r, "description"), quantity: num(get(x.r, "quantity"), "Quantité", x.idx), unit: get(x.r, "unit"),
      unit_price: num(get(x.r, "unit_price"), "Prix unitaire", x.idx), amount: num(get(x.r, "line_amount"), "Montant de ligne", x.idx) }))
      .filter((l) => l.description || l.amount != null || l.quantity != null);
    lines.forEach((l, i) => { if (l.quantity != null && l.unit_price != null && l.amount != null && Math.abs(l.quantity * l.unit_price - l.amount) > 0.01) errors.push(`Ligne ${g[i].idx} : quantité × prix ≠ montant`); });
    const lsum = lines.some((l) => l.amount != null) ? Math.round(lines.reduce((s, l) => s + (l.amount ?? 0), 0) * 100) / 100 : null;
    if (subtotal != null && gst != null && qst != null && total != null && Math.abs(subtotal + gst + qst - total) > 0.01) errors.push(`Montant incohérent : ${subtotal} + ${gst} + ${qst} ≠ ${total}`);
    if (lsum != null && subtotal != null && Math.abs(lsum - subtotal) > 0.01) errors.push(`Montant incohérent : somme des lignes ${lsum} ≠ sous-total ${subtotal}`);
    const cands = o.sups.filter((s) => !s.archived && norm(s.name) === norm(supplierName));
    const chosen = o.supplierMap[norm(supplierName)];
    const supplierId = chosen && o.sups.some((s) => s.id === chosen) ? chosen : cands.length === 1 ? cands[0].id : null;
    if (supplierName && !supplierId) errors.push(cands.length > 1 ? "Fournisseur ambigu : choisissez la fiche" : "Fournisseur introuvable : associez une fiche existante");
    const p = { supplier_id: supplierId, reference, doc_date: dd.v, due_date: due.v, currency: cur, description: lines.length === 1 ? lines[0].description : `${lines.length} lignes importées`,
      subtotal, gst, qst, total, lines };
    out.push({ key, kind, supplierName, supplierId, supplierChoices: cands, reference, rows: g.map((x) => x.idx), errors: [...new Set(errors)], p, hash: fnv(JSON.stringify(p)) });
  }
  return out;
}
export const docPayload = (d: Doc) => ({ key: d.key, kind: d.kind, rows: d.rows, hash: d.hash, p: { ...d.p, subtotal: d.p.subtotal ?? "", gst: d.p.gst ?? "", qst: d.p.qst ?? "", total: d.p.total ?? "" } });

export type Check = { key: string; problem: string | null; outcome: "nouveau" | "deja_present" | "conflit" | "refuse"; existing: { id: string; total: number | null; status: string } | null };
export async function check(c: string, docs: Doc[]): Promise<Check[]> {
  const { data, error } = await db.rpc("fin_csv_check", { _company: c, _docs: docs.map(docPayload) }); if (error) throw new Error(error.message); return data;
}
export type Result = { import_id: string; replay?: boolean; counts: { cree: number; deja_present: number; conflit: number; refuse: number };
  docs: { key: string; outcome: string; reason: string | null; bill_id: string | null; credit_id: string | null }[] };
export async function commit(c: string, requestKey: string, fileName: string, fileSha: string, settings: unknown, docs: Doc[]): Promise<Result> {
  const { data, error } = await db.rpc("fin_csv_commit", { _company: c, _request_key: requestKey, _file_name: fileName, _file_sha: fileSha, _settings: settings, _docs: docs.map(docPayload) });
  if (error) throw new Error(error.message); return data;
}

export const TEMPLATE = "type;fournisseur;numero;date;echeance;devise;description;quantite;unite;prix_unitaire;montant_ligne;sous_total;tps;tvq;total\n";
export const EXAMPLE = TEMPLATE +
  "facture;Fournisseur Fictif Ltée;000123;2026-09-15;2026-10-15;CAD;Gravier concassé 0-3/4;10;t;25,50;255,00;355,00;17,75;35,41;408,16\n" +
  "facture;Fournisseur Fictif Ltée;000123;2026-09-15;2026-10-15;CAD;Livraison;1;forfait;100,00;100,00;355,00;17,75;35,41;408,16\n" +
  "note de crédit;Fournisseur Fictif Ltée;NC-0045;2026-09-20;;CAD;Retour de matériel;;;;;50,00;2,50;4,99;57,49\n";
