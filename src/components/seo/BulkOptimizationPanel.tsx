import { useEffect, useMemo, useState } from "react";
import {
  Sparkles, RefreshCw, Play, Pause, Square, RotateCcw, AlertTriangle,
  Loader2, X, CheckCircle2, ListChecks, Gauge,
} from "lucide-react";
import { toast } from "sonner";
import {
  useBulkOptimization, type BulkMode, type BulkScope, type BulkPreview, type BulkError,
} from "@/lib/seo/useBulkOptimization";

type Action = { key: string; label: string; mode: BulkMode; scope: BulkScope; icon: typeof Sparkles; primary?: boolean };

const ACTIONS: Action[] = [
  { key: "opt_improve", label: "Optimiser les pages à améliorer", mode: "optimize", scope: "to_improve", icon: Sparkles, primary: true },
  { key: "ref_refresh", label: "Rafraîchir les pages à rafraîchir", mode: "refresh", scope: "to_refresh", icon: RefreshCw },
  { key: "opt_all", label: "Optimiser toutes les pages", mode: "optimize", scope: "all", icon: Sparkles },
  { key: "ref_all", label: "Rafraîchir toutes les pages", mode: "refresh", scope: "all", icon: RefreshCw },
  { key: "opt_errors", label: "Corriger les pages en erreur", mode: "optimize", scope: "errors", icon: AlertTriangle },
];

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-primary" : tone === "warn" ? "text-amber-600" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-body">{label}</div>
      <div className={`text-2xl font-display font-bold ${color}`}>{value}</div>
    </div>
  );
}

