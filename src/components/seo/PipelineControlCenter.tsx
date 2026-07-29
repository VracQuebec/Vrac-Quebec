import { useMemo, useState } from "react";
import { useEffect } from "react";
import { useSeoPipelineV2, type CityBatch } from "@/lib/seo/useSeoPipelineV2";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  Play, Pause, Square, RotateCcw, Rocket, RefreshCw, Send, ListRestart,
  CheckCircle2, AlertCircle, Clock, Loader2, Zap, XCircle,
} from "lucide-react";

function formatEta(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function statusBadge(s: string) {
  const map: Record<string, { label: string; className: string; icon: JSX.Element }> = {
    queued:    { label: "En attente", className: "bg-muted text-muted-foreground",    icon: <Clock className="w-3 h-3" /> },
    running:   { label: "En cours",   className: "bg-primary/20 text-primary",         icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    paused:    { label: "En pause",   className: "bg-yellow-500/20 text-yellow-700",   icon: <Pause className="w-3 h-3" /> },
    completed: { label: "Terminé",    className: "bg-green-500/20 text-green-700",     icon: <CheckCircle2 className="w-3 h-3" /> },
    failed:    { label: "Échec",      className: "bg-destructive/20 text-destructive", icon: <XCircle className="w-3 h-3" /> },
    stopped:   { label: "Arrêté",     className: "bg-muted text-muted-foreground",    icon: <Square className="w-3 h-3" /> },
    cancelled: { label: "Annulé",     className: "bg-muted text-muted-foreground",    icon: <XCircle className="w-3 h-3" /> },
  };
  const cfg = map[s] ?? map.queued;
  return <Badge variant="outline" className={`gap-1 ${cfg.className}`}>{cfg.icon}{cfg.label}</Badge>;
}

function cityIcon(status: string): string {
  if (status === "completed") return "✅";
  if (status === "running") return "🔄";
  if (status === "failed") return "⚠️";
  if (status === "paused") return "⏸";
  return "⏳";
}

export default function PipelineControlCenter() {
  const { state, loading, error, start, pause, resume, stop, cancel, retryErrors, regenerateCity, republishCity } = useSeoPipelineV2();
  const [busy, setBusy] = useState(false);
  const [logsBatch, setLogsBatch] = useState<CityBatch | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [counters, setCounters] = useState<{ target_total: number; in_db: number; drafts: number; in_qa: number; published: number } | null>(null);
  const [errorsCount, setErrorsCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const [{ data: dash }, { count: errs }] = await Promise.all([
        supabase.rpc("seo_publication_dashboard"),
        supabase.from("seo_page_tasks").select("id", { count: "exact", head: true }).eq("status", "needs_retry"),
      ]);
      if (cancelled) return;
      const c = (dash as any)?.counts ?? null;
      if (c) setCounters({ target_total: c.target_total, in_db: c.in_db, drafts: c.drafts, in_qa: c.in_qa, published: c.published });
      setErrorsCount(errs ?? 0);
    }
    void refresh();
    const t = window.setInterval(refresh, 10000);
    const ch = supabase.channel("seo-pipeline-global-counters")
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_pages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_page_tasks" }, refresh)
      .subscribe();
    return () => { cancelled = true; window.clearInterval(t); void supabase.removeChannel(ch); };
  }, []);

  const run = state?.active_run ?? null;
  const batches = state?.batches ?? [];
  const overallPct = run && run.total_pages > 0 ? Math.round((run.done_pages / run.total_pages) * 100) : 0;
  const canPause = run?.status === "running" || run?.status === "queued";
  const canResume = run?.status === "paused";
  const canStop = run && ["queued","running","paused"].includes(run.status);

  const summary = useMemo(() => ({
    remaining: run ? Math.max(0, run.total_pages - run.done_pages) : 0,
    successRate: run && run.done_pages > 0 ? Math.round((run.succeeded_pages / run.done_pages) * 100) : 0,
  }), [run]);

  async function guarded(fn: () => Promise<void>) {
    setBusy(true); try { await fn(); } finally { setBusy(false); }
  }

  async function openLogs(batch: CityBatch) {
    setLogsBatch(batch);
    const { data } = await supabase.from("seo_page_tasks")
      .select("id, city_slug, material_slug, service_slug, status, attempts, qa_score, step, last_error, duration_ms, finished_at")
      .eq("batch_id", batch.id).order("updated_at", { ascending: false }).limit(200);
    setLogs(data ?? []);
  }

  return (
    <Card className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-lg font-display font-bold flex items-center gap-2"><Rocket className="w-5 h-5 text-primary" /> Pipeline SEO — Génération par ville</h2>
          <p className="text-xs text-muted-foreground">Génération séquentielle ville par ville, reprise après crash, watchdog automatique.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!run || ["completed","failed","stopped","cancelled"].includes(run.status) ? (
            <>
              <Button onClick={() => guarded(() => start({ mode: "all_cities" }))} disabled={busy} className="gap-2">
                <Rocket className="w-4 h-4" /> Générer tout
              </Button>
              <Button variant="outline" onClick={() => guarded(() => start({ mode: "all_cities", force: true }))} disabled={busy} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Regénérer tout
              </Button>
            </>
          ) : null}
          {canPause && <Button variant="outline" onClick={() => guarded(() => pause(run!.id))} disabled={busy} className="gap-2"><Pause className="w-4 h-4" /> Pause</Button>}
          {canResume && <Button onClick={() => guarded(() => resume(run!.id))} disabled={busy} className="gap-2"><Play className="w-4 h-4" /> Reprendre</Button>}
          {canStop && <Button variant="outline" onClick={() => guarded(() => stop(run!.id))} disabled={busy} className="gap-2"><Square className="w-4 h-4" /> Arrêter</Button>}
          {run && ["running","paused","stopped","failed","completed"].includes(run.status) && (
            <Button variant="outline" onClick={() => guarded(() => retryErrors(run.id))} disabled={busy} className="gap-2"><ListRestart className="w-4 h-4" /> Relancer erreurs</Button>
          )}
          {canStop && <Button variant="ghost" onClick={() => guarded(() => cancel(run!.id))} disabled={busy} className="gap-2 text-destructive"><XCircle className="w-4 h-4" /> Annuler</Button>}
        </div>
      </header>

      {error && <div className="text-sm text-destructive">{error}</div>}
      {loading && !state && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>}

      {counters && (
        <div className="space-y-2 rounded-lg border border-border bg-background/50 p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progression réelle · pages persistées en base (jamais régénérées automatiquement)</span>
            <span className="font-semibold text-foreground">
              {counters.target_total > 0 ? Math.round((counters.published / counters.target_total) * 100) : 0}%
            </span>
          </div>
          <Progress value={counters.target_total > 0 ? Math.round((counters.published / counters.target_total) * 100) : 0} className="h-2" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <Stat label="Total cible" value={counters.target_total} />
            <Stat label="Générées" value={counters.in_db} tone="good" />
            <Stat label="Publiées" value={counters.published} tone="good" />
            <Stat label="Restantes" value={Math.max(0, counters.target_total - counters.in_db)} />
            <Stat label="Erreurs" value={errorsCount} tone={errorsCount > 0 ? "bad" : "muted"} />
          </div>
        </div>
      )}

      {run && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2">
              {statusBadge(run.status)}
              <span className="text-sm text-muted-foreground">Mode : <strong className="text-foreground">{run.mode}</strong></span>
              {run.current_city_slug && <span className="text-sm">· Ville actuelle : <strong>{run.current_city_slug}</strong></span>}
            </div>
            <div className="text-xs text-muted-foreground">
              {run.pages_per_minute ? `${run.pages_per_minute} p/min` : "—"} · ETA {formatEta(run.eta_seconds)}
            </div>
          </div>

          <Progress value={overallPct} className="h-3" />
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
            <Stat label="Total" value={run.total_pages} />
            <Stat label="Faites" value={run.done_pages} />
            <Stat label="Restantes" value={summary.remaining} />
            <Stat label="Réussies" value={run.succeeded_pages} tone="good" />
            <Stat label="Échecs" value={run.failed_pages} tone={run.failed_pages > 0 ? "bad" : "muted"} />
            <Stat label="QA moyen" value={run.qa_avg != null ? `${run.qa_avg}` : "—"} />
          </div>
        </div>
      )}

      {batches.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Villes ({batches.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {batches.map((b) => {
              const pct = b.total_tasks > 0 ? Math.round((b.done_tasks / b.total_tasks) * 100) : 0;
              return (
                <div key={b.id} className="rounded-lg border border-border p-3 space-y-2 bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg">{cityIcon(b.status)}</span>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{b.city_slug}</div>
                        <div className="text-xs text-muted-foreground truncate">{b.current_step ?? "—"}</div>
                      </div>
                    </div>
                    {statusBadge(b.status)}
                  </div>
                  <Progress value={pct} className="h-2" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{b.done_tasks}/{b.total_tasks} · {pct}%</span>
                    <span>{b.succeeded_tasks} ✓ · {b.failed_tasks} ✗</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openLogs(b)}>Logs</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => guarded(() => regenerateCity(b.city_slug))} disabled={busy}><RefreshCw className="w-3 h-3" /> Regénérer</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => guarded(() => republishCity(b.city_slug))} disabled={busy}><Send className="w-3 h-3" /> Republier</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!run && batches.length === 0 && !loading && (
        <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg">
          Aucun lancement actif. Cliquez sur <strong>Générer tout</strong> pour démarrer la pipeline ville par ville.
        </div>
      )}

      {state?.recent_runs && state.recent_runs.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Historique récent ({state.recent_runs.length})</summary>
          <div className="mt-2 space-y-1">
            {state.recent_runs.map((r) => (
              <div key={r.id} className="flex items-center gap-2 py-1 border-b border-border last:border-0">
                {statusBadge(r.status)}
                <span className="text-muted-foreground">{r.mode}</span>
                <span className="ml-auto">{r.succeeded_pages}/{r.total_pages} · QA {r.qa_avg ?? "—"}</span>
                <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString("fr-CA")}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <Dialog open={!!logsBatch} onOpenChange={(o) => !o && setLogsBatch(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Logs — {logsBatch?.city_slug}</DialogTitle></DialogHeader>
          <div className="space-y-1 text-xs font-mono">
            {logs.length === 0 && <div className="text-muted-foreground">Aucune tâche.</div>}
            {logs.map((l) => (
              <div key={l.id} className="flex items-center gap-2 py-1 border-b border-border last:border-0">
                {statusBadge(l.status)}
                <span>{[l.material_slug, l.service_slug].filter(Boolean).join(" · ") || "hub"}</span>
                <span className="text-muted-foreground">{l.step ?? "—"}</span>
                <span className="ml-auto">{l.qa_score != null ? `QA ${l.qa_score}` : ""}</span>
                <span className="text-muted-foreground">{l.duration_ms ? `${Math.round(l.duration_ms/1000)}s` : ""}</span>
                {l.last_error && <span className="text-destructive truncate max-w-[240px]" title={l.last_error}>{l.last_error}</span>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "bad" | "muted" }) {
  const cls = tone === "good" ? "text-green-700" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-background/50 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-base font-bold ${cls}`}>{value}</div>
    </div>
  );
}