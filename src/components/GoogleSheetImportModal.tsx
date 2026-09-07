import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Download, X, CheckCircle2, AlertTriangle, Info, Filter } from "lucide-react";

type RowReport = { row: number; dompe?: string; identifier?: string; reason: string; status: 'inserted' | 'skipped' | 'failed' | 'backfilled' };
type TabReport = { tab: string | null; total: number; inserted: number; skipped: number; failed: number; backfilled: number; rows: RowReport[] };
type Result = {
  clients: number; entrepreneurs: number; payments: number; expenses: number;
  skipped: number; errors: string[];
  tabs: Record<string, string | null>;
  report: Record<string, TabReport>;
};

const TAB_LABELS: Record<string, string> = { clients: "Clients (leads)", entrepreneurs: "Entrepreneurs", payments: "Paiements", expenses: "Factures" };
type Filt = "all" | "failed" | "skipped" | "backfilled";

export default function GoogleSheetImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [activeTab, setActiveTab] = useState<string>("clients");
  const [filt, setFilt] = useState<Filt>("failed");

  const run = async () => {
    setRunning(true); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("import-google-sheet", { body: {} });
      if (error) throw error;
      setResult(data as Result);
      onImported();
      toast({ title: "Import terminé", description: `Clients: ${data.clients} • Entrepr.: ${data.entrepreneurs} • Paiements: ${data.payments} • Factures: ${data.expenses}` });
    } catch (e: any) {
      toast({ title: "Erreur d'import", description: e.message || "Échec", variant: "destructive" });
    } finally { setRunning(false); }
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
    const a = document.createElement("a"); a.href = url; a.download = `rapport-import-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const rep = result?.report?.[activeTab];
  const filteredRows = rep?.rows.filter((r) => filt === "all" ? true : r.status === filt) || [];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-display font-bold">Importer depuis Google Sheet</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        {!result && (
          <>
            <p className="text-sm text-muted-foreground font-body mb-4">
              Lit les 4 onglets du Google Sheet officiel et insère les données dans le CRM. Les doublons sont ignorés. Un rapport détaillé est produit après l'import.
            </p>
            <button onClick={run} disabled={running}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-600 text-white font-display font-bold hover:opacity-90 disabled:opacity-50">
              {running ? <><Loader2 className="w-5 h-5 animate-spin" /> Import en cours…</> : <><Download className="w-5 h-5" /> Lancer l'import</>}
            </button>
          </>
        )}

        {result && (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            <div className="flex items-center gap-2 text-emerald-600 font-display font-bold">
              <CheckCircle2 className="w-5 h-5" /> Import terminé
            </div>

            {/* Section tabs */}
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
                  <button onClick={downloadCsv} className="ml-auto text-xs px-3 py-1 rounded border border-border bg-card font-display font-semibold hover:bg-secondary">
                    Exporter CSV
                  </button>
                </div>

                <div className="flex-1 overflow-auto border border-border rounded-lg">
                  {filteredRows.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground font-body flex items-center justify-center gap-2">
                      <Info className="w-4 h-4" /> Aucune ligne pour ce filtre.
                    </div>
                  ) : (
                    <div className="table-scroll">
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
                    </div>
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
              <button onClick={() => { setResult(null); }} className="flex-1 px-4 py-2 rounded-lg border border-border font-display font-semibold">Relancer</button>
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
