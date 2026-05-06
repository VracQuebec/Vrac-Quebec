import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, X, CheckCircle2, AlertTriangle, Info, Filter, FileSpreadsheet, Upload } from "lucide-react";

type RowReport = { row: number; dompe?: string; identifier?: string; reason: string; status: "inserted" | "skipped" | "failed" | "backfilled" };
type TabReport = { tab: string | null; total: number; inserted: number; skipped: number; failed: number; backfilled: number; rows: RowReport[] };
type Result = { report: Record<string, TabReport>; errors: string[]; tabs: Record<string, string | null> };

const TAB_LABELS: Record<string, string> = { clients: "Clients (leads)", entrepreneurs: "Entrepreneurs", payments: "Paiements", expenses: "Factures" };
type Filt = "all" | "failed" | "skipped" | "backfilled";

// ---------- helpers ----------
const s = (v: any) => (v === undefined || v === null ? "" : String(v).trim());
const num = (v: any): number | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const str = String(v).replace(/[^0-9.,-]/g, "").replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
};
const splitList = (v: any): string[] => s(v).split(/[;,]/).map((x) => x.trim()).filter(Boolean);

// Normalize: lowercase, strip diacritics, collapse whitespace.
// Handles trailing spaces ("Paiements ") and variants ("Factures 2025").
const norm = (v: string) =>
  (v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const findSheet = (titles: string[], keywords: string[]): string | null => {
  const ks = keywords.map(norm);
  // 1) exact match (after normalization)
  for (const t of titles) if (ks.includes(norm(t))) return t;
  // 2) starts-with
  for (const t of titles) { const n = norm(t); if (ks.some((k) => n.startsWith(k))) return t; }
  // 3) contains
  for (const t of titles) { const n = norm(t); if (ks.some((k) => n.includes(k))) return t; }
  return null;
};

function emptyReport(tab: string | null): TabReport {
  return { tab, total: 0, inserted: 0, skipped: 0, failed: 0, backfilled: 0, rows: [] };
}

function sheetToRows(wb: XLSX.WorkBook, name: string | null): any[][] {
  if (!name) return [];
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true, blankrows: false }) as any[][];
}

// ---------- importers ----------
async function importEntrepreneurs(rows: any[][], rep: TabReport) {
  const { data: existing } = await supabase.from("entrepreneurs").select("email");
  const seen = new Set((existing || []).map((e: any) => (e.email || "").toLowerCase()).filter(Boolean));
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; const rowNum = i + 1;
    if (!s(r[0]) && !s(r[1])) continue;
    rep.total++;
    const ident = s(r[0]) || s(r[1]);
    const email = s(r[3]).toLowerCase();
    if (email && seen.has(email)) { rep.skipped++; rep.rows.push({ row: rowNum, identifier: ident, status: "skipped", reason: `Doublon (email ${email})` }); continue; }
    const payload = {
      name: s(r[0]) || "Sans nom", company: s(r[1]), phone: s(r[2]), email: s(r[3]),
      address: s(r[4]), truck_types: splitList(r[5]), map_number: s(r[6]),
      truck_count: s(r[7]), notes: s(r[8]),
    };
    const { error } = await supabase.from("entrepreneurs").insert(payload);
    if (error) { rep.failed++; rep.rows.push({ row: rowNum, identifier: ident, status: "failed", reason: error.message }); }
    else { rep.inserted++; if (email) seen.add(email); }
  }
}