export default function BulkOptimizationPanel({ onProgress }: { onProgress?: () => void }) {
  const { overview, state, loading, isActive, reload, preview, start, control, listErrors, retryTask } = useBulkOptimization();
  const [pending, setPending] = useState<{ action: Action; preview: BulkPreview } | null>(null);
  const [analysis, setAnalysis] = useState<BulkPreview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [errors, setErrors] = useState<BulkError[]>([]);

  const run = state?.run ?? null;
  const counts = state?.counts ?? null;
  const done = counts ? counts.completed + counts.skipped + counts.errors : 0;
  const total = counts?.total ?? run?.total ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const interrupted = !!run && (run.status === "paused" || (run.status === "running" && !!run.last_progress_at && Date.now() - new Date(run.last_progress_at).getTime() > 120_000));

  // Refresh the page table while the queue advances.
  useEffect(() => {
    if (!isActive || !onProgress) return;
    const t = window.setInterval(onProgress, 15000);
    return () => window.clearInterval(t);
  }, [isActive, onProgress]);

  const openConfirm = async (action: Action) => {
    setBusy(action.key);
    try {
      const p = await preview(action.mode, action.scope);
      if (p.will_process === 0) {
        toast.success("Aucune page ne nécessite cette opération — rien n'a été modifié.");
        return;
      }
      setPending({ action, preview: p });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally { setBusy(null); }
  };

  const runAnalysis = async () => {
    setBusy("analyze");
    try {
      setAnalysis(await preview("optimize", "all"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally { setBusy(null); }
  };

  const confirmStart = async () => {
    if (!pending) return;
    setBusy("start");
    try {
      const res = await start(pending.action.mode, pending.action.scope);
      toast.success(`Opération lancée — ${res.total} pages en file`);
      setPending(null);
      setAnalysis(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur au démarrage");
    } finally { setBusy(null); }
  };

  const doControl = async (action: "pause" | "resume" | "cancel" | "retry") => {
    setBusy(action);
    try {
      await control(action);
      toast.success({ pause: "Pause demandée", resume: "Reprise en cours", cancel: "Opération arrêtée", retry: "Erreurs relancées" }[action]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally { setBusy(null); }
  };

  const openErrors = async () => {
    if (!run) return;
    setBusy("errors");
    try {
      setErrors(await listErrors(run.id));
      setErrorsOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally { setBusy(null); }
  };

  const recent = state?.recent ?? [];
  const improved = useMemo(() => recent.filter((t) => t.status === "completed" && (t.qa_after ?? 0) > (t.qa_before ?? 0)), [recent]);

  if (loading) {
    return <div className="rounded-xl border border-border bg-card p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Chargement du centre de contrôle…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Tableau de suivi global */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Stat label="Pages totales" value={overview?.total ?? 0} />
        <Stat label="Score moyen" value={overview?.avg_score ?? 0} />
        <Stat label="Excellentes" value={overview?.excellent ?? 0} tone="good" />
        <Stat label="Bonnes" value={overview?.good ?? 0} />
        <Stat label="À améliorer" value={overview?.to_improve ?? 0} tone="warn" />
        <Stat label="À rafraîchir" value={overview?.to_refresh ?? 0} tone="warn" />
        <Stat label="Erreurs" value={overview?.errors ?? 0} tone={overview?.errors ? "bad" : undefined} />
      </div>

      {/* Actions globales */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="font-display font-bold text-foreground">Centre de contrôle SEO</h3>
            <p className="text-xs text-muted-foreground">Traitement par lots, reprise automatique, aucune page dupliquée : chaque page est mise à jour via son identifiant unique.</p>
          </div>
          <button type="button" onClick={runAnalysis} disabled={!!busy || isActive}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm font-display font-semibold hover:bg-secondary disabled:opacity-50">
            {busy === "analyze" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />} Analyser avant d'optimiser
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <button key={a.key} type="button" onClick={() => openConfirm(a)} disabled={!!busy || isActive}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-display font-semibold disabled:opacity-50 ${
                a.primary ? "bg-primary text-primary-foreground hover:opacity-90" : "border border-border hover:bg-secondary"
              }`}>
              {busy === a.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <a.icon className="w-4 h-4" />} {a.label}
            </button>
          ))}
        </div>
        {isActive && <p className="text-xs text-muted-foreground">Une opération est en cours — les nouveaux lancements sont bloqués tant qu'elle n'est pas terminée ou arrêtée.</p>}
      </div>

      {/* Résultat de la simulation */}
      {analysis && !pending && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-display font-bold flex items-center gap-2"><Gauge className="w-4 h-4" /> Simulation (aucune page modifiée)</h4>
            <button type="button" onClick={() => setAnalysis(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div><div className="text-muted-foreground text-xs">Pages analysées</div><div className="font-bold">{analysis.analyzed}</div></div>
            <div><div className="text-muted-foreground text-xs">À optimiser</div><div className="font-bold">{analysis.to_improve}</div></div>
            <div><div className="text-muted-foreground text-xs">À rafraîchir</div><div className="font-bold">{analysis.to_refresh}</div></div>
            <div><div className="text-muted-foreground text-xs">Déjà excellentes</div><div className="font-bold">{analysis.already_excellent}</div></div>
            <div><div className="text-muted-foreground text-xs">En erreur</div><div className="font-bold">{analysis.errors}</div></div>
          </div>
          <button type="button" disabled={analysis.will_process === 0 || isActive}
            onClick={() => openConfirm(ACTIONS[0])}
            className="mt-1 inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold disabled:opacity-50">
            <Sparkles className="w-4 h-4" /> Optimiser les {analysis.to_improve} pages à améliorer
          </button>
        </div>
      )}

      {/* Progression */}
      {run && (run.status !== "completed" || pct < 100) && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="font-display font-bold flex items-center gap-2">
              {run.status === "running" ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Pause className="w-4 h-4 text-amber-600" />}
              {run.status === "running" ? "Optimisation SEO en cours" : interrupted ? "Optimisation interrompue" : `Opération ${run.status}`}
              <span className="text-xs font-body text-muted-foreground">
                {state?.mode === "refresh" ? "· rafraîchissement" : "· optimisation"}
              </span>
            </h4>
            <div className="flex gap-2">
              {run.status === "running" && (
                <button type="button" onClick={() => doControl("pause")} disabled={!!busy}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs font-display font-semibold hover:bg-secondary">
                  <Pause className="w-3.5 h-3.5" /> Pause
                </button>
              )}
              {(run.status === "paused" || interrupted) && (
                <button type="button" onClick={() => doControl("resume")} disabled={!!busy}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold">
                  <Play className="w-3.5 h-3.5" /> Reprendre
                </button>
              )}
              {["running", "paused", "queued"].includes(run.status) && (
                <button type="button" onClick={() => doControl("cancel")} disabled={!!busy}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-destructive/40 text-destructive text-xs font-display font-semibold hover:bg-destructive/10">
                  <Square className="w-3.5 h-3.5" /> Arrêter
                </button>
              )}
              {(counts?.errors ?? 0) > 0 && (
                <>
                  <button type="button" onClick={openErrors} disabled={!!busy}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs font-display font-semibold hover:bg-secondary">
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive" /> Voir les {counts?.errors} erreurs
                  </button>
                  <button type="button" onClick={() => doControl("retry")} disabled={!!busy}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs font-display font-semibold hover:bg-secondary">
                    <RotateCcw className="w-3.5 h-3.5" /> Réessayer les erreurs
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Pages traitées</div><div className="font-bold">{done} / {total}</div></div>
            <div><div className="text-xs text-muted-foreground">Optimisées</div><div className="font-bold text-primary">{counts?.completed ?? 0}</div></div>
            <div><div className="text-xs text-muted-foreground">Déjà optimisées</div><div className="font-bold">{counts?.skipped ?? 0}</div></div>
            <div><div className="text-xs text-muted-foreground">Score amélioré</div><div className="font-bold">{counts?.improved ?? 0}</div></div>
            <div><div className="text-xs text-muted-foreground">Erreurs</div><div className={`font-bold ${counts?.errors ? "text-destructive" : ""}`}>{counts?.errors ?? 0}</div></div>
            <div><div className="text-xs text-muted-foreground">Progression</div><div className="font-bold">{pct} %</div></div>
          </div>

          {state?.current_page && run.status === "running" && (
            <p className="text-xs text-muted-foreground truncate">
              Optimisation en cours : <span className="text-foreground font-semibold">{state.current_page.title}</span> <span className="font-mono">/{state.current_page.slug}</span>
            </p>
          )}

          {recent.length > 0 && (
            <div className="max-h-52 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {recent.map((t) => (
                <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  {t.status === "completed" ? <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                    : t.status === "error" ? <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                    : <RefreshCw className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  <span className="truncate flex-1">{t.title}</span>
                  {t.status === "skipped" ? (
                    <span className="text-muted-foreground shrink-0">Aucune modification nécessaire</span>
                  ) : t.status === "error" ? (
                    <span className="text-destructive truncate max-w-[220px] shrink-0">{t.error}</span>
                  ) : (
                    <span className="font-mono shrink-0">{t.qa_before ?? "—"} → <span className="text-primary font-bold">{t.qa_after ?? "—"}</span></span>
                  )}
                </div>
              ))}
            </div>
          )}
          {improved.length > 0 && <p className="text-[11px] text-muted-foreground">{improved.length} pages améliorées sur les 25 dernières traitées.</p>}
        </div>
      )}

      {/* Confirmation */}
      {pending && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setPending(null)}>
          <div className="bg-card border border-border rounded-xl p-5 max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-display font-bold text-lg">{pending.action.label}</h4>
            <p className="text-sm text-muted-foreground">
              Vous êtes sur le point de traiter <span className="font-bold text-foreground">{pending.preview.will_process} pages</span>.
              Les pages seront traitées par lots. Les pages déjà excellentes et ne nécessitant aucune amélioration seront conservées telles quelles
              ({pending.preview.already_excellent} pages). Aucune page ne sera supprimée, dupliquée, ni changée d'URL.
            </p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• À optimiser : {pending.preview.to_improve}</li>
              <li>• À rafraîchir : {pending.preview.to_refresh}</li>
              <li>• En erreur : {pending.preview.errors}</li>
            </ul>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setPending(null)} className="px-3 py-2 rounded-md border border-border text-sm font-display font-semibold hover:bg-secondary">Annuler</button>
              <button type="button" onClick={confirmStart} disabled={busy === "start"}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
                {busy === "start" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Commencer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Erreurs */}
      {errorsOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setErrorsOpen(false)}>
          <div className="bg-card border border-border rounded-xl p-5 max-w-2xl w-full max-h-[80vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="font-display font-bold">Erreurs à corriger ({errors.length})</h4>
              <button type="button" onClick={() => setErrorsOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            {errors.length === 0 ? <p className="text-sm text-muted-foreground">Aucune erreur.</p> : errors.map((e) => (
              <div key={e.task_id} className="border border-border rounded-md p-3 text-sm space-y-1">
                <div className="font-semibold truncate">{e.title}</div>
                <div className="text-xs font-mono text-muted-foreground">/{e.slug}</div>
                <div className="text-xs text-destructive break-words">{e.error ?? "Erreur inconnue"}</div>
                <button type="button" onClick={async () => {
                  if (!run) return;
                  try { await retryTask(e.task_id, run.id); setErrors((prev) => prev.filter((x) => x.task_id !== e.task_id)); toast.success("Page relancée"); }
                  catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
                }} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-xs font-display font-semibold hover:bg-secondary">
                  <RotateCcw className="w-3 h-3" /> Relancer cette page
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={() => { void reload(); onProgress?.(); }} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Rafraîchir les indicateurs
        </button>
      </div>
    </div>
  );
}
