import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";
import { useOptimizationState, type OptimizationRun } from "@/lib/seo/useOptimizationState";
import { toast } from "sonner";
import {
  Play, Pause, Square, RotateCcw, AlertTriangle, CheckCircle2, Clock,
  Cpu, DollarSign, Zap, Loader2, TrendingUp, TrendingDown, ArrowRight,
} from "lucide-react";

function fmtDuration(ms: number | null | undefined) {
  if (!ms || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}m ${r}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function computeMetrics(run: OptimizationRun | null) {
  if (!run) return null;
  const startedMs = run.started_at ? new Date(run.started_at).getTime() : Date.now();
  const elapsed = Date.now() - startedMs;
  const pagesPerMin = elapsed > 0 && run.done > 0 ? (run.done / (elapsed / 60000)) : 0;
  const remaining = Math.max(0, run.total - run.done);
  const etaMs = pagesPerMin > 0 ? (remaining / pagesPerMin) * 60000 : null;
  const pct = run.total > 0 ? Math.min(100, Math.round((run.done / run.total) * 100)) : 0;
  return { pagesPerMin, remaining, etaMs, pct, elapsed };
}

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-secondary text-foreground",
  running: "bg-primary text-primary-foreground animate-pulse",
  paused: "bg-amber-500 text-white",
  completed: "bg-emerald-600 text-white",
  failed: "bg-red-600 text-white",
  cancelled: "bg-muted text-muted-foreground",
};