async function importClients(rows: any[][], rep: TabReport) {
  const { data: existing } = await supabase.from("submissions").select("id,email,phone,dompe_number");
  const seenKey = new Set((existing || []).map((e: any) => `${(e.email || "").toLowerCase()}|${(e.phone || "").replace(/\D/g, "")}`));
  const seenDompe = new Set((existing || []).map((e: any) => (e.dompe_number || "").toLowerCase().trim()).filter(Boolean));
  const byKey = new Map<string, { id: string; dompe_number: string | null }>();
  for (const row of (existing || []) as any[]) {
    const k = `${(row.email || "").toLowerCase()}|${(row.phone || "").replace(/\D/g, "")}`;
    if (k !== "|" && !byKey.has(k)) byKey.set(k, { id: row.id, dompe_number: row.dompe_number });
  }
  // Process in original row order — preserves DOMPE ordering exactly as in Excel
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; const rowNum = i + 1;
    if (!s(r[0]) && !s(r[2])) continue;
    rep.total++;
    const email = s(r[2]); const phone = s(r[1]); const dompe = s(r[5]);
    const ident = s(r[0]) || email || phone;
    const key = `${email.toLowerCase()}|${phone.replace(/\D/g, "")}`;

    // Backfill: existing lead, no DOMPE yet → just update DOMPE
    if (dompe) {
      const match = byKey.get(key);
      if (match && !(match.dompe_number || "").trim()) {
        const { error } = await supabase.from("submissions").update({ dompe_number: dompe }).eq("id", match.id);
        if (error) { rep.failed++; rep.rows.push({ row: rowNum, dompe, identifier: ident, status: "failed", reason: `Backfill: ${error.message}` }); }
        else { rep.backfilled++; seenDompe.add(dompe.toLowerCase()); rep.rows.push({ row: rowNum, dompe, identifier: ident, status: "backfilled", reason: "Numéro DOMPE ajouté à un lead existant" }); }
        continue;
      }
    }
    if (dompe && seenDompe.has(dompe.toLowerCase())) { rep.skipped++; rep.rows.push({ row: rowNum, dompe, identifier: ident, status: "skipped", reason: `Doublon (DOMPE ${dompe} déjà importé)` }); continue; }
    if (!dompe && key !== "|" && seenKey.has(key)) { rep.skipped++; rep.rows.push({ row: rowNum, identifier: ident, status: "skipped", reason: "Doublon (email/téléphone déjà présent)" }); continue; }

    const lat = num(r[12]); const lon = num(r[13]);
    const payload: any = {
      dompe_number: dompe,
      name: s(r[0]) || "Sans nom",
      phone, email: email || "no-email@import.local",
      address: s(r[3]) || s(r[4]), postal_code: s(r[4]),
      materials: splitList(r[6]).length ? splitList(r[6]) : ["Autre"],
      quantity: s(r[7]), accessibility: splitList(r[8]),
      machinery_available: /oui|yes|tracteur|pelle|bobcat|mini/i.test(s(r[9])) && !/aucune/i.test(s(r[9])),
      machinery_description: s(r[9]), budget_max: s(r[10]),
      internal_notes: s(r[11]) ? `[Import Excel${dompe ? " - " + dompe : ""}] ${s(r[11])}` : `[Import Excel${dompe ? " - " + dompe : ""}]`,
      latitude: lat, longitude: lon,
      property_type: "résidentiel", tonnage: "",
      request_type: "livraison", status: "nouveau", visible_to_entrepreneur: true,
    };
    const { error } = await supabase.from("submissions").insert(payload);
    if (error) { rep.failed++; rep.rows.push({ row: rowNum, dompe, identifier: ident, status: "failed", reason: error.message }); }
    else { rep.inserted++; seenKey.add(key); if (dompe) seenDompe.add(dompe.toLowerCase()); }
  }
}

