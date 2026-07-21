import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeSeo } from "@/lib/seo/api";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle, Rocket, Sparkles, FileText, RotateCcw, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

type Job = {
  id: string;
  status: string;
  mode: string;
  wave: string | null;
  total: number;
  done: number;
  succeeded: number;
  failed: number;
  report: Record<string, unknown>;
  errors?: unknown[];
  current_target?: unknown;
  current_step?: string | null;
  current_attempt?: number | null;
  current_started_at?: string | null;
  last_progress_at?: string | null;
  watchdog_events?: PipelineEvent[];
  retry_queue?: PipelineEvent[];
  blocked_items?: PipelineEvent[];
  started_at: string | null;
  finished_at: string | null;
};

type PipelineEvent = {
  at?: string;
  target?: unknown;
  label?: string;
  status?: string;
  step?: string;
  attempts?: number;
  attempt?: number;
  next_attempt?: number | null;
  duration_ms?: number;
  reason?: string;
  page_id?: string;
  stalled_for_ms?: number;
  type?: string;
};

const WAVES: Array<{ code: string | null; label: string }> = [
  { code: "S1", label: "S1 — Grandes villes" },
  { code: "S2", label: "S2 — Villes moyennes" },
  { code: "S3", label: "S3 — Longue traîne" },
  { code: null, label: "Toutes les vagues" },
];

