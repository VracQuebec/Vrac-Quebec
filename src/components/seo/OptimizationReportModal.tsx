import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Download, Loader2, TrendingUp, TrendingDown } from "lucide-react";

export type OptimizationReport = {
  id: string;
  run_id: string;
  pages_optimized: number;
  pages_skipped: number;
  pages_failed: number;
  errors_fixed: number;
  duration_seconds: number;
  ai_calls: number;
  cost_estimate: number;
  avg_qa_before: number | null;
  avg_qa_after: number | null;
  avg_qa_delta: number | null;
  top_fixes: Array<{ action: string; count: number }>;
  final_status: string;
  generated_at: string;
};

function fmtDuration(seconds: number) {
  if (!seconds || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function OptimizationReportModal({
  runId,
  onClose,
}: {
  runId: string;
  onClose: () => void;
}) {
  const [report, setReport] = useState<OptimizationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)("seo_optimization_finalize", { _run_id: runId });
        const { data, error } = await supabase
          .from("seo_optimization_reports" as never)
          .select("*")
          .eq("run_id", runId)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setReport((data as unknown as OptimizationReport) ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [runId]);

  const downloadCsv = () => {
    if (!report) return;
    const rows: Array<Array<string | number>> = [
      ["Métrique", "Valeur"],
      ["Pages optimisées", report.pages_optimized],
      ["Pages ignorées", report.pages_skipped],
      ["Pages en erreur", report.pages_failed],
      ["Erreurs corrigées", report.errors_fixed],
      ["Durée (s)", report.duration_seconds],
      ["Appels IA", report.ai_calls],
      ["Coût IA ($)", Number(report.cost_estimate).toFixed(4)],
      ["Score QA avant (moyenne)", report.avg_qa_before ?? ""],
      ["Score QA après (moyenne)", report.avg_qa_after ?? ""],
      ["Delta QA", report.avg_qa_delta ?? ""],
      ["Statut final", report.final_status],
      ["Généré à", report.generated_at],
      [],
      ["Corrections", "Occurrences"],
      ...report.top_fixes.map((f) => [f.action, f.count]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-optimisation-${runId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <header className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
          <div>
            <h2 className="text-lg font-display font-bold">Rapport final du run</h2>
            <p className="text-xs text-muted-foreground">{runId}</p>
          </div>
          <div className="flex items-center gap-2">
            {report && (
              <button onClick={downloadCsv}
                className="flex items-center gap-1 border border-border rounded-md px-3 py-1.5 text-sm hover:bg-secondary">
                <Download className="w-4 h-4" /> CSV
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded hover:bg-secondary" aria-label="Fermer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="p-4">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Génération du rapport…
            </div>
          )}
          {error && <div className="text-red-600 text-sm">{error}</div>}
          {report && (
            <div className="space-y-5">
              <span className={`inline-block text-xs font-semibold px-2 py-1 rounded ${
                report.final_status === "completed" ? "bg-emerald-500/10 text-emerald-700"
                : report.final_status === "failed"  ? "bg-red-500/10 text-red-700"
                : "bg-secondary text-muted-foreground"}`}>
                {report.final_status}
              </span>

              <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric label="Pages optimisées" value={report.pages_optimized} tone="good" />
                <Metric label="Pages ignorées" value={report.pages_skipped} />
                <Metric label="Erreurs" value={report.pages_failed} tone={report.pages_failed ? "bad" : undefined} />
                <Metric label="Erreurs corrigées" value={report.errors_fixed} tone="good" />
                <Metric label="Durée" value={fmtDuration(report.duration_seconds)} />
                <Metric label="Appels IA" value={report.ai_calls} />
                <Metric label="Coût IA" value={`$${Number(report.cost_estimate).toFixed(2)}`} />
                <Metric label="Delta QA moyen" value={
                  report.avg_qa_delta === null ? "—"
                    : `${report.avg_qa_delta > 0 ? "+" : ""}${Number(report.avg_qa_delta).toFixed(1)}`
                } tone={report.avg_qa_delta && report.avg_qa_delta > 0 ? "good" : report.avg_qa_delta && report.avg_qa_delta < 0 ? "bad" : undefined} />
              </section>

              <section className="border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3">Score QA moyen</h3>
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-display font-bold">
                    {report.avg_qa_before !== null ? Number(report.avg_qa_before).toFixed(1) : "—"}
                  </div>
                  <div className="text-muted-foreground">→</div>
                  <div className="text-3xl font-display font-bold text-emerald-600">
                    {report.avg_qa_after !== null ? Number(report.avg_qa_after).toFixed(1) : "—"}
                  </div>
                  {report.avg_qa_delta !== null && (
                    <div className={`flex items-center gap-1 text-sm ${report.avg_qa_delta > 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {report.avg_qa_delta > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {report.avg_qa_delta > 0 ? "+" : ""}{Number(report.avg_qa_delta).toFixed(1)} points
                    </div>
                  )}
                </div>
              </section>

              {report.top_fixes.length > 0 && (
                <section className="border border-border rounded-lg p-4">
                  <h3 className="text-sm font-semibold mb-3">Corrections les plus fréquentes</h3>
                  <ul className="space-y-1 text-sm">
                    {report.top_fixes.map((f) => (
                      <li key={f.action} className="flex justify-between">
                        <span>{f.action}</span>
                        <span className="font-semibold">{f.count}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="border border-border rounded-lg p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-display font-bold ${
        tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-foreground"
      }`}>{value}</div>
    </div>
  );
}