async function importPayments(rows: any[][], rep: TabReport) {
  const { data: existing } = await supabase.from("payments").select("delivery_date,client_name,map_point");
  const seen = new Set((existing || []).map((e: any) => `${e.delivery_date}|${e.client_name}|${e.map_point}`));
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; const rowNum = i + 1;
    if (!s(r[0]) && !s(r[2])) continue;
    rep.total++;
    const ident = s(r[2]) || s(r[0]);
    const key = `${s(r[0])}|${s(r[2])}|${s(r[1])}`;
    if (seen.has(key)) { rep.skipped++; rep.rows.push({ row: rowNum, identifier: ident, status: "skipped", reason: "Doublon (date+client+map déjà présent)" }); continue; }
    const payload = {
      delivery_date: s(r[0]), map_point: s(r[1]), client_name: s(r[2]), client_phone: s(r[3]),
      client_email: s(r[4]), client_address: s(r[5]), material: s(r[6]), trips: s(r[7]),
      price_sold: num(r[8]), charged_to_entrepreneur: num(r[9]), total: num(r[10]),
      entrepreneur_invoiced: s(r[11]), client_invoiced: s(r[12]), client_payment_date: s(r[13]),
      client_confirmation: s(r[14]), entrepreneur_payment_date: s(r[15]),
      entrepreneur_confirmation: s(r[16]), notes: s(r[17]),
    };
    const { error } = await supabase.from("payments").insert(payload);
    if (error) { rep.failed++; rep.rows.push({ row: rowNum, identifier: ident, status: "failed", reason: error.message }); }
    else { rep.inserted++; seen.add(key); }
  }
}

async function importExpenses(rows: any[][], rep: TabReport) {
  const { data: existing } = await supabase.from("expenses").select("expense_date,invoice_number,category");
  const seen = new Set((existing || []).map((e: any) => `${e.category}|${e.expense_date}|${e.invoice_number}`));
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i]; const rowNum = i + 1;
    const groups: { cat: "fournitures" | "gaz"; payload: any; ident: string }[] = [];
    if (s(r[0]) && s(r[1])) groups.push({ cat: "fournitures", ident: `${s(r[1])} ${s(r[2])}`, payload: { category: "fournitures", expense_date: s(r[0]), company: s(r[1]), invoice_number: s(r[2]), tps: num(r[3]), tvq: num(r[4]), fees: num(r[5]), amount_before_tax: num(r[6]), amount_total: num(r[7]) } });
    if (s(r[9]) && s(r[10])) groups.push({ cat: "gaz", ident: `${s(r[10])} ${s(r[11])}`, payload: { category: "gaz", expense_date: s(r[9]), company: s(r[10]), invoice_number: s(r[11]), tps: num(r[12]), tvq: num(r[13]), amount_before_tax: num(r[14]), amount_total: num(r[15]) } });
    for (const g of groups) {
      rep.total++;
      const k = `${g.cat}|${g.payload.expense_date}|${g.payload.invoice_number}`;
      if (seen.has(k)) { rep.skipped++; rep.rows.push({ row: rowNum, identifier: `[${g.cat}] ${g.ident}`, status: "skipped", reason: "Doublon (catégorie+date+facture)" }); continue; }
      const { error } = await supabase.from("expenses").insert(g.payload);
      if (error) { rep.failed++; rep.rows.push({ row: rowNum, identifier: `[${g.cat}] ${g.ident}`, status: "failed", reason: error.message }); }
      else { rep.inserted++; seen.add(k); }
    }
  }
}