export default function WaveRunner() {
  const [autoPipeline, setAutoPipeline] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<Job[]>([]);

  async function loadRecent() {
    const { data } = await supabase
      .from("seo_generation_jobs")
      .select("id,status,mode,wave,total,done,succeeded,failed,report,errors,current_target,current_step,current_attempt,current_started_at,last_progress_at,watchdog_events,retry_queue,blocked_items,started_at,finished_at")
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(5);
    setHistory((data ?? []) as unknown as Job[]);
    const active = (data ?? []).find((j) => j.status === "running");
    if (active) setJob(active as Job);
  }

  useEffect(() => {
    void loadRecent();
    const ch = supabase
      .channel("seo-jobs-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_generation_jobs" }, (payload) => {
        const row = payload.new as Job;
        if (job && row.id === job.id) setJob(row);
        void loadRecent();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const activeJob = job?.status === "running" ? job : null;
    if (!activeJob?.last_progress_at) return;
    const timer = window.setInterval(async () => {
      const lastProgress = new Date(activeJob.last_progress_at ?? activeJob.started_at ?? Date.now()).getTime();
      const currentStarted = activeJob.current_started_at ? new Date(activeJob.current_started_at).getTime() : lastProgress;
      const stalledFor = Date.now() - Math.max(lastProgress, currentStarted);
      if (stalledFor < 60_000) return;
      try {
        await invokeSeo("seo-pipeline-run", { action: "watchdog", job_id: activeJob.id }, { retries: 0 });
        toast.info("Watchdog SEO activé : reprise automatique du pipeline.");
        void loadRecent();
      } catch (e) {
        console.warn("Watchdog SEO indisponible", e);
      }
    }, 15_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status, job?.last_progress_at, job?.current_started_at]);

  async function launch(mode: "generate" | "publish" | "pipeline", wave: string | null) {
    const key = `${mode}-${wave ?? "all"}`;
    setRunning(key);
    try {
      const res = await invokeSeo<{ ok: boolean; job_id?: string; empty?: boolean; message?: string; total?: number }>(
        "seo-pipeline-run",
        { mode, wave, auto_fix: true, qa_threshold: 80, limit: 500 },
      );
      if (res.empty) {
        toast.info(res.message || "Rien à traiter.");
      } else {
        toast.success(`Job lancé : ${res.total} éléments à traiter.`);
        void loadRecent();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du lancement.");
    } finally {
      setRunning(null);
    }
  }

  const activeJob = job && job.status === "running" ? job : null;
  const progress = activeJob ? Math.round((activeJob.done / Math.max(1, activeJob.total)) * 100) : 0;
  const newestJob = activeJob ?? history[0] ?? job;

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-display font-extrabold text-foreground flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" /> Pipeline SEO — Publication par vague
          </h2>
          <p className="text-xs text-muted-foreground font-body mt-1">
            Générer → Vérifier → Corriger → Publier. Timeout 60 s/page, 3 tentatives, watchdog anti-blocage.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {newestJob && <LogsDialog job={newestJob} />}
          <label className="flex items-center gap-2 text-xs font-display font-semibold cursor-pointer">
            <input type="checkbox" checked={autoPipeline} onChange={(e) => setAutoPipeline(e.target.checked)} className="accent-primary" />
            Pipeline automatique
          </label>
        </div>
      </header>

      {activeJob ? (
        <div className="rounded-lg bg-secondary p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-display font-semibold">
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              Job en cours — {activeJob.mode} {activeJob.wave ?? "toutes vagues"}
            </span>
            <span>{activeJob.done}/{activeJob.total} ({progress}%)</span>
          </div>
          <div className="h-2 rounded-full bg-background overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="text-green-600">✓ {activeJob.succeeded} réussis</span>
            <span className="text-red-600">✗ {activeJob.failed} échoués</span>
            <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-primary" /> {activeJob.current_step ?? "watchdog"}</span>
            <span>Tentative {activeJob.current_attempt ?? 1}/3</span>
          </div>
          {activeJob.current_target && (
            <div className="text-xs text-muted-foreground bg-background rounded-md px-3 py-2">
              Page en cours : <span className="font-display font-semibold text-foreground">{formatTarget(activeJob.current_target)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {WAVES.map((w) => (
            <div key={w.label} className="rounded-lg border border-border p-3 space-y-2">
              <div className="font-display font-bold text-sm text-foreground">{w.label}</div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => launch("generate", w.code)}
                  disabled={running !== null}
                  className="text-[11px] font-display font-semibold px-2 py-1.5 rounded-md border border-border hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {running === `generate-${w.code ?? "all"}` ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Générer"}
                </button>
                <button
                  onClick={() => launch("publish", w.code)}
                  disabled={running !== null}
                  className="text-[11px] font-display font-semibold px-2 py-1.5 rounded-md border border-border hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {running === `publish-${w.code ?? "all"}` ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Publier"}
                </button>
                <button
                  onClick={() => launch(autoPipeline ? "pipeline" : "generate", w.code)}
                  disabled={running !== null}
                  className="text-[11px] font-display font-extrabold px-2 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {running === `pipeline-${w.code ?? "all"}` ? <Loader2 className="w-3 h-3 animate-spin" /> : (<><Sparkles className="w-3 h-3" /> Pipeline</>)}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="pt-3 border-t border-border">
          <h3 className="text-xs font-display font-bold text-muted-foreground uppercase mb-2">Derniers rapports</h3>
          <div className="space-y-1.5">
            {history.slice(0, 5).map((h) => (
              <div key={h.id} className="flex items-center justify-between text-xs bg-background rounded-md px-3 py-2">
                <div className="flex items-center gap-2">
                  {h.status === "completed" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    : h.status === "completed_with_warnings" ? <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    : h.status === "failed" || h.status === "failed_with_retries" ? <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                    : <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                  <span className="font-display font-semibold">{statusLabel(h.status)} — {h.mode} — {h.wave ?? "toutes"}</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>{h.succeeded}/{h.total} · QA moy. {(h.report as { qa_avg?: number })?.qa_avg ?? "—"}</span>
                  <LogsDialog job={h} compact />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function statusLabel(status: string) {
  if (status === "completed") return "Terminée";
  if (status === "completed_with_warnings") return "Terminée avec avertissements";
  if (status === "failed_with_retries") return "Pages à reprendre";
  if (status === "failed") return "Échec";
  if (status === "running") return "En cours";
  return status;
}

function formatTarget(target: unknown) {
  if (!target) return "—";
  if (typeof target === "string") return target;
  if (typeof target === "object") {
    const row = target as { city_slug?: string; material_slug?: string | null; service_slug?: string | null };
    return [row.city_slug, row.material_slug, row.service_slug].filter(Boolean).join(" / ") || JSON.stringify(target);
  }
  return String(target);
}

function formatDuration(ms?: number) {
  if (!Number.isFinite(ms)) return "—";
  const seconds = Math.max(1, Math.round((ms ?? 0) / 1000));
  return `${seconds}s`;
}

function logsFrom(job: Job) {
  const report = (job.report ?? {}) as { logs?: PipelineEvent[]; warnings?: PipelineEvent[]; blocked?: PipelineEvent[] };
  return {
    logs: Array.isArray(report.logs) ? report.logs : [],
    warnings: Array.isArray(job.retry_queue) ? job.retry_queue : Array.isArray(report.warnings) ? report.warnings : [],
    blocked: Array.isArray(job.blocked_items) ? job.blocked_items : Array.isArray(report.blocked) ? report.blocked : [],
    watchdog: Array.isArray(job.watchdog_events) ? job.watchdog_events : [],
  };
}

function LogsDialog({ job, compact = false }: { job: Job; compact?: boolean }) {
  const { logs, warnings, blocked, watchdog } = logsFrom(job);
  const currentRuntime = job.current_started_at ? Date.now() - new Date(job.current_started_at).getTime() : 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className={compact
            ? "inline-flex items-center gap-1 text-[11px] font-display font-semibold hover:text-primary"
            : "inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-display font-semibold hover:border-primary hover:text-primary"}
        >
          <FileText className="w-3.5 h-3.5" /> Voir les logs
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display">Logs pipeline SEO — {statusLabel(job.status)}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <LogStat label="Progression" value={`${job.done}/${job.total}`} />
          <LogStat label="Réussies" value={String(job.succeeded)} />
          <LogStat label="À reprendre" value={String(blocked.length || job.failed)} />
          <LogStat label="Étape" value={job.current_step ?? "—"} />
        </div>

        {job.status === "running" && (
          <div className="rounded-lg bg-secondary p-3 text-xs space-y-1">
            <div>Page en cours : <span className="font-display font-semibold text-foreground">{formatTarget(job.current_target)}</span></div>
            <div>Temps d'exécution : <span className="font-display font-semibold text-foreground">{formatDuration(currentRuntime)}</span></div>
            <div>Tentative : <span className="font-display font-semibold text-foreground">{job.current_attempt ?? 1}/3</span></div>
          </div>
        )}

        <ScrollArea className="h-[420px] pr-4">
          <LogSection title="Watchdog" icon={<ShieldCheck className="w-4 h-4 text-primary" />} items={watchdog} empty="Aucun blocage détecté." />
          <LogSection title="À régénérer" icon={<RotateCcw className="w-4 h-4 text-amber-600" />} items={blocked} empty="Aucune page à reprendre." />
          <LogSection title="Tentatives automatiques" icon={<AlertCircle className="w-4 h-4 text-amber-600" />} items={warnings.slice(-30)} empty="Aucune relance nécessaire." />
          <LogSection title="Exécution récente" icon={<CheckCircle2 className="w-4 h-4 text-green-600" />} items={logs.slice(-50).reverse()} empty="Aucun log disponible." />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function LogStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary p-3">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-display font-extrabold text-foreground truncate">{value}</div>
    </div>
  );
}

function LogSection({ title, icon, items, empty }: { title: string; icon: React.ReactNode; items: PipelineEvent[]; empty: string }) {
  return (
    <div className="space-y-2 mb-5">
      <h3 className="text-xs font-display font-bold uppercase text-muted-foreground flex items-center gap-2">
        {icon} {title}
      </h3>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground rounded-md border border-border px-3 py-2">{empty}</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, idx) => (
            <div key={`${title}-${idx}`} className="rounded-md border border-border px-3 py-2 text-xs">
              <div className="flex items-start justify-between gap-3">
                <span className="font-display font-semibold text-foreground">{item.label || formatTarget(item.target)}</span>
                <span className="text-muted-foreground shrink-0">{formatDuration(item.duration_ms ?? item.stalled_for_ms)}</span>
              </div>
              <div className="text-muted-foreground mt-1">
                Étape : {item.step ?? item.type ?? "—"} · Tentative : {item.attempts ?? item.attempt ?? "—"}{item.next_attempt ? ` → ${item.next_attempt}` : ""}
              </div>
              {item.reason && <div className="text-muted-foreground mt-1">Cause : {item.reason}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}