export default function OptimizationEngine() {
  const { activeRun, journal, history, today, loading, error, reload } = useOptimizationState();
  const [concurrency, setConcurrency] = useState(5);
  const [threshold, setThreshold] = useState(90);
  const [skipAbove, setSkipAbove] = useState(95);
  const [forceAll, setForceAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const metrics = useMemo(() => computeMetrics(activeRun), [activeRun]);

  const start = async () => {
    if (activeRun) { toast.error("Un run est déjà actif."); return; }
    setBusy("start");
    try {
      const { data: runId, error: e1 } = await supabase.rpc("seo_optimization_start", {
        _concurrency: concurrency,
        _threshold: threshold,
        _skip_above: skipAbove,
        _force_all: forceAll,
        _actions: [],
      });
      if (e1) throw e1;
      if (!runId) throw new Error("Aucun ID de run reçu");
      // Kick worker
      await invokeWithFreshSession("seo-optimize-worker", { run_id: runId });
      toast.success("Optimisation lancée");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur au démarrage");
    } finally { setBusy(null); }
  };

  const control = async (action: "pause" | "resume" | "cancel" | "retry") => {
    if (!activeRun && action !== "retry") return;
    setBusy(action);
    try {
      const runId = activeRun?.id ?? history[0]?.id;
      if (!runId) return;
      const rpc = ({
        pause: "seo_optimization_pause",
        resume: "seo_optimization_resume",
        cancel: "seo_optimization_cancel",
        retry: "seo_optimization_retry_errors",
      } as const)[action];
      const { error: e1 } = await supabase.rpc(rpc, { _run_id: runId });
      if (e1) throw e1;
      if (action === "resume" || action === "retry") {
        await invokeWithFreshSession("seo-optimize-worker", { run_id: runId });
      }
      toast.success({
        pause: "Run en pause", resume: "Reprise en cours",
        cancel: "Run annulé", retry: "Erreurs relancées",
      }[action]);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally { setBusy(null); }
  };

  if (loading) return <div className="p-6 text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground">Moteur d'optimisation industriel</h2>
          <p className="text-sm text-muted-foreground">Queue intelligente, parallélisme configurable, reprise automatique, journal complet.</p>
        </div>
        {error && <div className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle className="w-4 h-4" />{error}</div>}
      </header>

      {/* KPI du jour */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Kpi label="Runs (aujourd'hui)" value={today?.runs_today ?? 0} />
        <Kpi label="Pages traitées" value={today?.pages_today ?? 0} icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} />
        <Kpi label="Pages ignorées" value={today?.skipped_today ?? 0} icon={<ArrowRight className="w-4 h-4 text-muted-foreground" />} />
        <Kpi label="Erreurs" value={today?.failed_today ?? 0} icon={<AlertTriangle className="w-4 h-4 text-red-600" />} tone={today?.failed_today ? "bad" : undefined} />
        <Kpi label="Appels IA" value={today?.ai_calls_today ?? 0} icon={<Zap className="w-4 h-4 text-primary" />} />
        <Kpi label="Coût IA" value={`$${(today?.cost_today ?? 0).toFixed(2)}`} icon={<DollarSign className="w-4 h-4" />} />
        <Kpi label="Temps moyen/page" value={fmtDuration(today?.avg_duration_ms ?? 0)} icon={<Clock className="w-4 h-4" />} />
      </section>

      {/* Contrôles */}
      <section className="border border-border rounded-xl p-4 bg-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold">Contrôles</h3>
          {activeRun && (
            <span className={`text-xs font-semibold px-2 py-1 rounded ${STATUS_STYLE[activeRun.status]}`}>
              {activeRun.status}
            </span>
          )}
        </div>

        {!activeRun && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <label className="text-sm">
              <span className="block mb-1 text-muted-foreground">Parallélisme</span>
              <select value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))}
                className="w-full border border-input rounded-md px-2 py-2 bg-background">
                {[3, 5, 10, 20].map((n) => <option key={n} value={n}>{n} pages en parallèle</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="block mb-1 text-muted-foreground">Seuil QA cible</span>
              <input type="number" min={50} max={100} value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full border border-input rounded-md px-2 py-2 bg-background" />
            </label>
            <label className="text-sm">
              <span className="block mb-1 text-muted-foreground">Ignorer si QA ≥</span>
              <input type="number" min={50} max={100} value={skipAbove}
                onChange={(e) => setSkipAbove(Number(e.target.value))}
                className="w-full border border-input rounded-md px-2 py-2 bg-background" />
            </label>
            <label className="text-sm flex items-center gap-2 pt-6">
              <input type="checkbox" checked={forceAll} onChange={(e) => setForceAll(e.target.checked)} />
              <span className="text-muted-foreground">Forcer tout</span>
            </label>
            <button onClick={start} disabled={busy === "start"}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 font-semibold hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2">
              {busy === "start" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Démarrer
            </button>
          </div>
        )}

        {activeRun && (
          <div className="flex flex-wrap gap-2">
            {activeRun.status === "running" && (
              <button onClick={() => control("pause")} disabled={busy === "pause"}
                className="border border-border rounded-md px-3 py-2 text-sm flex items-center gap-2 hover:bg-secondary">
                <Pause className="w-4 h-4" /> Pause
              </button>
            )}
            {activeRun.status === "paused" && (
              <button onClick={() => control("resume")} disabled={busy === "resume"}
                className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm flex items-center gap-2 hover:bg-primary/90">
                <Play className="w-4 h-4" /> Reprendre
              </button>
            )}
            <button onClick={() => control("cancel")} disabled={busy === "cancel"}
              className="border border-red-500/40 text-red-600 rounded-md px-3 py-2 text-sm flex items-center gap-2 hover:bg-red-500/10">
              <Square className="w-4 h-4" /> Annuler
            </button>
            {activeRun.failed > 0 && (
              <button onClick={() => control("retry")} disabled={busy === "retry"}
                className="border border-border rounded-md px-3 py-2 text-sm flex items-center gap-2 hover:bg-secondary">
                <RotateCcw className="w-4 h-4" /> Relancer les {activeRun.failed} erreurs
              </button>
            )}
            <span className="text-xs text-muted-foreground ml-auto self-center">
              Parallélisme : {activeRun.concurrency} • Seuil : {activeRun.qa_threshold} • Skip ≥ {activeRun.qa_skip_above}
              {activeRun.force_all && " • Forcer tout"}
            </span>
          </div>
        )}
      </section>

      {/* Progression live */}
      {activeRun && metrics && (
        <section className="border border-border rounded-xl p-4 bg-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Progression</div>
              <div className="text-2xl font-display font-bold">{metrics.pct}%</div>
            </div>
            <div className="text-right text-sm">
              <div>{activeRun.done} / {activeRun.total} pages</div>
              <div className="text-muted-foreground">{metrics.remaining} restantes</div>
            </div>
          </div>
          <div className="h-3 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${metrics.pct}%` }} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            <Kpi label="Réussies" value={activeRun.succeeded} icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} />
            <Kpi label="Ignorées" value={activeRun.skipped} />
            <Kpi label="Erreurs" value={activeRun.failed} tone={activeRun.failed ? "bad" : undefined} />
            <Kpi label="Relancées" value={activeRun.retried} />
            <Kpi label="Vitesse" value={`${metrics.pagesPerMin.toFixed(1)}/min`} icon={<Cpu className="w-4 h-4" />} />
            <Kpi label="ETA" value={metrics.etaMs ? fmtDuration(metrics.etaMs) : "—"} icon={<Clock className="w-4 h-4" />} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Kpi label="Écoulé" value={fmtDuration(metrics.elapsed)} />
            <Kpi label="Appels IA" value={activeRun.ai_calls} icon={<Zap className="w-4 h-4 text-primary" />} />
            <Kpi label="Coût IA estimé" value={`$${Number(activeRun.cost_estimate).toFixed(2)}`} icon={<DollarSign className="w-4 h-4" />} />
            <Kpi label="Dernière progression"
              value={activeRun.last_progress_at ? new Date(activeRun.last_progress_at).toLocaleTimeString() : "—"} />
          </div>
        </section>
      )}

      {/* Journal */}
      <section className="border border-border rounded-xl bg-card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-bold">Journal (50 dernières pages du run actif)</h3>
          <span className="text-xs text-muted-foreground">{journal.length} entrées</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Page</th>
                <th className="text-left px-3 py-2">Statut</th>
                <th className="text-right px-3 py-2">QA avant → après</th>
                <th className="text-right px-3 py-2">Corrections</th>
                <th className="text-right px-3 py-2">IA</th>
                <th className="text-right px-3 py-2">Durée</th>
                <th className="text-right px-3 py-2">Coût</th>
                <th className="text-left px-3 py-2">Terminé</th>
              </tr>
            </thead>
            <tbody>
              {journal.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Aucune tâche terminée pour le moment.</td></tr>
              )}
              {journal.map((t) => {
                const delta = t.qa_before !== null && t.qa_after !== null ? t.qa_after - t.qa_before : null;
                return (
                  <tr key={t.id} className="border-t border-border/60">
                    <td className="px-3 py-2">
                      <a href={`/${t.slug}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">{t.title || t.slug}</a>
                      {t.error && <div className="text-xs text-red-600 truncate max-w-md">{t.error}</div>}
                      {t.skip_reason && <div className="text-xs text-muted-foreground">{t.skip_reason}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded ${
                        t.status === "completed" ? "bg-emerald-500/10 text-emerald-700"
                          : t.status === "error" ? "bg-red-500/10 text-red-700"
                          : "bg-secondary text-muted-foreground"}`}>{t.status}</span>
                      {t.attempts > 1 && <span className="ml-2 text-[10px] text-muted-foreground">×{t.attempts}</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {t.qa_before ?? "—"} → {t.qa_after ?? "—"}
                      {delta !== null && delta !== 0 && (
                        <span className={`ml-1 text-xs inline-flex items-center ${delta > 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {delta > 0 ? "+" : ""}{delta}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">{t.fixed_actions?.length ? t.fixed_actions.join(", ") : "—"}</td>
                    <td className="px-3 py-2 text-right">{t.ai_calls}</td>
                    <td className="px-3 py-2 text-right">{fmtDuration(t.duration_ms)}</td>
                    <td className="px-3 py-2 text-right">${Number(t.cost_estimate).toFixed(3)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{t.finished_at ? new Date(t.finished_at).toLocaleTimeString() : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Historique */}
      <section className="border border-border rounded-xl bg-card">
        <div className="p-4 border-b border-border">
          <h3 className="font-display font-bold">Historique des runs</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Créé</th>
                <th className="text-left px-3 py-2">Statut</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-right px-3 py-2">✓ / skip / ✗</th>
                <th className="text-right px-3 py-2">Appels IA</th>
                <th className="text-right px-3 py-2">Coût</th>
                <th className="text-right px-3 py-2">Durée</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => {
                const dur = r.started_at && r.finished_at
                  ? new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()
                  : null;
                return (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="px-3 py-2 text-xs">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{r.total}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-emerald-600">{r.succeeded}</span> / <span className="text-muted-foreground">{r.skipped}</span> / <span className="text-red-600">{r.failed}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{r.ai_calls}</td>
                    <td className="px-3 py-2 text-right">${Number(r.cost_estimate).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{dur ? fmtDuration(dur) : "—"}</td>
                  </tr>
                );
              })}
              {history.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Aucun run passé.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, icon, tone }: { label: string; value: string | number; icon?: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="border border-border rounded-lg p-3 bg-background">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {icon}{label}
      </div>
      <div className={`text-lg font-display font-bold ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-600" : ""}`}>
        {value}
      </div>
    </div>
  );
}