// ---------- component ----------
export default function ExcelImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [result, setResult] = useState<Result | null>(null);
  const [activeTab, setActiveTab] = useState<string>("clients");
  const [filt, setFilt] = useState<Filt>("failed");
  const inputRef = useRef<HTMLInputElement>(null);

  const run = async () => {
    if (!file) return;
    setRunning(true); setResult(null); setProgress("Lecture du fichier Excel…");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const titles = wb.SheetNames;

      const tabClients = findSheet(titles, ["clients", "client"]);
      const tabEntrepreneurs = findSheet(titles, ["entrepreneurs", "entrepreneur"]);
      const tabPayments = findSheet(titles, ["paiements", "paiement"]);
      const tabExpenses = findSheet(titles, ["factures 2025", "factures", "facture"]);

      const reports: Record<string, TabReport> = {
        clients: emptyReport(tabClients),
        entrepreneurs: emptyReport(tabEntrepreneurs),
        payments: emptyReport(tabPayments),
        expenses: emptyReport(tabExpenses),
      };
      const errors: string[] = [];

      try { setProgress("Import: Entrepreneurs…"); if (tabEntrepreneurs) await importEntrepreneurs(sheetToRows(wb, tabEntrepreneurs), reports.entrepreneurs); else errors.push(`Onglet 'Entrepreneurs' introuvable. Onglets: ${titles.join(", ")}`); } catch (e) { errors.push(`entrepreneurs: ${(e as Error).message}`); }
      try { setProgress("Import: Clients (leads)…"); if (tabClients) await importClients(sheetToRows(wb, tabClients), reports.clients); else errors.push(`Onglet 'Clients' introuvable. Onglets: ${titles.join(", ")}`); } catch (e) { errors.push(`clients: ${(e as Error).message}`); }
      try { setProgress("Import: Paiements…"); if (tabPayments) await importPayments(sheetToRows(wb, tabPayments), reports.payments); else errors.push(`Onglet 'Paiements' introuvable. Onglets: ${titles.join(", ")}`); } catch (e) { errors.push(`payments: ${(e as Error).message}`); }
      try { setProgress("Import: Factures…"); if (tabExpenses) await importExpenses(sheetToRows(wb, tabExpenses), reports.expenses); else errors.push(`Onglet 'Factures' introuvable. Onglets: ${titles.join(", ")}`); } catch (e) { errors.push(`expenses: ${(e as Error).message}`); }

      const res: Result = { report: reports, errors, tabs: { clients: tabClients, entrepreneurs: tabEntrepreneurs, payments: tabPayments, expenses: tabExpenses } };
      setResult(res); onImported();
      const totalIns = reports.clients.inserted + reports.entrepreneurs.inserted + reports.payments.inserted + reports.expenses.inserted;
      toast({ title: "Import Excel terminé", description: `${totalIns} ligne(s) ajoutée(s) au CRM` });
    } catch (e: any) {
      toast({ title: "Erreur d'import Excel", description: e.message || "Échec du traitement", variant: "destructive" });
    } finally { setRunning(false); setProgress(""); }
  };

  const downloadCsv = () => {
    if (!result) return;
    const lines = ["section,ligne,statut,dompe,identifiant,raison"];
    for (const [section, rep] of Object.entries(result.report)) {
      for (const r of rep.rows) {
        const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        lines.push([section, r.row, r.status, r.dompe || "", r.identifier || "", r.reason].map(esc).join(","));
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `rapport-import-excel-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const rep = result?.report?.[activeTab];
  const filteredRows = rep?.rows.filter((r) => (filt === "all" ? true : r.status === filt)) || [];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-display font-bold flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" /> Importer fichier Excel (.xlsx)</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        {!result && (
          <>
            <p className="text-sm text-muted-foreground font-body mb-4">
              Source de vérité = fichier Excel. Conserve l'ordre original des lignes et les numéros DOMPE. Détecte automatiquement les onglets <strong>Clients</strong>, <strong>Entrepreneurs</strong>, <strong>Paiements</strong>, <strong>Factures</strong>. Doublons ignorés.
            </p>

            <input ref={inputRef} type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden
              onChange={(e) => setFile(e.target.files?.[0] || null)} />

            <button onClick={() => inputRef.current?.click()} disabled={running}
              className="w-full mb-3 px-4 py-6 rounded-lg border-2 border-dashed border-border hover:border-primary bg-secondary/30 text-sm font-body flex flex-col items-center gap-2">
              <Upload className="w-6 h-6 text-muted-foreground" />
              {file ? <span className="font-semibold">{file.name} <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)} Ko)</span></span> : <span>Cliquer pour choisir un fichier .xlsx</span>}
            </button>

            <button onClick={run} disabled={running || !file}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-600 text-white font-display font-bold hover:opacity-90 disabled:opacity-50">
              {running ? <><Loader2 className="w-5 h-5 animate-spin" /> {progress || "Import en cours…"}</> : <><Upload className="w-5 h-5" /> Lancer l'import</>}
            </button>
          </>
        )}

        {result && (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            <div className="flex items-center gap-2 text-emerald-600 font-display font-bold">
              <CheckCircle2 className="w-5 h-5" /> Import Excel terminé
            </div>

            <div className="flex flex-wrap gap-2">
              {Object.keys(TAB_LABELS).map((k) => {
                const r = result.report[k];
                const hasIssues = r.failed > 0;
                return (
                  <button key={k} onClick={() => setActiveTab(k)}
                    className={`px-3 py-2 rounded-lg text-sm font-display font-semibold border ${activeTab === k ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border"}`}>
                    {TAB_LABELS[k]} <span className="opacity-70">({r.total})</span>
                    {hasIssues && <span className="ml-1 text-rose-500">●</span>}
                  </button>
                );
              })}
            </div>

            {rep && (
              <>
                <div className="text-xs text-muted-foreground font-body">Onglet détecté : <strong>{rep.tab || "—"}</strong></div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm font-body">
                  <Stat label="Total" value={rep.total} />
                  <Stat label="Importés" value={rep.inserted} color="text-emerald-600" />
                  <Stat label="Mis à jour" value={rep.backfilled} color="text-sky-600" />
                  <Stat label="Ignorés" value={rep.skipped} color="text-amber-600" />
                  <Stat label="Échecs" value={rep.failed} color="text-rose-600" />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  {(["failed", "skipped", "backfilled", "all"] as Filt[]).map((f) => (
                    <button key={f} onClick={() => setFilt(f)}
                      className={`px-2.5 py-1 rounded text-xs font-display font-semibold border ${filt === f ? "bg-foreground text-background border-foreground" : "bg-card border-border"}`}>
                      {f === "failed" ? "Échecs" : f === "skipped" ? "Ignorés" : f === "backfilled" ? "Mis à jour" : "Tout"}
                    </button>
                  ))}
                  <button onClick={downloadCsv} className="ml-auto text-xs px-3 py-1 rounded border border-border bg-card font-display font-semibold hover:bg-secondary">Exporter CSV</button>
                </div>

                <div className="flex-1 overflow-auto border border-border rounded-lg">
                  {filteredRows.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground font-body flex items-center justify-center gap-2">
                      <Info className="w-4 h-4" /> Aucune ligne pour ce filtre.
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-secondary sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-2 font-display font-bold">Ligne</th>
                          <th className="text-left px-2 py-2 font-display font-bold">Statut</th>
                          <th className="text-left px-2 py-2 font-display font-bold">DOMPE</th>
                          <th className="text-left px-2 py-2 font-display font-bold">Identifiant</th>
                          <th className="text-left px-2 py-2 font-display font-bold">Raison</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((r, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="px-2 py-1.5 font-mono">{r.row}</td>
                            <td className="px-2 py-1.5">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase
                                ${r.status === "failed" ? "bg-rose-100 text-rose-700" :
                                  r.status === "skipped" ? "bg-amber-100 text-amber-700" :
                                  r.status === "backfilled" ? "bg-sky-100 text-sky-700" :
                                  "bg-emerald-100 text-emerald-700"}`}>
                                {r.status === "failed" && <AlertTriangle className="w-3 h-3" />}
                                {r.status}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 font-mono">{r.dompe || "—"}</td>
                            <td className="px-2 py-1.5">{r.identifier || "—"}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{r.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {result.errors.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 p-3 rounded text-xs text-rose-700 font-body">
                <div className="font-bold mb-1">Erreurs globales :</div>
                <ul className="list-disc pl-4 space-y-1">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setResult(null); setFile(null); }} className="flex-1 px-4 py-2 rounded-lg border border-border font-display font-semibold">Nouvel import</button>
              <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-foreground text-background font-display font-semibold">Fermer</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-secondary p-3 rounded">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className={`text-2xl font-display font-bold ${color || ""}`}>{value}</div>
    </div>
  );
}